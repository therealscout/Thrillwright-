import type { GuestDetails } from '../sim/sim-core';
import { THOUGHT_MOOD, thoughtText } from '../sim/thoughts';
import { money } from './format';
import { guestName } from './guest-names';

const NEEDS: Array<{ key: keyof GuestDetails; label: string; good: 'low' | 'high' }> = [
  { key: 'happiness', label: 'Happiness', good: 'high' },
  { key: 'energy', label: 'Energy', good: 'high' },
  { key: 'hunger', label: 'Hunger', good: 'low' },
  { key: 'thirst', label: 'Thirst', good: 'low' },
  { key: 'toilet', label: 'Bathroom', good: 'low' },
  { key: 'nausea', label: 'Nausea', good: 'low' },
];

interface Props {
  guest: GuestDetails;
  nameOf(id: number): string;
  onClose(): void;
}

function doing(g: GuestDetails, nameOf: (id: number) => string): string {
  const where = g.target ? nameOf(g.target) : '';
  switch (g.state) {
    case 'heading': return `Walking to ${where}`;
    case 'queuing': return `Queuing for ${where}`;
    case 'riding': return `Riding ${where}`;
    case 'leaving': return 'Heading home';
    default: return 'Walking around';
  }
}

export function GuestInfo({ guest: g, nameOf, onClose }: Props) {
  const mood = THOUGHT_MOOD[g.thought];
  return (
    <aside class="panel info" aria-label="Guest details" data-testid="guest-info">
      <div class="panel-head">
        <h2>{guestName(g.id)}</h2>
        <button type="button" class="close" onClick={onClose} aria-label="Close">×</button>
      </div>
      <p class="status-line">{doing(g, nameOf)}</p>
      {g.thought !== 0 && (
        <ul class="thoughts recent">
          <li class={mood === true ? 'good' : mood === false ? 'bad' : ''}>“{thoughtText(g.thought, g.thoughtAbout ? nameOf(g.thoughtAbout) : 'this ride')}”</li>
        </ul>
      )}
      <ul class="bars">
        {NEEDS.map((n) => {
          const value = Math.round(((g[n.key] as number) / 255) * 100);
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
      <dl>
        <dt>Cash</dt><dd>{money.format(g.cash)}</dd>
        <dt>Rides so far</dt><dd>{g.rides}</dd>
        <dt>Likes rides up to</dt><dd>intensity {g.maxIntensity.toFixed(1)}</dd>
        <dt>In the park</dt><dd>{g.minutes} min</dd>
      </dl>
    </aside>
  );
}
