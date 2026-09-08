import { Router } from 'express';
import { authenticateInitData } from '../authenticate.js';
import { adjustBalance, getOrCreateUser } from '../db.js';
import { answerPreCheckoutQuery, createStarsInvoiceLink } from '../telegram.js';

export const STAR_PACKAGES = [50, 100, 250, 500, 1000] as const;

export function starsRouter(botToken: string | undefined): Router {
  const router = Router();

  router.post('/stars/invoice', async (req, res) => {
    const { initData, stars } = req.body as { initData?: string; stars?: number };
    if (!initData || !stars) return res.status(400).json({ error: 'initData and stars required' });
    const tgUser = authenticateInitData(initData, botToken);
    if (!tgUser) return res.status(401).json({ error: 'Invalid Telegram authentication' });
    if (!STAR_PACKAGES.includes(stars as (typeof STAR_PACKAGES)[number])) {
      return res.status(400).json({ error: 'Invalid star package' });
    }
    if (!botToken) {
      return res.status(503).json({ error: 'Telegram Stars purchases require the server to be configured with BOT_TOKEN' });
    }
    try {
      const link = await createStarsInvoiceLink(
        botToken,
        `${stars} Stars`,
        `Add ${stars} Stars to your poker balance`,
        `stars_topup_${tgUser.id}_${stars}_${Date.now()}`,
        stars
      );
      res.json({ invoiceLink: link });
    } catch (err) {
      res.status(502).json({ error: (err as Error).message });
    }
  });

  return router;
}

interface TelegramUpdate {
  pre_checkout_query?: { id: string; from: { id: number }; total_amount: number };
  message?: {
    from: { id: number };
    successful_payment?: { total_amount: number; telegram_payment_charge_id: string };
  };
}

export function telegramWebhookRouter(botToken: string | undefined): Router {
  const router = Router();

  router.post('/telegram/webhook', async (req, res) => {
    res.sendStatus(200); // ack immediately per Telegram's requirements
    if (!botToken) return;
    const update = req.body as TelegramUpdate;

    if (update.pre_checkout_query) {
      await answerPreCheckoutQuery(botToken, update.pre_checkout_query.id, true);
      return;
    }

    const payment = update.message?.successful_payment;
    if (payment && update.message) {
      const telegramId = update.message.from.id;
      getOrCreateUser(telegramId);
      adjustBalance(telegramId, payment.total_amount, 'stars_purchase', payment.telegram_payment_charge_id);
    }
  });

  return router;
}
