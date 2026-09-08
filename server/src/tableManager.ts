import { Table } from './poker/Table.js';
import type { TableConfig } from './poker/types.js';

export const TABLE_CONFIGS: TableConfig[] = [
  { tableId: 'micro', smallBlind: 5, bigBlind: 10, maxSeats: 6, minBuyIn: 200, maxBuyIn: 1000, turnTimeoutMs: 20_000 },
  { tableId: 'standard', smallBlind: 10, bigBlind: 20, maxSeats: 6, minBuyIn: 400, maxBuyIn: 2000, turnTimeoutMs: 20_000 },
  { tableId: 'high', smallBlind: 20, bigBlind: 50, maxSeats: 9, minBuyIn: 1000, maxBuyIn: 5000, turnTimeoutMs: 20_000 },
];

export interface TableSummary {
  tableId: string;
  smallBlind: number;
  bigBlind: number;
  maxSeats: number;
  minBuyIn: number;
  maxBuyIn: number;
  seatedCount: number;
}

type ChangeListener = (tableId: string) => void;

export class TableManager {
  private tables = new Map<string, Table>();
  private listeners: ChangeListener[] = [];
  /** Tracks which table each telegramId currently occupies, so reconnects and disconnect cleanup are O(1). */
  private seatedAt = new Map<number, string>();

  constructor() {
    for (const config of TABLE_CONFIGS) {
      const table = new Table(config, () => this.notify(config.tableId));
      this.tables.set(config.tableId, table);
    }
  }

  private notify(tableId: string): void {
    for (const listener of this.listeners) listener(tableId);
  }

  onChange(listener: ChangeListener): void {
    this.listeners.push(listener);
  }

  getTable(tableId: string): Table | undefined {
    return this.tables.get(tableId);
  }

  listSummaries(): TableSummary[] {
    return TABLE_CONFIGS.map((config) => {
      const table = this.tables.get(config.tableId)!;
      const view = table.getView();
      return {
        tableId: config.tableId,
        smallBlind: config.smallBlind,
        bigBlind: config.bigBlind,
        maxSeats: config.maxSeats,
        minBuyIn: config.minBuyIn,
        maxBuyIn: config.maxBuyIn,
        seatedCount: view.seats.length,
      };
    });
  }

  findTableFor(telegramId: number): string | undefined {
    return this.seatedAt.get(telegramId);
  }

  markSeated(telegramId: number, tableId: string): void {
    this.seatedAt.set(telegramId, tableId);
  }

  markUnseated(telegramId: number): void {
    this.seatedAt.delete(telegramId);
  }
}
