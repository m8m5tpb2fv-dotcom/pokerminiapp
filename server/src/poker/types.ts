export type Suit = 'h' | 'd' | 'c' | 's';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';
/** pokersolver card notation, e.g. "As", "Td", "2c" */
export type CardCode = `${Rank}${Suit}`;

export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

export type PlayerStatus = 'sitting_out' | 'active' | 'folded' | 'all_in';

export interface Seat {
  seatIndex: number;
  telegramId: number;
  displayName: string;
  stack: number;
  status: PlayerStatus;
  holeCards: CardCode[];
  committedThisStreet: number;
  committedTotal: number;
  hasActedThisStreet: boolean;
}

export interface Pot {
  amount: number;
  eligibleTelegramIds: number[];
}

export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise';

export interface TableConfig {
  tableId: string;
  smallBlind: number;
  bigBlind: number;
  maxSeats: number;
  minBuyIn: number;
  maxBuyIn: number;
  turnTimeoutMs: number;
}

export interface PublicSeatView {
  seatIndex: number;
  telegramId: number;
  displayName: string;
  stack: number;
  status: PlayerStatus;
  committedThisStreet: number;
  committedTotal: number;
  holeCardsHidden: boolean;
  holeCards?: CardCode[];
}

export interface TableStateView {
  tableId: string;
  street: Street;
  communityCards: CardCode[];
  pots: Pot[];
  seats: PublicSeatView[];
  buttonSeatIndex: number;
  toActSeatIndex: number | null;
  currentBet: number;
  minRaiseTo: number;
  smallBlind: number;
  bigBlind: number;
  handNumber: number;
  turnDeadline: number | null;
  lastAction: { seatIndex: number; type: ActionType; amount?: number } | null;
  winners: { telegramId: number; amount: number; handDescr?: string }[] | null;
}
