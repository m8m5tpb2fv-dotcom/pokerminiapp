import { Router } from 'express';
import { authenticateInitData } from '../authenticate.js';
import { displayNameFor, setNickname } from '../db.js';

export function nicknameRouter(botToken: string | undefined): Router {
  const router = Router();

  router.post('/nickname', (req, res) => {
    const { initData, nickname } = req.body as { initData?: string; nickname?: string };
    if (!initData || !nickname) return res.status(400).json({ error: 'initData and nickname required' });
    const tgUser = authenticateInitData(initData, botToken);
    if (!tgUser) return res.status(401).json({ error: 'Invalid Telegram authentication' });

    try {
      const user = setNickname(tgUser.id, nickname);
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
