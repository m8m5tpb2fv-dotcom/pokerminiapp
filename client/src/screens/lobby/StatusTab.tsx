import { useState } from 'react';
import { purchaseStatus } from '../../api';
import { pokerSocket } from '../../ws';
import type { StatusTier, User } from '../../types';

interface Props {
  user: User;
  statusTiers: StatusTier[];
  onUserChange: (user: User) => void;
}

export function StatusTab({ user, statusTiers, onUserChange }: Props) {
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
    <div className="lobby-section">
      <div className="lobby-section-title">Status</div>
      <div className="lobby-hint">Cosmetic rank shown next to your name at the table and on the leaderboard. Paid for with your Stars balance.</div>
      <div className="status-shop">
        {statusTiers.map((tier) => (
          <button
            key={tier.id}
            className="status-shop-item"
            style={{ borderColor: tier.color }}
            disabled={purchasingStatus !== null || user.statusTier === tier.id || user.starsBalance < tier.price}
            onClick={() => buyStatus(tier.id)}
          >
            <span style={{ color: tier.color }}>{tier.label}</span>
            <span>{user.statusTier === tier.id ? 'Active' : `⭐ ${tier.price}`}</span>
          </button>
        ))}
      </div>
      {statusError && <div className="toast toast-error">{statusError}</div>}
    </div>
  );
}
