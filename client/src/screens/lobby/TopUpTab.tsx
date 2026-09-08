import { useState } from 'react';
import { requestStarsInvoice } from '../../api';
import { isRealTelegramClient, openInvoice } from '../../telegram';

const STAR_PACKAGES = [50, 100, 250, 500, 1000];

interface Props {
  onBalanceRefresh: () => void;
}

export function TopUpTab({ onBalanceRefresh }: Props) {
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
  );
}
