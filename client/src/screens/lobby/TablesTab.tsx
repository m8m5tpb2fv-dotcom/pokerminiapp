import type { TableSummary } from '../../types';

interface Props {
  tables: TableSummary[];
  onSelectTable: (table: TableSummary) => void;
}

export function TablesTab({ tables, onSelectTable }: Props) {
  return (
    <div className="lobby-section">
      <div className="lobby-section-title">Tables</div>
      <div className="table-list">
        {tables.map((t) => (
          <button key={t.tableId} className="table-row" onClick={() => onSelectTable(t)}>
            <div className="table-row-name">{t.tableId.toUpperCase()}</div>
            <div className="table-row-blinds">⭐ {t.smallBlind}/{t.bigBlind}</div>
            <div className="table-row-buyin">Buy-in ⭐{t.minBuyIn}–{t.maxBuyIn}</div>
            <div className="table-row-seats">{t.seatedCount}/{t.maxSeats} seated</div>
          </button>
        ))}
      </div>
    </div>
  );
}
