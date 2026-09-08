import { Router } from 'express';
import { authenticateInitData } from '../authenticate.js';
import { getAvatar, setAvatar, toClientUser, getOrCreateUser } from '../db.js';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 500 * 1024; // client resizes/compresses before upload, this is just a safety cap

const DATA_URL_PATTERN = /^data:(image\/[a-z]+);base64,(.+)$/;

export function avatarRouter(botToken: string | undefined): Router {
  const router = Router();

  router.post('/avatar', (req, res) => {
    const { initData, image } = req.body as { initData?: string; image?: string };
    if (!initData || !image) return res.status(400).json({ error: 'initData and image required' });
    const tgUser = authenticateInitData(initData, botToken);
    if (!tgUser) return res.status(401).json({ error: 'Invalid Telegram authentication' });

    const match = DATA_URL_PATTERN.exec(image);
    if (!match) return res.status(400).json({ error: 'image must be a base64 data URL' });
    const [, mime, base64] = match;
    if (!ALLOWED_MIME.has(mime)) return res.status(400).json({ error: 'Unsupported image type' });

    const data = Buffer.from(base64, 'base64');
    if (data.length === 0 || data.length > MAX_BYTES) {
      return res.status(400).json({ error: `Image must be under ${MAX_BYTES / 1024}KB` });
    }

    try {
      setAvatar(tgUser.id, data, mime);
      const user = getOrCreateUser(tgUser.id);
      res.json({ user: toClientUser(user) });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.get('/avatar/:telegramId', (req, res) => {
    const telegramId = Number(req.params.telegramId);
    if (!Number.isInteger(telegramId)) return res.status(400).end();
    const avatar = getAvatar(telegramId);
    if (!avatar) return res.status(404).end();
    res.set('Content-Type', avatar.mime);
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(avatar.data);
  });

  return router;
}
