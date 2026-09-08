import { useState } from 'react';
import { requestStarsInvoice } from '../api';
import { openInvoice, isRealTelegramClient } from '../telegram';
import type { TableSummary, User } from '../types';

const STAR_PACKAGES = [50, 100, 250, 500, 1000];

interface Props {
  user: User;
  tables: TableSummary[];
  onSelectTable: (table: TableSummary) => void;
  onBalanceRefresh: () => void;
}

export function Lobby({ user, tables, onSelectTable, onBalanceRefresh }: Props) {
  const [buying, setBuying] = useState<number | null>(null);
  const [buyError, setBuyError] = useState<string | null>(null);

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

  return (
    <div className="lobby">
      <div className="lobby-header">
        <div className="lobby-title">Stars Poker</div>
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
    </div>
  );
}
