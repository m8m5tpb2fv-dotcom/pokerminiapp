import { useRef, useState } from 'react';
import { purchaseStatus, uploadAvatar } from '../../api';
import { Avatar } from '../../components/Avatar';
import { StatusBadge } from '../../components/StatusBadge';
import { pokerSocket } from '../../ws';
import type { StatusTier, User } from '../../types';

const AVATAR_SIZE = 256;

/** Downscales/center-crops the picked image to a square JPEG data URL so uploads stay small. */
function fileToSquareJpeg(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;
      const canvas = document.createElement('canvas');
      canvas.width = AVATAR_SIZE;
      canvas.height = AVATAR_SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas not supported'));
      ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image'));
    };
    img.src = url;
  });
}

interface Props {
  user: User;
  statusTiers: StatusTier[];
  onUserChange: (user: User) => void;
  onEditNickname: () => void;
}

export function ProfileTab({ user, statusTiers, onUserChange, onEditNickname }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [switchingStatus, setSwitchingStatus] = useState<string | null>(null);

  const ownedTiers = statusTiers.filter((t) => user.ownedStatusTiers.includes(t.id));

  async function switchStatus(tierId: string): Promise<void> {
    setSwitchingStatus(tierId);
    setError(null);
    try {
      onUserChange(await purchaseStatus(tierId));
      pokerSocket.reauth();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSwitchingStatus(null);
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const dataUrl = await fileToSquareJpeg(file);
      onUserChange(await uploadAvatar(dataUrl));
      pokerSocket.reauth();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="lobby-section">
      <div className="profile-header">
        <div className="profile-avatar-wrap">
          <Avatar telegramId={user.telegramId} avatarVersion={user.avatarVersion} displayName={user.displayName} size={92} />
          <button
            className="profile-avatar-edit"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            aria-label="Change avatar"
          >
            {uploading ? '…' : '✎'}
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFile} hidden />
        </div>
        <div className="profile-name">
          {user.displayName} <StatusBadge tierId={user.statusTier} tiers={statusTiers} />
        </div>
        {user.username && <div className="profile-username">@{user.username}</div>}
        {error && <div className="toast toast-error">{error}</div>}
      </div>

      <div className="lobby-section-title">Statistics</div>
      <div className="profile-stats-grid">
        <div className="profile-stat-tile">
          <div className="profile-stat-value">{user.handsPlayed}</div>
          <div className="profile-stat-label">Hands played</div>
        </div>
        <div className="profile-stat-tile">
          <div className="profile-stat-value">{user.handsWon}</div>
          <div className="profile-stat-label">Hands won</div>
        </div>
        <div className="profile-stat-tile">
          <div className="profile-stat-value">
            {user.handsPlayed > 0 ? `${((user.handsWon / user.handsPlayed) * 100).toFixed(1)}%` : '—'}
          </div>
          <div className="profile-stat-label">Win rate</div>
        </div>
        <div className="profile-stat-tile">
          <div className="profile-stat-value">⭐{user.biggestWin}</div>
          <div className="profile-stat-label">Biggest win</div>
        </div>
        <div className="profile-stat-tile profile-stat-tile-wide">
          <div className="profile-stat-value">{user.leaderboardPosition ? `#${user.leaderboardPosition}` : '—'}</div>
          <div className="profile-stat-label">This week's rating</div>
        </div>
      </div>

      {ownedTiers.length > 0 && (
        <div className="profile-status-switcher">
          <div className="lobby-section-title">Your statuses</div>
          <div className="lobby-hint">Switch between any status you own — free, as many times as you like.</div>
          <div className="status-shop">
            {ownedTiers.map((tier) => {
              const isCurrent = user.statusTier === tier.id;
              return (
                <button
                  key={tier.id}
                  className={`status-shop-item ${!isCurrent ? 'status-shop-item-owned' : ''}`}
                  style={{ borderColor: tier.color }}
                  disabled={isCurrent || switchingStatus !== null}
                  onClick={() => switchStatus(tier.id)}
                >
                  <span style={{ color: tier.color }}>{tier.label}</span>
                  <span>{isCurrent ? 'Active' : 'Switch'}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="profile-info-list">
        <button className="profile-info-row profile-info-row-button" onClick={onEditNickname}>
          <span>Table name</span>
          <span>{user.nickname ?? '—'} ›</span>
        </button>
        <div className="profile-info-row">
          <span>Stars balance</span>
          <span>⭐ {user.starsBalance}</span>
        </div>
        <div className="profile-info-row">
          <span>Rank points</span>
          <span>{user.points} pts</span>
        </div>
        <div className="profile-info-row">
          <span>Telegram ID</span>
          <span>{user.telegramId}</span>
        </div>
      </div>
    </div>
  );
}
