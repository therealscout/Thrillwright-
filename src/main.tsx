import { render } from 'preact';
import { buildingType } from './core/catalog';
import { layTestGrid } from './game/bench';
import { Park } from './game/park';
import { createStarterTerrain, starterLayout } from './game/starter-park';
import { ToolController } from './game/tool-controller';
import { GameRenderer } from './render/game-renderer';
import { SimClient } from './sim/sim-client';
import { App } from './ui/App';
import './ui/styles.css';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui') as HTMLElement;

const layout = starterLayout();
const park = new Park(createStarterTerrain());
const game = new GameRenderer(canvas, park, layout.entrance);
const tools = new ToolController(park, game);
const entrances = [layout.entrance, { tx: layout.entrance.tx - 1, ty: layout.entrance.ty }];
/** Guest cap set by the performance panel, overriding normal demand. */
let benchCap: number | null = null;
const sim = new SimClient(park, entrances, parkDemand());
game.setGuestSource(() => sim.snapshot);
game.setBuildingStatsSource(() => sim.stats.buildings);

/**
 * How many guests the park attracts. More rides draw bigger crowds; the park
 * rating (milestone 6) and marketing (milestone 7) will feed in here later.
 */
function parkDemand() {
  const rides = park.buildings.filter((b) => buildingType(b.type).kind === 'ride').length;
  const stalls = park.buildings.length - rides;
  return {
    arrivalRate: 0.4 + rides * 0.35 + stalls * 0.05,
    maxGuests: benchCap ?? 120 + rides * 220 + stalls * 30,
  };
}
park.onChange(() => sim.setConfig(parkDemand()));

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
const bench = Number(new URLSearchParams(location.search).get('bench'));
if (bench > 0) {
  devActions.layTestPaths();
  // Give the worker a moment to receive the new paths first.
  setTimeout(() => devActions.fillTo(bench), 200);
}

// Exposed for automated smoke tests and debugging in the console.
(window as unknown as { thrillwright: unknown }).thrillwright = { game, park, tools, sim, devActions };

render(<App game={game} park={park} tools={tools} sim={sim} dev={devActions} showHelp={!bench} />, uiRoot);
