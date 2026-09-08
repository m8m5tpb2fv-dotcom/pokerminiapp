import { useState } from 'react';
import { Avatar } from '../../components/Avatar';
import { StatusBadge } from '../../components/StatusBadge';
import type { LeaderboardData, RankTier, StatusTier, User } from '../../types';

interface Props {
  user: User;
  leaderboard: LeaderboardData;
  statusTiers: StatusTier[];
  rankTiers: RankTier[];
}

export function LeaderboardTab({ user, leaderboard, statusTiers, rankTiers }: Props) {
  const [activeTier, setActiveTier] = useState(() => user.rankTier ?? rankTiers[0]?.id ?? 'bronze');
  const activeTierInfo = rankTiers.find((t) => t.id === activeTier);
  const tierBoard = leaderboard.byTier[activeTier] ?? [];

  return (
    <div className="lobby-section">
      <div className="lobby-section-title">Weekly Leaderboard</div>
      <div className="lobby-hint">
        Top player each week wins real Telegram gifts worth ~50-55% of the Stars purchased this week, sent by the
        bot. Standings are ranked separately within each earned rank, so every tier has its own #1.
      </div>
      {leaderboard.lastPrize && (
        <div className="prize-banner">
          🎁 Last week's winner: <strong>{leaderboard.lastPrize.displayName}</strong> — ⭐{leaderboard.lastPrize.starCount} in gifts for +
          {leaderboard.lastPrize.netWinnings} net winnings
        </div>
      )}

      <div className="rank-tab-bar">
        {rankTiers.map((tier) => (
          <button
            key={tier.id}
            className={`rank-tab-item ${activeTier === tier.id ? 'rank-tab-item-active' : ''}`}
            style={activeTier === tier.id ? { borderColor: tier.color, color: tier.color } : undefined}
            onClick={() => setActiveTier(tier.id)}
          >
            {tier.label}
          </button>
        ))}
      </div>

      {tierBoard.length === 0 ? (
        <div className="lobby-hint">
          Nobody in {activeTierInfo?.label ?? activeTier} has played a hand yet this week — be the first!
        </div>
      ) : (
        <div className="leaderboard-list">
          {tierBoard.map((entry, i) => (
            <div
              key={entry.telegramId}
              className={`leaderboard-row ${entry.telegramId === user.telegramId ? 'leaderboard-row-me' : ''} ${i === 0 ? 'leaderboard-row-first' : ''}`}
            >
              <div className="leaderboard-rank">{i === 0 ? '👑' : `#${i + 1}`}</div>
              <Avatar telegramId={entry.telegramId} avatarVersion={entry.avatarVersion} displayName={entry.displayName} size={26} />
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
