import { Router } from 'express';
import { authenticateInitData } from '../authenticate.js';
import { adjustBalance, displayNameFor, getBalance, setStatusTier } from '../db.js';
import { STATUS_TIERS, findStatusTier } from '../statusTiers.js';

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
    if (getBalance(tgUser.id) < tier.price) return res.status(400).json({ error: 'Insufficient Stars balance' });

    try {
      adjustBalance(tgUser.id, -tier.price, 'status_purchase');
      const user = setStatusTier(tgUser.id, tier.id);
      res.json({
        user: {
          telegramId: user.telegram_id,
          username: user.username,
          firstName: user.first_name,
          nickname: user.nickname,
          statusTier: user.status_tier,
          displayName: displayNameFor(user),
          starsBalance: user.stars_balance,
        },
      });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  return router;
}
