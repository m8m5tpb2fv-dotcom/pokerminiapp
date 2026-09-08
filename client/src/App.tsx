import { useEffect, useState } from 'react';
import { authenticate, fetchLeaderboard, fetchRankTiers, fetchStatusTiers, fetchTables, fetchTournament } from './api';
import { initTelegram } from './telegram';
import { pokerSocket } from './ws';
import { Lobby } from './screens/Lobby';
import { NicknameScreen } from './screens/Nickname';
import { TableScreen } from './screens/Table';
import type { LeaderboardData, RankTier, StatusTier, TableSummary, TournamentInfo, User } from './types';

const EMPTY_LEADERBOARD: LeaderboardData = { leaderboard: [], byTier: {}, periodStart: '', lastPrize: null };

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [tables, setTables] = useState<TableSummary[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardData>(EMPTY_LEADERBOARD);
  const [statusTiers, setStatusTiers] = useState<StatusTier[]>([]);
  const [rankTiers, setRankTiers] = useState<RankTier[]>([]);
  const [tournament, setTournament] = useState<TournamentInfo | null>(null);
  const [activeTable, setActiveTable] = useState<TableSummary | null>(null);
  const [editingNickname, setEditingNickname] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    initTelegram();
    pokerSocket.connect();
    const off = pokerSocket.on((msg) => {
      if (msg.type === 'auth_ok') setUser(msg.user);
    });
    Promise.all([authenticate(), fetchTables(), fetchLeaderboard(), fetchStatusTiers(), fetchRankTiers(), fetchTournament()])
      .then(([u, t, l, s, r, tour]) => {
        setUser(u);
        setTables(t);
        setLeaderboard(l);
        setStatusTiers(s);
        setRankTiers(r);
        setTournament(tour);
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

  // Polls independently of which lobby tab is open, so a player who registered and wandered off
  // to another tab still gets auto-seated into the tournament table the moment it starts.
  useEffect(() => {
    if (activeTable) return;
    const interval = setInterval(() => {
      fetchTables().then(setTables).catch(() => {});
      fetchLeaderboard().then(setLeaderboard).catch(() => {});
      fetchTournament().then(setTournament).catch(() => {});
      refreshUser();
    }, 5000);
    return () => clearInterval(interval);
  }, [activeTable]);

  useEffect(() => {
    if (!tournament?.isSeated || activeTable) return;
    setActiveTable({
      tableId: 'tournament',
      smallBlind: tournament.smallBlind,
      bigBlind: tournament.bigBlind,
      maxSeats: tournament.maxSeats,
      minBuyIn: tournament.buyIn,
      maxBuyIn: tournament.buyIn,
      seatedCount: tournament.maxSeats,
    });
  }, [tournament, activeTable]);

  if (loadError) return <div className="fatal-error">Failed to load: {loadError}</div>;
  if (!user) {
    return (
      <div className="loading">
        <img src="/logo-180.png" alt="" className="loading-logo" />
        <div className="loading-spinner" />
      </div>
    );
  }

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
          fetchTournament().then(setTournament).catch(() => {});
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
      rankTiers={rankTiers}
      tournament={tournament}
      onTournamentChange={setTournament}
      onSelectTable={setActiveTable}
      onBalanceRefresh={refreshUser}
      onUserChange={setUser}
      onEditNickname={() => setEditingNickname(true)}
    />
  );
}
