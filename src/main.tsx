import { render } from 'preact';
import { Park } from './game/park';
import { createStarterTerrain, starterLayout } from './game/starter-park';
import { ToolController } from './game/tool-controller';
import { GameRenderer } from './render/game-renderer';
import { App } from './ui/App';
import './ui/styles.css';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui') as HTMLElement;

const park = new Park(createStarterTerrain());
const game = new GameRenderer(canvas, park, starterLayout().entrance);
const tools = new ToolController(park, game);

game.onTilePointer((e) => tools.pointer(e.kind, e.tile));
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (tools.key(e.key, e.ctrlKey || e.metaKey, e.shiftKey)) e.preventDefault();
});

// Exposed for automated smoke tests and debugging in the console.
(window as unknown as { thrillwright: unknown }).thrillwright = { game, park, tools };

render(<App game={game} tools={tools} />, uiRoot);
