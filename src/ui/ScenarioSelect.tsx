import { useEffect, useState } from 'preact/hooks';
import { deadlineText, goalLines } from '../game/goals';
import { latestSave, readSave } from '../game/save';
import { SCENARIOS, isScenarioOpen, loadCompleted, scenarioById, type Scenario } from '../game/scenarios';
import { money } from './format';

interface Props {
  onPlay(id: string, resume?: boolean): void;
  /** Go back to the park being played (left out on first load). */
  onClose?(): void;
}

/** The goal as plain sentences, for the scenario list. */
function goalSummary(s: Scenario): string[] {
  const lines = goalLines(s.goal, { guests: 0, rating: 0, bestCoaster: 0, bestMonthProfit: 0, loan: 1, monthIndex: 0 }).map((l) => l.label);
  const by = deadlineText(s.goal);
  if (by) lines.push(`By the e${by.slice(1)}`);
  return lines.length ? lines : ['No goal: build freely'];
}

/** Full-screen list of scenarios to choose from. */
export function ScenarioSelect({ onPlay, onClose }: Props) {
  const [completed] = useState(loadCompleted);
  const [picked, setPicked] = useState<string>(() => {
    // Suggest the first open scenario that isn't finished yet.
    const next = SCENARIOS.find((s) => s.difficulty !== 'Sandbox' && isScenarioOpen(s, completed) && !completed.has(s.id));
    return (next ?? SCENARIOS[0])!.id;
  });
  const current = scenarioById(picked) as Scenario;
  const [last] = useState(latestSave);
  const saved = readSave(current.id);
  // Start keyboard players on the main button.
  useEffect(() => {
    (document.querySelector('[data-testid="continue"], [data-testid="resume"], [data-testid="play"]') as HTMLElement | null)?.focus();
  }, []);
  const open = isScenarioOpen(current, completed);
  return (
    <div class="menu-backdrop" data-testid="scenario-select">
      <div class="menu" role="dialog" aria-modal="true" aria-labelledby="menu-title">
        <header class="menu-head">
          <span class="logo big" aria-hidden="true" />
          <div>
            <h1 id="menu-title">Thrillwright</h1>
            <p>Build a park, design coasters, keep the crowds happy.</p>
          </div>
          {onClose && <button type="button" class="close" onClick={onClose} aria-label="Back to the park">×</button>}
        </header>
        {last && scenarioById(last.scenario) && (
          <div class="continue-row">
            <button type="button" class="primary" data-testid="continue" onClick={() => onPlay(last.scenario, true)}>
              Continue
            </button>
            <span>
              {scenarioById(last.scenario)?.name} · {last.dateText}
            </span>
          </div>
        )}
        <div class="menu-body">
          <ul class="scenario-list" role="listbox" aria-label="Scenarios">
            {SCENARIOS.map((s) => {
              const unlocked = isScenarioOpen(s, completed);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={s.id === picked}
                    class={s.id === picked ? 'scenario active' : 'scenario'}
                    data-scenario={s.id}
                    onClick={() => setPicked(s.id)}
                  >
                    <span class="scenario-name">
                      {!unlocked && <span aria-label="Locked">🔒 </span>}
                      {completed.has(s.id) && <span class="done" aria-label="Completed">✓ </span>}
                      {s.name}
                    </span>
                    <span class={`badge badge-${s.difficulty.toLowerCase()}`}>{s.difficulty}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <section class="scenario-detail" aria-live="polite">
            <h2>{current.name}</h2>
            <p>{current.blurb}</p>
            <h3>Goal</h3>
            <ul class="goal-list">
              {goalSummary(current).map((g) => <li key={g}>{g}</li>)}
            </ul>
            <h3>Start with</h3>
            <p class="note">
              {money.format(current.cash)} cash
              {current.management.loan ? `, a ${money.format(current.management.loan)} loan` : ''}
              {current.management.researched === 'all' ? ', every ride researched' : ''}.
            </p>
            {open ? (
              <div class="play-row">
                {saved && (
                  <button type="button" class="primary" data-testid="resume" onClick={() => onPlay(current.id, true)}>
                    Continue ({saved.dateText})
                  </button>
                )}
                <button type="button" class={saved ? '' : 'primary'} data-testid="play" onClick={() => onPlay(current.id)}>
                  {saved ? 'Start over' : current.tutorial ? 'Start tutorial' : 'Play'}
                </button>
                {saved && <p class="note">Starting over replaces your saved game for this park when it next saves.</p>}
              </div>
            ) : (
              <p class="note warn">Finish {scenarioById(current.after)?.name} to unlock this park.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
