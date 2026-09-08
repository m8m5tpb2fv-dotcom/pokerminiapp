import { Router } from 'express';
import { RANK_TIERS } from '../rankTiers.js';

export function ranksRouter(): Router {
  const router = Router();

  router.get('/ranks', (_req, res) => {
    res.json({ ranks: RANK_TIERS });
  });

  return router;
}
