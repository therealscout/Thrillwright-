import { WAGES } from '../core/costs';
import type { SimStats } from '../sim/sim-core';
import { count, money } from './format';

interface Props {
  handymen: number;
  mechanics: number;
  stats: SimStats['staff'];
  onChange(kind: 'handymen' | 'mechanics', delta: number): void;
  onClose(): void;
}

const ROWS = [
  { kind: 'handymen' as const, label: 'Handymen', one: 'handyman', wage: WAGES.handyman, job: 'Sweep up litter and sick, and empty bins.' },
  { kind: 'mechanics' as const, label: 'Mechanics', one: 'mechanic', wage: WAGES.mechanic, job: 'Fix broken rides and inspect worn ones.' },
];

export function StaffPanel({ handymen, mechanics, stats, onChange, onClose }: Props) {
  const have = { handymen, mechanics };
  const bill = handymen * WAGES.handyman + mechanics * WAGES.mechanic;
  return (
    <aside class="panel staff" aria-label="Staff" data-testid="staff-panel">
      <div class="panel-head">
        <h2>Staff</h2>
        <button type="button" class="close" onClick={onClose} aria-label="Close">×</button>
      </div>
      {ROWS.map((r) => (
        <section key={r.kind} class="staff-row">
          <div class="price-row">
            <span>
              <strong>{r.label}</strong> · {money.format(r.wage)}/min each
            </span>
            <button type="button" onClick={() => onChange(r.kind, -1)} disabled={have[r.kind] === 0} aria-label={`Let a ${r.one} go`}>−</button>
            <strong data-testid={`staff-${r.kind}`}>{have[r.kind]}</strong>
            <button type="button" onClick={() => onChange(r.kind, 1)} aria-label={`Hire a ${r.one}`}>+</button>
          </div>
          <p class="note">{r.job}</p>
        </section>
      ))}
      <dl>
        <dt>Wages</dt><dd>{money.format(bill)} per minute</dd>
        <dt>Tiles swept</dt><dd>{count.format(stats.swept)}</dd>
        <dt>Rides repaired</dt><dd>{count.format(stats.repairs)}</dd>
      </dl>
      <p class="note">New staff start at the park entrance and work wherever paths lead.</p>
    </aside>
  );
}
