import type { CardCode, Rank, Suit } from './types.js';

const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUITS: Suit[] = ['h', 'd', 'c', 's'];

export class Deck {
  private cards: CardCode[];

  constructor(rng: () => number = Math.random) {
    this.cards = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        this.cards.push(`${rank}${suit}` as CardCode);
      }
    }
    this.shuffle(rng);
  }

  private shuffle(rng: () => number): void {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  draw(): CardCode {
    const card = this.cards.pop();
    if (!card) throw new Error('Deck is empty');
    return card;
  }

  remaining(): number {
    return this.cards.length;
  }
}
