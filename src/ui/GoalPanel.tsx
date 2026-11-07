import { deadlineText, type GoalTracker, type Outcome } from '../game/goals';
import type { Scenario } from '../game/scenarios';

interface PanelProps {
  scenario: Scenario;
  goals: GoalTracker;
  monthIndex: number;
  onScenarios(): void;
  onClose(): void;
}

export function GoalPanel({ scenario, goals, monthIndex, onScenarios, onClose }: PanelProps) {
  const left = goals.monthsLeft(monthIndex);
  const by = deadlineText(scenario.goal);
  return (
    <aside class="panel goal" aria-label="Scenario goal" data-testid="goal-panel">
      <div class="panel-head">
        <h2>{scenario.name}</h2>
        <button type="button" class="close" onClick={onClose} aria-label="Close">×</button>
      </div>
      {goals.lines.length === 0 ? (
        <p class="note">No goal in the sandbox. Build whatever you like.</p>
      ) : (
        <>
          <ul class="goal-list checks-done">
            {goals.lines.map((l) => (
              <li key={l.id} class={l.met ? 'met' : ''} data-goal={l.id}>
                <span aria-hidden="true">{l.met ? '✓' : '○'}</span>
                <span>{l.label}</span>
                <span class="note">{l.progress}</span>
              </li>
            ))}
          </ul>
          {by && (
            <p class="note">
              Deadline: {by}
              {left !== null && goals.outcome === 'playing' ? ` (${left === 0 ? 'this month' : left === 1 ? '1 month left' : `${left} months left`})` : ''}.
            </p>
          )}
          {goals.outcome === 'won' && <p class="status-line">Goal reached. The next park is unlocked.</p>}
          {goals.outcome === 'lost' && <p class="status-line broken">Time ran out on this goal.</p>}
        </>
      )}
      <div class="row">
        <button type="button" onClick={onScenarios} data-testid="to-scenarios">Choose a scenario</button>
      </div>
    </aside>
  );
}

interface OutcomeProps {
  outcome: Outcome;
  scenario: Scenario;
  onKeepPlaying(): void;
  onRetry(): void;
  onScenarios(): void;
}

/** The win or lose message. */
export function OutcomeDialog({ outcome, scenario, onKeepPlaying, onRetry, onScenarios }: OutcomeProps) {
  if (outcome === 'playing') return null;
  const won = outcome === 'won';
  return (
    <div class="menu-backdrop light" data-testid="outcome">
      <div class={won ? 'outcome won' : 'outcome lost'} role="alertdialog" aria-modal="true" aria-labelledby="outcome-title">
        <h2 id="outcome-title">{won ? 'Scenario complete!' : 'Out of time'}</h2>
        <p>
          {won
            ? `${scenario.name} is a success. Guests will be talking about it for years. The next park is now open.`
            : `${scenario.name} didn't reach its goal in time. You can keep building here for fun, or try again.`}
        </p>
        <div class="row">
          <button type="button" class="primary" onClick={won ? onScenarios : onRetry}>{won ? 'Next scenario' : 'Try again'}</button>
          <button type="button" onClick={onKeepPlaying}>Keep playing</button>
        </div>
      </div>
    </div>
  );
}
