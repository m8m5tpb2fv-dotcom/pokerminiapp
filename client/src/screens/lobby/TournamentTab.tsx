import type { TournamentInfo, User } from '../../types';
import { TournamentCard } from './TournamentCard';

interface Props {
  user: User;
  tournament: TournamentInfo | null;
  onTournamentChange: (info: TournamentInfo) => void;
}

export function TournamentTab({ user, tournament, onTournamentChange }: Props) {
  return (
    <div className="lobby-section">
      <TournamentCard user={user} info={tournament} onChange={onTournamentChange} />
    </div>
  );
}
