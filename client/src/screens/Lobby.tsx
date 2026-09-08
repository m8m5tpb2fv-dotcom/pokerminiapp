import { useState } from 'react';
import { StatusBadge } from '../components/StatusBadge';
import { TabBar, type LobbyTab } from '../components/TabBar';
import { LeaderboardTab } from './lobby/LeaderboardTab';
import { ProfileTab } from './lobby/ProfileTab';
import { StatusTab } from './lobby/StatusTab';
import { TablesTab } from './lobby/TablesTab';
import { TopUpTab } from './lobby/TopUpTab';
import { TournamentTab } from './lobby/TournamentTab';
import type { LeaderboardData, RankTier, StatusTier, TableSummary, TournamentInfo, User } from '../types';

interface Props {
  user: User;
  tables: TableSummary[];
  leaderboard: LeaderboardData;
  statusTiers: StatusTier[];
  rankTiers: RankTier[];
  tournament: TournamentInfo | null;
  onTournamentChange: (info: TournamentInfo) => void;
  onSelectTable: (table: TableSummary) => void;
  onBalanceRefresh: () => void;
  onUserChange: (user: User) => void;
  onEditNickname: () => void;
}

export function Lobby({
  user,
  tables,
  leaderboard,
  statusTiers,
  rankTiers,
  tournament,
  onTournamentChange,
  onSelectTable,
  onBalanceRefresh,
  onUserChange,
  onEditNickname,
}: Props) {
  const [tab, setTab] = useState<LobbyTab>('tables');

  return (
    <div className="lobby">
      <div className="lobby-header">
        <div className="brand-row">
          <img src="/logo-96.png" alt="" className="lobby-logo" />
          <div>
            <div className="lobby-title">Stars Poker</div>
            <div className="lobby-name-display">
              {user.displayName} <StatusBadge tierId={user.statusTier} tiers={statusTiers} />
            </div>
          </div>
        </div>
        <div className="lobby-balance">⭐ {user.starsBalance}</div>
      </div>

      <div className="lobby-content">
        {tab === 'tables' && <TablesTab tables={tables} onSelectTable={onSelectTable} />}
        {tab === 'topup' && <TopUpTab onBalanceRefresh={onBalanceRefresh} />}
        {tab === 'status' && (
          <StatusTab user={user} statusTiers={statusTiers} rankTiers={rankTiers} onUserChange={onUserChange} />
        )}
        {tab === 'tournament' && (
          <TournamentTab user={user} tournament={tournament} onTournamentChange={onTournamentChange} />
        )}
        {tab === 'leaderboard' && (
          <LeaderboardTab user={user} leaderboard={leaderboard} statusTiers={statusTiers} rankTiers={rankTiers} />
        )}
        {tab === 'profile' && (
          <ProfileTab user={user} statusTiers={statusTiers} onUserChange={onUserChange} onEditNickname={onEditNickname} />
        )}
      </div>

      <TabBar active={tab} onChange={setTab} />
    </div>
  );
}
