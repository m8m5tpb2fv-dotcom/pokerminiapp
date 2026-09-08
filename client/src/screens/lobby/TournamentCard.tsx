import { useEffect, useState } from 'react';
import { fetchTournament, registerForTournament, unregisterFromTournament } from '../../api';
import type { TournamentInfo, User } from '../../types';

function formatCountdown(nextStartAt: string, now: number): string {
  const target = new Date(`${nextStartAt.replace(' ', 'T')}Z`).getTime();
  const diff = Math.max(0, target - now);
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1_000);
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

interface Props {
  user: User;
  onEnterTournament: (info: TournamentInfo) => void;
}

export function TournamentCard({ user, onEnterTournament }: Props) {
  const [info, setInfo] = useState<TournamentInfo | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    function load(): void {
      fetchTournament()
        .then((i) => {
          if (!cancelled) setInfo(i);
        })
        .catch(() => {});
    }
    load();
    const interval = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (info?.isSeated) onEnterTournament(info);
  }, [info, onEnterTournament]);

  if (!info) return null;

  async function toggleRegister(): Promise<void> {
    if (!info) return;
    setBusy(true);
    setError(null);
    try {
      if (info.isRegistered) await unregisterFromTournament();
      else await registerForTournament();
      setInfo(await fetchTournament());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const prizePool = info.buyIn * info.maxSeats;
  const prize = Math.floor(prizePool * 0.5);

  return (
    <div className="tournament-card">
      <div className="lobby-section-title">Daily Tournament</div>
      <div className="lobby-hint">
        Once a day, {info.maxSeats} players face off for ⭐{info.buyIn} each. The winner takes real Telegram gifts
        worth 50-55% of the prize pool (~⭐{prize} today). Too few players by start time and everyone gets refunded.
      </div>

      {info.status === 'running' ? (
        <div className="tournament-status-row">
          <div className="tournament-progress">🏆 Tournament in progress</div>
        </div>
      ) : (
        <div className="tournament-status-row">
          <div className="tournament-meta">Starts in</div>
          <div className="tournament-countdown">{formatCountdown(info.nextStartAt, now)}</div>
        </div>
      )}

      <div className="tournament-progress">
        {info.registeredCount}/{info.maxSeats} registered
      </div>

      {info.status === 'scheduled' && (
        <button
          className={info.isRegistered ? 'btn btn-tournament-leave' : 'btn btn-gold btn-tournament'}
          disabled={busy || (!info.isRegistered && user.starsBalance < info.buyIn)}
          onClick={toggleRegister}
        >
          {info.isRegistered ? 'Cancel registration' : `Register — ⭐${info.buyIn}`}
        </button>
      )}

      {error && <div className="toast toast-error">{error}</div>}

      {info.lastResult && (
        <div className="prize-banner">
          🎁 Yesterday's winner: <strong>{info.lastResult.displayName}</strong>
          {info.lastResult.starCount ? ` — ⭐${info.lastResult.starCount} in gifts` : ''} from a ⭐{info.lastResult.prizePool} pool.
        </div>
      )}
    </div>
  );
}
