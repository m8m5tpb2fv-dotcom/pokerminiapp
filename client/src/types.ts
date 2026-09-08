export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
export type PlayerStatus = 'sitting_out' | 'active' | 'folded' | 'all_in';
export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise';
export type CardCode = string;

export interface User {
  telegramId: number;
  username: string | null;
  firstName: string | null;
  nickname: string | null;
  statusTier: string | null;
  ownedStatusTiers: string[];
  displayName: string;
  starsBalance: number;
  points: number;
  rankTier: string | null;
  avatarVersion: number | null;
}

export interface StatusTier {
  id: string;
  label: string;
  price: number;
  color: string;
}

/** Earned automatically by playing hands - separate from the purchasable StatusTier badges. */
export interface RankTier {
  id: string;
  label: string;
  threshold: number;
  bonus: number;
  color: string;
}

export interface LeaderboardEntry {
  telegramId: number;
  displayName: string;
  statusTier: string | null;
  avatarVersion: number | null;
  netWinnings: number;
}

export interface LastPrize {
  telegramId: number;
  displayName: string;
  giftId: string;
  starCount: number;
  netWinnings: number;
  createdAt: string;
}

export interface LeaderboardData {
  leaderboard: LeaderboardEntry[];
  periodStart: string;
  lastPrize: LastPrize | null;
}

export interface TableSummary {
  tableId: string;
  smallBlind: number;
  bigBlind: number;
  maxSeats: number;
  minBuyIn: number;
  maxBuyIn: number;
  seatedCount: number;
}

export interface TournamentResult {
  telegramId: number;
  displayName: string;
  giftId: string | null;
  starCount: number | null;
  prizePool: number;
  players: number;
  createdAt: string;
}

export interface TournamentInfo {
  status: 'scheduled' | 'running';
  nextStartAt: string;
  buyIn: number;
  maxSeats: number;
  smallBlind: number;
  bigBlind: number;
  registeredCount: number;
  isRegistered: boolean;
  isSeated: boolean;
  lastResult: TournamentResult | null;
}

export interface PublicSeatView {
  seatIndex: number;
  telegramId: number;
  displayName: string;
  statusTier: string | null;
  avatarVersion: number | null;
  stack: number;
  status: PlayerStatus;
  committedThisStreet: number;
  committedTotal: number;
  holeCardsHidden: boolean;
  holeCards?: CardCode[];
}

export interface Pot {
  amount: number;
  eligibleTelegramIds: number[];
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
