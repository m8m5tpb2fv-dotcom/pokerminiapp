import { describe, expect, it } from 'vitest';
import { evaluateShowdown } from '../poker/handEvaluator.js';
import type { CardCode } from '../poker/types.js';

describe('evaluateShowdown', () => {
  it('picks the higher two pair as winner', () => {
    const community: CardCode[] = ['Jc', 'Th', '2d', 'Qs', 'Qd'];
    const players = [
      { telegramId: 1, holeCards: ['Ad', 'As'] as CardCode[] },
      { telegramId: 2, holeCards: ['Kd', 'Ks'] as CardCode[] },
    ];
    const winners = evaluateShowdown(players, community);
    expect(winners).toHaveLength(1);
    expect(winners[0].telegramId).toBe(1);
  });

  it('splits the pot on a tie', () => {
    const community: CardCode[] = ['Ah', 'Kh', 'Qh', 'Jh', '9c'];
    const players = [
      { telegramId: 1, holeCards: ['2c', '3c'] as CardCode[] },
      { telegramId: 2, holeCards: ['4d', '5d'] as CardCode[] },
    ];
    const winners = evaluateShowdown(players, community);
    expect(winners.map((w) => w.telegramId).sort()).toEqual([1, 2]);
  });
});
