import { adjustBalance } from './db.js';
import { pickGiftBundleWithinBudget } from './prizeScheduler.js';
import type { TableManager } from './tableManager.js';
import { getAvailableGifts, getMyStarBalance, sendGift } from './telegram.js';
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

export function startTournament(tableManager: TableManager): void {
  const entries = listEntries();
  const table = tableManager.getTable(TOURNAMENT_TABLE_ID);
  if (!table) return;

  if (entries.length < TOURNAMENT_SEATS) {
    for (const e of entries) adjustBalance(e.telegramId, TOURNAMENT_BUY_IN, 'tournament_entry_refund');
    console.log(`[tournament] Cancelled: only ${entries.length}/${TOURNAMENT_SEATS} registered.`);
    clearEntries();
    advanceToNextDay();
    return;
  }

  entries.forEach((e, i) => table.sitDown(i, e.telegramId, e.displayName, TOURNAMENT_BUY_IN, null, false));
  table.startIfReady();
  clearEntries();
  setTournamentStatus('running');
  console.log(`[tournament] Started with ${entries.length} players.`);
}

export async function finishTournament(tableManager: TableManager, botToken: string | undefined): Promise<void> {
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
  if (!botToken || maxTarget <= 0) {
    recordTournamentResult({ ...base, giftId: null, starCount: null });
    return;
  }

  try {
    const [balance, gifts] = await Promise.all([getMyStarBalance(botToken), getAvailableGifts(botToken)]);
    const spendable = Math.min(maxTarget, balance - RESERVE_STARS);
    const bundle = pickGiftBundleWithinBudget(gifts, spendable);
    if (!bundle) {
      console.warn(`[tournament] No gift affordable for the winner (target ${minTarget}-${maxTarget}⭐, bot balance ${balance}⭐).`);
      recordTournamentResult({ ...base, giftId: null, starCount: null });
      return;
    }
    for (const pick of bundle.picks) {
      await sendGift(botToken, {
        userId: winnerSeat.telegramId,
        giftId: pick.gift.id,
        payForUpgrade: pick.payForUpgrade,
        text: `🏆 You won the daily Stars Poker tournament! Prize pool: ${prizePool}⭐`,
      });
    }
    recordTournamentResult({
      ...base,
      giftId: bundle.picks[0].gift.id,
      starCount: bundle.totalSpent,
    });
    console.log(`[tournament] Awarded ${bundle.picks.length} gift(s) worth ${bundle.totalSpent}⭐ to ${winnerSeat.displayName} (${winnerSeat.telegramId}).`);
  } catch (err) {
    console.error('[tournament] Failed to send the winner gift:', (err as Error).message);
    recordTournamentResult({ ...base, giftId: null, starCount: null });
  }
}

async function tick(tableManager: TableManager, botToken: string | undefined): Promise<void> {
  const state = getTournamentState();
  if (state.status === 'scheduled') {
    const startsAt = new Date(`${state.nextStartAt.replace(' ', 'T')}Z`).getTime();
    if (Date.now() >= startsAt) startTournament(tableManager);
    return;
  }

  // status === 'running': check whether only one player still has chips.
  const table = tableManager.getTable(TOURNAMENT_TABLE_ID);
  if (!table) return;
  const view = table.getView();
  if (view.seats.length === 0) return; // already finalized, waiting for next cycle
  const alive = view.seats.filter((s) => s.stack > 0);
  if (alive.length > 1) return; // still playing
  await finishTournament(tableManager, botToken);
}

export function startTournamentScheduler(tableManager: TableManager, botToken: string | undefined): void {
  tick(tableManager, botToken);
  setInterval(() => tick(tableManager, botToken), CHECK_INTERVAL_MS);
}
