import { addPoints, adjustBalance, setRankTier } from './db.js';
import { RANK_TIERS, tierForPoints } from './rankTiers.js';

export const HAND_PARTICIPATION_POINTS = 10;
export const HAND_WIN_POINTS = 50;

/** Called once a hand finishes: every dealt-in player gets participation points, winners get more. */
export function awardHandPoints(participantIds: number[], winnerIds: number[]): void {
  const winnerSet = new Set(winnerIds);
  for (const telegramId of participantIds) {
    const gain = HAND_PARTICIPATION_POINTS + (winnerSet.has(telegramId) ? HAND_WIN_POINTS : 0);
    grantPointsAndMaybePromote(telegramId, gain);
  }
}

function grantPointsAndMaybePromote(telegramId: number, gain: number): void {
  const { points, previousRankTier } = addPoints(telegramId, gain);
  const newTier = tierForPoints(points);
  if (!newTier || newTier.id === previousRankTier) return;

  // Award every tier's bonus between the previous rank and the new one, in case a
  // single gain (unlikely at 10/50 points) jumps across more than one threshold.
  const prevIndex = RANK_TIERS.findIndex((t) => t.id === previousRankTier);
  const newIndex = RANK_TIERS.findIndex((t) => t.id === newTier.id);
  for (let i = prevIndex + 1; i <= newIndex; i++) {
    adjustBalance(telegramId, RANK_TIERS[i].bonus, 'rank_bonus');
  }
  setRankTier(telegramId, newTier.id);
}
