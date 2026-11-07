import { useEffect, useState } from 'preact/hooks';
import type { GameRenderer, RendererStats } from '../render/game-renderer';

const VIEW_NAMES = ['North-east', 'South-east', 'South-west', 'North-west'];

export function App({ game }: { game: GameRenderer }) {
  const [stats, setStats] = useState<RendererStats | null>(null);
  const [showHelp, setShowHelp] = useState(true);

  useEffect(() => game.onStats(setStats), [game]);

  return (
    <>
      <header class="topbar">
        <div class="brand">
          <span class="logo" aria-hidden="true" />
          Thrillwright
        </div>
        <div class="tag">Milestone 1 preview</div>
      </header>

      <div class="toolbar" role="toolbar" aria-label="Camera">
        <button type="button" onClick={() => game.rotate(-1)} title="Rotate left (Q)">⟲</button>
        <button type="button" onClick={() => game.rotate(1)} title="Rotate right (E)">⟳</button>
        <button type="button" onClick={() => game.zoomBy(1.25)} title="Zoom in (+)">＋</button>
        <button type="button" onClick={() => game.zoomBy(0.8)} title="Zoom out (−)">－</button>
        <button type="button" onClick={() => setShowHelp((v) => !v)} title="Controls">?</button>
      </div>

      <div class="status" data-testid="status">
        <span data-testid="fps">{stats ? `${stats.fps} fps` : '… fps'}</span>
        <span>View: {VIEW_NAMES[stats?.rotation ?? 0]}</span>
        <span>Zoom: {(stats?.zoom ?? 1).toFixed(2)}×</span>
        <span>Tile: {stats?.hoveredTile ? `${stats.hoveredTile.tx}, ${stats.hoveredTile.ty}` : '—'}</span>
      </div>

      {showHelp && (
        <aside class="help" aria-label="Controls">
          <h2>Controls</h2>
          <ul>
            <li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or arrows: move</li>
            <li>Right-drag: pan</li>
            <li>Scroll or <kbd>+</kbd>/<kbd>−</kbd>: zoom</li>
            <li><kbd>Q</kbd>/<kbd>E</kbd>: rotate view</li>
          </ul>
          <button type="button" onClick={() => setShowHelp(false)}>Got it</button>
        </aside>
      )}
    </>
  );
}
