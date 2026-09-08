import { Router } from 'express';
import { getLastPrize, getLeaderboard, getPrizePeriodStart, type LeaderboardEntry } from '../db.js';
import { RANK_TIERS } from '../rankTiers.js';

export function leaderboardRouter(): Router {
  const router = Router();

  router.get('/leaderboard', (_req, res) => {
    const periodStart = getPrizePeriodStart();
    const byTier: Record<string, LeaderboardEntry[]> = {};
    for (const tier of RANK_TIERS) byTier[tier.id] = getLeaderboard(20, periodStart, tier.id);
    res.json({
      leaderboard: getLeaderboard(20, periodStart),
      byTier,
      periodStart,
      lastPrize: getLastPrize(),
    });
  });

  return router;
}
