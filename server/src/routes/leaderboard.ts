import { Router } from 'express';
import { getLastPrize, getLeaderboard, getPrizePeriodStart } from '../db.js';

export function leaderboardRouter(): Router {
  const router = Router();

  router.get('/leaderboard', (_req, res) => {
    const periodStart = getPrizePeriodStart();
    res.json({
      leaderboard: getLeaderboard(20, periodStart),
      periodStart,
      lastPrize: getLastPrize(),
    });
  });

  return router;
}
