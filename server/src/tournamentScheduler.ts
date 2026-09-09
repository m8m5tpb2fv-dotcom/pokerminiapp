import { adjustBalance, getAvatarVersion, getOrCreateUser } from './db.js';
import { pickGiftBundleWithinBudget, type GiftPick } from './prizeScheduler.js';
import type { TableManager } from './tableManager.js';
import { getAvailableGifts, getMyStarBalance, sendGift, sendMessage } from './telegram.js';
import {
  TOURNAMENT_BUY_IN,
  TOURNAMENT_SEATS,
  TOURNAMENT_TABLE_ID,
  addEntry,
  advanceToNextDay,
  clearEntries,
  countEntries,
  getTournamentState,
  isRegistered,
  listEntries,
  recordTournamentResult,
  removeEntry,
  setTournamentStatus,
} from './tournamentDb.js';

const CHECK_INTERVAL_MS = 5_000;
const PRIZE_SHARE_MIN = 0.5;
const PRIZE_SHARE_MAX = 0.55;
/** Keep some balance in reserve so the bot never fails to answer real Stars purchases because it spent everything on a prize. */
const RESERVE_STARS = 10;

export function registerForTournament(telegramId: number, displayName: string): void {
  const state = getTournamentState();
  if (state.status === 'running') throw new Error('A tournament is already in progress; registration reopens once it ends.');
  if (isRegistered(telegramId)) throw new Error('Already registered for the tournament');
  if (countEntries() >= TOURNAMENT_SEATS) throw new Error('Tournament is full');
  adjustBalance(telegramId, -TOURNAMENT_BUY_IN, 'tournament_entry');
  try {
    addEntry(telegramId, displayName);
  } catch (err) {
    adjustBalance(telegramId, TOURNAMENT_BUY_IN, 'tournament_entry_refund');
    throw err;
  }
}

export function unregisterFromTournament(telegramId: number): void {
  const state = getTournamentState();
  if (state.status === 'running') throw new Error('Cannot leave once the tournament has started');
  if (removeEntry(telegramId)) adjustBalance(telegramId, TOURNAMENT_BUY_IN, 'tournament_entry_refund');
}

/** Best-effort notification; a player who hasn't started a chat with the bot yet just won't get it. */
function notifyPlayers(botToken: string | undefined, telegramIds: number[], text: string): void {
  if (!botToken) return;
  for (const telegramId of telegramIds) {
    sendMessage(botToken, telegramId, text).catch((err) =>
      console.error(`[tournament] Failed to notify ${telegramId}:`, (err as Error).message)
    );
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Posts a nicely formatted result card to the configured group chat, if any (never required for the tournament itself to work). */
async function announceTournamentWinner(
  botToken: string | undefined,
  announceChatId: number | null | undefined,
  winnerTelegramId: number,
  winnerDisplayName: string,
  prizePool: number,
  players: number,
  bundle: { picks: GiftPick[]; totalSpent: number } | null
): Promise<void> {
  if (!botToken || !announceChatId) return;

  const username = getOrCreateUser(winnerTelegramId).username;
  const winnerLabel = username ? `@${escapeHtml(username)}` : `<b>${escapeHtml(winnerDisplayName)}</b>`;

  const lines = [
    '🏆 <b>Турнир Stars Poker завершён!</b>',
    '',
    `Победитель: ${winnerLabel}`,
    `Призовой фонд: ⭐${prizePool} (${players} игроков)`,
  ];
  if (bundle) {
    const emojis = bundle.picks.map((p) => p.gift.sticker?.emoji ?? '🎁').join(' ');
    lines.push(`Награда: ${emojis} на сумму ⭐${bundle.totalSpent}`);
  }
  lines.push('', 'Поздравляем! 🎉');

  try {
    await sendMessage(botToken, announceChatId, lines.join('\n'), 'HTML');
  } catch (err) {
    console.error('[tournament] Failed to post the winner announcement:', (err as Error).message);
  }
}

export function startTournament(tableManager: TableManager, botToken?: string): void {
  const entries = listEntries();
  const table = tableManager.getTable(TOURNAMENT_TABLE_ID);
  if (!table) return;

  if (entries.length < TOURNAMENT_SEATS) {
    for (const e of entries) adjustBalance(e.telegramId, TOURNAMENT_BUY_IN, 'tournament_entry_refund');
    console.log(`[tournament] Cancelled: only ${entries.length}/${TOURNAMENT_SEATS} registered.`);
    notifyPlayers(
      botToken,
      entries.map((e) => e.telegramId),
      `Not enough players registered for today's tournament (${entries.length}/${TOURNAMENT_SEATS}) — your ${TOURNAMENT_BUY_IN}⭐ buy-in has been refunded.`
    );
    clearEntries();
    advanceToNextDay();
    return;
  }

  entries.forEach((e, i) =>
    table.sitDown(i, e.telegramId, e.displayName, TOURNAMENT_BUY_IN, null, false, getAvatarVersion(e.telegramId))
  );
  table.startIfReady();
  clearEntries();
  setTournamentStatus('running');
  console.log(`[tournament] Started with ${entries.length} players.`);
  notifyPlayers(
    botToken,
    entries.map((e) => e.telegramId),
    '🏆 The daily Stars Poker tournament has started! Open the app now — your seat is ready.'
  );
}

export async function finishTournament(
  tableManager: TableManager,
  botToken: string | undefined,
  announceChatId?: number | null
): Promise<void> {
  const table = tableManager.getTable(TOURNAMENT_TABLE_ID);
  if (!table) return;
  const view = table.getView();
  const totalSeats = view.seats.length;
  const prizePool = totalSeats * TOURNAMENT_BUY_IN;
  const winnerSeat = view.seats.find((s) => s.stack > 0);

  for (const seat of view.seats) {
    const stack = table.standUp(seat.telegramId);
    if (stack > 0) adjustBalance(seat.telegramId, stack, 'tournament_win');
    tableManager.markUnseated(seat.telegramId);
  }
  tableManager.broadcast(TOURNAMENT_TABLE_ID);
  setTournamentStatus('scheduled');
  advanceToNextDay();

  if (!winnerSeat) {
    console.warn('[tournament] Ended with no single surviving stack (rare split finish); no gift sent.');
    return;
  }

  const minTarget = Math.floor(prizePool * PRIZE_SHARE_MIN);
  const maxTarget = Math.floor(prizePool * PRIZE_SHARE_MAX);
  const base = { telegramId: winnerSeat.telegramId, displayName: winnerSeat.displayName, prizePool, players: totalSeats };

  let bundle: { picks: GiftPick[]; totalSpent: number } | null = null;
  if (botToken && maxTarget > 0) {
    try {
      const [balance, gifts] = await Promise.all([getMyStarBalance(botToken), getAvailableGifts(botToken)]);
      const spendable = Math.min(maxTarget, balance - RESERVE_STARS);
      bundle = pickGiftBundleWithinBudget(gifts, spendable);
      if (!bundle) {
        console.warn(`[tournament] No gift affordable for the winner (target ${minTarget}-${maxTarget}⭐, bot balance ${balance}⭐).`);
      } else {
        for (const pick of bundle.picks) {
          await sendGift(botToken, {
            userId: winnerSeat.telegramId,
            giftId: pick.gift.id,
            payForUpgrade: pick.payForUpgrade,
            text: `🏆 You won the daily Stars Poker tournament! Prize pool: ${prizePool}⭐`,
          });
        }
        console.log(`[tournament] Awarded ${bundle.picks.length} gift(s) worth ${bundle.totalSpent}⭐ to ${winnerSeat.displayName} (${winnerSeat.telegramId}).`);
      }
    } catch (err) {
      console.error('[tournament] Failed to send the winner gift:', (err as Error).message);
      bundle = null;
    }
  }

  recordTournamentResult({ ...base, giftId: bundle?.picks[0]?.gift.id ?? null, starCount: bundle?.totalSpent ?? null });
  await announceTournamentWinner(botToken, announceChatId, winnerSeat.telegramId, winnerSeat.displayName, prizePool, totalSeats, bundle);
}

async function tick(tableManager: TableManager, botToken: string | undefined, announceChatId: number | null | undefined): Promise<void> {
  const state = getTournamentState();
  if (state.status === 'scheduled') {
    const startsAt = new Date(`${state.nextStartAt.replace(' ', 'T')}Z`).getTime();
    if (Date.now() >= startsAt) startTournament(tableManager, botToken);
    return;
  }

  // status === 'running': check whether only one player still has chips.
  const table = tableManager.getTable(TOURNAMENT_TABLE_ID);
  if (!table) return;
  const view = table.getView();
  if (view.seats.length === 0) return; // already finalized, waiting for next cycle
  const alive = view.seats.filter((s) => s.stack > 0);
  if (alive.length > 1) return; // still playing
  await finishTournament(tableManager, botToken, announceChatId);
}

export function startTournamentScheduler(tableManager: TableManager, botToken: string | undefined, announceChatId?: number | null): void {
  tick(tableManager, botToken, announceChatId);
  setInterval(() => tick(tableManager, botToken, announceChatId), CHECK_INTERVAL_MS);
}
