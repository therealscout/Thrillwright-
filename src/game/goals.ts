/**
 * Checking a scenario's goal: what each part of it needs, how close the park
 * is, and whether it has been won or the time has run out.
 */
import { MONTH_NAMES } from './management';
import type { ScenarioGoal } from './scenarios';

/** What the goal is judged on, gathered from the park, sim and accounts. */
export interface GoalState {
  guests: number;
  rating: number;
  /** Excitement of the best open coaster, or 0. */
  bestCoaster: number;
  /** Best profit of any finished month. */
  bestMonthProfit: number;
  loan: number;
  /** Months since the park opened. */
  monthIndex: number;
}

export interface GoalLine {
  id: string;
  label: string;
  progress: string;
  met: boolean;
}

export type Outcome = 'playing' | 'won' | 'lost';

const fmt = new Intl.NumberFormat('en-US');
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export function goalLines(goal: ScenarioGoal, s: GoalState): GoalLine[] {
  const out: GoalLine[] = [];
  if (goal.guests !== undefined) {
    out.push({ id: 'guests', label: `${fmt.format(goal.guests)} guests in the park`, progress: `${fmt.format(s.guests)} now`, met: s.guests >= goal.guests });
  }
  if (goal.rating !== undefined) {
    out.push({ id: 'rating', label: `Park rating of ${goal.rating} or more`, progress: `${s.rating} now`, met: s.rating >= goal.rating });
  }
  if (goal.coasterExcitement !== undefined) {
    out.push({
      id: 'coaster',
      label: `An open coaster with excitement ${goal.coasterExcitement.toFixed(1)} or more`,
      progress: s.bestCoaster > 0 ? `best ${s.bestCoaster.toFixed(1)}` : 'none yet',
      met: s.bestCoaster >= goal.coasterExcitement,
    });
  }
  if (goal.monthlyProfit !== undefined) {
    out.push({
      id: 'profit',
      label: `A month with ${usd.format(goal.monthlyProfit)} profit`,
      progress: `best ${usd.format(Math.round(s.bestMonthProfit))}`,
      met: s.bestMonthProfit >= goal.monthlyProfit,
    });
  }
  if (goal.noLoan) {
    out.push({ id: 'loan', label: 'Loan paid off', progress: s.loan > 0 ? `${usd.format(s.loan)} owed` : 'paid', met: s.loan <= 0 });
  }
  return out;
}

/** The first month index past the deadline (November of the goal's year), or null. */
export function deadlineMonth(goal: ScenarioGoal, startMonth: number): number | null {
  if (goal.year === undefined) return null;
  return (goal.year - 1) * 12 + 10 - startMonth;
}

/** "End of October, Year 2". */
export function deadlineText(goal: ScenarioGoal): string | null {
  return goal.year === undefined ? null : `End of ${MONTH_NAMES[9]}, Year ${goal.year}`;
}

export function hasGoal(goal: ScenarioGoal): boolean {
  return goalLines(goal, { guests: 0, rating: 0, bestCoaster: 0, bestMonthProfit: 0, loan: 0, monthIndex: 0 }).length > 0;
}

/** Follows a goal until it is won or lost; after that the result stays. */
export class GoalTracker {
  outcome: Outcome = 'playing';
  lines: GoalLine[] = [];
  private readonly listeners = new Set<(o: Outcome) => void>();

  constructor(readonly goal: ScenarioGoal, private readonly startMonth: number) {}

  onOutcome(listener: (o: Outcome) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  check(s: GoalState): Outcome {
    this.lines = goalLines(this.goal, s);
    if (this.outcome !== 'playing' || this.lines.length === 0) return this.outcome;
    const end = deadlineMonth(this.goal, this.startMonth);
    if (this.lines.every((l) => l.met)) this.finish('won');
    else if (end !== null && s.monthIndex >= end) this.finish('lost');
    return this.outcome;
  }

  /** Months left before the deadline, or null with no deadline. */
  monthsLeft(monthIndex: number): number | null {
    const end = deadlineMonth(this.goal, this.startMonth);
    return end === null ? null : Math.max(0, end - monthIndex);
  }

  private finish(o: Outcome): void {
    this.outcome = o;
    for (const l of this.listeners) l(o);
  }
}
