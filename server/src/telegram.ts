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
