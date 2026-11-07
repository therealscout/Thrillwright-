/**
 * Saving and loading a park. A save holds the land, the buildings, the money
 * and accounts, research, the scenario and its progress, and the weather.
 * Guests are not saved: a loaded park fills up again within a minute or two.
 *
 * Saves live in the browser's local storage, one per scenario, plus a
 * pointer to the most recent so the menu can offer "Continue".
 */
import { createTerrain, type Terrain } from '../core/terrain';
import type { ResearchCategory } from '../core/research';
import type { Outcome } from './goals';
import type { CampaignId, Management, MonthAccount } from './management';
import type { Park, ParkState } from './park';
import type { WeatherKind } from './weather';

export const SAVE_VERSION = 1;

export interface SaveGame {
  version: number;
  savedAt: string;
  scenario: string;
  terrain: {
    width: number;
    height: number;
    corners: string;
    water: string;
    surfaces: string;
    paths: string;
    owned: string;
    blocked: string;
    items: string;
  };
  park: ParkState;
  management: {
    time: number;
    loan: number;
    maxLoan: number;
    entryFee: number;
    funding: number;
    priorities: ResearchCategory[];
    progress: number;
    researched: string[];
    unlocked: string[];
    campaigns: Array<[CampaignId, number]>;
    months: MonthAccount[];
  };
  outcome: Outcome;
  weather: WeatherKind;
  /** For the menu: "18 March, Year 2". */
  dateText: string;
}

const LAYERS = ['corners', 'water', 'surfaces', 'paths', 'owned', 'blocked', 'items'] as const;

// ---- byte arrays as text ---------------------------------------------------------

/** Base64 of a byte array, run-length packed first (terrain is very repetitive). */
export function packBytes(bytes: Uint8Array): string {
  const out: number[] = [];
  for (let i = 0; i < bytes.length; ) {
    const v = bytes[i] as number;
    let run = 1;
    while (i + run < bytes.length && bytes[i + run] === v && run < 255) run++;
    out.push(run, v);
    i += run;
  }
  let text = '';
  const chunk = 0x8000;
  for (let i = 0; i < out.length; i += chunk) text += String.fromCharCode(...out.slice(i, i + chunk));
  return btoa(text);
}

export function unpackBytes(text: string, length: number): Uint8Array {
  const raw = atob(text);
  const out = new Uint8Array(length);
  let o = 0;
  for (let i = 0; i + 1 < raw.length && o < length; i += 2) {
    const run = raw.charCodeAt(i);
    const v = raw.charCodeAt(i + 1);
    out.fill(v, o, Math.min(length, o + run));
    o += run;
  }
  return out;
}

// ---- building and applying a save --------------------------------------------------

export function makeSave(input: {
  scenario: string;
  park: Park;
  management: Management;
  outcome: Outcome;
  weather: WeatherKind;
}): SaveGame {
  const { park, management: m } = input;
  const t = park.terrain;
  const terrain = { width: t.width, height: t.height } as SaveGame['terrain'];
  for (const layer of LAYERS) terrain[layer] = packBytes(t[layer]);
  const d = m.date;
  return {
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    scenario: input.scenario,
    terrain,
    park: park.saveState(),
    management: {
      time: m.time,
      loan: m.loan,
      maxLoan: m.maxLoan,
      entryFee: m.entryFee,
      funding: m.funding,
      priorities: [...m.priorities],
      progress: m.progress,
      researched: [...m.researched],
      unlocked: [...m.unlocked],
      campaigns: [...m.campaigns.entries()],
      months: structuredClone(m.months),
    },
    outcome: input.outcome,
    weather: input.weather,
    dateText: `${d.day} ${d.month}, Year ${d.year}`,
  };
}

export function terrainFromSave(save: SaveGame): Terrain {
  const { width, height } = save.terrain;
  const t = createTerrain(width, height);
  for (const layer of LAYERS) {
    const target = t[layer];
    target.set(unpackBytes(save.terrain[layer], target.length));
  }
  return t;
}

/** Put the money, buildings and research of a save into a fresh park. */
export function applySave(save: SaveGame, park: Park, m: Management): void {
  park.loadState(save.park);
  const s = save.management;
  m.time = s.time;
  m.loan = s.loan;
  m.maxLoan = s.maxLoan;
  m.entryFee = s.entryFee;
  m.funding = s.funding;
  m.priorities.clear();
  for (const c of s.priorities) m.priorities.add(c);
  m.progress = s.progress;
  m.researched.clear();
  for (const r of s.researched) m.researched.add(r);
  m.unlocked.clear();
  for (const u of s.unlocked) m.unlocked.add(u);
  m.campaigns.clear();
  for (const [id, left] of s.campaigns) m.campaigns.set(id, left);
  m.months.length = 0;
  m.months.push(...structuredClone(s.months));
  if (m.months.length === 0) m.months.push({ index: m.monthIndex, amounts: { rides: 0, stalls: 0, entry: 0, construction: 0, wages: 0, marketing: 0, research: 0, interest: 0 } });
}

/** Check a parsed save looks right before trusting it. */
export function isSave(v: unknown): v is SaveGame {
  if (!v || typeof v !== 'object') return false;
  const s = v as Partial<SaveGame>;
  return (
    s.version === SAVE_VERSION &&
    typeof s.scenario === 'string' &&
    !!s.terrain &&
    typeof s.terrain.width === 'number' &&
    LAYERS.every((l) => typeof s.terrain?.[l] === 'string') &&
    !!s.park &&
    Array.isArray(s.park.buildings) &&
    !!s.management &&
    Array.isArray(s.management.months)
  );
}

// ---- storage -------------------------------------------------------------------------

const slotKey = (scenario: string) => `thrillwright.save.${scenario}`;
const LAST_KEY = 'thrillwright.save.last';

export function writeSave(save: SaveGame): boolean {
  try {
    localStorage.setItem(slotKey(save.scenario), JSON.stringify(save));
    localStorage.setItem(LAST_KEY, save.scenario);
    return true;
  } catch {
    return false;
  }
}

export function readSave(scenario: string): SaveGame | null {
  try {
    const raw = localStorage.getItem(slotKey(scenario));
    if (!raw) return null;
    const v = JSON.parse(raw) as unknown;
    return isSave(v) ? v : null;
  } catch {
    return null;
  }
}

/** The most recently saved park, for "Continue". */
export function latestSave(): SaveGame | null {
  try {
    const last = localStorage.getItem(LAST_KEY);
    return last ? readSave(last) : null;
  } catch {
    return null;
  }
}

export function deleteSave(scenario: string): void {
  try {
    localStorage.removeItem(slotKey(scenario));
    if (localStorage.getItem(LAST_KEY) === scenario) localStorage.removeItem(LAST_KEY);
  } catch {
    // Nothing to do without storage.
  }
}
