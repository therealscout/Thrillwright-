import { useEffect, useRef, useState } from 'preact/hooks';
import { COSTS } from '../core/costs';
import type { BuilderState, CoasterEditor } from '../game/coaster-editor';
import type { AudioEngine } from '../audio/audio-engine';
import type { GoalTracker, Outcome } from '../game/goals';
import type { Management } from '../game/management';
import type { Scenario } from '../game/scenarios';
import { WEATHER_NAMES, type Weather, type WeatherKind } from '../game/weather';
import type { Park } from '../game/park';
import { BRUSH_SIZES, TOOLS, type ToolController, type ToolState } from '../game/tool-controller';
import type { GameRenderer, RendererStats } from '../render/game-renderer';
import type { SimClient } from '../sim/sim-client';
import type { SimStats } from '../sim/sim-core';
import { BuildingInfo } from './BuildingInfo';
import { BuildMenu } from './BuildMenu';
import { CoasterBuilder } from './CoasterBuilder';
import { count, money } from './format';
import { ManageIcon, StaffIcon, ToolIcon } from './icons';
import { GoalPanel, OutcomeDialog } from './GoalPanel';
import { ManagePanel } from './ManagePanel';
import { OptionsPanel, type DisplayControl } from './OptionsPanel';
import { ScenarioSelect } from './ScenarioSelect';
import { TutorialCard } from './TutorialCard';
import { ParkPanel } from './ParkPanel';
import { StaffPanel } from './StaffPanel';
import { GuestInfo } from './GuestInfo';
import { buildingType } from '../core/catalog';

const VIEW_NAMES = ['North-east', 'South-east', 'South-west', 'North-west'];
const WEATHER_ICON: Record<WeatherKind, string> = { sunny: '☀', cloudy: '☁', rain: '🌧' };
const FACING = ['north', 'east', 'south', 'west'];

const TOOL_COST: Partial<Record<ToolState['tool'], string>> = {
  raise: `${money.format(COSTS.landStep)} per corner step`,
  lower: `${money.format(COSTS.landStep)} per corner step`,
  'water-up': `${money.format(COSTS.waterStep)} per tile`,
  'water-down': `${money.format(COSTS.waterStep)} per tile`,
  path: `${money.format(COSTS.path)} per tile`,
  'buy-land': `${money.format(COSTS.landPurchase)} per tile`,
  bin: `${money.format(COSTS.bin)} each`,
  bench: `${money.format(COSTS.bench)} each`,
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
  management: Management;
  /** The scenario being played, or null to show the scenario list. */
  scenario: Scenario | null;
  goals: GoalTracker;
  weather: Weather;
  audio: AudioEngine;
  display: DisplayControl;
  onPlay(id: string): void;
  dev: DevActions;
  showHelp?: boolean;
  /** Open the performance panel at start (benchmarks). */
  showPerf?: boolean;
}

export function App({ game, park, tools, coaster, sim, management, scenario, goals, weather, audio, display, onPlay, dev, showHelp: helpAtStart = true, showPerf: perfAtStart = false }: AppProps) {
  const [stats, setStats] = useState<RendererStats | null>(null);
  const [tool, setTool] = useState<ToolState>(tools.state);
  const [simStats, setSimStats] = useState<SimStats>(sim.stats);
  const [toast, setToast] = useState<{ text: string; tone: string } | null>(null);
  const [showHelp, setShowHelp] = useState(helpAtStart);
  const [showPerf, setShowPerf] = useState(perfAtStart);
  const [showBuild, setShowBuild] = useState(false);
  const [showPark, setShowPark] = useState(false);
  const [showStaff, setShowStaff] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [showGoal, setShowGoal] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [sky, setSky] = useState<WeatherKind>(weather.kind);
  const [outcome, setOutcome] = useState<Outcome>('playing');
  const [showMenu, setShowMenu] = useState(scenario === null);
  /** Panels opened at least once, for the tutorial. */
  const opened = useRef(new Set<string>()).current;
  if (showPark) opened.add('park');
  if (showManage) opened.add('manage');
  const [, setManageVersion] = useState(0);
  const [, setStaffVersion] = useState(0);
  const [, setVersion] = useState(park.version);
  const [builder, setBuilder] = useState<BuilderState>(coaster.state);

  useEffect(() => game.onStats(setStats), [game]);
  useEffect(() => tools.subscribe(setTool), [tools]);
  useEffect(() => sim.onStats(setSimStats), [sim]);
  useEffect(() => coaster.subscribe(setBuilder), [coaster]);
  useEffect(() => park.onStaff(() => setStaffVersion((v) => v + 1)), [park]);
  useEffect(() => park.onChange(() => setVersion(park.version)), [park]);
  useEffect(() => management.onChange(() => setManageVersion((v) => v + 1)), [management]);
  useEffect(() => goals.onOutcome(setOutcome), [goals]);
  useEffect(() => weather.onChange(setSky), [weather]);

  // Pause and game speed.
  const [paused, setPausedState] = useState(sim.paused);
  const [speed, setSpeedState] = useState(sim.speed);
  const setPaused = (p: boolean) => {
    sim.setPaused(p);
    setPausedState(p);
  };
  const setSpeed = (n: number) => {
    sim.setSpeed(n);
    setSpeedState(n);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.ctrlKey || e.metaKey) return;
      if (e.key === 'p' || e.key === 'P') {
        const next = !sim.paused;
        sim.setPaused(next);
        setPausedState(next);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sim]);
  // A finished scenario stops the clock until the player decides what next.
  useEffect(() => {
    if (outcome !== 'playing') setPaused(true);
  }, [outcome]);

  // Show each feedback message briefly.
  useEffect(() => {
    if (!tool.message) return;
    setToast({ text: tool.message.text, tone: tool.message.tone });
    const timer = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(timer);
  }, [tool.message?.id]);

  const active = TOOLS.find((t) => t.id === tool.tool);
  const nameOf = (id: number) => {
    const b = park.buildings.find((x) => x.id === id);
    return b ? buildingType(b.type).name : 'a ride';
  };
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
        <div class="date" data-testid="date" title="Date">
          {management.date.day} {management.date.month}, Year {management.date.year}
        </div>
        <div class="speed" role="group" aria-label="Game speed">
          <button
            type="button"
            class={paused ? 'active' : ''}
            aria-pressed={paused}
            title="Pause (P)"
            data-testid="pause"
            onClick={() => setPaused(!paused)}
          >
            {paused ? '▶' : '❚❚'}
          </button>
          {[1, 2, 3].map((n) => (
            <button
              type="button"
              key={n}
              class={!paused && speed === n ? 'active' : ''}
              aria-pressed={!paused && speed === n}
              title={`Speed ${n}×`}
              data-speed={n}
              onClick={() => {
                setPaused(false);
                setSpeed(n);
              }}
            >
              {n}×
            </button>
          ))}
        </div>
        <span class="weather" data-testid="weather" title={`Weather: ${WEATHER_NAMES[sky]}`} aria-label={`Weather: ${WEATHER_NAMES[sky]}`}>
          {sky === 'sunny' && game.night > 0.6 ? '🌙' : WEATHER_ICON[sky]}
        </span>
        {scenario && (
          <button type="button" class="guests goal-chip" data-testid="goal" title="Scenario goal" onClick={() => setShowGoal((v) => !v)}>
            {goals.outcome === 'won' ? '🏆 Goal reached' : goals.lines.length ? `◎ Goal ${goals.lines.filter((l) => l.met).length}/${goals.lines.length}` : '◎ Sandbox'}
          </button>
        )}
        <button type="button" class="guests" data-testid="guests" title="Park and guest details" onClick={() => setShowPark((v) => !v)}>
          {count.format(simStats.guests)} guests
        </button>
        <button type="button" class="guests rating" data-testid="rating" title="Park rating" onClick={() => setShowPark((v) => !v)}>
          ★ {simStats.rating}
        </button>
      </header>

      <div class="toolbar camera" role="toolbar" aria-label="Camera">
        <button type="button" onClick={() => game.rotate(-1)} title="Rotate left (Q)">⟲</button>
        <button type="button" onClick={() => game.rotate(1)} title="Rotate right (E)">⟳</button>
        <button type="button" onClick={() => game.zoomBy(1.25)} title="Zoom in (+)">＋</button>
        <button type="button" onClick={() => game.zoomBy(0.8)} title="Zoom out (−)">－</button>
        <button type="button" onClick={() => setShowPerf((v) => !v)} title="Performance test" aria-pressed={showPerf}>⚡</button>
        <button type="button" onClick={() => setShowOptions((v) => !v)} title="Sound and display options" aria-pressed={showOptions} data-testid="options">
          ⚙
        </button>
        <button type="button" onClick={() => setShowHelp((v) => !v)} title="Controls">?</button>
      </div>

      {scenario?.tutorial && !showMenu && <TutorialCard park={park} sim={sim} game={game} opened={opened} />}

      <div class="side">
        {showGoal && scenario && (
          <GoalPanel
            scenario={scenario}
            goals={goals}
            monthIndex={management.monthIndex}
            onScenarios={() => setShowMenu(true)}
            onClose={() => setShowGoal(false)}
          />
        )}
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
            isUnlocked={(id) => management.isUnlocked(id)}
            onPick={(t) => {
              tools.setBuildType(t.id);
              if (t.custom) setShowBuild(false);
            }}
            onClose={() => setShowBuild(false)}
          />
        )}
        {simStats.guest && (
          <GuestInfo guest={simStats.guest} nameOf={nameOf} onClose={() => sim.inspectAt(null)} />
        )}
        {showPark && (
          <ParkPanel
            stats={simStats}
            nameOf={nameOf}
            onClose={() => setShowPark(false)}
          />
        )}
        {showStaff && (
          <StaffPanel
            handymen={park.staff.handymen}
            mechanics={park.staff.mechanics}
            stats={simStats.staff}
            onChange={(kind, delta) => park.setStaff(kind, delta)}
            onClose={() => setShowStaff(false)}
          />
        )}
        {showOptions && <OptionsPanel audio={audio} display={display} onClose={() => setShowOptions(false)} />}
        {showManage && (
          <ManagePanel management={management} buildings={park.buildings} cash={tool.cash} onClose={() => setShowManage(false)} />
        )}
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
          <button
            type="button"
            class={showStaff ? 'tool active' : 'tool'}
            aria-pressed={showStaff}
            title="Hire staff"
            data-tool="staff"
            onClick={() => setShowStaff((v) => !v)}
          >
            <StaffIcon />
            <span class="tool-label">Staff</span>
          </button>
          <button
            type="button"
            class={showManage ? 'tool active' : 'tool'}
            aria-pressed={showManage}
            title="Finances, marketing and research"
            data-tool="manage"
            onClick={() => setShowManage((v) => !v)}
          >
            <ManageIcon />
            <span class="tool-label">Manage</span>
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

      {scenario && (
        <OutcomeDialog
          outcome={outcome}
          scenario={scenario}
          onKeepPlaying={() => {
            setOutcome('playing');
            setPaused(false);
          }}
          onRetry={() => onPlay(scenario.id)}
          onScenarios={() => {
            setOutcome('playing');
            setShowMenu(true);
          }}
        />
      )}
      {showMenu && <ScenarioSelect onPlay={onPlay} onClose={scenario ? () => setShowMenu(false) : undefined} />}

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
            <li><kbd>1</kbd>–<kbd>7</kbd>: land tools · <kbd>8</kbd>/<kbd>9</kbd>: bin, bench · <kbd>Esc</kbd>: look</li>
            <li>Rides &amp; stalls menu, <kbd>R</kbd>: turn entrance</li>
            <li><kbd>C</kbd>: coaster builder</li>
            <li><kbd>P</kbd>: pause · speed buttons in the top bar</li>
            <li>Look tool: click a ride or a guest for details</li>
            <li><kbd>[</kbd>/<kbd>]</kbd>: brush · <kbd>Ctrl</kbd>+<kbd>Z</kbd>/<kbd>Y</kbd>: undo, redo</li>
          </ul>
          <button type="button" onClick={() => setShowHelp(false)}>Got it</button>
        </aside>
      )}
    </>
  );
}
