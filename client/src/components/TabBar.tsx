export type LobbyTab = 'tables' | 'topup' | 'status' | 'leaderboard' | 'profile';

const TABS: { id: LobbyTab; icon: string; label: string }[] = [
  { id: 'tables', icon: '🎮', label: 'Play' },
  { id: 'topup', icon: '⭐', label: 'Top Up' },
  { id: 'status', icon: '👑', label: 'Status' },
  { id: 'leaderboard', icon: '🏆', label: 'Rating' },
  { id: 'profile', icon: '👤', label: 'Profile' },
];

export function TabBar({ active, onChange }: { active: LobbyTab; onChange: (tab: LobbyTab) => void }) {
  return (
    <div className="tab-bar">
      {TABS.map((tab) => (
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
