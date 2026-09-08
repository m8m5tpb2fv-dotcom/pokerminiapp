import { Avatar } from './Avatar';
import { Card, CardBack } from './Card';
import { StatusBadge } from './StatusBadge';
import type { PublicSeatView, StatusTier } from '../types';

interface Props {
  seat: PublicSeatView | undefined;
  seatIndex: number;
  isButton: boolean;
  isToAct: boolean;
  isMe: boolean;
  onSit: (seatIndex: number) => void;
  canSit: boolean;
  statusTiers?: StatusTier[];
  /** Used to key hole-card backs so the deal animation replays each new hand. */
  handNumber?: number;
}

export function Seat({ seat, seatIndex, isButton, isToAct, isMe, onSit, canSit, statusTiers, handNumber }: Props) {
  if (!seat) {
    return (
      <div className="seat seat-empty">
        {canSit ? (
          <button className="sit-button" onClick={() => onSit(seatIndex)}>
            Sit
          </button>
        ) : (
          <span className="seat-empty-label">Empty</span>
        )}
      </div>
    );
  }

  return (
    <div className={`seat ${isToAct ? 'seat-active' : ''} ${seat.status === 'folded' ? 'seat-folded' : ''}`}>
      {isButton && <div className="dealer-button">D</div>}
      <div className="seat-cards">
        {seat.holeCardsHidden
          ? seat.status !== 'sitting_out' && [0, 1].map((i) => <CardBack key={`${handNumber}-${i}`} />)
          : (seat.holeCards ?? []).map((c) => <Card key={c} code={c} />)}
      </div>
      <div className="seat-info">
        <Avatar telegramId={seat.telegramId} avatarVersion={seat.avatarVersion} displayName={seat.displayName} size={26} />
        <div className="seat-name">
          {seat.displayName}
          {isMe ? ' (you)' : ''}
        </div>
        {seat.statusTier && (
          <div className="seat-status-line">
            <StatusBadge tierId={seat.statusTier} tiers={statusTiers} />
          </div>
        )}
        <div className="seat-stack">⭐ {seat.stack}</div>
        {seat.status === 'all_in' && <div className="seat-badge">ALL IN</div>}
        {seat.status === 'folded' && <div className="seat-badge">FOLD</div>}
      </div>
      {seat.committedThisStreet > 0 && <div className="seat-bet">⭐ {seat.committedThisStreet}</div>}
    </div>
  );
}
