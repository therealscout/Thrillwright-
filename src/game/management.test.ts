import { describe, expect, it } from 'vitest';
import { createTerrain } from '../core/terrain';
import { RESEARCH } from '../core/research';
import { CoasterEditor } from './coaster-editor';
import { INTEREST_RATE, Management, MONTH_SECONDS } from './management';
import { Park } from './park';

function setup(cash = 10_000) {
  const t = createTerrain(40, 20);
  t.owned.fill(1);
  const park = new Park(t, cash);
  const m = new Management(park);
  return { park, m, t };
}

describe('Management', () => {
  it('keeps a calendar that starts in March of year 1', () => {
    const { m } = setup();
    expect(m.date).toEqual({ month: 'March', year: 1, day: 1 });
    m.setFunding(0);
    m.advance(MONTH_SECONDS / 2);
    expect(m.date.day).toBe(16);
    m.advance(MONTH_SECONDS * 10);
    expect(m.date).toMatchObject({ month: 'January', year: 2 });
  });

  it('books money into the current month and starts a new account each month', () => {
    const { park, m } = setup();
    m.setFunding(0);
    park.earn(120, 'rides');
    park.earn(30, 'stalls');
    park.charge(50, 'wages');
    const now = m.months[0]!;
    expect(now.amounts.rides).toBe(120);
    expect(now.amounts.stalls).toBe(30);
    expect(now.amounts.wages).toBe(-50);
    m.advance(MONTH_SECONDS);
    expect(m.months).toHaveLength(2);
    park.earn(10, 'entry');
    expect(m.months[1]!.amounts.entry).toBe(10);
    expect(m.months[0]!.amounts.entry).toBe(0);
  });

  it('keeps two years of accounts at most', () => {
    const { m } = setup();
    m.setFunding(0);
    m.advance(MONTH_SECONDS * 30);
    expect(m.months).toHaveLength(24);
    expect(m.months[23]!.index).toBe(30);
  });

  it('lends money up to the limit, charges interest and takes repayments', () => {
    const { park, m } = setup(1000);
    m.setFunding(0);
    expect(m.borrow(5000)).toBe(true);
    expect(park.cash).toBe(6000);
    expect(m.loan).toBe(5000);
    // A loan is not income.
    expect(m.months[0]!.amounts.rides).toBe(0);
    expect(m.borrow(1e9)).toBe(true);
    expect(m.loan).toBe(m.maxLoan);
    expect(m.borrow()).toBe(false);
    const before = park.cash;
    m.advance(MONTH_SECONDS);
    const interest = (m.maxLoan * INTEREST_RATE) / 12;
    expect(before - park.cash).toBeCloseTo(interest, 5);
    expect(m.months[0]!.amounts.interest).toBeCloseTo(-interest, 5);
    expect(m.repay(2000)).toBe(true);
    expect(m.loan).toBe(m.maxLoan - 2000);
  });

  it('refuses a repayment the park cannot afford', () => {
    const { park, m } = setup(0);
    m.borrow(3000);
    park.charge(2500, 'construction');
    expect(m.repay(1000)).toBe(false);
    expect(m.loan).toBe(3000);
  });

  it('puts guests off when the entry fee is more than the park is worth', () => {
    const { m } = setup();
    expect(m.demandMultiplier([])).toBe(1);
    m.setEntryFee(2);
    expect(m.demandMultiplier([])).toBe(1);
    m.setEntryFee(22);
    expect(m.demandMultiplier([])).toBeCloseTo(0.15);
    m.setEntryFee(999);
    expect(m.entryFee).toBe(40);
  });

  it('values a park with good rides more', () => {
    const { park, m } = setup(50_000);
    const empty = m.parkValue(park.buildings);
    park.placeBuilding('carousel', { tx: 5, ty: 5 }, 0);
    park.placeBuilding('spin-cups', { tx: 10, ty: 5 }, 0);
    expect(m.parkValue(park.buildings)).toBeGreaterThan(empty + 2);
  });

  it('runs marketing campaigns for a month, charging as they go', () => {
    const { park, m } = setup();
    m.setFunding(0);
    m.startCampaign('radio');
    expect(m.marketingBoost()).toBeCloseTo(0.35);
    expect(m.demandMultiplier([])).toBeCloseTo(1.35);
    const cash = park.cash;
    m.advance(MONTH_SECONDS / 2);
    expect(cash - park.cash).toBeCloseTo(450, 5);
    m.advance(MONTH_SECONDS);
    expect(m.campaigns.has('radio')).toBe(false);
    expect(cash - park.cash).toBeCloseTo(900, 5);
    expect(m.marketingBoost()).toBe(0);
  });

  it('caps the marketing boost', () => {
    const { m } = setup();
    m.startCampaign('flyers');
    m.startCampaign('radio');
    m.startCampaign('tv');
    expect(m.marketingBoost()).toBe(1.2);
  });

  it('researches items in order, unlocking them and telling listeners', () => {
    const { park, m } = setup();
    const first = RESEARCH[0]!;
    expect(m.isUnlocked(first.unlocks)).toBe(false);
    expect(m.currentResearch()).toBe(first);
    const found: string[] = [];
    m.onUnlock((item) => found.push(item.id));
    const cash = park.cash;
    // Normal funding: 2 points a second.
    m.advance(first.cost / 2);
    expect(found).toEqual([first.id]);
    expect(m.isUnlocked(first.unlocks)).toBe(true);
    expect(m.currentResearch()).toBe(RESEARCH[1]);
    expect(cash - park.cash).toBeCloseTo((300 * first.cost) / 2 / MONTH_SECONDS, 5);
    expect(m.months[0]!.amounts.research).toBeLessThan(0);
  });

  it('pauses research without funding and skips categories left out', () => {
    const { park, m } = setup();
    m.setFunding(0);
    const cash = park.cash;
    m.advance(1000);
    expect(m.researched.size).toBe(0);
    expect(park.cash).toBe(cash);
    m.setFunding(2);
    for (const c of ['gentle', 'thrill', 'shops'] as const) m.togglePriority(c);
    expect(m.currentResearch()?.category).toBe('coaster');
    m.togglePriority('coaster');
    expect(m.currentResearch()).toBeNull();
    m.advance(1000);
    expect(park.cash).toBe(cash);
  });

  it('can start with everything researched', () => {
    const t = createTerrain(10, 10);
    const m = new Management(new Park(t), { researched: 'all' });
    expect(m.currentResearch()).toBeNull();
    for (const r of RESEARCH) expect(m.isUnlocked(r.unlocks)).toBe(true);
  });
});

describe('Locked coaster pieces', () => {
  it('greys out banked turns and the loop until researched', () => {
    const { park, m } = setup(50_000);
    const editor = new CoasterEditor(park, (f) => m.isUnlocked(f));
    editor.begin();
    editor.placeStation({ tx: 10, ty: 5 });
    const loop = editor.state.options.find((o) => o.id === 'loop');
    expect(loop).toMatchObject({ ok: false, locked: true });
    expect(editor.press('bank-left').ok).toBe(false);
    expect(editor.add('loop').ok).toBe(false);
    expect(editor.press('straight').ok).toBe(true);
  });

  it('builds a plainer sample circuit without them that still rides well', () => {
    const { park, m } = setup(50_000);
    const editor = new CoasterEditor(park, (f) => m.isUnlocked(f));
    editor.begin();
    editor.placeStation({ tx: 10, ty: 5 });
    expect(editor.buildSample().ok).toBe(true);
    const pieces = editor.state.design!.pieces;
    expect(pieces.some((p) => p.kind === 'loop' || p.kind.startsWith('bank'))).toBe(false);
    expect(editor.state.complete).toBe(true);
    expect(editor.runTest()?.ok).toBe(true);
  });
});
