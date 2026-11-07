import { render } from 'preact';
import { buildingType } from './core/catalog';
import { layTestGrid } from './game/bench';
import { CoasterEditor } from './game/coaster-editor';
import { GoalTracker, type GoalState } from './game/goals';
import { Management } from './game/management';
import { markCompleted, scenarioById, type Scenario } from './game/scenarios';
import { Park } from './game/park';
import { createStarterTerrain, starterLayout } from './game/starter-park';
import { ToolController } from './game/tool-controller';
import { GameRenderer } from './render/game-renderer';
import { SimClient } from './sim/sim-client';
import { App } from './ui/App';
import './ui/styles.css';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui') as HTMLElement;

// Which scenario to play: #scenario=<id> (or ?scenario=<id>). Without one,
// the scenario list opens over a sandbox park.
const params = new URLSearchParams(location.search);
const hashParams = new URLSearchParams(location.hash.slice(1));
const bench = Number(params.get('bench'));
const chosen = scenarioById(hashParams.get('scenario') ?? params.get('scenario')) ?? (bench > 0 ? scenarioById('sandbox') : undefined);
const scenario = chosen ?? (scenarioById('sandbox') as Scenario);

const layout = starterLayout();
const park = new Park(createStarterTerrain(undefined, scenario.terrain), scenario.cash);
const game = new GameRenderer(canvas, park, layout.entrance);
const management = new Management(park, scenario.management);
const goals = new GoalTracker(scenario.goal, management.startMonth);
const coaster = new CoasterEditor(park, (feature) => management.isUnlocked(feature));
const tools = new ToolController(park, game, coaster);
tools.canBuild = (type) => management.isUnlocked(type);
game.setDraftSource(() => coaster.draft);
const entrances = [layout.entrance, { tx: layout.entrance.tx - 1, ty: layout.entrance.ty }];
/** Guest cap set by the performance panel, overriding normal demand. */
let benchCap: number | null = null;
const sim = new SimClient(park, entrances, parkDemand());
game.setGuestSource(() => sim.snapshot);
game.setBuildingStatsSource(() => sim.stats.buildings);
game.setDirtSource(() => sim.dirt);
tools.onPickGuest = (tile) => sim.inspectAt(tile);

// The calendar, running costs and research follow simulated time.
sim.onTime((seconds) => management.advance(seconds));
management.onUnlock((item) => tools.notify(`Research complete: ${item.name} is now available.`, 'info'));
let lastDemand = '';
management.onChange(() => {
  // Only tell the worker when the fee or marketing actually changed demand.
  const config = parkDemand();
  const key = JSON.stringify(config);
  if (key !== lastDemand) {
    lastDemand = key;
    sim.setConfig(config);
  }
});

// Tell the player when rides break down and get fixed.
sim.onEvent((e) => {
  const b = park.buildings.find((x) => x.id === e.id);
  if (!b) return;
  const name = buildingType(b.type).name;
  if (e.kind === 'breakdown') {
    tools.notify(park.staff.mechanics > 0 ? `${name} has broken down. A mechanic is on the way.` : `${name} has broken down! Hire a mechanic to fix it.`);
  } else {
    tools.notify(`${name} is fixed and running again.`, 'info');
  }
});

/**
 * How many guests the park attracts. More rides draw bigger crowds; the sim
 * scales this by the park rating, and an entry fee above what the park is
 * worth puts people off while marketing brings more in.
 */
function parkDemand() {
  // A coaster draws a crowd like two flat rides.
  const rides = park.buildings.reduce((n, b) => n + (b.coaster ? 2 : buildingType(b.type).kind === 'ride' ? 1 : 0), 0);
  const stalls = park.buildings.filter((b) => buildingType(b.type).kind !== 'ride').length;
  const pull = management.demandMultiplier(park.buildings);
  return {
    arrivalRate: (0.4 + rides * 0.35 + stalls * 0.05) * (benchCap === null ? pull : 1),
    maxGuests: benchCap ?? Math.round((120 + rides * 220 + stalls * 30) * Math.min(1.5, pull)),
    useRating: benchCap === null,
    entryFee: management.entryFee,
  };
}
park.onChange(() => sim.setConfig(parkDemand()));

/** Everything the scenario goal is judged on, right now. */
function goalState(): GoalState {
  let bestCoaster = 0;
  for (const b of park.buildings) if (b.open && b.coaster) bestCoaster = Math.max(bestCoaster, b.coaster.ratings.excitement);
  let bestMonthProfit = 0;
  for (const m of management.months.slice(0, -1)) {
    const profit = Object.values(m.amounts).reduce((a, v) => a + v, 0);
    bestMonthProfit = Math.max(bestMonthProfit, profit);
  }
  return { guests: sim.stats.guests, rating: sim.stats.rating, bestCoaster, bestMonthProfit, loan: management.loan, monthIndex: management.monthIndex };
}
sim.onStats(() => goals.check(goalState()));
goals.onOutcome((o) => {
  if (o === 'won' && chosen) markCompleted(chosen.id);
});
// Nothing needs to run behind the scenario list.
if (!chosen) sim.setPaused(true);

game.onTilePointer((e) => tools.pointer(e.kind, e.tile));
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (tools.key(e.key, e.ctrlKey || e.metaKey, e.shiftKey)) e.preventDefault();
});

/** Developer actions for the performance panel. */
export const devActions = {
  layTestPaths: () => park.applyFree((t) => layTestGrid(t)),
  addGuests: (n: number) => {
    benchCap = Math.max(sim.settings.maxGuests, sim.stats.guests + n);
    sim.setConfig(parkDemand());
    sim.spawn(n);
  },
  fillTo: (n: number) => {
    benchCap = n;
    sim.setConfig(parkDemand());
    sim.spawn(Math.max(0, n - sim.stats.guests));
  },
};

// ?bench=10000 lays the test grid and fills the park, for performance checks.
if (bench > 0) {
  devActions.layTestPaths();
  // Give the worker a moment to receive the new paths first.
  setTimeout(() => devActions.fillTo(bench), 200);
}

// Exposed for automated smoke tests and debugging in the console.
(window as unknown as { thrillwright: unknown }).thrillwright = { game, park, tools, sim, coaster, management, goals, devActions };

/** Start a scenario: the page reloads into it. */
function play(id: string) {
  location.hash = `scenario=${id}`;
  location.reload();
}

render(
  <App
    game={game}
    park={park}
    tools={tools}
    coaster={coaster}
    sim={sim}
    management={management}
    scenario={chosen ?? null}
    goals={goals}
    onPlay={play}
    dev={devActions}
    showHelp={!!chosen && !bench && !chosen.tutorial}
    showPerf={bench > 0}
  />,
  uiRoot,
);
