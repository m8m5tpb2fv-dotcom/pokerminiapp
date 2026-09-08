import { useState } from 'react';
import { purchaseStatus } from '../../api';
import { pokerSocket } from '../../ws';
import type { RankTier, StatusTier, User } from '../../types';

interface Props {
  user: User;
  statusTiers: StatusTier[];
  rankTiers: RankTier[];
  onUserChange: (user: User) => void;
}

function RankProgress({ user, rankTiers }: { user: User; rankTiers: RankTier[] }) {
  const currentIndex = rankTiers.findIndex((t) => t.id === user.rankTier);
  const current = currentIndex >= 0 ? rankTiers[currentIndex] : null;
  const next = rankTiers[currentIndex + 1] ?? (currentIndex === -1 ? rankTiers[0] : undefined);
  const floor = current?.threshold ?? 0;
  const pct = next ? Math.min(100, Math.round(((user.points - floor) / (next.threshold - floor)) * 100)) : 100;

  return (
    <div className="lobby-section">
      <div className="lobby-section-title">Rank</div>
      <div className="lobby-hint">
        Earn 10 points for every hand you play and 50 for every hand you win. Reaching a new rank pays out a
        one-time Stars bonus automatically.
      </div>
      <div className="rank-current">
        {current ? (
          <span style={{ color: current.color }}>{current.label}</span>
        ) : (
          <span className="rank-none">No rank yet</span>
        )}
        <span className="rank-points">{user.points} pts</span>
      </div>
      {next && (
        <>
          <div className="rank-progress-bar">
            <div className="rank-progress-fill" style={{ width: `${pct}%`, background: next.color }} />
          </div>
          <div className="lobby-hint">
            {Math.max(0, next.threshold - user.points)} points to {next.label} (+⭐{next.bonus})
          </div>
        </>
      )}
      <div className="rank-tier-list">
        {rankTiers.map((tier) => (
          <div key={tier.id} className={`rank-tier-chip ${user.points >= tier.threshold ? 'rank-tier-chip-done' : ''}`}>
            <span style={{ color: tier.color }}>{tier.label}</span>
            <span className="lobby-hint">{tier.threshold}+ · +⭐{tier.bonus}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function StatusTab({ user, statusTiers, rankTiers, onUserChange }: Props) {
  const [purchasingStatus, setPurchasingStatus] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  async function buyStatus(tierId: string): Promise<void> {
    setPurchasingStatus(tierId);
    setStatusError(null);
    try {
      onUserChange(await purchaseStatus(tierId));
      pokerSocket.reauth();
    } catch (err) {
      setStatusError((err as Error).message);
    } finally {
      setPurchasingStatus(null);
    }
  }

  return (
    <>
      <RankProgress user={user} rankTiers={rankTiers} />
      <div className="lobby-section">
        <div className="lobby-section-title">Status</div>
        <div className="lobby-hint">
          Cosmetic rank shown next to your name at the table and on the leaderboard. Paid for with your Stars
          balance — once bought, you can switch back to any status you own for free.
        </div>
        <div className="status-shop">
          {statusTiers.map((tier, i) => {
            const currentRank = statusTiers.findIndex((t) => t.id === user.statusTier);
            const isCurrent = user.statusTier === tier.id;
            const isOwned = user.ownedStatusTiers.includes(tier.id);
            const isLocked = !isOwned && i <= currentRank;
            const canAfford = isOwned || user.starsBalance >= tier.price;
            return (
              <button
                key={tier.id}
                className={`status-shop-item ${isOwned && !isCurrent ? 'status-shop-item-owned' : ''}`}
                style={{ borderColor: tier.color }}
                disabled={purchasingStatus !== null || isCurrent || isLocked || !canAfford}
                onClick={() => buyStatus(tier.id)}
              >
                <span style={{ color: tier.color }}>{tier.label}</span>
                <span>{isCurrent ? 'Active' : isOwned ? 'Switch' : isLocked ? 'Locked' : `⭐ ${tier.price}`}</span>
              </button>
            );
          })}
        </div>
        {statusError && <div className="toast toast-error">{statusError}</div>}
      </div>
    </>
  );
}
