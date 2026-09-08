import { useState } from 'react';
import { StatusBadge } from '../components/StatusBadge';
import { TabBar, type LobbyTab } from '../components/TabBar';
import { LeaderboardTab } from './lobby/LeaderboardTab';
import { StatusTab } from './lobby/StatusTab';
import { TablesTab } from './lobby/TablesTab';
import { TopUpTab } from './lobby/TopUpTab';
import type { LeaderboardData, StatusTier, TableSummary, TournamentInfo, User } from '../types';

interface Props {
  user: User;
  tables: TableSummary[];
  leaderboard: LeaderboardData;
  statusTiers: StatusTier[];
  onSelectTable: (table: TableSummary) => void;
  onBalanceRefresh: () => void;
  onUserChange: (user: User) => void;
  onEditNickname: () => void;
  onEnterTournament: (info: TournamentInfo) => void;
}

export function Lobby({
  user,
  tables,
  leaderboard,
  statusTiers,
  onSelectTable,
  onBalanceRefresh,
  onUserChange,
  onEditNickname,
  onEnterTournament,
}: Props) {
  const [tab, setTab] = useState<LobbyTab>('tables');

  return (
    <div className="lobby">
      <div className="lobby-header">
        <div>
          <div className="lobby-title">Stars Poker</div>
          <button className="lobby-name-button" onClick={onEditNickname}>
            {user.displayName} <StatusBadge tierId={user.statusTier} tiers={statusTiers} /> · edit
          </button>
        </div>
        <div className="lobby-balance">⭐ {user.starsBalance}</div>
      </div>

      <div className="lobby-content">
        {tab === 'tables' && <TablesTab tables={tables} onSelectTable={onSelectTable} />}
        {tab === 'topup' && <TopUpTab onBalanceRefresh={onBalanceRefresh} />}
        {tab === 'status' && <StatusTab user={user} statusTiers={statusTiers} onUserChange={onUserChange} />}
        {tab === 'leaderboard' && (
          <LeaderboardTab user={user} leaderboard={leaderboard} statusTiers={statusTiers} onEnterTournament={onEnterTournament} />
        )}
      </div>

      <TabBar active={tab} onChange={setTab} />
    </div>
  );
}
