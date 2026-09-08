import { getInitData } from './telegram';
import type { ActionType, TableStateView, User } from './types';

type ServerMessage =
  | { type: 'auth_ok'; user: User }
  | { type: 'table_state'; view: TableStateView }
  | { type: 'left_table' }
  | { type: 'error'; message: string };

type Listener = (msg: ServerMessage) => void;

export class PokerSocket {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private queue: string[] = [];

  connect(): void {
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) return; // already connecting/connected
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${protocol}://${location.host}/ws`);
    this.ws = socket;
    socket.addEventListener('open', () => {
      this.send({ type: 'auth', initData: getInitData() });
      for (const msg of this.queue) socket.send(msg);
      this.queue = [];
    });
    socket.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data) as ServerMessage;
      for (const listener of this.listeners) listener(msg);
    });
    socket.addEventListener('close', () => {
      if (this.ws === socket) setTimeout(() => this.connect(), 2000);
    });
  }

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private send(payload: unknown): void {
    const data = JSON.stringify(payload);
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(data);
    else this.queue.push(data);
  }

  watchTable(tableId: string): void {
    this.send({ type: 'watch_table', tableId });
  }

  unwatchTable(): void {
    this.send({ type: 'unwatch_table' });
  }

  joinTable(tableId: string, seatIndex: number, buyIn: number): void {
    this.send({ type: 'join_table', tableId, seatIndex, buyIn });
  }

  leaveTable(): void {
    this.send({ type: 'leave_table' });
  }

  act(action: ActionType, amount?: number): void {
    this.send({ type: 'action', action, amount });
  }
}

export const pokerSocket = new PokerSocket();
