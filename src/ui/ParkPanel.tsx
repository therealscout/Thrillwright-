import type { GuestAverages, SimStats } from '../sim/sim-core';
import { count, money } from './format';

const NEEDS: Array<{ key: keyof GuestAverages; label: string; good: 'low' | 'high' }> = [
  { key: 'happiness', label: 'Happiness', good: 'high' },
  { key: 'energy', label: 'Energy', good: 'high' },
  { key: 'hunger', label: 'Hunger', good: 'low' },
  { key: 'thirst', label: 'Thirst', good: 'low' },
  { key: 'toilet', label: 'Bathroom', good: 'low' },
  { key: 'nausea', label: 'Nausea', good: 'low' },
];

export function ParkPanel({ stats, onClose }: { stats: SimStats; onClose(): void }) {
  const a = stats.averages;
  return (
    <aside class="panel park" aria-label="Guests" data-testid="park-panel">
      <div class="panel-head">
        <h2>Guests</h2>
        <button type="button" class="close" onClick={onClose} aria-label="Close">×</button>
      </div>
      <dl>
        <dt>In the park</dt><dd>{count.format(stats.guests)}</dd>
        <dt>Visited so far</dt><dd>{count.format(stats.arrived)}</dd>
        <dt>Average cash</dt><dd>{money.format(a.cash)}</dd>
      </dl>
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
