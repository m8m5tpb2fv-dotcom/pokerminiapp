import { Router } from 'express';
import { authenticateInitData } from '../authenticate.js';
import { getOrCreateUser, grantDevStarterBalanceIfEmpty } from '../db.js';

export function authRouter(botToken: string | undefined): Router {
  const router = Router();

  router.post('/auth', (req, res) => {
    const { initData } = req.body as { initData?: string };
    if (!initData) return res.status(400).json({ error: 'initData required' });
    const tgUser = authenticateInitData(initData, botToken);
    if (!tgUser) return res.status(401).json({ error: 'Invalid Telegram authentication' });

    let user = getOrCreateUser(tgUser.id, tgUser.username, tgUser.first_name);
    if (!botToken) {
      grantDevStarterBalanceIfEmpty(user.telegram_id);
      user = getOrCreateUser(user.telegram_id);
    }
    res.json({
      user: {
        telegramId: user.telegram_id,
        username: user.username,
        firstName: user.first_name,
        starsBalance: user.stars_balance,
      },
    });
  });

  return router;
}
