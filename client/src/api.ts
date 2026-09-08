import { SERVER_URL } from './config';
import { getInitData } from './telegram';
import type { LeaderboardEntry, StatusTier, TableSummary, User } from './types';

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${SERVER_URL}/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `Request failed: ${res.status}`);
  return data as T;
}

export async function authenticate(): Promise<User> {
  const { user } = await post<{ user: User }>('/auth', { initData: getInitData() });
  return user;
}

export async function fetchTables(): Promise<TableSummary[]> {
  const res = await fetch(`${SERVER_URL}/api/tables`);
  const data = await res.json();
  return data.tables as TableSummary[];
}

export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  const res = await fetch(`${SERVER_URL}/api/leaderboard`);
  const data = await res.json();
  return data.leaderboard as LeaderboardEntry[];
}

export async function requestStarsInvoice(stars: number): Promise<string> {
  const { invoiceLink } = await post<{ invoiceLink: string }>('/stars/invoice', {
    initData: getInitData(),
    stars,
  });
  return invoiceLink;
}

export async function setNickname(nickname: string): Promise<User> {
  const { user } = await post<{ user: User }>('/nickname', { initData: getInitData(), nickname });
  return user;
}

export async function fetchStatusTiers(): Promise<StatusTier[]> {
  const res = await fetch(`${SERVER_URL}/api/statuses`);
  const data = await res.json();
  return data.statuses as StatusTier[];
}

export async function purchaseStatus(statusId: string): Promise<User> {
  const { user } = await post<{ user: User }>('/status/purchase', { initData: getInitData(), statusId });
  return user;
}
