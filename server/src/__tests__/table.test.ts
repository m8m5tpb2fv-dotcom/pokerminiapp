import { describe, expect, it, vi } from 'vitest';
import { Table, buildPots } from '../poker/Table.js';
import type { TableConfig } from '../poker/types.js';

function makeConfig(overrides: Partial<TableConfig> = {}): TableConfig {
  return {
    tableId: 't1',
    smallBlind: 5,
    bigBlind: 10,
    maxSeats: 6,
    minBuyIn: 100,
    maxBuyIn: 1000,
    turnTimeoutMs: 30_000,
    ...overrides,
  };
}

describe('buildPots', () => {
  it('creates a single pot when all contributions are equal', () => {
    const pots = buildPots([
      { telegramId: 1, amount: 100, folded: false },
      { telegramId: 2, amount: 100, folded: false },
    ]);
    expect(pots).toHaveLength(1);
    expect(pots[0].amount).toBe(200);
    expect(pots[0].eligibleTelegramIds.sort()).toEqual([1, 2]);
  });

  it('splits into a main pot and side pot when one player is short-stacked', () => {
    const pots = buildPots([
      { telegramId: 1, amount: 50, folded: false }, // all-in short stack
      { telegramId: 2, amount: 150, folded: false },
      { telegramId: 3, amount: 150, folded: false },
    ]);
    expect(pots).toHaveLength(2);
    expect(pots[0]).toEqual({ amount: 150, eligibleTelegramIds: [1, 2, 3] });
    expect(pots[1].amount).toBe(200);
    expect(pots[1].eligibleTelegramIds.sort()).toEqual([2, 3]);
  });

  it('folds dead money into the pot without granting eligibility', () => {
    const pots = buildPots([
      { telegramId: 1, amount: 100, folded: true },
      { telegramId: 2, amount: 100, folded: false },
      { telegramId: 3, amount: 100, folded: false },
    ]);
    expect(pots).toHaveLength(1);
    expect(pots[0].amount).toBe(300);
    expect(pots[0].eligibleTelegramIds.sort()).toEqual([2, 3]);
  });
});

describe('Table heads-up hand', () => {
  it('posts blinds and conserves total chips through a full hand to showdown', () => {
    vi.useFakeTimers();
    const table = new Table(makeConfig());
    table.sitDown(0, 1, 'Alice', 500);
    table.sitDown(1, 2, 'Bob', 500);

    let view = table.getView();
    // Blinds already posted when the hand auto-started (uneven blind sizes create a technical side pot).
    expect(view.pots.reduce((sum, p) => sum + p.amount, 0)).toBe(15);
    // Button (seat 0) is small blind heads-up and acts first preflop.
    expect(view.toActSeatIndex).toBe(0);
    expect(view.currentBet).toBe(10);

    table.applyAction(1, 'call');
    table.applyAction(2, 'check');
    view = table.getView();
    expect(view.street).toBe('flop');

    table.applyAction(2, 'check');
    table.applyAction(1, 'check');
    view = table.getView();
    expect(view.street).toBe('turn');

    table.applyAction(2, 'check');
    table.applyAction(1, 'check');
    view = table.getView();
    expect(view.street).toBe('river');

    table.applyAction(2, 'check');
    table.applyAction(1, 'check');
    view = table.getView();
    expect(view.street).toBe('showdown');

    const totalChips = view.seats.reduce((sum, s) => sum + s.stack, 0);
    expect(totalChips).toBe(1000);
    expect(view.winners).not.toBeNull();
    const wonTotal = view.winners!.reduce((sum, w) => sum + w.amount, 0);
    expect(wonTotal).toBe(20);
    expect(view.toActSeatIndex).toBeNull();
    vi.useRealTimers();
  });

  it('ends the hand immediately when one player folds preflop', () => {
    vi.useFakeTimers();
    const table = new Table(makeConfig());
    table.sitDown(0, 1, 'Alice', 500);
    table.sitDown(1, 2, 'Bob', 500);

    table.applyAction(1, 'fold');
    const view = table.getView();
    const totalChips = view.seats.reduce((sum, s) => sum + s.stack, 0);
    expect(totalChips).toBe(1000);
    expect(view.winners).toEqual([{ telegramId: 2, amount: 15 }]);
    vi.useRealTimers();
  });

  it('restarts the button rotation from the lowest seat once the table empties and refills with new players', () => {
    vi.useFakeTimers();
    const table = new Table(makeConfig());
    table.sitDown(0, 1, 'Alice', 500);
    table.sitDown(1, 2, 'Bob', 500);
    // Heads-up: seat 0 (Alice) is the button and should act first.
    expect(table.getView().toActSeatIndex).toBe(0);

    table.standUp(1);
    table.standUp(2);

    // A completely different pair joins the same seats later.
    table.sitDown(0, 3, 'Carol', 500);
    table.sitDown(1, 4, 'Dave', 500);
    // Seat 0 should be the button again, not a rotated-over stale position.
    expect(table.getView().toActSeatIndex).toBe(0);
    vi.useRealTimers();
  });

  it('rejects an out-of-turn action', () => {
    vi.useFakeTimers();
    const table = new Table(makeConfig());
    table.sitDown(0, 1, 'Alice', 500);
    table.sitDown(1, 2, 'Bob', 500);
    expect(() => table.applyAction(2, 'call')).toThrow('Not your turn');
    vi.useRealTimers();
  });
});

describe('Table 3-way all-in side pot', () => {
  it('creates a side pot when a short stack goes all-in and others keep betting', () => {
    vi.useFakeTimers();
    const table = new Table(makeConfig({ maxSeats: 6, minBuyIn: 50 }));
    table.sitDown(0, 1, 'Alice', 50); // short stack, will be all-in for 50
    table.sitDown(1, 2, 'Bob', 500);
    table.sitDown(2, 3, 'Carol', 500);

    // 3-handed: seat0=button/UTG-ish first-to-act preflop after blinds posted at seat1(SB) & seat2(BB).
    let view = table.getView();
    expect(view.toActSeatIndex).toBe(0);

    table.applyAction(1, 'raise', 50); // Alice shoves all-in for her full stack
    table.applyAction(2, 'call'); // Bob (SB) calls to 50
    table.applyAction(3, 'call'); // Carol (BB) calls to 50

    view = table.getView();
    const totalChips =
      view.seats.reduce((sum, s) => sum + s.stack + s.committedTotal, 0);
    expect(totalChips).toBe(1050);
    expect(view.pots.reduce((sum, p) => sum + p.amount, 0)).toBe(150);
    // Alice is all-in and out of further betting; hand should fast-forward to showdown eventually.
    const aliceSeat = view.seats.find((s) => s.telegramId === 1)!;
    expect(aliceSeat.status).toBe('all_in');
    vi.useRealTimers();
  });
});
