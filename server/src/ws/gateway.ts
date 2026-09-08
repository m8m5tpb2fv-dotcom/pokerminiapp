import type { Server as HttpServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { authenticateInitData } from '../authenticate.js';
import { adjustBalance, displayNameFor, getBalance, getOrCreateUser, grantDevStarterBalanceIfEmpty, toClientUser } from '../db.js';
import type { ActionType } from '../poker/types.js';
import type { TableManager } from '../tableManager.js';
import { TOURNAMENT_TABLE_ID, getTournamentState } from '../tournamentDb.js';

function isTournamentRunning(): boolean {
  return getTournamentState().status === 'running';
}

interface ClientMessage {
  type: 'auth' | 'watch_table' | 'unwatch_table' | 'join_table' | 'leave_table' | 'action';
  initData?: string;
  tableId?: string;
  seatIndex?: number;
  buyIn?: number;
  action?: ActionType;
  amount?: number;
}

interface ConnState {
  telegramId: number | null;
  displayName: string;
  statusTier: string | null;
  /** Table this socket is seated (playing) at, if any. */
  seatedTableId: string | null;
  /** Table this socket is currently viewing (lobby preview or the seated table). */
  watchingTableId: string | null;
}

function send(ws: WebSocket, payload: unknown): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

export function attachWebSocketServer(server: HttpServer, tableManager: TableManager, botToken: string | undefined): void {
  const wss = new WebSocketServer({ server, path: '/ws' });
  const states = new Map<WebSocket, ConnState>();
  /** tableId -> sockets currently viewing/playing that table */
  const rooms = new Map<string, Set<WebSocket>>();

  function joinRoom(ws: WebSocket, tableId: string): void {
    if (!rooms.has(tableId)) rooms.set(tableId, new Set());
    rooms.get(tableId)!.add(ws);
  }

  function leaveRoom(ws: WebSocket, tableId: string): void {
    rooms.get(tableId)?.delete(ws);
  }

  function sendTableStateTo(ws: WebSocket, tableId: string): void {
    const table = tableManager.getTable(tableId);
    if (!table) return;
    const state = states.get(ws);
    send(ws, { type: 'table_state', view: table.getView(state?.telegramId ?? undefined) });
  }

  function broadcastTable(tableId: string): void {
    const sockets = rooms.get(tableId);
    if (!sockets) return;
    for (const socket of sockets) sendTableStateTo(socket, tableId);
  }

  tableManager.onChange(broadcastTable);

  function setWatching(ws: WebSocket, state: ConnState, tableId: string | null): void {
    if (state.watchingTableId === tableId) return;
    if (state.watchingTableId && state.watchingTableId !== state.seatedTableId) leaveRoom(ws, state.watchingTableId);
    state.watchingTableId = tableId;
    if (tableId) {
      joinRoom(ws, tableId);
      sendTableStateTo(ws, tableId);
    }
  }

  function cashOutAndLeave(ws: WebSocket, state: ConnState): void {
    if (!state.telegramId || !state.seatedTableId) return;
    const tableId = state.seatedTableId;
    if (tableId === TOURNAMENT_TABLE_ID && isTournamentRunning()) {
      // Elimination/payout happens server-side via the scheduler; a socket disconnect
      // must not stand the player up early. Just drop this socket's binding.
      state.seatedTableId = null;
      if (state.watchingTableId !== tableId) leaveRoom(ws, tableId);
      return;
    }
    const table = tableManager.getTable(tableId);
    if (table) {
      const stack = table.standUp(state.telegramId);
      if (stack > 0) adjustBalance(state.telegramId, stack, 'cash_out');
    }
    tableManager.markUnseated(state.telegramId);
    state.seatedTableId = null;
    if (state.watchingTableId !== tableId) leaveRoom(ws, tableId);
    broadcastTable(tableId);
  }

  wss.on('connection', (ws) => {
    const state: ConnState = {
      telegramId: null,
      displayName: 'Player',
      statusTier: null,
      seatedTableId: null,
      watchingTableId: null,
    };
    states.set(ws, state);

    ws.on('message', (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        send(ws, { type: 'error', message: 'Invalid message' });
        return;
      }

      try {
        if (msg.type === 'auth') {
          const tgUser = authenticateInitData(msg.initData ?? '', botToken);
          if (!tgUser) {
            send(ws, { type: 'error', message: 'Invalid Telegram authentication' });
            return;
          }
          let user = getOrCreateUser(tgUser.id, tgUser.username, tgUser.first_name);
          if (!botToken) {
            grantDevStarterBalanceIfEmpty(user.telegram_id);
            user = getOrCreateUser(user.telegram_id);
          }
          state.telegramId = user.telegram_id;
          state.displayName = displayNameFor(user);
          state.statusTier = user.status_tier;
          send(ws, { type: 'auth_ok', user: toClientUser(user) });
          return;
        }

        if (!state.telegramId) {
          send(ws, { type: 'error', message: 'Not authenticated' });
          return;
        }

        if (msg.type === 'watch_table') {
          const table = msg.tableId ? tableManager.getTable(msg.tableId) : undefined;
          if (!msg.tableId || !table) {
            send(ws, { type: 'error', message: 'Unknown table' });
            return;
          }
          // Tournament seating happens server-side via the scheduler, not join_table, so
          // rebind this socket to its existing seat (e.g. on reconnect or first entry).
          if (msg.tableId === TOURNAMENT_TABLE_ID && !state.seatedTableId && table.getSeat(state.telegramId)) {
            tableManager.markSeated(state.telegramId, msg.tableId);
            state.seatedTableId = msg.tableId;
          }
          setWatching(ws, state, msg.tableId);
          return;
        }

        if (msg.type === 'unwatch_table') {
          setWatching(ws, state, null);
          return;
        }

        if (msg.type === 'join_table') {
          const { tableId, seatIndex, buyIn } = msg;
          if (!tableId || seatIndex === undefined || !buyIn) {
            send(ws, { type: 'error', message: 'tableId, seatIndex and buyIn are required' });
            return;
          }
          if (tableId === TOURNAMENT_TABLE_ID) {
            send(ws, { type: 'error', message: 'The tournament table can only be joined by registering for the tournament' });
            return;
          }
          if (tableManager.findTableFor(state.telegramId)) {
            send(ws, { type: 'error', message: 'Already seated at a table' });
            return;
          }
          const table = tableManager.getTable(tableId);
          if (!table) {
            send(ws, { type: 'error', message: 'Unknown table' });
            return;
          }
          if (getBalance(state.telegramId) < buyIn) {
            send(ws, { type: 'error', message: 'Insufficient Stars balance' });
            return;
          }
          adjustBalance(state.telegramId, -buyIn, 'buy_in');
          try {
            table.sitDown(seatIndex, state.telegramId, state.displayName, buyIn, state.statusTier);
          } catch (err) {
            adjustBalance(state.telegramId, buyIn, 'buy_in_refund');
            send(ws, { type: 'error', message: (err as Error).message });
            return;
          }
          tableManager.markSeated(state.telegramId, tableId);
          state.seatedTableId = tableId;
          setWatching(ws, state, tableId);
          broadcastTable(tableId);
          return;
        }

        if (msg.type === 'leave_table') {
          if (state.seatedTableId === TOURNAMENT_TABLE_ID && isTournamentRunning()) {
            send(ws, { type: 'error', message: 'Cannot leave the tournament once it has started' });
            return;
          }
          cashOutAndLeave(ws, state);
          send(ws, { type: 'left_table' });
          return;
        }

        if (msg.type === 'action') {
          if (!state.seatedTableId || !msg.action) {
            send(ws, { type: 'error', message: 'Not seated at a table' });
            return;
          }
          const table = tableManager.getTable(state.seatedTableId);
          if (!table) return;
          table.applyAction(state.telegramId, msg.action, msg.amount);
          return;
        }
      } catch (err) {
        send(ws, { type: 'error', message: (err as Error).message });
      }
    });

    ws.on('close', () => {
      cashOutAndLeave(ws, state);
      states.delete(ws);
    });
  });
}
