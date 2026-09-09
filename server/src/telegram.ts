import crypto from 'node:crypto';

export interface TelegramUser {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}

/**
 * Validates the `initData` string a Telegram Mini App sends on launch.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function validateInitData(initData: string, botToken: string): TelegramUser | null {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (computedHash !== hash) return null;

  const authDate = Number(params.get('auth_date') ?? 0);
  const maxAgeSeconds = 24 * 60 * 60;
  if (authDate && Date.now() / 1000 - authDate > maxAgeSeconds) return null;

  const userJson = params.get('user');
  if (!userJson) return null;
  try {
    return JSON.parse(userJson) as TelegramUser;
  } catch {
    return null;
  }
}

const TELEGRAM_API = 'https://api.telegram.org';

export async function createStarsInvoiceLink(botToken: string, title: string, description: string, payload: string, starsAmount: number): Promise<string> {
  const res = await fetch(`${TELEGRAM_API}/bot${botToken}/createInvoiceLink`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title,
      description,
      payload,
      currency: 'XTR',
      prices: [{ label: title, amount: starsAmount }],
    }),
  });
  const data = (await res.json()) as { ok: boolean; result?: string; description?: string };
  if (!data.ok || !data.result) {
    throw new Error(`Telegram createInvoiceLink failed: ${data.description ?? 'unknown error'}`);
  }
  return data.result;
}

export async function answerPreCheckoutQuery(botToken: string, preCheckoutQueryId: string, ok: boolean, errorMessage?: string): Promise<void> {
  await fetch(`${TELEGRAM_API}/bot${botToken}/answerPreCheckoutQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pre_checkout_query_id: preCheckoutQueryId, ok, error_message: errorMessage }),
  });
}

export interface TelegramGift {
  id: string;
  star_count: number;
  upgrade_star_count?: number;
  sticker?: { emoji?: string };
}

async function callTelegramApi<T>(botToken: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(`${TELEGRAM_API}/bot${botToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json()) as { ok: boolean; result?: T; description?: string };
  if (!data.ok) throw new Error(`Telegram ${method} failed: ${data.description ?? 'unknown error'}`);
  return data.result as T;
}

export async function getMyStarBalance(botToken: string): Promise<number> {
  const result = await callTelegramApi<{ amount: number }>(botToken, 'getMyStarBalance');
  return result.amount;
}

export async function getAvailableGifts(botToken: string): Promise<TelegramGift[]> {
  const result = await callTelegramApi<{ gifts: TelegramGift[] }>(botToken, 'getAvailableGifts');
  return result.gifts;
}

/** Sends a paid gift to a user, spending the bot's own Stars balance. */
export async function sendGift(
  botToken: string,
  params: { userId: number; giftId: string; payForUpgrade?: boolean; text?: string }
): Promise<void> {
  await callTelegramApi(botToken, 'sendGift', {
    user_id: params.userId,
    gift_id: params.giftId,
    pay_for_upgrade: params.payForUpgrade,
    text: params.text,
  });
}

/** Sends a chat message from the bot to a user or group (the bot must be a member of a group chat to post there). */
export async function sendMessage(botToken: string, chatId: number, text: string, parseMode?: 'HTML' | 'MarkdownV2'): Promise<void> {
  await callTelegramApi(botToken, 'sendMessage', { chat_id: chatId, text, parse_mode: parseMode });
}
