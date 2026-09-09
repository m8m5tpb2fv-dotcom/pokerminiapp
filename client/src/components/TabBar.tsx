export type LobbyTab = 'tables' | 'topup' | 'status' | 'tournament' | 'leaderboard' | 'profile' | 'admin';

const BASE_TABS: { id: LobbyTab; icon: string; label: string }[] = [
  { id: 'tables', icon: '🎮', label: 'Play' },
  { id: 'topup', icon: '⭐', label: 'Top Up' },
  { id: 'status', icon: '👑', label: 'Status' },
  { id: 'tournament', icon: '🏆', label: 'Tourney' },
  { id: 'leaderboard', icon: '📊', label: 'Rating' },
  { id: 'profile', icon: '👤', label: 'Profile' },
];

const ADMIN_TAB: { id: LobbyTab; icon: string; label: string } = { id: 'admin', icon: '🛠️', label: 'Admin' };

export function TabBar({ active, onChange, showAdmin }: { active: LobbyTab; onChange: (tab: LobbyTab) => void; showAdmin: boolean }) {
  const tabs = showAdmin ? [...BASE_TABS, ADMIN_TAB] : BASE_TABS;
  return (
    <div className="tab-bar" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`tab-bar-item ${active === tab.id ? 'tab-bar-item-active' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          <span className="tab-bar-icon">{tab.icon}</span>
          <span className="tab-bar-label">{tab.label}</span>
        </button>
      ))}
    </div>
  );
}
