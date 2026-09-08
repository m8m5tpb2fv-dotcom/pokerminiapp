import { Deck } from './deck.js';
import { evaluateShowdown } from './handEvaluator.js';
import type {
  ActionType,
  CardCode,
  Pot,
  PublicSeatView,
  Seat,
  Street,
  TableConfig,
  TableStateView,
} from './types.js';

interface PotContribution {
  telegramId: number;
  amount: number;
  folded: boolean;
}

function buildPots(contributions: PotContribution[]): Pot[] {
  const working = contributions.filter((c) => c.amount > 0).map((c) => ({ ...c }));
  const pots: Pot[] = [];
  while (working.some((c) => c.amount > 0)) {
    const layer = working.filter((c) => c.amount > 0);
    const minAmount = Math.min(...layer.map((c) => c.amount));
    const potAmount = minAmount * layer.length;
    const eligible = layer.filter((c) => !c.folded).map((c) => c.telegramId);
    if (eligible.length > 0) {
      pots.push({ amount: potAmount, eligibleTelegramIds: eligible });
    } else if (pots.length > 0) {
      // Everyone contributing to this layer folded; the money still belongs to the previous pot's winners.
      pots[pots.length - 1].amount += potAmount;
    }
    for (const c of layer) c.amount -= minAmount;
  }
  return pots;
}

export class Table {
  readonly config: TableConfig;
  private seats: Map<number, Seat> = new Map();
  private deck: Deck | null = null;
  private communityCards: CardCode[] = [];
  private street: Street = 'preflop';
  private buttonSeatIndex = -1;
  private toActSeatIndex: number | null = null;
  private currentBet = 0;
  private lastRaiseIncrement = 0;
  private handNumber = 0;
  private handInProgress = false;
  private turnDeadline: number | null = null;
  private turnTimer: ReturnType<typeof setTimeout> | null = null;
  private lastAction: TableStateView['lastAction'] = null;
  private winners: TableStateView['winners'] = null;
  private handParticipants: number[] = [];
  private onChange: () => void;
  private onHandComplete: (participantIds: number[], winnerIds: number[]) => void;
  private rng: () => number;

  constructor(
    config: TableConfig,
    onChange: () => void = () => {},
    onHandComplete: (participantIds: number[], winnerIds: number[]) => void = () => {},
    rng: () => number = Math.random
  ) {
    this.config = config;
    this.onChange = onChange;
    this.onHandComplete = onHandComplete;
    this.rng = rng;
  }

  getSeat(telegramId: number): Seat | undefined {
    return [...this.seats.values()].find((s) => s.telegramId === telegramId);
  }

  sitDown(
    seatIndex: number,
    telegramId: number,
    displayName: string,
    buyIn: number,
    statusTier: string | null = null,
    autoStart = true
  ): void {
    if (seatIndex < 0 || seatIndex >= this.config.maxSeats) throw new Error('Invalid seat');
    if (this.seats.has(seatIndex)) throw new Error('Seat taken');
    if (this.getSeat(telegramId)) throw new Error('Already seated');
    if (buyIn < this.config.minBuyIn || buyIn > this.config.maxBuyIn) throw new Error('Buy-in out of range');
    this.seats.set(seatIndex, {
      seatIndex,
      telegramId,
      displayName,
      statusTier,
      stack: buyIn,
      status: 'active',
      holeCards: [],
      committedThisStreet: 0,
      committedTotal: 0,
      hasActedThisStreet: false,
    });
    if (autoStart) this.maybeStartHand();
  }

  /** For seating a whole group at once (e.g. a tournament's starting field) without a hand starting mid-batch. */
  startIfReady(): void {
    this.maybeStartHand();
  }

  /** Removes the player and returns their remaining stack (to be credited back to their star balance). */
  standUp(telegramId: number): number {
    const seat = this.getSeat(telegramId);
    if (!seat) return 0;
    const stack = seat.stack;
    if (this.handInProgress && seat.status === 'active') {
      seat.status = 'folded';
      this.checkForUncontestedWin();
    }
    if (!this.handInProgress || seat.status !== 'active') {
      this.seats.delete(seat.seatIndex);
    }
    // Once the table is fully empty, forget the old button position so the
    // next set of players starts a fresh rotation instead of inheriting one
    // seat index left over from an unrelated earlier group.
    if (this.seats.size === 0) this.buttonSeatIndex = -1;
    return stack;
  }

  private activeSeatedEntries(): Seat[] {
    return [...this.seats.values()].sort((a, b) => a.seatIndex - b.seatIndex);
  }

  private seatsWithChips(): Seat[] {
    return this.activeSeatedEntries().filter((s) => s.stack > 0 || s.committedTotal > 0);
  }

  maybeStartHand(): void {
    if (this.handInProgress) return;
    const eligible = this.activeSeatedEntries().filter((s) => s.stack > 0);
    if (eligible.length < 2) return;
    this.startHand();
  }

  private nextSeatIndex(fromSeatIndex: number, predicate: (s: Seat) => boolean): number | null {
    const ordered = this.activeSeatedEntries();
    if (ordered.length === 0) return null;
    const startIdx = ordered.findIndex((s) => s.seatIndex === fromSeatIndex);
    for (let step = 1; step <= ordered.length; step++) {
      const candidate = ordered[(startIdx + step) % ordered.length];
      if (predicate(candidate)) return candidate.seatIndex;
    }
    return null;
  }

  private startHand(): void {
    this.clearTurnTimer();
    const players = this.activeSeatedEntries().filter((s) => s.stack > 0);
    for (const s of players) {
      s.status = 'active';
      s.holeCards = [];
      s.committedThisStreet = 0;
      s.committedTotal = 0;
      s.hasActedThisStreet = false;
    }
    this.handNumber++;
    this.handInProgress = true;
    this.street = 'preflop';
    this.communityCards = [];
    this.winners = null;
    this.lastAction = null;
    this.handParticipants = players.map((p) => p.telegramId);
    this.deck = new Deck(this.rng);

    const ordered = players.sort((a, b) => a.seatIndex - b.seatIndex);
    if (this.buttonSeatIndex === -1 || !ordered.some((s) => s.seatIndex === this.buttonSeatIndex)) {
      this.buttonSeatIndex = ordered[0].seatIndex;
    } else {
      this.buttonSeatIndex = this.nextSeatIndex(this.buttonSeatIndex, () => true) ?? ordered[0].seatIndex;
    }

    for (const seat of ordered) {
      seat.holeCards = [this.deck.draw(), this.deck.draw()];
    }

    let sbSeatIndex: number;
    let bbSeatIndex: number;
    let firstToActIndex: number;
    if (ordered.length === 2) {
      sbSeatIndex = this.buttonSeatIndex;
      bbSeatIndex = this.nextSeatIndex(this.buttonSeatIndex, () => true)!;
      firstToActIndex = sbSeatIndex;
    } else {
      sbSeatIndex = this.nextSeatIndex(this.buttonSeatIndex, () => true)!;
      bbSeatIndex = this.nextSeatIndex(sbSeatIndex, () => true)!;
      firstToActIndex = this.nextSeatIndex(bbSeatIndex, () => true)!;
    }

    this.postBlind(sbSeatIndex, this.config.smallBlind);
    this.postBlind(bbSeatIndex, this.config.bigBlind);
    this.currentBet = this.config.bigBlind;
    this.lastRaiseIncrement = this.config.bigBlind;
    this.toActSeatIndex = firstToActIndex;
    this.armTurnTimer();
    this.onChange();
  }

  private postBlind(seatIndex: number, amount: number): void {
    const seat = this.seats.get(seatIndex);
    if (!seat) return;
    const posted = Math.min(amount, seat.stack);
    seat.stack -= posted;
    seat.committedThisStreet = posted;
    seat.committedTotal = posted;
    if (seat.stack === 0) seat.status = 'all_in';
  }

  private clearTurnTimer(): void {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
    this.turnDeadline = null;
  }

  private armTurnTimer(): void {
    this.clearTurnTimer();
    if (this.toActSeatIndex === null) return;
    this.turnDeadline = Date.now() + this.config.turnTimeoutMs;
    this.turnTimer = setTimeout(() => {
      const seatIndex = this.toActSeatIndex;
      if (seatIndex === null) return;
      const seat = this.seats.get(seatIndex);
      if (!seat) return;
      if (seat.committedThisStreet === this.currentBet) {
        this.applyAction(seat.telegramId, 'check');
      } else {
        this.applyAction(seat.telegramId, 'fold');
      }
    }, this.config.turnTimeoutMs);
  }

  applyAction(telegramId: number, type: ActionType, amount?: number): void {
    if (!this.handInProgress) throw new Error('No hand in progress');
    const seat = this.getSeat(telegramId);
    if (!seat) throw new Error('Not seated at this table');
    if (this.toActSeatIndex !== seat.seatIndex) throw new Error('Not your turn');
    if (seat.status !== 'active') throw new Error('Cannot act');

    switch (type) {
      case 'fold':
        seat.status = 'folded';
        break;
      case 'check':
        if (seat.committedThisStreet !== this.currentBet) throw new Error('Cannot check, must call or fold');
        break;
      case 'call': {
        const toCall = Math.min(this.currentBet - seat.committedThisStreet, seat.stack);
        if (toCall <= 0) throw new Error('Nothing to call');
        seat.stack -= toCall;
        seat.committedThisStreet += toCall;
        seat.committedTotal += toCall;
        if (seat.stack === 0) seat.status = 'all_in';
        break;
      }
      case 'bet':
      case 'raise': {
        if (amount === undefined || amount <= 0) throw new Error('Amount required');
        const maxTotal = seat.committedThisStreet + seat.stack;
        const targetTotal = Math.min(amount, maxTotal);
        const minTotal = this.currentBet === 0 ? this.config.bigBlind : this.currentBet + this.lastRaiseIncrement;
        const isAllIn = targetTotal === maxTotal;
        if (targetTotal <= this.currentBet) throw new Error('Raise must exceed current bet');
        if (!isAllIn && targetTotal < minTotal) throw new Error(`Raise must be at least ${minTotal}`);
        const increment = targetTotal - this.currentBet;
        const delta = targetTotal - seat.committedThisStreet;
        seat.stack -= delta;
        seat.committedThisStreet = targetTotal;
        seat.committedTotal += delta;
        if (seat.stack === 0) seat.status = 'all_in';
        const isFullRaise = increment >= this.lastRaiseIncrement;
        this.currentBet = targetTotal;
        if (isFullRaise) {
          this.lastRaiseIncrement = increment;
          for (const other of this.seats.values()) {
            if (other.seatIndex !== seat.seatIndex && other.status === 'active') other.hasActedThisStreet = false;
          }
        }
        break;
      }
    }

    seat.hasActedThisStreet = true;
    this.lastAction = { seatIndex: seat.seatIndex, type, amount };

    if (this.checkForUncontestedWin()) return;

    const next = this.findNextToAct();
    if (next === null) {
      this.advanceStreet();
    } else {
      this.toActSeatIndex = next;
      this.armTurnTimer();
      this.onChange();
    }
  }

  private findNextToAct(): number | null {
    const contenders = this.activeSeatedEntries().filter((s) => s.status === 'active');
    if (contenders.length <= 1) return null;
    const needsToAct = contenders.filter((s) => !s.hasActedThisStreet || s.committedThisStreet !== this.currentBet);
    if (needsToAct.length === 0) return null;
    return this.nextSeatIndex(this.toActSeatIndex ?? this.buttonSeatIndex, (s) => needsToAct.some((n) => n.seatIndex === s.seatIndex));
  }

  private checkForUncontestedWin(): boolean {
    const stillIn = this.activeSeatedEntries().filter((s) => s.status === 'active' || s.status === 'all_in');
    if (stillIn.length > 1) return false;
    this.clearTurnTimer();
    this.toActSeatIndex = null;
    const contributions = this.activeSeatedEntries()
      .filter((s) => s.committedTotal > 0)
      .map((s) => ({ telegramId: s.telegramId, amount: s.committedTotal, folded: s.status === 'folded' }));
    const pots = buildPots(contributions);
    const winnerSeat = stillIn[0];
    let totalWon = 0;
    for (const pot of pots) totalWon += pot.amount;
    if (winnerSeat) {
      winnerSeat.stack += totalWon;
      this.winners = [{ telegramId: winnerSeat.telegramId, amount: totalWon }];
    } else {
      this.winners = [];
    }
    this.finishHand();
    return true;
  }

  private advanceStreet(): void {
    this.clearTurnTimer();
    for (const seat of this.seats.values()) {
      seat.committedThisStreet = 0;
      seat.hasActedThisStreet = false;
    }
    this.currentBet = 0;
    this.lastRaiseIncrement = this.config.bigBlind;

    const canAct = this.activeSeatedEntries().filter((s) => s.status === 'active');
    const contenders = this.activeSeatedEntries().filter((s) => s.status === 'active' || s.status === 'all_in');

    if (this.street === 'preflop') {
      this.street = 'flop';
      this.communityCards.push(this.deck!.draw(), this.deck!.draw(), this.deck!.draw());
    } else if (this.street === 'flop') {
      this.street = 'turn';
      this.communityCards.push(this.deck!.draw());
    } else if (this.street === 'turn') {
      this.street = 'river';
      this.communityCards.push(this.deck!.draw());
    } else {
      this.runShowdown();
      return;
    }

    if (canAct.length < 2 || contenders.length <= 1) {
      // Everyone but at most one is all-in: run out remaining streets with no more betting.
      this.toActSeatIndex = null;
      this.armTurnTimer0msFastForward();
      return;
    }

    this.toActSeatIndex = this.nextSeatIndex(this.buttonSeatIndex, (s) => s.status === 'active');
    this.armTurnTimer();
    this.onChange();
  }

  /** When all remaining players are all-in, auto-advance through streets without waiting on input. */
  private armTurnTimer0msFastForward(): void {
    this.onChange();
    setTimeout(() => this.advanceStreet(), 700);
  }

  private runShowdown(): void {
    const contenders = this.activeSeatedEntries().filter((s) => s.status === 'active' || s.status === 'all_in');
    const contributions = this.activeSeatedEntries()
      .filter((s) => s.committedTotal > 0)
      .map((s) => ({ telegramId: s.telegramId, amount: s.committedTotal, folded: s.status === 'folded' }));
    const pots = buildPots(contributions);

    const winnerAmounts = new Map<number, { amount: number; descr?: string }>();
    for (const pot of pots) {
      const eligiblePlayers = contenders.filter((c) => pot.eligibleTelegramIds.includes(c.telegramId));
      if (eligiblePlayers.length === 0) continue;
      const winners = evaluateShowdown(
        eligiblePlayers.map((p) => ({ telegramId: p.telegramId, holeCards: p.holeCards })),
        this.communityCards
      );
      const share = Math.floor(pot.amount / winners.length);
      let remainder = pot.amount - share * winners.length;
      for (const w of winners) {
        const extra = remainder > 0 ? 1 : 0;
        remainder -= extra;
        const prev = winnerAmounts.get(w.telegramId)?.amount ?? 0;
        winnerAmounts.set(w.telegramId, { amount: prev + share + extra, descr: w.hand.descr });
      }
    }

    for (const [telegramId, { amount }] of winnerAmounts) {
      const seat = this.getSeat(telegramId);
      if (seat) seat.stack += amount;
    }
    this.winners = [...winnerAmounts.entries()].map(([telegramId, v]) => ({ telegramId, amount: v.amount, handDescr: v.descr }));
    this.street = 'showdown';
    this.finishHand();
  }

  private finishHand(): void {
    this.handInProgress = false;
    this.toActSeatIndex = null;
    this.onHandComplete(this.handParticipants, (this.winners ?? []).map((w) => w.telegramId));
    this.onChange();
    for (const seat of [...this.seats.values()]) {
      if (seat.stack <= 0) {
        seat.status = 'sitting_out';
      }
    }
    setTimeout(() => {
      this.maybeStartHand();
      if (!this.handInProgress) this.onChange();
    }, 3000);
  }

  getView(forTelegramId?: number): TableStateView {
    const seats: PublicSeatView[] = this.activeSeatedEntries().map((s) => {
      const revealHoleCards =
        s.telegramId === forTelegramId || (this.street === 'showdown' && s.status !== 'folded');
      return {
        seatIndex: s.seatIndex,
        telegramId: s.telegramId,
        displayName: s.displayName,
        statusTier: s.statusTier,
        stack: s.stack,
        status: s.status,
        committedThisStreet: s.committedThisStreet,
        committedTotal: s.committedTotal,
        holeCardsHidden: !revealHoleCards,
        holeCards: revealHoleCards ? s.holeCards : undefined,
      };
    });
    return {
      tableId: this.config.tableId,
      street: this.street,
      communityCards: this.communityCards,
      pots: this.handInProgress
        ? buildPots(
            this.activeSeatedEntries()
              .filter((s) => s.committedTotal > 0)
              .map((s) => ({ telegramId: s.telegramId, amount: s.committedTotal, folded: s.status === 'folded' }))
          )
        : [],
      seats,
      buttonSeatIndex: this.buttonSeatIndex,
      toActSeatIndex: this.toActSeatIndex,
      currentBet: this.currentBet,
      minRaiseTo: this.currentBet === 0 ? this.config.bigBlind : this.currentBet + this.lastRaiseIncrement,
      smallBlind: this.config.smallBlind,
      bigBlind: this.config.bigBlind,
      handNumber: this.handNumber,
      turnDeadline: this.turnDeadline,
      lastAction: this.lastAction,
      winners: this.winners,
    };
  }
}

export { buildPots };
