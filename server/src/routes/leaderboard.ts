import { Router } from 'express';
import { getLeaderboard } from '../db.js';

export function leaderboardRouter(): Router {
  const router = Router();

  router.get('/leaderboard', (_req, res) => {
    res.json({ leaderboard: getLeaderboard(20) });
  });

  return router;
}
