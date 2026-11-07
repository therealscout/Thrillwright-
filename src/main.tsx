import { render } from 'preact';
import { buildingType } from './core/catalog';
import { layTestGrid } from './game/bench';
import { AudioEngine } from './audio/audio-engine';
import { CoasterEditor } from './game/coaster-editor';
import { loadDisplaySettings, saveDisplaySettings, type DisplaySettings } from './game/display-settings';
import { GoalTracker, type GoalState } from './game/goals';
import { Management, MONTH_SECONDS } from './game/management';
import { applySave, makeSave, readSave, terrainFromSave, writeSave } from './game/save';
import { markCompleted, scenarioById, type Scenario } from './game/scenarios';
import { Park } from './game/park';
import { createStarterTerrain, starterLayout } from './game/starter-park';
import { ToolController } from './game/tool-controller';
import { Weather } from './game/weather';
import { GameRenderer } from './render/game-renderer';
import { SimClient } from './sim/sim-client';
import { App } from './ui/App';
import './ui/styles.css';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui') as HTMLElement;

// Without WebGL there is no park to show: say so plainly instead of a blank page.
function hasWebGL(): boolean {
  try {
    const probe = document.createElement('canvas');
    return !!(probe.getContext('webgl2') ?? probe.getContext('webgl'));
  } catch {
    return false;
  }
}
if (!hasWebGL()) {
  uiRoot.innerHTML = `<div class="menu-backdrop"><div class="outcome" role="alert"><h2>Thrillwright needs WebGL</h2>
    <p>Your browser didn't let the game use 3D graphics. Try an up-to-date Chrome, Edge, Firefox or Safari,
    and check that hardware acceleration is turned on in the browser's settings.</p></div></div>`;
  throw new Error('WebGL is not available');
}

// Which scenario to play: #scenario=<id> (or ?scenario=<id>). Without one,
// the scenario list opens over a sandbox park.
const params = new URLSearchParams(location.search);
const hashParams = new URLSearchParams(location.hash.slice(1));
const bench = Number(params.get('bench'));
const chosen = scenarioById(hashParams.get('scenario') ?? params.get('scenario')) ?? (bench > 0 ? scenarioById('sandbox') : undefined);
const scenario = chosen ?? (scenarioById('sandbox') as Scenario);

const layout = starterLayout();
// "Continue" loads the saved park for this scenario instead of a fresh one.
const save = chosen && hashParams.get('continue') ? readSave(chosen.id) : null;
const park = new Park(save ? terrainFromSave(save) : createStarterTerrain(undefined, scenario.terrain), scenario.cash);
const game = new GameRenderer(canvas, park, layout.entrance);
const management = new Management(park, scenario.management);
const goals = new GoalTracker(scenario.goal, management.startMonth);
const weather = new Weather([...scenario.id].reduce((h, c) => h * 31 + c.charCodeAt(0), 7));
if (save) {
  applySave(save, park, management);
  goals.outcome = save.outcome;
  weather.set(save.weather);
}
const audio = new AudioEngine();
audio.armOnGesture();

/** Display options, applied live. */
const display = {
  settings: loadDisplaySettings(),
  update(patch: Partial<DisplaySettings>) {
    this.settings = { ...this.settings, ...patch };
    saveDisplaySettings(this.settings);
    applyDisplay(patch);
  },
};
/** Put display settings into effect (only the ones that changed). */
function applyDisplay(changed: Partial<DisplaySettings>) {
  const s = display.settings;
  if ('quality' in changed) game.setQuality(s.quality);
  game.reduceMotion = s.reduceMotion;
  uiRoot.style.setProperty('zoom', String(s.uiScale));
  document.documentElement.classList.toggle('reduce-motion', s.reduceMotion);
}
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
applyDisplay(display.settings);
// One day and night per game month; the park opens mid-morning.
game.setSkySource(() => ({
  time: display.settings.dayNight ? (0.4 + management.time / MONTH_SECONDS) % 1 : 0.5,
  cloud: display.settings.weatherEffects ? weather.cloud : 0,
  rain: display.settings.weatherEffects ? weather.rain : 0,
}));
tools.onPickGuest = (tile) => sim.inspectAt(tile);

// The calendar, running costs and research follow simulated time.
sim.onTime((seconds) => {
  management.advance(seconds);
  weather.advance(seconds, (management.startMonth + management.monthIndex) % 12);
});
management.onUnlock((item) => {
  tools.notify(`Research complete: ${item.name} is now available.`, 'info');
  audio.play('unlock');
});
weather.onChange((kind) => {
  if (kind === 'rain') tools.notify('It has started to rain. Fewer visitors will come until it stops.', 'info');
  sim.setConfig(parkDemand());
});
sim.onStats((s) => audio.setAmbience(s.guests, weather.rain));

// Sounds for things happening in the park.
park.onLedger((category, amount) => {
  if (category === 'construction' && amount < 0) audio.play('build');
});
let lastMessage = 0;
tools.subscribe((s) => {
  if (!s.message || s.message.id === lastMessage) return;
  lastMessage = s.message.id;
  if (s.message.tone === 'error') audio.play('error');
});
uiRoot.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('button')) audio.play('click');
});
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
  audio.play(e.kind === 'breakdown' ? 'breakdown' : 'fixed');
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
  const pull = management.demandMultiplier(park.buildings) * weather.demandFactor;
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
  audio.play(o === 'won' ? 'win' : 'lose');
  if (o === 'won' && chosen) markCompleted(chosen.id);
});
// Nothing needs to run behind the scenario list.
if (!chosen) sim.setPaused(true);

game.onTilePointer((e) => tools.pointer(e.kind, e.tile));
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (tools.key(e.key, e.ctrlKey || e.metaKey, e.shiftKey)) e.preventDefault();
});

// ---- saving -----------------------------------------------------------------------

/** Save the park now; returns whether it worked. */
function saveGame(): boolean {
  if (!chosen || bench > 0) return false;
  return writeSave(makeSave({ scenario: chosen.id, park, management, outcome: goals.outcome, weather: weather.kind }));
}
// Autosave at the start of every month and when the player leaves the page.
let savedMonth = management.monthIndex;
management.onChange(() => {
  if (management.monthIndex !== savedMonth) {
    savedMonth = management.monthIndex;
    saveGame();
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveGame();
});
window.addEventListener('pagehide', () => saveGame());
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    const ok = saveGame();
    tools.notify(ok ? 'Game saved.' : "The game couldn't be saved here.", ok ? 'info' : 'error');
  }
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
(window as unknown as { thrillwright: unknown }).thrillwright = { game, park, tools, sim, coaster, management, goals, weather, audio, display, devActions };

/** Start a scenario: the page reloads into it. */
function play(id: string, resume = false) {
  location.hash = resume ? `scenario=${id}&continue=1` : `scenario=${id}`;
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
    weather={weather}
    audio={audio}
    display={display}
    onPlay={play}
    onSave={chosen && !bench ? saveGame : undefined}
    loaded={save !== null}
    dev={devActions}
    showHelp={!!chosen && !bench && !chosen.tutorial}
    showPerf={bench > 0}
  />,
  uiRoot,
);
