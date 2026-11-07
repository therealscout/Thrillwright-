import { useState } from 'preact/hooks';
import type { Building } from '../core/buildings';
import { buildingType } from '../core/catalog';
import { CATEGORY_NAMES, FUNDING, RESEARCH, type ResearchCategory } from '../core/research';
import {
  CAMPAIGNS,
  INTEREST_RATE,
  LEDGER_NAMES,
  LEDGERS,
  LOAN_STEP,
  MAX_ENTRY_FEE,
  MONTH_NAMES,
  type Management,
  type MonthAccount,
} from '../game/management';
import { money, price } from './format';
import { plural } from './BuildingInfo';

type Tab = 'finances' | 'prices' | 'marketing' | 'research';

interface Props {
  management: Management;
  buildings: readonly Building[];
  cash: number;
  /** Set the price of every building of a type at once. */
  onPriceType(type: string, price: number): void;
  onClose(): void;
}

const signed = (v: number) => (v > 0 ? '+' : '') + money.format(Math.round(v));

function profit(m: MonthAccount): number {
  let sum = 0;
  for (const l of LEDGERS) sum += m.amounts[l];
  return sum;
}

export function ManagePanel({ management: m, buildings, cash, onPriceType, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('finances');
  return (
    <aside class="panel manage" aria-label="Manage park" data-testid="manage-panel">
      <div class="panel-head">
        <h2>Manage park</h2>
        <button type="button" class="close" onClick={onClose} aria-label="Close">×</button>
      </div>
      <div class="tabs" role="tablist">
        {(['finances', 'prices', 'marketing', 'research'] as const).map((t) => (
          <button
            type="button"
            key={t}
            role="tab"
            aria-selected={tab === t}
            class={tab === t ? 'tab active' : 'tab'}
            data-tab={t}
            onClick={() => setTab(t)}
          >
            {t[0]?.toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      {tab === 'finances' && <Finances m={m} buildings={buildings} cash={cash} />}
      {tab === 'prices' && <Prices buildings={buildings} onPriceType={onPriceType} />}
      {tab === 'marketing' && <Marketing m={m} />}
      {tab === 'research' && <Research m={m} />}
    </aside>
  );
}

/** One row per kind of stall or ride in the park, priced all together. */
function Prices({ buildings, onPriceType }: { buildings: readonly Building[]; onPriceType(type: string, price: number): void }) {
  const groups = new Map<string, number[]>();
  for (const b of buildings) {
    const t = buildingType(b.type);
    if (t.custom || t.kind === 'toilet') continue;
    groups.set(b.type, [...(groups.get(b.type) ?? []), b.price]);
  }
  const rows = [...groups.entries()].map(([id, prices]) => {
    const t = buildingType(id);
    const lo = Math.min(...prices);
    const hi = Math.max(...prices);
    // Step from the price most of them charge.
    const tally = new Map<number, number>();
    for (const p of prices) tally.set(p, (tally.get(p) ?? 0) + 1);
    const usual = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? lo;
    return { id, t, count: prices.length, lo, hi, usual };
  });
  const section = (title: string, list: typeof rows) =>
    list.length > 0 && (
      <>
        <h3>{title}</h3>
        {list.map((r) => (
          <div class="price-row" key={r.id} data-testid={`price-type-${r.id}`}>
            <span>
              {r.count > 1 ? `${r.count} ${plural(r.t.name)}` : r.t.name}
              {r.lo !== r.hi && <small> ({price.format(r.lo)}–{price.format(r.hi)})</small>}
            </span>
            <button type="button" onClick={() => onPriceType(r.id, r.usual - 0.5)} aria-label={`Lower the price at every ${r.t.name}`}>−</button>
            <strong>{price.format(r.usual)}</strong>
            <button type="button" onClick={() => onPriceType(r.id, r.usual + 0.5)} aria-label={`Raise the price at every ${r.t.name}`}>+</button>
          </div>
        ))}
      </>
    );
  const stalls = rows.filter((r) => r.t.kind !== 'ride');
  const rides = rows.filter((r) => r.t.kind === 'ride');
  return (
    <>
      <p class="note">Each change applies to every one of that kind in the park. Coasters keep their own ticket prices.</p>
      {rows.length === 0 && <p class="note">Build some stalls or rides first.</p>}
      {section('Food and drink', stalls)}
      {section('Rides', rides)}
    </>
  );
}

function Finances({ m, buildings, cash }: { m: Management; buildings: readonly Building[]; cash: number }) {
  const [asTable, setAsTable] = useState(false);
  const now = m.months[m.months.length - 1] as MonthAccount;
  const last = m.months.length > 1 ? (m.months[m.months.length - 2] as MonthAccount) : null;
  const value = m.parkValue(buildings);
  const interest = Math.round((m.loan * INTEREST_RATE) / 12);
  return (
    <>
      <h3>Loan</h3>
      <div class="price-row">
        <span>
          Owed <strong data-testid="loan">{money.format(m.loan)}</strong> of {money.format(m.maxLoan)}
        </span>
        <button type="button" onClick={() => m.repay()} disabled={m.loan === 0 || cash < Math.min(LOAN_STEP, m.loan)} data-testid="repay">
          Repay
        </button>
        <button type="button" onClick={() => m.borrow()} disabled={m.loan >= m.maxLoan} data-testid="borrow">
          Borrow
        </button>
      </div>
      <p class="note">8% a year: about {money.format(interest)} interest a month. Borrow and repay in steps of {money.format(LOAN_STEP)}.</p>

      <h3>Park entry</h3>
      <div class="price-row">
        <span>Entry fee</span>
        <button type="button" onClick={() => m.setEntryFee(m.entryFee - 1)} disabled={m.entryFee <= 0} aria-label="Lower entry fee">−</button>
        <strong data-testid="entry-fee">{money.format(m.entryFee)}</strong>
        <button type="button" onClick={() => m.setEntryFee(m.entryFee + 1)} disabled={m.entryFee >= MAX_ENTRY_FEE} aria-label="Raise entry fee">+</button>
      </div>
      <p class={m.entryFee > value ? 'note warn' : 'note'}>
        Guests think the park is worth about {money.format(Math.floor(value))} to get in.
        {m.entryFee > value ? ' Fewer will come at this price.' : ' More rides make it worth more.'}
      </p>

      <h3>
        Profit by month
        <button type="button" class="link" onClick={() => setAsTable((v) => !v)} data-testid="chart-toggle">
          {asTable ? 'Show chart' : 'Show table'}
        </button>
      </h3>
      {asTable ? <ProfitTable m={m} /> : <ProfitChart m={m} />}

      <h3>Accounts</h3>
      <table class="accounts" data-testid="accounts">
        <thead>
          <tr><th /><th>This month</th><th>Last month</th></tr>
        </thead>
        <tbody>
          {LEDGERS.map((l) => (
            <tr key={l}>
              <th scope="row">{LEDGER_NAMES[l]}</th>
              <td class={now.amounts[l] < 0 ? 'bad' : ''}>{now.amounts[l] ? signed(now.amounts[l]) : '—'}</td>
              <td class={last && last.amounts[l] < 0 ? 'bad' : ''}>{last && last.amounts[l] ? signed(last.amounts[l]) : '—'}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Profit</th>
            <td class={profit(now) < 0 ? 'bad' : 'good'} data-testid="profit-now">{signed(profit(now))}</td>
            <td class={last && profit(last) < 0 ? 'bad' : 'good'}>{last ? signed(profit(last)) : '—'}</td>
          </tr>
        </tfoot>
      </table>
    </>
  );
}

/** A month's name from its index, for chart labels. */
function monthLabel(m: Management, index: number): string {
  const current = MONTH_NAMES.indexOf(m.date.month);
  const offset = index - m.monthIndex;
  return (MONTH_NAMES[(((current + offset) % 12) + 12) % 12] as string).slice(0, 3);
}

const CHART_W = 280;
const CHART_H = 110;

/** Monthly profit as bars from a zero line: green above, pink below. */
function ProfitChart({ m }: { m: Management }) {
  const [hover, setHover] = useState<number | null>(null);
  const months = m.months.slice(-12);
  const values = months.map(profit);
  const top = Math.max(100, ...values);
  const bottom = Math.min(0, ...values);
  const span = top - bottom;
  const zero = 8 + ((top - 0) / span) * (CHART_H - 24);
  const y = (v: number) => 8 + ((top - v) / span) * (CHART_H - 24);
  const slot = CHART_W / 12;
  const barW = Math.min(16, slot - 4);
  const hovered = hover !== null ? months[hover] : undefined;
  return (
    <div class="chart" data-testid="profit-chart">
      <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} role="img" aria-label="Profit for each of the last twelve months">
        <line x1="0" x2={CHART_W} y1={zero} y2={zero} class="baseline" />
        {months.map((mo, i) => {
          const v = values[i] as number;
          const h = Math.max(1, Math.abs(y(v) - zero));
          const x = i * slot + (slot - barW) / 2;
          const up = v >= 0;
          // Round only the data end; the baseline end stays square.
          const r = Math.min(4, h, barW / 2);
          const yTop = up ? zero - h : zero;
          const d = up
            ? `M${x},${zero} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + barW - r} Q${x + barW},${yTop} ${x + barW},${yTop + r} V${zero} Z`
            : `M${x},${zero} V${zero + h - r} Q${x},${zero + h} ${x + r},${zero + h} H${x + barW - r} Q${x + barW},${zero + h} ${x + barW},${zero + h - r} V${zero} Z`;
          return (
            <g key={mo.index}>
              <path d={d} class={up ? 'bar-up' : 'bar-down'} opacity={hover === null || hover === i ? 1 : 0.5} />
              <text x={x + barW / 2} y={CHART_H - 3} class="axis">{monthLabel(m, mo.index)}</text>
              {/* Hit target taller and wider than the bar. */}
              <rect
                x={i * slot}
                y="0"
                width={slot}
                height={CHART_H}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            </g>
          );
        })}
      </svg>
      {hovered && (
        <div class="chart-tip" role="status">
          {monthLabel(m, hovered.index)}{hovered.index === m.monthIndex ? ' (so far)' : ''}: <strong>{signed(profit(hovered))}</strong>
        </div>
      )}
    </div>
  );
}

function ProfitTable({ m }: { m: Management }) {
  return (
    <table class="accounts">
      <thead>
        <tr><th>Month</th><th>Profit</th></tr>
      </thead>
      <tbody>
        {m.months.slice(-12).map((mo) => (
          <tr key={mo.index}>
            <th scope="row">{monthLabel(m, mo.index)}{mo.index === m.monthIndex ? ' (so far)' : ''}</th>
            <td class={profit(mo) < 0 ? 'bad' : 'good'}>{signed(profit(mo))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Marketing({ m }: { m: Management }) {
  return (
    <>
      <p class="note">Campaigns bring more visitors while they run. Each lasts one month; start it again to add another.</p>
      <ul class="campaigns">
        {CAMPAIGNS.map((c) => {
          const left = m.campaigns.get(c.id);
          return (
            <li key={c.id}>
              <div>
                <strong>{c.name}</strong>
                <span class="note">{money.format(c.perMonth)} a month · +{Math.round(c.boost * 100)}% visitors</span>
                {left !== undefined && <span class="status-line" data-testid={`campaign-${c.id}`}>Running: {Math.ceil((left / 240) * 30)} days left</span>}
              </div>
              <div class="row">
                <button type="button" onClick={() => m.startCampaign(c.id)} data-campaign={c.id}>
                  {left !== undefined ? 'Extend' : 'Start'}
                </button>
                {left !== undefined && <button type="button" onClick={() => m.stopCampaign(c.id)}>Stop</button>}
              </div>
            </li>
          );
        })}
      </ul>
      <p class="note">Visitors now: {m.marketingBoost() > 0 ? `+${Math.round(m.marketingBoost() * 100)}% from marketing` : 'no campaigns running'}.</p>
    </>
  );
}

function Research({ m }: { m: Management }) {
  const item = m.currentResearch();
  const fund = FUNDING[m.funding] ?? FUNDING[0];
  const left = item && fund.points > 0 ? Math.ceil((item.cost - m.progress) / fund.points) : null;
  const done = RESEARCH.filter((r) => m.researched.has(r.id));
  return (
    <>
      <h3>Funding</h3>
      <div class="segmented" role="radiogroup" aria-label="Research funding">
        {FUNDING.map((f, i) => (
          <button
            type="button"
            key={f.name}
            role="radio"
            aria-checked={m.funding === i}
            class={m.funding === i ? 'active' : ''}
            onClick={() => m.setFunding(i)}
            data-funding={f.name.toLowerCase()}
          >
            {f.name}
          </button>
        ))}
      </div>
      <p class="note">{fund.perMonth > 0 ? `${money.format(fund.perMonth)} a month.` : 'Research is paused.'}</p>

      <h3>Now researching</h3>
      {item ? (
        <div data-testid="research-current">
          <p class="status-line">{item.name} <span class="note">({CATEGORY_NAMES[item.category]})</span></p>
          <div class="bar"><span class="fill" style={{ width: `${Math.min(100, (m.progress / item.cost) * 100)}%` }} /></div>
          <p class="note">{left !== null ? `About ${Math.max(1, Math.round(left / 8))} days to go.` : 'Waiting for funding.'}</p>
        </div>
      ) : (
        <p class="note" data-testid="research-current">
          {RESEARCH.every((r) => m.researched.has(r.id)) ? 'Everything has been researched.' : 'Nothing left in the chosen categories.'}
        </p>
      )}

      <h3>Focus on</h3>
      <ul class="checks">
        {(Object.keys(CATEGORY_NAMES) as ResearchCategory[]).map((c) => (
          <li key={c}>
            <label>
              <input type="checkbox" checked={m.priorities.has(c)} onChange={() => m.togglePriority(c)} data-priority={c} />
              {CATEGORY_NAMES[c]}
            </label>
          </li>
        ))}
      </ul>

      <h3>Discovered</h3>
      {done.length === 0 ? (
        <p class="note">Nothing yet.</p>
      ) : (
        <ul class="discovered">
          {done.map((r) => <li key={r.id}>{r.name}</li>)}
        </ul>
      )}
      <p class="note">{RESEARCH.length - done.length} of {RESEARCH.length} items still to discover.</p>
    </>
  );
}
