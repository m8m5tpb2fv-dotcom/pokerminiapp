import { useEffect, useMemo, useState } from 'react';
import { Card } from '../components/Card';
import { Seat } from '../components/Seat';
import { ActionBar } from '../components/ActionBar';
import { pokerSocket } from '../ws';
import { haptic } from '../telegram';
import type { ActionType, StatusTier, TableStateView, TableSummary, User } from '../types';

interface Props {
  summary: TableSummary;
  user: User;
  statusTiers: StatusTier[];
  onBalanceChange: (delta: number) => void;
  onLeave: () => void;
}

function seatPosition(seatIndex: number, maxSeats: number): { left: string; top: string } {
  const angle = (seatIndex / maxSeats) * 2 * Math.PI - Math.PI / 2;
  const rx = 42;
  const ry = 38;
  const left = 50 + rx * Math.cos(angle);
  const top = 50 + ry * Math.sin(angle);
  return { left: `${left}%`, top: `${top}%` };
}

export function TableScreen({ summary, user, statusTiers, onBalanceChange, onLeave }: Props) {
  const [view, setView] = useState<TableStateView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [buyInChoice, setBuyInChoice] = useState(summary.minBuyIn);

  useEffect(() => {
    const off = pokerSocket.on((msg) => {
      if (msg.type === 'table_state' && msg.view.tableId === summary.tableId) {
        setView(msg.view);
      } else if (msg.type === 'error') {
        setError(msg.message);
        setTimeout(() => setError(null), 3000);
      }
    });
    pokerSocket.watchTable(summary.tableId);
    return () => {
      off();
      pokerSocket.unwatchTable();
    };
  }, [summary.tableId]);

  const mySeat = view?.seats.find((s) => s.telegramId === user.telegramId);
  const emptySeatIndexes = useMemo(() => {
    // Until the first snapshot arrives we don't know who's really seated, so
    // treat every seat as unavailable rather than racing another player's join.
    if (!view) return [];
    const taken = new Set(view.seats.map((s) => s.seatIndex));
    return Array.from({ length: summary.maxSeats }, (_, i) => i).filter((i) => !taken.has(i));
  }, [view, summary.maxSeats]);

  function sit(seatIndex: number): void {
    if (buyInChoice > user.starsBalance) {
      setError('Not enough Stars');
      return;
    }
    onBalanceChange(-buyInChoice);
    pokerSocket.joinTable(summary.tableId, seatIndex, buyInChoice);
  }

  function leave(): void {
    pokerSocket.leaveTable();
    if (mySeat) onBalanceChange(mySeat.stack);
    onLeave();
  }

  function act(action: ActionType, amount?: number): void {
    haptic('impact');
    pokerSocket.act(action, amount);
  }

  const potTotal = view?.pots.reduce((sum, p) => sum + p.amount, 0) ?? 0;
  const canAct = Boolean(view && mySeat && view.toActSeatIndex === mySeat.seatIndex && mySeat.status === 'active');
  const isTournamentTable = summary.tableId === 'tournament';
  // Auto-seated tournament players stay in their seat (even after elimination) until the
  // whole tournament concludes and the server stands everyone up - no early cash-out.
  const lockedInTournament = isTournamentTable && Boolean(mySeat);

  return (
    <div className="table-screen">
      <div className="table-header">
        {lockedInTournament ? (
          <div className="btn-back tournament-locked">🏆 Tournament</div>
        ) : (
          <button className="btn-back" onClick={leave}>
            ← Leave
          </button>
        )}
        <div className="table-title">
          {isTournamentTable ? 'TOURNAMENT' : summary.tableId.toUpperCase()} · ⭐{summary.smallBlind}/{summary.bigBlind}
        </div>
        <div className="my-balance">⭐ {user.starsBalance}</div>
      </div>

      {error && <div className="toast toast-error">{error}</div>}

      <div className="poker-table">
        <div className="table-felt">
          <div className="community">
            {view?.communityCards.map((c) => <Card key={c} code={c} />)}
          </div>
          <div className="pot">Pot: ⭐ {potTotal}</div>
          {view?.winners && view.winners.length > 0 && (
            <div className="winner-banner">
              {view.winners.map((w) => {
                const seat = view.seats.find((s) => s.telegramId === w.telegramId);
                return (
                  <div key={w.telegramId}>
                    {seat?.displayName ?? w.telegramId} wins ⭐{w.amount} {w.handDescr ? `(${w.handDescr})` : ''}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {Array.from({ length: summary.maxSeats }, (_, seatIndex) => {
          const seat = view?.seats.find((s) => s.seatIndex === seatIndex);
          const pos = seatPosition(seatIndex, summary.maxSeats);
          return (
            <div className="seat-slot" style={pos} key={seatIndex}>
              <Seat
                seat={seat}
                seatIndex={seatIndex}
                isButton={view?.buttonSeatIndex === seatIndex}
                isToAct={view?.toActSeatIndex === seatIndex}
                isMe={seat?.telegramId === user.telegramId}
                onSit={sit}
                canSit={!mySeat && emptySeatIndexes.includes(seatIndex)}
                statusTiers={statusTiers}
                handNumber={view?.handNumber}
              />
            </div>
          );
        })}
      </div>

      {!mySeat && !isTournamentTable && (
        <div className="buyin-panel">
          <label>
            Buy-in: ⭐
            <input
              type="range"
              min={summary.minBuyIn}
              max={Math.min(summary.maxBuyIn, user.starsBalance) || summary.minBuyIn}
              step={summary.bigBlind}
              value={buyInChoice}
              onChange={(e) => setBuyInChoice(Number(e.target.value))}
            />
            {buyInChoice}
          </label>
          <div className="buyin-hint">Tap an empty seat to sit down.</div>
        </div>
      )}

      {mySeat && view && (
        <ActionBar
          canAct={canAct}
          currentBet={view.currentBet}
          myCommitted={mySeat.committedThisStreet}
          myStack={mySeat.stack}
          minRaiseTo={view.minRaiseTo}
          bigBlind={view.bigBlind}
          onAction={act}
        />
      )}
    </div>
  );
}
