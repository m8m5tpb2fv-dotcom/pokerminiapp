import { useEffect, useState } from 'react';
import { adminAdjustBalance, fetchAdminDashboard } from '../../api';
import { Avatar } from '../../components/Avatar';
import type { AdminDashboard } from '../../types';

export function AdminTab() {
  const [data, setData] = useState<AdminDashboard | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [adjId, setAdjId] = useState('');
  const [adjAmount, setAdjAmount] = useState('');
  const [adjReason, setAdjReason] = useState('');
  const [adjBusy, setAdjBusy] = useState(false);
  const [adjResult, setAdjResult] = useState<string | null>(null);
  const [adjError, setAdjError] = useState<string | null>(null);

  async function load(): Promise<void> {
    setLoading(true);
    setLoadError(null);
    try {
      setData(await fetchAdminDashboard());
    } catch (err) {
      setLoadError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function applyAdjustment(): Promise<void> {
    const telegramId = Number(adjId);
    const amount = Number(adjAmount);
    setAdjError(null);
    setAdjResult(null);
    if (!telegramId || !amount) {
      setAdjError('Telegram ID and a non-zero amount are required.');
      return;
    }
    setAdjBusy(true);
    try {
      const user = await adminAdjustBalance(telegramId, amount, adjReason);
      setAdjResult(`${user.displayName}'s new balance: ⭐${user.starsBalance}`);
      setAdjId('');
      setAdjAmount('');
      setAdjReason('');
    } catch (err) {
      setAdjError((err as Error).message);
    } finally {
      setAdjBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="lobby-section">
        <div className="lobby-hint">Loading…</div>
      </div>
    );
  }

  if (loadError || !data) {
    return (
      <div className="lobby-section">
        <div className="toast toast-error">{loadError ?? 'Failed to load'}</div>
      </div>
    );
  }

  return (
    <div className="lobby-section">
      <div className="lobby-section-title">Admin</div>
      <div className="lobby-hint">Visible only to you.</div>

      <div className="profile-stats-grid" style={{ marginTop: 10 }}>
        <div className="profile-stat-tile">
          <div className="profile-stat-value">⭐{data.weeklyStarsRevenue}</div>
          <div className="profile-stat-label">Stars bought this week</div>
        </div>
        <div className="profile-stat-tile">
          <div className="profile-stat-value">⭐{data.lifetimeStarsRevenue}</div>
          <div className="profile-stat-label">Stars bought all-time</div>
        </div>
        <div className="profile-stat-tile">
          <div className="profile-stat-value">{data.totalPlayers}</div>
          <div className="profile-stat-label">Total players</div>
        </div>
        <div className="profile-stat-tile">
          <div className="profile-stat-value">{data.activePlayersThisWeek}</div>
          <div className="profile-stat-label">Active this week</div>
        </div>
        <div className="profile-stat-tile">
          <div className="profile-stat-value">{data.totalHandsPlayed}</div>
          <div className="profile-stat-label">Hands played (all-time)</div>
        </div>
        <div className="profile-stat-tile">
          <div className="profile-stat-value">{data.botStarsBalance === null ? '—' : `⭐${data.botStarsBalance}`}</div>
          <div className="profile-stat-label">Bot's Stars balance</div>
        </div>
      </div>

      <div className="lobby-section-title" style={{ marginTop: 16 }}>
        Tournament
      </div>
      <div className="lobby-hint">
        Status: {data.tournament.status} · Registered: {data.tournament.registeredCount}/{data.tournament.seats} · Buy-in: ⭐
        {data.tournament.buyIn} · Next start: {data.tournament.nextStartAt} UTC
      </div>

      <div className="lobby-section-title" style={{ marginTop: 16 }}>
        Top 5 this week
      </div>
      {data.topWeekly.length === 0 ? (
        <div className="lobby-hint">Nobody has a net result yet this week.</div>
      ) : (
        <div className="leaderboard-list">
          {data.topWeekly.map((entry, i) => (
            <div key={entry.telegramId} className="leaderboard-row">
              <div className="leaderboard-rank">#{i + 1}</div>
              <Avatar telegramId={entry.telegramId} avatarVersion={entry.avatarVersion} displayName={entry.displayName} size={26} />
              <div className="leaderboard-name">{entry.displayName}</div>
              <div className={`leaderboard-net ${entry.netWinnings >= 0 ? 'leaderboard-net-positive' : 'leaderboard-net-negative'}`}>
                {entry.netWinnings >= 0 ? '+' : ''}
                {entry.netWinnings}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="lobby-section-title" style={{ marginTop: 16 }}>
        Adjust a player's balance
      </div>
      <div className="lobby-hint">Use for support/compensation. Positive amount credits, negative debits.</div>
      <div className="admin-form-row">
        <input className="admin-input" type="number" placeholder="Telegram ID" value={adjId} onChange={(e) => setAdjId(e.target.value)} />
        <input
          className="admin-input"
          type="number"
          placeholder="Amount"
          value={adjAmount}
          onChange={(e) => setAdjAmount(e.target.value)}
        />
      </div>
      <div className="admin-form-row">
        <input
          className="admin-input"
          type="text"
          placeholder="Reason (optional)"
          value={adjReason}
          onChange={(e) => setAdjReason(e.target.value)}
        />
        <button className="btn btn-gold" disabled={adjBusy} onClick={applyAdjustment}>
          Apply
        </button>
      </div>
      {adjError && <div className="toast toast-error">{adjError}</div>}
      {adjResult && <div className="toast toast-success">{adjResult}</div>}

      <button className="btn" style={{ marginTop: 16 }} onClick={load}>
        Refresh
      </button>
    </div>
  );
}
