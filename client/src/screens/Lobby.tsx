import { useState } from 'react';
import { purchaseStatus, requestStarsInvoice } from '../api';
import { StatusBadge } from '../components/StatusBadge';
import { openInvoice, isRealTelegramClient } from '../telegram';
import { pokerSocket } from '../ws';
import type { LeaderboardData, StatusTier, TableSummary, User } from '../types';

const STAR_PACKAGES = [50, 100, 250, 500, 1000];

interface Props {
  user: User;
  tables: TableSummary[];
  leaderboard: LeaderboardData;
  statusTiers: StatusTier[];
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
  onSelectTable,
  onBalanceRefresh,
  onUserChange,
  onEditNickname,
}: Props) {
  const [buying, setBuying] = useState<number | null>(null);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [purchasingStatus, setPurchasingStatus] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  async function buyStars(stars: number): Promise<void> {
    setBuying(stars);
    setBuyError(null);
    try {
      const link = await requestStarsInvoice(stars);
      const status = await openInvoice(link);
      if (status === 'paid') onBalanceRefresh();
    } catch (err) {
      setBuyError((err as Error).message);
    } finally {
      setBuying(null);
    }
  }

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

      <div className="lobby-section">
        <div className="lobby-section-title">Buy Stars</div>
        {!isRealTelegramClient() && (
          <div className="lobby-hint">Open inside Telegram to buy real Stars. In this browser preview, purchases are disabled.</div>
        )}
        <div className="star-packages">
          {STAR_PACKAGES.map((stars) => (
            <button
              key={stars}
              className="btn btn-package"
              disabled={buying !== null || !isRealTelegramClient()}
              onClick={() => buyStars(stars)}
            >
              ⭐ {stars}
            </button>
          ))}
        </div>
        {buyError && <div className="toast toast-error">{buyError}</div>}
      </div>

      <div className="lobby-section">
        <div className="lobby-section-title">Tables</div>
        <div className="table-list">
          {tables.map((t) => (
            <button key={t.tableId} className="table-row" onClick={() => onSelectTable(t)}>
              <div className="table-row-name">{t.tableId.toUpperCase()}</div>
              <div className="table-row-blinds">⭐ {t.smallBlind}/{t.bigBlind}</div>
              <div className="table-row-buyin">Buy-in ⭐{t.minBuyIn}–{t.maxBuyIn}</div>
              <div className="table-row-seats">{t.seatedCount}/{t.maxSeats} seated</div>
            </button>
          ))}
        </div>
      </div>

      {statusTiers.length > 0 && (
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
      )}

      {(leaderboard.leaderboard.length > 0 || leaderboard.lastPrize) && (
        <div className="lobby-section">
          <div className="lobby-section-title">Weekly Leaderboard</div>
          <div className="lobby-hint">Top player each week wins a real Telegram gift worth ~50% of the Stars purchased this week, sent by the bot.</div>
          {leaderboard.lastPrize && (
            <div className="prize-banner">
              🎁 Last week's winner: <strong>{leaderboard.lastPrize.displayName}</strong> — a ⭐{leaderboard.lastPrize.starCount} gift
              for +{leaderboard.lastPrize.netWinnings} net winnings
            </div>
          )}
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
        </div>
      )}
    </div>
  );
}
