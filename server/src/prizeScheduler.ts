import { getLastPrize, getLeaderboard, getPrizePeriodStart, recordPrizeAwarded, resetPrizePeriod } from './db.js';
import { getAvailableGifts, getMyStarBalance, sendGift, type TelegramGift } from './telegram.js';

const PERIOD_MS = 7 * 24 * 60 * 60 * 1000; // weekly
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // check hourly whether the period has elapsed
/** Keep some balance in reserve so the bot never fails to answer real Stars purchases because it spent everything on a prize. */
const RESERVE_STARS = 10;

function pickAffordableGift(gifts: TelegramGift[], balance: number, wantUpgrade: boolean): { gift: TelegramGift; payForUpgrade: boolean } | null {
  const spendable = balance - RESERVE_STARS;
  if (spendable <= 0) return null;

  if (wantUpgrade) {
    const upgradable = gifts
      .filter((g) => g.upgrade_star_count && g.star_count + g.upgrade_star_count <= spendable)
      .sort((a, b) => a.star_count + (a.upgrade_star_count ?? 0) - (b.star_count + (b.upgrade_star_count ?? 0)));
    if (upgradable.length > 0) return { gift: upgradable[0], payForUpgrade: true };
  }

  const affordable = gifts.filter((g) => g.star_count <= spendable).sort((a, b) => a.star_count - b.star_count);
  if (affordable.length === 0) return null;
  // Prefer the priciest one we can afford without upgrading, so the weekly prize still feels substantial.
  return { gift: affordable[affordable.length - 1], payForUpgrade: false };
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

  try {
    const [balance, gifts] = await Promise.all([getMyStarBalance(botToken), getAvailableGifts(botToken)]);
    const pick = pickAffordableGift(gifts, balance, true);
    if (!pick) {
      console.warn(`[prize] Skipping weekly prize: bot Star balance (${balance}) too low to afford any gift.`);
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
    console.log(`[prize] Awarded a gift to ${winner.displayName} (${winner.telegramId}) for +${winner.netWinnings} net winnings.`);
  } catch (err) {
    console.error('[prize] Failed to award weekly prize:', (err as Error).message);
  }
}

export { pickAffordableGift };

export function startPrizeScheduler(botToken: string | undefined): void {
  checkAndAwardWeeklyPrize(botToken);
  setInterval(() => checkAndAwardWeeklyPrize(botToken), CHECK_INTERVAL_MS);
}

export { getLastPrize };
