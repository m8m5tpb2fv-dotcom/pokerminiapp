// pokersolver ships as CommonJS with no types.
// @ts-expect-error - no type declarations published
import pokersolver from 'pokersolver';
import type { CardCode } from './types.js';

const { Hand } = pokersolver as { Hand: { solve: (cards: string[]) => SolvedHand; winners: (hands: SolvedHand[]) => SolvedHand[] } };

export interface SolvedHand {
  name: string;
  descr: string;
  cards: unknown[];
}

export interface EvaluatedPlayer {
  telegramId: number;
  hand: SolvedHand;
}

/** Evaluates each player's best 7-card hand and returns the winners among the given players. */
export function evaluateShowdown(
  players: { telegramId: number; holeCards: CardCode[] }[],
  communityCards: CardCode[]
): EvaluatedPlayer[] {
  const evaluated: EvaluatedPlayer[] = players.map((p) => ({
    telegramId: p.telegramId,
    hand: Hand.solve([...p.holeCards, ...communityCards]),
  }));
  const winningHands = Hand.winners(evaluated.map((e) => e.hand));
  return evaluated.filter((e) => winningHands.includes(e.hand));
}
