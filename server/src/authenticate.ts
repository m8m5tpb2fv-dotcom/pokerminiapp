import { validateInitData, type TelegramUser } from './telegram.js';

/**
 * In dev mode (no BOT_TOKEN configured) we accept initData shaped as
 * `debug:<telegramId>:<displayName>` so the app can be exercised without a real
 * Telegram client. Never enabled once BOT_TOKEN is set.
 */
export function authenticateInitData(initData: string, botToken: string | undefined): TelegramUser | null {
  if (!botToken) {
    const match = /^debug:(\d+):(.+)$/.exec(initData);
    if (!match) return null;
    return { id: Number(match[1]), first_name: match[2] };
  }
  return validateInitData(initData, botToken);
}
