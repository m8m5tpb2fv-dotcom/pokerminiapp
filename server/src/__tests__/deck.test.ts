import { describe, expect, it } from 'vitest';
import { Deck } from '../poker/deck.js';

describe('Deck', () => {
  it('contains 52 unique cards and deals them without repeats', () => {
    const deck = new Deck();
    expect(deck.remaining()).toBe(52);
    const drawn = new Set<string>();
    for (let i = 0; i < 52; i++) drawn.add(deck.draw());
    expect(drawn.size).toBe(52);
    expect(() => deck.draw()).toThrow();
  });

  it('is deterministic given a seeded rng', () => {
    let seed = 42;
    const rng = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    const a = new Deck(() => rng());
    seed = 42;
    const b = new Deck(() => rng());
    const cardsA = Array.from({ length: 52 }, () => a.draw());
    const cardsB = Array.from({ length: 52 }, () => b.draw());
    expect(cardsA).toEqual(cardsB);
  });
});
