import { useState } from 'react';
import { setNickname } from '../api';
import type { User } from '../types';

const NICKNAME_PATTERN = /^[a-zA-Z0-9_ ]{2,16}$/;

interface Props {
  user: User;
  onDone: (user: User) => void;
  onCancel?: () => void;
}

export function NicknameScreen({ user, onDone, onCancel }: Props) {
  const [value, setValue] = useState(user.nickname ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isValid = NICKNAME_PATTERN.test(value.trim());

  async function save(): Promise<void> {
    if (!isValid) {
      setError('2-16 characters: letters, numbers, spaces, underscores');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      onDone(await setNickname(value.trim()));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="nickname-screen">
      <div className="nickname-card">
        <img src="/logo-96.png" alt="" className="nickname-logo" />
        <div className="nickname-title">Choose your table name</div>
        <div className="nickname-hint">This is what other players will see at the table and on the leaderboard.</div>
        <input
          className="nickname-input"
          value={value}
          maxLength={16}
          placeholder="e.g. Ace_of_Spades"
          onChange={(e) => setValue(e.target.value)}
          autoFocus
        />
        {error && <div className="toast toast-error">{error}</div>}
        <div className="nickname-actions">
          {onCancel && (
            <button className="btn" onClick={onCancel} disabled={saving}>
              Cancel
            </button>
          )}
          <button className="btn btn-gold" onClick={save} disabled={saving || !isValid}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
