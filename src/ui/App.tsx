import { useEffect, useState } from 'preact/hooks';
import { COSTS } from '../core/costs';
import type { BuilderState, CoasterEditor } from '../game/coaster-editor';
import type { Park } from '../game/park';
import { BRUSH_SIZES, TOOLS, type ToolController, type ToolState } from '../game/tool-controller';
import type { GameRenderer, RendererStats } from '../render/game-renderer';
import type { SimClient } from '../sim/sim-client';
import type { SimStats } from '../sim/sim-core';
import { BuildingInfo } from './BuildingInfo';
import { BuildMenu } from './BuildMenu';
import { CoasterBuilder } from './CoasterBuilder';
import { count, money } from './format';
import { ToolIcon } from './icons';
import { ParkPanel } from './ParkPanel';

const VIEW_NAMES = ['North-east', 'South-east', 'South-west', 'North-west'];
const FACING = ['north', 'east', 'south', 'west'];

const TOOL_COST: Partial<Record<ToolState['tool'], string>> = {
  raise: `${money.format(COSTS.landStep)} per corner step`,
  lower: `${money.format(COSTS.landStep)} per corner step`,
  'water-up': `${money.format(COSTS.waterStep)} per tile`,
  'water-down': `${money.format(COSTS.waterStep)} per tile`,
  path: `${money.format(COSTS.path)} per tile`,
  'buy-land': `${money.format(COSTS.landPurchase)} per tile`,
};

export interface DevActions {
  layTestPaths(): void;
  addGuests(n: number): void;
  fillTo(n: number): void;
}

interface AppProps {
  game: GameRenderer;
  park: Park;
  tools: ToolController;
  coaster: CoasterEditor;
  sim: SimClient;
  dev: DevActions;
  showHelp?: boolean;
}

export function App({ game, park, tools, coaster, sim, dev, showHelp: helpAtStart = true }: AppProps) {
  const [stats, setStats] = useState<RendererStats | null>(null);
  const [tool, setTool] = useState<ToolState>(tools.state);
  const [simStats, setSimStats] = useState<SimStats>(sim.stats);
  const [toast, setToast] = useState<{ text: string; tone: string } | null>(null);
  const [showHelp, setShowHelp] = useState(helpAtStart);
  const [showPerf, setShowPerf] = useState(!helpAtStart);
  const [showBuild, setShowBuild] = useState(false);
  const [showPark, setShowPark] = useState(false);
  const [, setVersion] = useState(park.version);
  const [builder, setBuilder] = useState<BuilderState>(coaster.state);

  useEffect(() => game.onStats(setStats), [game]);
  useEffect(() => tools.subscribe(setTool), [tools]);
  useEffect(() => sim.onStats(setSimStats), [sim]);
  useEffect(() => coaster.subscribe(setBuilder), [coaster]);
  useEffect(() => park.onChange(() => setVersion(park.version)), [park]);

  // Show each feedback message briefly.
  useEffect(() => {
    if (!tool.message) return;
    setToast({ text: tool.message.text, tone: tool.message.tone });
    const timer = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(timer);
  }, [tool.message?.id]);

  const active = TOOLS.find((t) => t.id === tool.tool);
  const selected = tool.selected !== null ? park.buildings.find((b) => b.id === tool.selected) : undefined;
  const buildName = tool.buildType ? (document.querySelector(`[data-build="${tool.buildType}"] .item-name`)?.textContent ?? '') : '';

  return (
    <>
      <header class="topbar">
        <div class="brand">
          <span class="logo" aria-hidden="true" />
          Thrillwright
        </div>
        <div class="cash" data-testid="cash" title="Park cash">{money.format(tool.cash)}</div>
        <button type="button" class="guests" data-testid="guests" title="Guest details" onClick={() => setShowPark((v) => !v)}>
          {count.format(simStats.guests)} guests
        </button>
      </header>

      <div class="toolbar camera" role="toolbar" aria-label="Camera">
        <button type="button" onClick={() => game.rotate(-1)} title="Rotate left (Q)">⟲</button>
        <button type="button" onClick={() => game.rotate(1)} title="Rotate right (E)">⟳</button>
        <button type="button" onClick={() => game.zoomBy(1.25)} title="Zoom in (+)">＋</button>
        <button type="button" onClick={() => game.zoomBy(0.8)} title="Zoom out (−)">－</button>
        <button type="button" onClick={() => setShowPerf((v) => !v)} title="Performance test" aria-pressed={showPerf}>⚡</button>
        <button type="button" onClick={() => setShowHelp((v) => !v)} title="Controls">?</button>
      </div>

      <div class="side">
        {builder.phase !== 'idle' && (
          <CoasterBuilder
            editor={coaster}
            state={builder}
            onPlaceStation={() => tools.startCoaster()}
            onMessage={(text, tone) => tools.notify(text, tone)}
          />
        )}
        {selected && (
          <BuildingInfo
            building={selected}
            stats={simStats.buildings.find((b) => b.id === selected.id)}
            onPrice={(v) => park.setPrice(selected.id, v)}
            onToggleOpen={() => park.setOpen(selected.id, !selected.open)}
            onDemolish={() => park.demolish(selected.id)}
            onClose={() => tools.select(null)}
          />
        )}
        {showBuild && (
          <BuildMenu
            cash={tool.cash}
            current={tool.buildType}
            onPick={(t) => {
              tools.setBuildType(t.id);
              if (t.custom) setShowBuild(false);
            }}
            onClose={() => setShowBuild(false)}
          />
        )}
        {showPark && <ParkPanel stats={simStats} onClose={() => setShowPark(false)} />}
        {showPerf && (
          <aside class="panel perf" aria-label="Performance test" data-testid="perf">
            <div class="panel-head">
              <h2>Performance test</h2>
              <button type="button" class="close" onClick={() => setShowPerf(false)} aria-label="Close">×</button>
            </div>
            <dl>
              <dt>Guests</dt><dd data-testid="perf-guests">{count.format(simStats.guests)}</dd>
              <dt>Frame rate</dt><dd>{stats ? `${stats.fps} fps` : '…'}</dd>
              <dt>Simulation</dt><dd data-testid="perf-tick">{simStats.tickMs.toFixed(2)} ms per tick</dd>
              <dt>Arrived / left</dt><dd>{count.format(simStats.arrived)} / {count.format(simStats.left)}</dd>
            </dl>
            <div class="row">
              <button type="button" onClick={() => dev.layTestPaths()} title="Free; undo with Ctrl+Z">Lay test paths</button>
            </div>
            <div class="row">
              <button type="button" onClick={() => dev.addGuests(1000)}>+1,000 guests</button>
              <button type="button" onClick={() => dev.fillTo(10_000)}>Fill to 10,000</button>
            </div>
            <p class="note">Guests only walk on paths. Lay test paths first for a big crowd.</p>
          </aside>
        )}
      </div>

      <div class="dock">
        {active && active.id !== 'inspect' && (
          <div class="hint" data-testid="hint">
            <strong>{active.id === 'build' ? buildName || 'Build' : active.label}</strong> ·{' '}
            {active.id === 'coaster' && builder.phase === 'track' ? 'Lay track with the pieces in the builder panel' : active.hint}
            {active.id === 'build' && <span class="cost"> · entrance faces {FACING[tool.facing]}</span>}
            {TOOL_COST[active.id] && <span class="cost"> · {TOOL_COST[active.id]}</span>}
          </div>
        )}
        <div class="build-bar" role="toolbar" aria-label="Build tools">
          {TOOLS.filter((t) => t.id !== 'build').map((t) => (
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
          <button
            type="button"
            class={tool.tool === 'build' || showBuild ? 'tool active' : 'tool'}
            aria-pressed={showBuild}
            title="Rides and stalls (B)"
            data-tool="build"
            onClick={() => setShowBuild((v) => !v)}
          >
            <ToolIcon tool="build" />
            <span class="tool-label">Rides &amp; stalls</span>
          </button>
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

      {toast && <div class={`toast ${toast.tone}`} role="status">{toast.text}</div>}

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
            <li><kbd>1</kbd>–<kbd>7</kbd>: land tools · <kbd>Esc</kbd>: look</li>
            <li>Rides &amp; stalls menu, <kbd>R</kbd>: turn entrance</li>
            <li><kbd>C</kbd>: coaster builder</li>
            <li>Look tool: click a ride for details</li>
            <li><kbd>[</kbd>/<kbd>]</kbd>: brush · <kbd>Ctrl</kbd>+<kbd>Z</kbd>/<kbd>Y</kbd>: undo, redo</li>
          </ul>
          <button type="button" onClick={() => setShowHelp(false)}>Got it</button>
        </aside>
      )}
    </>
  );
}
