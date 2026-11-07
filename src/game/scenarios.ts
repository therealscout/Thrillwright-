/**
 * Scenarios: a starting park, money and research, and a goal to reach by a
 * deadline. All parks and names are original to Thrillwright. Finishing one
 * unlocks the next.
 */
import type { ManagementOptions } from './management';
import type { TerrainStyle } from './starter-park';

export interface ScenarioGoal {
  /** Guests in the park at once. */
  guests?: number;
  /** Park rating at least this. */
  rating?: number;
  /** An open coaster with at least this excitement. */
  coasterExcitement?: number;
  /** A finished month with at least this much profit. */
  monthlyProfit?: number;
  /** The loan paid off. */
  noLoan?: boolean;
  /** Deadline: the end of October in this year. Leave out for no deadline. */
  year?: number;
}

export interface Scenario {
  id: string;
  name: string;
  /** One or two sentences for the scenario list. */
  blurb: string;
  difficulty: 'Tutorial' | 'Easy' | 'Medium' | 'Hard' | 'Sandbox';
  cash: number;
  terrain: TerrainStyle;
  management: ManagementOptions;
  goal: ScenarioGoal;
  /** Scenario that must be finished first. */
  after?: string;
  /** Show the guided tutorial. */
  tutorial?: boolean;
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'first-steps',
    name: 'First Steps Fairground',
    blurb: 'A guided first park. Lay paths, open rides and stalls, hire staff and build your first coaster, one step at a time.',
    difficulty: 'Tutorial',
    cash: 25_000,
    terrain: { seed: 0 },
    management: { loan: 0, maxLoan: 10_000 },
    goal: { guests: 60, rating: 45, year: 1 },
    tutorial: true,
  },
  {
    id: 'meadowbrook',
    name: 'Meadowbrook Green',
    blurb: 'A quiet field outside a market town. Get the locals through the gates before the season ends.',
    difficulty: 'Easy',
    cash: 12_000,
    terrain: { seed: 3 },
    management: { loan: 5_000, maxLoan: 15_000 },
    goal: { guests: 250, rating: 55, year: 1 },
  },
  {
    id: 'lakeshore',
    name: 'Lakeshore Landing',
    blurb: 'A long lake runs along the plot. Build a coaster worth crossing the county for.',
    difficulty: 'Medium',
    cash: 15_000,
    terrain: { seed: 7, water: 'lake' },
    management: { loan: 10_000, maxLoan: 25_000 },
    goal: { guests: 400, coasterExcitement: 5, year: 2 },
    after: 'meadowbrook',
  },
  {
    id: 'hilltop',
    name: 'Hilltop Hollow',
    blurb: 'Rolling hills and a big debt. Turn a real profit and pay back every dollar you owe.',
    difficulty: 'Medium',
    cash: 8_000,
    terrain: { seed: 11, plotHills: 7, water: 'none' },
    management: { loan: 15_000, maxLoan: 25_000 },
    goal: { monthlyProfit: 1_500, noLoan: true, year: 2 },
    after: 'lakeshore',
  },
  {
    id: 'summit',
    name: 'Thunder Summit',
    blurb: 'The big one. A hilly site with a lake, the latest rides already in the lab, and a crowd to match.',
    difficulty: 'Hard',
    cash: 20_000,
    terrain: { seed: 19, plotHills: 5, water: 'lake' },
    management: { loan: 10_000, maxLoan: 40_000, researched: ['r-popcorn', 'r-swing', 'r-bank'] },
    goal: { guests: 1_000, rating: 70, year: 3 },
    after: 'hilltop',
  },
  {
    id: 'sandbox',
    name: 'Sandbox',
    blurb: 'No goals and no deadline. Build whatever you like, with everything researched.',
    difficulty: 'Sandbox',
    cash: 50_000,
    terrain: { seed: 0 },
    management: { loan: 0, maxLoan: 50_000, researched: 'all' },
    goal: {},
  },
];

export function scenarioById(id: string | null | undefined): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

/** Whether a scenario can be played, given the ones finished. */
export function isScenarioOpen(s: Scenario, completed: ReadonlySet<string>): boolean {
  return !s.after || completed.has(s.after);
}

// ---- saved progress -----------------------------------------------------------

const PROGRESS_KEY = 'thrillwright.completed';

export function loadCompleted(): Set<string> {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export function markCompleted(id: string): void {
  const done = loadCompleted();
  done.add(id);
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify([...done]));
  } catch {
    // Private windows can refuse storage; progress just isn't kept.
  }
}
