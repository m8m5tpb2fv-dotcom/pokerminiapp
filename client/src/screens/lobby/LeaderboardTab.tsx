import { StatusBadge } from '../../components/StatusBadge';
import type { LeaderboardData, StatusTier, TournamentInfo, User } from '../../types';
import { TournamentCard } from './TournamentCard';

interface Props {
  user: User;
  leaderboard: LeaderboardData;
  statusTiers: StatusTier[];
  onEnterTournament: (info: TournamentInfo) => void;
}

export function LeaderboardTab({ user, leaderboard, statusTiers, onEnterTournament }: Props) {
  return (
    <div className="lobby-section">
      <TournamentCard user={user} onEnterTournament={onEnterTournament} />

      <div className="lobby-section-title">Weekly Leaderboard</div>
      <div className="lobby-hint">Top player each week wins real Telegram gifts worth ~50-55% of the Stars purchased this week, sent by the bot.</div>
      {leaderboard.lastPrize && (
        <div className="prize-banner">
          🎁 Last week's winner: <strong>{leaderboard.lastPrize.displayName}</strong> — ⭐{leaderboard.lastPrize.starCount} in gifts for +
          {leaderboard.lastPrize.netWinnings} net winnings
        </div>
      )}
      {leaderboard.leaderboard.length === 0 ? (
        <div className="lobby-hint">Nobody has played a hand yet this week — be the first!</div>
      ) : (
        <div className="leaderboard-list">
          {leaderboard.leaderboard.map((entry, i) => (
            <div
              key={entry.telegramId}
              className={`leaderboard-row ${entry.telegramId === user.telegramId ? 'leaderboard-row-me' : ''}`}
            >
              <div className="leaderboard-rank">#{i + 1}</div>
              <div className="leaderboard-name">
                {entry.displayName} <StatusBadge tierId={entry.statusTier} tiers={statusTiers} />
              </div>
              <div className={`leaderboard-net ${entry.netWinnings >= 0 ? 'leaderboard-net-positive' : 'leaderboard-net-negative'}`}>
                {entry.netWinnings >= 0 ? '+' : ''}
                {entry.netWinnings}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
