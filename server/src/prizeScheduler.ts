import { getLastPrize, getLeaderboard, getPrizePeriodStart, getRevenueSince, recordPrizeAwarded, resetPrizePeriod } from './db.js';
import { getAvailableGifts, getMyStarBalance, sendGift, type TelegramGift } from './telegram.js';

const PERIOD_MS = 7 * 24 * 60 * 60 * 1000; // weekly
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // check hourly whether the period has elapsed
/** The winner's gift bundle is worth somewhere in this share range of the Stars the bot actually took in this period. */
const PRIZE_REVENUE_SHARE_MIN = 0.5;
const PRIZE_REVENUE_SHARE_MAX = 0.55;
/** Keep some balance in reserve so the bot never fails to answer real Stars purchases because it spent everything on a prize. */
const RESERVE_STARS = 10;
/** Cap how many individual gifts a single payout combines, so topping up the budget never turns into a flood of the cheapest gift. */
const MAX_GIFTS_PER_PRIZE = 6;

export interface GiftPick {
  gift: TelegramGift;
  payForUpgrade: boolean;
}

/**
 * Fills up to `maxSpendable` Stars with a small bundle of gifts (leading with the priciest
 * upgradable/collectible one that fits, then topping up with additional plain gifts,
 * largest-fit-first) rather than a single gift, so the payout can land closer to the target
 * share even when no single catalog gift is priced near it.
 */
export function pickGiftBundleWithinBudget(
  gifts: TelegramGift[],
  maxSpendable: number
): { picks: GiftPick[]; totalSpent: number } | null {
  if (maxSpendable <= 0) return null;

  const picks: GiftPick[] = [];
  let remaining = maxSpendable;

  const upgradable = gifts
    .filter((g) => g.upgrade_star_count && g.star_count + g.upgrade_star_count <= remaining)
    .sort((a, b) => b.star_count + (b.upgrade_star_count ?? 0) - (a.star_count + (a.upgrade_star_count ?? 0)));
  if (upgradable.length > 0) {
    const gift = upgradable[0];
    picks.push({ gift, payForUpgrade: true });
    remaining -= gift.star_count + (gift.upgrade_star_count ?? 0);
  }

  const byPriceDesc = [...gifts].sort((a, b) => b.star_count - a.star_count);
  while (picks.length < MAX_GIFTS_PER_PRIZE) {
    const next = byPriceDesc.find((g) => g.star_count <= remaining);
    if (!next) break;
    picks.push({ gift: next, payForUpgrade: false });
    remaining -= next.star_count;
  }

  if (picks.length === 0) return null;
  return { picks, totalSpent: maxSpendable - remaining };
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
  const minTarget = Math.floor(revenueThisPeriod * PRIZE_REVENUE_SHARE_MIN);
  const maxTarget = Math.floor(revenueThisPeriod * PRIZE_REVENUE_SHARE_MAX);
  if (maxTarget <= 0) {
    console.log('[prize] No Stars purchased this period; skipping the prize and starting a new one.');
    resetPrizePeriod();
    return;
  }

  try {
    const [balance, gifts] = await Promise.all([getMyStarBalance(botToken), getAvailableGifts(botToken)]);
    const spendable = Math.min(maxTarget, balance - RESERVE_STARS);
    const bundle = pickGiftBundleWithinBudget(gifts, spendable);
    if (!bundle) {
      console.warn(
        `[prize] Skipping weekly prize: target ${minTarget}-${maxTarget}⭐ (50-55% of ${revenueThisPeriod}⭐ revenue) vs bot balance ${balance}⭐ leaves nothing affordable.`
      );
      return; // try again on the next hourly check without losing the period's winner
    }
    for (const pick of bundle.picks) {
      await sendGift(botToken, {
        userId: winner.telegramId,
        giftId: pick.gift.id,
        payForUpgrade: pick.payForUpgrade,
        text: `🏆 Weekly Stars Poker leaderboard winner! Net +${winner.netWinnings} ⭐`,
      });
    }
    recordPrizeAwarded({
      telegramId: winner.telegramId,
      displayName: winner.displayName,
      giftId: bundle.picks[0].gift.id,
      starCount: bundle.totalSpent,
      netWinnings: winner.netWinnings,
    });
    resetPrizePeriod();
    console.log(
      `[prize] Awarded ${bundle.picks.length} gift(s) worth ${bundle.totalSpent}⭐ total to ${winner.displayName} (${winner.telegramId}) — target was 50-55% of ${revenueThisPeriod}⭐ this period.`
    );
  } catch (err) {
    console.error('[prize] Failed to award weekly prize:', (err as Error).message);
  }
}

export function startPrizeScheduler(botToken: string | undefined): void {
  checkAndAwardWeeklyPrize(botToken);
  setInterval(() => checkAndAwardWeeklyPrize(botToken), CHECK_INTERVAL_MS);
}

export { getLastPrize };
