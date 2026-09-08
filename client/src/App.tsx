import { useEffect, useState } from 'react';
import { authenticate, fetchTables } from './api';
import { initTelegram } from './telegram';
import { pokerSocket } from './ws';
import { Lobby } from './screens/Lobby';
import { TableScreen } from './screens/Table';
import type { TableSummary, User } from './types';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [tables, setTables] = useState<TableSummary[]>([]);
  const [activeTable, setActiveTable] = useState<TableSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    initTelegram();
    pokerSocket.connect();
    const off = pokerSocket.on((msg) => {
      if (msg.type === 'auth_ok') setUser(msg.user);
    });
    Promise.all([authenticate(), fetchTables()])
      .then(([u, t]) => {
        setUser(u);
        setTables(t);
      })
      .catch((err) => setLoadError(err.message));
    return off;
  }, []);

  async function refreshUser(): Promise<void> {
    try {
      setUser(await authenticate());
    } catch {
      // keep last known balance if the refresh fails transiently
    }
  }

  useEffect(() => {
    if (activeTable) return;
    const interval = setInterval(() => fetchTables().then(setTables).catch(() => {}), 5000);
    return () => clearInterval(interval);
  }, [activeTable]);

  if (loadError) return <div className="fatal-error">Failed to load: {loadError}</div>;
  if (!user) return <div className="loading">Loading…</div>;

  if (activeTable) {
    return (
      <TableScreen
        summary={activeTable}
        user={user}
        onBalanceChange={(delta) => setUser((u) => (u ? { ...u, starsBalance: u.starsBalance + delta } : u))}
        onLeave={() => {
          setActiveTable(null);
          refreshUser();
        }}
      />
    );
  }

  return <Lobby user={user} tables={tables} onSelectTable={setActiveTable} onBalanceRefresh={refreshUser} />;
}
