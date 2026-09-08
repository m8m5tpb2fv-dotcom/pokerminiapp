import { useEffect, useState } from 'react';
import { authenticate, fetchLeaderboard, fetchStatusTiers, fetchTables } from './api';
import { initTelegram } from './telegram';
import { pokerSocket } from './ws';
import { Lobby } from './screens/Lobby';
import { NicknameScreen } from './screens/Nickname';
import { TableScreen } from './screens/Table';
import type { LeaderboardEntry, StatusTier, TableSummary, User } from './types';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [tables, setTables] = useState<TableSummary[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [statusTiers, setStatusTiers] = useState<StatusTier[]>([]);
  const [activeTable, setActiveTable] = useState<TableSummary | null>(null);
  const [editingNickname, setEditingNickname] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    initTelegram();
    pokerSocket.connect();
    const off = pokerSocket.on((msg) => {
      if (msg.type === 'auth_ok') setUser(msg.user);
    });
    Promise.all([authenticate(), fetchTables(), fetchLeaderboard(), fetchStatusTiers()])
      .then(([u, t, l, s]) => {
        setUser(u);
        setTables(t);
        setLeaderboard(l);
        setStatusTiers(s);
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
    const interval = setInterval(() => {
      fetchTables().then(setTables).catch(() => {});
      fetchLeaderboard().then(setLeaderboard).catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [activeTable]);

  if (loadError) return <div className="fatal-error">Failed to load: {loadError}</div>;
  if (!user) return <div className="loading">Loading…</div>;

  if (!user.nickname || editingNickname) {
    return (
      <NicknameScreen
        user={user}
        onCancel={user.nickname ? () => setEditingNickname(false) : undefined}
        onDone={(u) => {
          setUser(u);
          setEditingNickname(false);
          pokerSocket.reauth();
        }}
      />
    );
  }

  if (activeTable) {
    return (
      <TableScreen
        summary={activeTable}
        user={user}
        statusTiers={statusTiers}
        onBalanceChange={(delta) => setUser((u) => (u ? { ...u, starsBalance: u.starsBalance + delta } : u))}
        onLeave={() => {
          setActiveTable(null);
          refreshUser();
          fetchLeaderboard().then(setLeaderboard).catch(() => {});
        }}
      />
    );
  }

  return (
    <Lobby
      user={user}
      tables={tables}
      leaderboard={leaderboard}
      statusTiers={statusTiers}
      onSelectTable={setActiveTable}
      onBalanceRefresh={refreshUser}
      onUserChange={setUser}
      onEditNickname={() => setEditingNickname(true)}
    />
  );
}
