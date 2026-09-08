import { SERVER_URL } from './config';
import { getInitData } from './telegram';
import type { LeaderboardData, StatusTier, TableSummary, TournamentInfo, User } from './types';

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

export async function fetchLeaderboard(): Promise<LeaderboardData> {
  const res = await fetch(`${SERVER_URL}/api/leaderboard`);
  return (await res.json()) as LeaderboardData;
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

export async function fetchTournament(): Promise<TournamentInfo> {
  const res = await fetch(`${SERVER_URL}/api/tournament?initData=${encodeURIComponent(getInitData())}`);
  return (await res.json()) as TournamentInfo;
}

export async function registerForTournament(): Promise<void> {
  await post('/tournament/register', { initData: getInitData() });
}

export async function unregisterFromTournament(): Promise<void> {
  await post('/tournament/unregister', { initData: getInitData() });
}
