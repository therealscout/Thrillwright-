import { Fragment } from 'preact';
import type { RatingParts } from '../sim/rating';
import type { GuestAverages, SimStats } from '../sim/sim-core';
import { THOUGHT_MOOD, thoughtText } from '../sim/thoughts';
import { count, money } from './format';

const NEEDS: Array<{ key: keyof GuestAverages; label: string; good: 'low' | 'high' }> = [
  { key: 'happiness', label: 'Happiness', good: 'high' },
  { key: 'energy', label: 'Energy', good: 'high' },
  { key: 'hunger', label: 'Hunger', good: 'low' },
  { key: 'thirst', label: 'Thirst', good: 'low' },
  { key: 'toilet', label: 'Bathroom', good: 'low' },
  { key: 'nausea', label: 'Nausea', good: 'low' },
];

const PARTS: Array<{ key: keyof RatingParts; label: string }> = [
  { key: 'happiness', label: 'Guest happiness' },
  { key: 'rides', label: 'Rides and variety' },
  { key: 'cleanliness', label: 'Clean paths' },
  { key: 'breakdowns', label: 'Breakdowns' },
  { key: 'departures', label: 'Unhappy guests leaving' },
];

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

interface Props {
  stats: SimStats;
  /** Name of a ride or stall by id. */
  nameOf(id: number): string;
  onClose(): void;
}

export function ParkPanel({ stats, nameOf, onClose }: Props) {
  const a = stats.averages;
  const mood = (m: boolean | null | undefined) => (m === true ? 'good' : m === false ? 'bad' : '');
  return (
    <aside class="panel park" aria-label="Park" data-testid="park-panel">
      <div class="panel-head">
        <h2>Park</h2>
        <button type="button" class="close" onClick={onClose} aria-label="Close">×</button>
      </div>
      <div class="rating-big">
        <strong data-testid="park-rating">{stats.rating}</strong>
        <span>park rating out of 100. Higher ratings bring more guests.</span>
      </div>
      <dl class="rating-parts">
        {PARTS.map((p) => (
          <Fragment key={p.key}>
            <dt>{p.label}</dt>
            <dd class={stats.ratingParts[p.key] < 0 ? 'bad' : ''}>{signed(stats.ratingParts[p.key])}</dd>
          </Fragment>
        ))}
      </dl>
      <dl>
        <dt>Guests in the park</dt><dd>{count.format(stats.guests)}</dd>
        <dt>Visited so far</dt><dd>{count.format(stats.arrived)}</dd>
        <dt>Average cash</dt><dd>{money.format(a.cash)}</dd>
      </dl>
      <h3>What guests are thinking</h3>
      {stats.thoughts.top.length === 0 && <p class="note">Nothing much yet.</p>}
      <ul class="thoughts" data-testid="thoughts">
        {stats.thoughts.top.map((t) => (
          <li key={t.thought} class={mood(THOUGHT_MOOD[t.thought])}>
            <span>{thoughtText(t.thought, 'a ride')}</span>
            <span class="count">{count.format(t.count)}</span>
          </li>
        ))}
      </ul>
      {stats.thoughts.recent.length > 0 && (
        <>
          <h3>Overheard</h3>
          <ul class="thoughts recent">
            {stats.thoughts.recent.slice(0, 6).map((t) => (
              <li key={`${t.guest}-${t.tick}`} class={mood(THOUGHT_MOOD[t.thought])}>
                “{thoughtText(t.thought, t.about ? nameOf(t.about) : 'this ride')}”
              </li>
            ))}
          </ul>
        </>
      )}
      <h3>Average needs</h3>
      <ul class="bars">
        {NEEDS.map((n) => {
          const value = Math.round(((a[n.key] as number) / 255) * 100);
          const bad = n.good === 'high' ? value < 35 : value > 65;
          return (
            <li key={n.key}>
              <span>{n.label}</span>
              <span class="bar" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={n.label}>
                <span class={bad ? 'fill bad' : 'fill'} style={{ width: `${value}%` }} />
              </span>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
