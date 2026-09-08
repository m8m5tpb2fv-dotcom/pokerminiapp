import { getInitData } from './telegram';
import type { TableSummary, User } from './types';

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
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
  const res = await fetch('/api/tables');
  const data = await res.json();
  return data.tables as TableSummary[];
}

export async function requestStarsInvoice(stars: number): Promise<string> {
  const { invoiceLink } = await post<{ invoiceLink: string }>('/stars/invoice', {
    initData: getInitData(),
    stars,
  });
  return invoiceLink;
}
