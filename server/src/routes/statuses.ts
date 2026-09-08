import { Router } from 'express';
import { authenticateInitData } from '../authenticate.js';
import { adjustBalance, getBalance, getOrCreateUser, setStatusTier, toClientUser } from '../db.js';
import { STATUS_TIERS, findStatusTier, tierRank } from '../statusTiers.js';

export function statusesRouter(botToken: string | undefined): Router {
  const router = Router();

  router.get('/statuses', (_req, res) => {
    res.json({ statuses: STATUS_TIERS });
  });

  router.post('/status/purchase', (req, res) => {
    const { initData, statusId } = req.body as { initData?: string; statusId?: string };
    if (!initData || !statusId) return res.status(400).json({ error: 'initData and statusId required' });
    const tgUser = authenticateInitData(initData, botToken);
    if (!tgUser) return res.status(401).json({ error: 'Invalid Telegram authentication' });

    const tier = findStatusTier(statusId);
    if (!tier) return res.status(400).json({ error: 'Unknown status' });

    const currentStatusTier = getOrCreateUser(tgUser.id).status_tier;
    if (tierRank(tier.id) <= tierRank(currentStatusTier)) {
      return res.status(400).json({ error: 'You already have this status or a higher one' });
    }
    if (getBalance(tgUser.id) < tier.price) return res.status(400).json({ error: 'Insufficient Stars balance' });

    try {
      adjustBalance(tgUser.id, -tier.price, 'status_purchase');
      const user = setStatusTier(tgUser.id, tier.id);
      res.json({ user: toClientUser(user) });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  return router;
}
