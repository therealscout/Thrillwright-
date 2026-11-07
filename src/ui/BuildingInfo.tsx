import type { Building } from '../core/buildings';
import { buildingType } from '../core/catalog';
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
  const isRide = type.kind === 'ride';
  const status = !building.open
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
      <p class="status-line">{status}</p>
      <dl>
        {isRide && (
          <>
            <dt>Excitement</dt><dd>{rating(type.excitement)}</dd>
            <dt>Intensity</dt><dd>{rating(type.intensity)}</dd>
            <dt>Nausea</dt><dd>{rating(type.nausea)}</dd>
            <dt>In queue</dt><dd data-testid="info-queue">{count.format(stats?.queue ?? 0)}</dd>
            <dt>Capacity</dt><dd>{type.capacity} per {type.cycle} s</dd>
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
        <button type="button" class="danger" onClick={onDemolish} title="Refunds half the build price. Undo with Ctrl+Z.">
          Demolish
        </button>
      </div>
    </aside>
  );
}
