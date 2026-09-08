import { Router } from 'express';
import { authenticateInitData } from '../authenticate.js';
import { setNickname, toClientUser } from '../db.js';

export function nicknameRouter(botToken: string | undefined): Router {
  const router = Router();

  router.post('/nickname', (req, res) => {
    const { initData, nickname } = req.body as { initData?: string; nickname?: string };
    if (!initData || !nickname) return res.status(400).json({ error: 'initData and nickname required' });
    const tgUser = authenticateInitData(initData, botToken);
    if (!tgUser) return res.status(401).json({ error: 'Invalid Telegram authentication' });

    try {
      const user = setNickname(tgUser.id, nickname);
      res.json({ user: toClientUser(user) });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  return router;
}
