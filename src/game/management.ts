/**
 * Running the park as a business: the calendar, monthly accounts, loans,
 * the entry fee, marketing campaigns and research. Time comes from the
 * simulation, so nothing moves while the game is paused.
 */
import type { Building } from '../core/buildings';
import { buildingType } from '../core/catalog';
import { FUNDING, RESEARCH, STARTING_UNLOCKS, type ResearchCategory, type ResearchItem } from '../core/research';
import type { Ledger, Park } from './park';

/** Seconds of play in one game month. */
export const MONTH_SECONDS = 240;
export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
export const LEDGER_NAMES: Record<Ledger, string> = {
  rides: 'Ride tickets',
  stalls: 'Food and drink',
  entry: 'Park entry',
  construction: 'Construction',
  wages: 'Staff wages',
  marketing: 'Marketing',
  research: 'Research',
  interest: 'Loan interest',
};
export const LEDGERS = Object.keys(LEDGER_NAMES) as Ledger[];

export const LOAN_STEP = 1000;
/** Yearly interest on the loan. */
export const INTEREST_RATE = 0.08;
export const MAX_ENTRY_FEE = 40;

export const CAMPAIGNS = [
  { id: 'flyers', name: 'Flyers in town', perMonth: 300, boost: 0.15 },
  { id: 'radio', name: 'Radio spots', perMonth: 900, boost: 0.35 },
  { id: 'tv', name: 'TV advert', perMonth: 2200, boost: 0.7 },
] as const;
export type CampaignId = (typeof CAMPAIGNS)[number]['id'];

export interface MonthAccount {
  /** Months since the park opened (0 = the first month). */
  index: number;
  amounts: Record<Ledger, number>;
}

export interface ManagementOptions {
  loan?: number;
  maxLoan?: number;
  /** Month the park opens in (0 = January). */
  startMonth?: number;
  unlocked?: readonly string[];
  /** Research items already done, by id (or all of them). */
  researched?: readonly string[] | 'all';
}

function emptyAccount(index: number): MonthAccount {
  const amounts = {} as Record<Ledger, number>;
  for (const l of LEDGERS) amounts[l] = 0;
  return { index, amounts };
}

export class Management {
  /** Seconds of play since the park opened. */
  time = 0;
  loan: number;
  maxLoan: number;
  entryFee = 0;
  /** Index into FUNDING. */
  funding = 2;
  readonly priorities = new Set<ResearchCategory>(['gentle', 'thrill', 'coaster', 'shops']);
  /** Points put into the current research item. */
  progress = 0;
  readonly researched = new Set<string>();
  readonly unlocked: Set<string>;
  /** Seconds left on each running campaign. */
  readonly campaigns = new Map<CampaignId, number>();
  readonly months: MonthAccount[] = [emptyAccount(0)];
  readonly startMonth: number;
  private readonly listeners = new Set<() => void>();
  private readonly unlockListeners = new Set<(item: ResearchItem) => void>();

  constructor(private readonly park: Park, options: ManagementOptions = {}) {
    this.loan = options.loan ?? 0;
    this.maxLoan = options.maxLoan ?? 20_000;
    this.startMonth = options.startMonth ?? 2;
    this.unlocked = new Set(options.unlocked ?? STARTING_UNLOCKS);
    const done = options.researched === 'all' ? RESEARCH.map((r) => r.id) : options.researched ?? [];
    for (const id of done) {
      const item = RESEARCH.find((r) => r.id === id);
      if (!item) continue;
      this.researched.add(id);
      this.unlocked.add(item.unlocks);
    }
    park.onLedger((category, amount) => {
      const m = this.months[this.months.length - 1] as MonthAccount;
      m.amounts[category] += amount;
    });
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** A research item finished. */
  onUnlock(listener: (item: ResearchItem) => void): () => void {
    this.unlockListeners.add(listener);
    return () => this.unlockListeners.delete(listener);
  }

  // ---- time ------------------------------------------------------------------

  get monthIndex(): number {
    return Math.floor(this.time / MONTH_SECONDS);
  }

  /** "March, Year 1". */
  get date(): { month: string; year: number; day: number } {
    const m = this.startMonth + this.monthIndex;
    return {
      month: MONTH_NAMES[m % 12] as string,
      year: Math.floor(m / 12) + 1,
      day: Math.floor(((this.time % MONTH_SECONDS) / MONTH_SECONDS) * 30) + 1,
    };
  }

  /** Let `seconds` of play pass: pay running costs, research, end months. */
  advance(seconds: number): void {
    if (seconds <= 0) return;
    const share = seconds / MONTH_SECONDS;
    const fund = FUNDING[this.funding] ?? FUNDING[0];
    const item = this.currentResearch();
    if (item && fund.perMonth > 0) {
      this.park.charge(fund.perMonth * share, 'research');
      this.progress += fund.points * seconds;
      if (this.progress >= item.cost) this.finishResearch(item);
    }
    for (const [id, left] of this.campaigns) {
      const c = CAMPAIGNS.find((x) => x.id === id);
      if (!c) continue;
      const used = Math.min(left, seconds);
      this.park.charge((c.perMonth * used) / MONTH_SECONDS, 'marketing');
      if (left - seconds <= 0) this.campaigns.delete(id);
      else this.campaigns.set(id, left - seconds);
    }
    if (this.loan > 0) this.park.charge(((this.loan * INTEREST_RATE) / 12) * share, 'interest');
    const before = this.monthIndex;
    this.time += seconds;
    for (let m = before + 1; m <= this.monthIndex; m++) {
      this.months.push(emptyAccount(m));
      if (this.months.length > 24) this.months.shift();
    }
    this.emit();
  }

  // ---- money -----------------------------------------------------------------

  borrow(amount = LOAN_STEP): boolean {
    const take = Math.min(amount, this.maxLoan - this.loan);
    if (take <= 0) return false;
    this.loan += take;
    this.park.transfer(take);
    this.emit();
    return true;
  }

  repay(amount = LOAN_STEP): boolean {
    const pay = Math.min(amount, this.loan);
    if (pay <= 0 || pay > this.park.cash) return false;
    this.loan -= pay;
    this.park.transfer(-pay);
    this.emit();
    return true;
  }

  setEntryFee(fee: number): void {
    this.entryFee = Math.max(0, Math.min(MAX_ENTRY_FEE, Math.round(fee)));
    this.emit();
  }

  /**
   * How much a park is worth visiting, in dollars: guests happily pay up to
   * this to get in. Grows with the rides on offer.
   */
  parkValue(buildings: readonly Building[]): number {
    let value = 2;
    for (const b of buildings) {
      if (!b.open) continue;
      const t = buildingType(b.type);
      if (t.kind !== 'ride') continue;
      value += (b.coaster?.ratings.excitement ?? t.excitement ?? 0) * 0.8;
    }
    return value;
  }

  /** Arrival multiplier from the entry fee (1 when it's fair) and marketing. */
  demandMultiplier(buildings: readonly Building[]): number {
    const over = Math.max(0, this.entryFee - this.parkValue(buildings));
    const fee = Math.max(0.15, 1 - over / 20);
    return fee * (1 + this.marketingBoost());
  }

  // ---- marketing -------------------------------------------------------------

  startCampaign(id: CampaignId, months = 1): void {
    this.campaigns.set(id, (this.campaigns.get(id) ?? 0) + months * MONTH_SECONDS);
    this.emit();
  }

  stopCampaign(id: CampaignId): void {
    this.campaigns.delete(id);
    this.emit();
  }

  /** Extra share of arrivals from running campaigns. */
  marketingBoost(): number {
    let boost = 0;
    for (const id of this.campaigns.keys()) boost += CAMPAIGNS.find((c) => c.id === id)?.boost ?? 0;
    return Math.min(1.2, boost);
  }

  // ---- research --------------------------------------------------------------

  setFunding(level: number): void {
    this.funding = Math.max(0, Math.min(FUNDING.length - 1, level));
    this.emit();
  }

  togglePriority(category: ResearchCategory): void {
    if (this.priorities.has(category)) this.priorities.delete(category);
    else this.priorities.add(category);
    this.emit();
  }

  /** The item being researched now, or null when there's nothing left (in the chosen categories). */
  currentResearch(): ResearchItem | null {
    return RESEARCH.find((r) => !this.researched.has(r.id) && this.priorities.has(r.category)) ?? null;
  }

  isUnlocked(id: string): boolean {
    return this.unlocked.has(id);
  }

  private finishResearch(item: ResearchItem): void {
    this.researched.add(item.id);
    this.unlocked.add(item.unlocks);
    this.progress = 0;
    for (const l of this.unlockListeners) l(item);
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }
}
