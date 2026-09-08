import { SERVER_URL } from '../config';

interface Props {
  telegramId: number;
  avatarVersion: number | null;
  displayName: string;
  size?: number;
}

export function Avatar({ telegramId, avatarVersion, displayName, size = 32 }: Props) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.42) };
  if (!avatarVersion) {
    return (
      <div className="avatar avatar-fallback" style={style}>
        {displayName.trim().charAt(0).toUpperCase() || '?'}
      </div>
    );
  }
  return (
    <img
      className="avatar"
      style={style}
      src={`${SERVER_URL}/api/avatar/${telegramId}?v=${avatarVersion}`}
      alt=""
    />
  );
}
