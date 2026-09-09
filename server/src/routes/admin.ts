import { Router } from 'express';
import { authenticateInitData } from '../authenticate.js';
import { adjustBalance, getAdminStats, getLeaderboard, getOrCreateUser, getPrizePeriodStart, toClientUser } from '../db.js';
import { grantRankForTesting } from '../ranking.js';
import { getMyStarBalance } from '../telegram.js';
import { countEntries, getTournamentState, TOURNAMENT_BUY_IN, TOURNAMENT_SEATS } from '../tournamentDb.js';

async function buildDashboardPayload(botToken: string | undefined) {
  const periodStart = getPrizePeriodStart();
  let botStarsBalance: number | null = null;
  if (botToken) {
    try {
      botStarsBalance = await getMyStarBalance(botToken);
    } catch {
      botStarsBalance = null; // Telegram API hiccup shouldn't break the whole dashboard
    }
  }

  return {
    ...getAdminStats(periodStart),
    periodStart,
    botStarsBalance,
    topWeekly: getLeaderboard(5, periodStart),
    tournament: { ...getTournamentState(), registeredCount: countEntries(), seats: TOURNAMENT_SEATS, buyIn: TOURNAMENT_BUY_IN },
  };
}

/**
 * Developer-only utilities. Two auth models coexist here:
 *  - `secret` (the bot token, a value only the deploying developer holds in Railway) for the
 *    standalone /admin page — usable from any browser, no Telegram session needed.
 *  - `initData` checked against ADMIN_TELEGRAM_ID for the in-app Admin tab, so the app's owner
 *    sees it without ever typing the bot token, and nobody else's Telegram account can.
 * Both paths are disabled entirely when their respective secret (BOT_TOKEN / ADMIN_TELEGRAM_ID)
 * isn't configured, so neither can be exploited without one.
 */
export function adminRouter(botToken: string | undefined, adminTelegramId: number | null): Router {
  const router = Router();

  function isAppAdmin(initData: unknown): boolean {
    if (!adminTelegramId || typeof initData !== 'string') return false;
    const tgUser = authenticateInitData(initData, botToken);
    return tgUser?.id === adminTelegramId;
  }

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

  router.get('/admin/stats', async (req, res) => {
    const { secret } = req.query as { secret?: string };
    if (!botToken || secret !== botToken) return res.status(403).json({ error: 'Forbidden' });
    res.json(await buildDashboardPayload(botToken));
  });

  router.post('/admin/adjust-balance', (req, res) => {
    const { secret, telegramId, amount, reason } = req.body as {
      secret?: string;
      telegramId?: number;
      amount?: number;
      reason?: string;
    };
    if (!botToken || secret !== botToken) return res.status(403).json({ error: 'Forbidden' });
    if (!telegramId || !amount) return res.status(400).json({ error: 'telegramId and non-zero amount required' });

    try {
      adjustBalance(telegramId, amount, reason?.trim() || 'admin_adjustment');
      res.json(toClientUser(getOrCreateUser(telegramId)));
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.get('/admin/app-dashboard', async (req, res) => {
    if (!isAppAdmin(req.query.initData)) return res.status(403).json({ error: 'Forbidden' });
    res.json(await buildDashboardPayload(botToken));
  });

  router.post('/admin/app-adjust-balance', (req, res) => {
    const { initData, telegramId, amount, reason } = req.body as {
      initData?: string;
      telegramId?: number;
      amount?: number;
      reason?: string;
    };
    if (!isAppAdmin(initData)) return res.status(403).json({ error: 'Forbidden' });
    if (!telegramId || !amount) return res.status(400).json({ error: 'telegramId and non-zero amount required' });

    try {
      adjustBalance(telegramId, amount, reason?.trim() || 'admin_adjustment');
      res.json(toClientUser(getOrCreateUser(telegramId)));
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  return router;
}
