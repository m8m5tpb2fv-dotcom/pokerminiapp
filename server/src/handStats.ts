import { incrementGlobalHandsPlayed, recordHandResult } from './db.js';

/** Called once a hand finishes: feeds the per-player Profile stats (hands played/won, biggest single win) and the global admin counter. */
export function recordHandStats(participantIds: number[], winners: { telegramId: number; amount: number }[]): void {
  const winAmounts = new Map(winners.map((w) => [w.telegramId, w.amount]));
  for (const telegramId of participantIds) {
    const amount = winAmounts.get(telegramId);
    recordHandResult(telegramId, amount !== undefined, amount ?? 0);
  }
  incrementGlobalHandsPlayed();
}
