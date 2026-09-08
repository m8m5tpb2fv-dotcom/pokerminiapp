import { useState } from 'react';
import type { ActionType } from '../types';

interface Props {
  canAct: boolean;
  currentBet: number;
  myCommitted: number;
  myStack: number;
  minRaiseTo: number;
  bigBlind: number;
  onAction: (action: ActionType, amount?: number) => void;
}

export function ActionBar({ canAct, currentBet, myCommitted, myStack, minRaiseTo, bigBlind, onAction }: Props) {
  const maxTotal = myCommitted + myStack;
  const [raiseTo, setRaiseTo] = useState(minRaiseTo);

  if (!canAct) return <div className="action-bar action-bar-waiting">Waiting for your turn…</div>;

  const toCall = Math.min(currentBet - myCommitted, myStack);
  const canCheck = myCommitted === currentBet;
  const canRaise = maxTotal > currentBet;
  const clampedRaiseTo = Math.min(Math.max(raiseTo, Math.min(minRaiseTo, maxTotal)), maxTotal);

  return (
    <div className="action-bar">
      {canRaise && (
        <div className="raise-controls">
          <input
            type="range"
            min={Math.min(minRaiseTo, maxTotal)}
            max={maxTotal}
            step={bigBlind}
            value={clampedRaiseTo}
            onChange={(e) => setRaiseTo(Number(e.target.value))}
          />
          <span className="raise-amount">⭐ {clampedRaiseTo}</span>
        </div>
      )}
      <div className="action-buttons">
        <button className="btn btn-fold" onClick={() => onAction('fold')}>
          Fold
        </button>
        {canCheck ? (
          <button className="btn btn-check" onClick={() => onAction('check')}>
            Check
          </button>
        ) : (
          <button className="btn btn-call" onClick={() => onAction('call')}>
            Call ⭐{toCall}
          </button>
        )}
        {canRaise && (
          <button
            className="btn btn-raise"
            onClick={() => onAction(currentBet === 0 ? 'bet' : 'raise', clampedRaiseTo)}
          >
            {currentBet === 0 ? 'Bet' : clampedRaiseTo === maxTotal ? 'All in' : 'Raise'} ⭐{clampedRaiseTo}
          </button>
        )}
      </div>
    </div>
  );
}
