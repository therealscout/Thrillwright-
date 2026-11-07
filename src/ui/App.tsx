import { useEffect, useState } from 'preact/hooks';
import { COSTS } from '../core/costs';
import { BRUSH_SIZES, TOOLS, type ToolController, type ToolState } from '../game/tool-controller';
import type { GameRenderer, RendererStats } from '../render/game-renderer';
import { ToolIcon } from './icons';

const VIEW_NAMES = ['North-east', 'South-east', 'South-west', 'North-west'];

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const TOOL_COST: Partial<Record<ToolState['tool'], string>> = {
  raise: `${money.format(COSTS.landStep)} per corner step`,
  lower: `${money.format(COSTS.landStep)} per corner step`,
  'water-up': `${money.format(COSTS.waterStep)} per tile`,
  'water-down': `${money.format(COSTS.waterStep)} per tile`,
  path: `${money.format(COSTS.path)} per tile`,
  'buy-land': `${money.format(COSTS.landPurchase)} per tile`,
};

export function App({ game, tools }: { game: GameRenderer; tools: ToolController }) {
  const [stats, setStats] = useState<RendererStats | null>(null);
  const [tool, setTool] = useState<ToolState>(tools.state);
  const [toast, setToast] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(true);

  useEffect(() => game.onStats(setStats), [game]);
  useEffect(() => tools.subscribe(setTool), [tools]);

  // Show each feedback message briefly.
  useEffect(() => {
    if (!tool.message) return;
    setToast(tool.message.text);
    const timer = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(timer);
  }, [tool.message?.id]);

  const active = TOOLS.find((t) => t.id === tool.tool);

  return (
    <>
      <header class="topbar">
        <div class="brand">
          <span class="logo" aria-hidden="true" />
          Thrillwright
        </div>
        <div class="cash" data-testid="cash" title="Park cash">{money.format(tool.cash)}</div>
      </header>

      <div class="toolbar camera" role="toolbar" aria-label="Camera">
        <button type="button" onClick={() => game.rotate(-1)} title="Rotate left (Q)">⟲</button>
        <button type="button" onClick={() => game.rotate(1)} title="Rotate right (E)">⟳</button>
        <button type="button" onClick={() => game.zoomBy(1.25)} title="Zoom in (+)">＋</button>
        <button type="button" onClick={() => game.zoomBy(0.8)} title="Zoom out (−)">－</button>
        <button type="button" onClick={() => setShowHelp((v) => !v)} title="Controls">?</button>
      </div>

      <div class="dock">
        {active && active.id !== 'inspect' && (
          <div class="hint" data-testid="hint">
            <strong>{active.label}</strong> · {active.hint}
            {TOOL_COST[active.id] && <span class="cost"> · {TOOL_COST[active.id]}</span>}
          </div>
        )}
        <div class="build-bar" role="toolbar" aria-label="Build tools">
          {TOOLS.map((t) => (
            <button
              type="button"
              key={t.id}
              class={t.id === tool.tool ? 'tool active' : 'tool'}
              aria-pressed={t.id === tool.tool}
              title={`${t.label} (${t.key === 'Escape' ? 'Esc' : t.key})`}
              data-tool={t.id}
              onClick={() => tools.setTool(t.id)}
            >
              <ToolIcon tool={t.id} />
              <span class="tool-label">{t.label}</span>
            </button>
          ))}
          <span class="divider" />
          <div class="brush" role="group" aria-label="Brush size">
            {BRUSH_SIZES.map((size) => (
              <button
                type="button"
                key={size}
                class={size === tool.brushSize ? 'size active' : 'size'}
                aria-pressed={size === tool.brushSize}
                title={`Brush ${size}×${size} ([ and ])`}
                onClick={() => tools.setBrushSize(size)}
              >
                {size}
              </button>
            ))}
          </div>
          <span class="divider" />
          <button type="button" disabled={!tool.canUndo} onClick={() => tools.undo()} title="Undo (Ctrl+Z)">↶</button>
          <button type="button" disabled={!tool.canRedo} onClick={() => tools.redo()} title="Redo (Ctrl+Y)">↷</button>
        </div>
      </div>

      {toast && <div class="toast" role="status">{toast}</div>}

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
            <li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or right-drag: move</li>
            <li>Scroll or <kbd>+</kbd>/<kbd>−</kbd>: zoom · <kbd>Q</kbd>/<kbd>E</kbd>: rotate</li>
            <li><kbd>1</kbd>–<kbd>7</kbd>: build tools · <kbd>Esc</kbd>: look</li>
            <li><kbd>[</kbd>/<kbd>]</kbd>: brush size</li>
            <li><kbd>Ctrl</kbd>+<kbd>Z</kbd>/<kbd>Y</kbd>: undo, redo</li>
          </ul>
          <button type="button" onClick={() => setShowHelp(false)}>Got it</button>
        </aside>
      )}
    </>
  );
}
