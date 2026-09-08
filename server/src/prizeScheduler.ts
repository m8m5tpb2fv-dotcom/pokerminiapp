import { getLastPrize, getLeaderboard, getPrizePeriodStart, getRevenueSince, recordPrizeAwarded, resetPrizePeriod } from './db.js';
import { getAvailableGifts, getMyStarBalance, sendGift, type TelegramGift } from './telegram.js';

const PERIOD_MS = 7 * 24 * 60 * 60 * 1000; // weekly
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // check hourly whether the period has elapsed
/** The winner's gift is worth up to this share of the Stars the bot actually took in from purchases this period. */
const PRIZE_REVENUE_SHARE = 0.5;
/** Keep some balance in reserve so the bot never fails to answer real Stars purchases because it spent everything on a prize. */
const RESERVE_STARS = 10;

/** Picks the priciest gift (preferring an upgraded/collectible one) that fits within the given Star budget. */
function pickGiftWithinBudget(gifts: TelegramGift[], spendable: number, wantUpgrade: boolean): { gift: TelegramGift; payForUpgrade: boolean } | null {
  if (spendable <= 0) return null;

  if (wantUpgrade) {
    const upgradable = gifts
      .filter((g) => g.upgrade_star_count && g.star_count + g.upgrade_star_count <= spendable)
      .sort((a, b) => b.star_count + (b.upgrade_star_count ?? 0) - (a.star_count + (a.upgrade_star_count ?? 0)));
    if (upgradable.length > 0) return { gift: upgradable[0], payForUpgrade: true };
  }

  const affordable = gifts.filter((g) => g.star_count <= spendable).sort((a, b) => b.star_count - a.star_count);
  if (affordable.length === 0) return null;
  return { gift: affordable[0], payForUpgrade: false };
}

/** Checks whether the weekly leaderboard period has elapsed and, if so, gifts the #1 player and starts a new period. */
export async function checkAndAwardWeeklyPrize(botToken: string | undefined): Promise<void> {
  if (!botToken) return; // dev mode: no real bot to send gifts from

  const periodStart = getPrizePeriodStart();
  // SQLite's datetime('now') returns UTC as "YYYY-MM-DD HH:MM:SS"; mark it explicitly UTC for Date parsing.
  const elapsed = Date.now() - new Date(`${periodStart.replace(' ', 'T')}Z`).getTime();
  if (elapsed < PERIOD_MS) return;

  const [winner] = getLeaderboard(1, periodStart);
  if (!winner) {
    resetPrizePeriod();
    return;
  }

  const revenueThisPeriod = getRevenueSince(periodStart);
  const target = Math.floor(revenueThisPeriod * PRIZE_REVENUE_SHARE);
  if (target <= 0) {
    console.log('[prize] No Stars purchased this period; skipping the prize and starting a new one.');
    resetPrizePeriod();
    return;
  }

  try {
    const [balance, gifts] = await Promise.all([getMyStarBalance(botToken), getAvailableGifts(botToken)]);
    const spendable = Math.min(target, balance - RESERVE_STARS);
    const pick = pickGiftWithinBudget(gifts, spendable, true);
    if (!pick) {
      console.warn(
        `[prize] Skipping weekly prize: target ${target}⭐ (50% of ${revenueThisPeriod}⭐ revenue) vs bot balance ${balance}⭐ leaves nothing affordable.`
      );
      return; // try again on the next hourly check without losing the period's winner
    }
    await sendGift(botToken, {
      userId: winner.telegramId,
      giftId: pick.gift.id,
      payForUpgrade: pick.payForUpgrade,
      text: `🏆 Weekly Stars Poker leaderboard winner! Net +${winner.netWinnings} ⭐`,
    });
    recordPrizeAwarded({
      telegramId: winner.telegramId,
      displayName: winner.displayName,
      giftId: pick.gift.id,
      starCount: pick.gift.star_count + (pick.payForUpgrade ? pick.gift.upgrade_star_count ?? 0 : 0),
      netWinnings: winner.netWinnings,
    });
    resetPrizePeriod();
    console.log(
      `[prize] Awarded a ${pick.gift.star_count}⭐ gift to ${winner.displayName} (${winner.telegramId}) — target was 50% of ${revenueThisPeriod}⭐ this period.`
    );
  } catch (err) {
    console.error('[prize] Failed to award weekly prize:', (err as Error).message);
  }
}

export { pickGiftWithinBudget };

export function startPrizeScheduler(botToken: string | undefined): void {
  checkAndAwardWeeklyPrize(botToken);
  setInterval(() => checkAndAwardWeeklyPrize(botToken), CHECK_INTERVAL_MS);
}

export { getLastPrize };
