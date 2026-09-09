import { Router } from 'express';
import { adjustBalance, getAdminStats, getLeaderboard, getOrCreateUser, getPrizePeriodStart, toClientUser } from '../db.js';
import { grantRankForTesting } from '../ranking.js';
import { getMyStarBalance } from '../telegram.js';
import { countEntries, getTournamentState, TOURNAMENT_BUY_IN, TOURNAMENT_SEATS } from '../tournamentDb.js';

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

  router.get('/admin/stats', async (req, res) => {
    const { secret } = req.query as { secret?: string };
    if (!botToken || secret !== botToken) return res.status(403).json({ error: 'Forbidden' });

    const periodStart = getPrizePeriodStart();
    let botStarsBalance: number | null = null;
    try {
      botStarsBalance = await getMyStarBalance(botToken);
    } catch {
      botStarsBalance = null; // Telegram API hiccup shouldn't break the whole dashboard
    }

    res.json({
      ...getAdminStats(periodStart),
      periodStart,
      botStarsBalance,
      topWeekly: getLeaderboard(5, periodStart),
      tournament: { ...getTournamentState(), registeredCount: countEntries(), seats: TOURNAMENT_SEATS, buyIn: TOURNAMENT_BUY_IN },
    });
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

  return router;
}
