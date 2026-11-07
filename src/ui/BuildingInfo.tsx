import type { Building } from '../core/buildings';
import { buildingType } from '../core/catalog';
import { COASTER_SEATS } from '../core/coaster';
import type { BuildingStats } from '../sim/sim-core';
import { count, money, price, rating } from './format';

interface Props {
  building: Building;
  stats: BuildingStats | undefined;
  onPrice(value: number): void;
  onToggleOpen(): void;
  onDemolish(): void;
  onClose(): void;
}

export function BuildingInfo({ building, stats, onPrice, onToggleOpen, onDemolish, onClose }: Props) {
  const type = buildingType(building.type);
  const r = building.coaster?.ratings;
  const excitement = r?.excitement ?? type.excitement;
  const intensity = r?.intensity ?? type.intensity;
  const nausea = r?.nausea ?? type.nausea;
  const capacity = r ? `${COASTER_SEATS} per ${r.duration + 4} s` : `${type.capacity} per ${type.cycle} s`;
  const isRide = type.kind === 'ride';
  const status = stats?.broken
    ? 'Broken down'
    : !building.open
    ? 'Closed'
    : isRide
      ? stats && stats.riders > 0
        ? `Running with ${stats.riders} riders`
        : stats && stats.queue > 0
          ? 'Loading'
          : 'Waiting for riders'
      : 'Open';
  return (
    <aside class="panel info" aria-label={`${type.name} details`} data-testid="building-info">
      <div class="panel-head">
        <h2>{type.name}</h2>
        <button type="button" class="close" onClick={onClose} aria-label="Close">×</button>
      </div>
      <p class={stats?.broken ? 'status-line broken' : 'status-line'}>{status}</p>
      <dl>
        {isRide && (
          <>
            <dt>Excitement</dt><dd data-testid="info-excitement">{rating(excitement)}</dd>
            <dt>Intensity</dt><dd>{rating(intensity)}</dd>
            <dt>Nausea</dt><dd>{rating(nausea)}</dd>
            {r && (
              <>
                <dt>Top speed</dt><dd>{Math.round(r.maxSpeed * 3.6)} km/h</dd>
                <dt>Length</dt><dd>{r.length} m</dd>
                <dt>Inversions</dt><dd>{r.inversions}</dd>
              </>
            )}
            <dt>In queue</dt><dd data-testid="info-queue">{count.format(stats?.queue ?? 0)}</dd>
            <dt>Capacity</dt><dd>{capacity}</dd>
            <dt>Reliability</dt><dd data-testid="info-reliability">{stats?.reliability ?? 100}%</dd>
            <dt>Downtime</dt><dd>{stats?.downtime ?? 0} s</dd>
          </>
        )}
        <dt>{isRide ? 'Riders so far' : 'Customers'}</dt><dd data-testid="info-customers">{count.format(stats?.customers ?? 0)}</dd>
        <dt>Income</dt><dd>{money.format(stats?.revenue ?? 0)}</dd>
      </dl>
      {type.kind !== 'toilet' && (
        <div class="price-row">
          <span>{isRide ? 'Ticket' : 'Price'}</span>
          <button type="button" onClick={() => onPrice(building.price - 0.5)} aria-label="Lower price">−</button>
          <strong data-testid="info-price">{price.format(building.price)}</strong>
          <button type="button" onClick={() => onPrice(building.price + 0.5)} aria-label="Raise price">+</button>
        </div>
      )}
      <div class="row">
        <button type="button" onClick={onToggleOpen}>{building.open ? 'Close' : 'Open'}</button>
        <button type="button" class="danger" onClick={onDemolish} title={`Refunds half the build price${building.coaster ? ` (${money.format(Math.round(building.coaster.cost / 2))})` : ''}. Undo with Ctrl+Z.`}>
          Demolish
        </button>
      </div>
    </aside>
  );
}
