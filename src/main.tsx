import { render } from 'preact';
import { createTerrain, Surface, tileIndex } from './core/terrain';
import { GameRenderer } from './render/game-renderer';
import { App } from './ui/App';
import './ui/styles.css';

const MAP_SIZE = 96;

function createStarterTerrain() {
  const terrain = createTerrain(MAP_SIZE, MAP_SIZE);
  // A short path from the entrance gate into the park.
  const cx = MAP_SIZE / 2;
  for (let ty = MAP_SIZE - 3; ty >= MAP_SIZE - 20; ty--) {
    terrain.surfaces[tileIndex(terrain, cx - 1, ty)] = Surface.Path;
    terrain.surfaces[tileIndex(terrain, cx, ty)] = Surface.Path;
  }
  return terrain;
}

const canvas = document.getElementById('game') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui') as HTMLElement;
const game = new GameRenderer(canvas, createStarterTerrain());

// Exposed for automated smoke tests and debugging in the console.
(window as unknown as { thrillwright: unknown }).thrillwright = { game };

render(<App game={game} />, uiRoot);
