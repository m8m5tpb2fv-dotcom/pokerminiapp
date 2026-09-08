import { Router } from 'express';
import { grantRankForTesting } from '../ranking.js';

/**
 * Developer-only utility, gated behind the bot's own token as a shared secret (already a
 * private value only the deploying developer holds in Railway). Disabled entirely when no
 * BOT_TOKEN is configured (dev mode), so it can never be exploited without one.
 */
export function adminRouter(botToken: string | undefined): Router {
  const router = Router();

  router.post('/admin/grant-rank', (req, res) => {
    const { secret, telegramId, rankId } = req.body as { secret?: string; telegramId?: number; rankId?: string };
    if (!botToken || secret !== botToken) return res.status(403).json({ error: 'Forbidden' });
    if (!telegramId || !rankId) return res.status(400).json({ error: 'telegramId and rankId required' });

    try {
      res.json(grantRankForTesting(telegramId, rankId));
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  return router;
}
