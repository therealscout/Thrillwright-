import { CATALOG, type BuildingKind, type BuildingType } from '../core/catalog';
import { money, rating } from './format';

const GROUPS: Array<{ title: string; kinds: BuildingKind[] }> = [
  { title: 'Rides', kinds: ['ride'] },
  { title: 'Food and drink', kinds: ['food', 'drink'] },
  { title: 'Facilities', kinds: ['toilet'] },
];

interface Props {
  cash: number;
  current: string | null;
  onPick(type: BuildingType): void;
  onClose(): void;
}

export function BuildMenu({ cash, current, onPick, onClose }: Props) {
  return (
    <aside class="panel build-menu" aria-label="Build menu" data-testid="build-menu">
      <div class="panel-head">
        <h2>Build</h2>
        <button type="button" class="close" onClick={onClose} aria-label="Close">×</button>
      </div>
      {GROUPS.map((group) => (
        <section key={group.title}>
          <h3>{group.title}</h3>
          <ul class="catalog">
            {CATALOG.filter((t) => group.kinds.includes(t.kind)).map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  class={t.id === current ? 'item active' : 'item'}
                  disabled={t.cost > cash}
                  onClick={() => onPick(t)}
                  data-build={t.id}
                  title={t.description}
                >
                  <span class="item-name">{t.name}</span>
                  <span class="item-cost">{t.custom ? 'per piece' : money.format(t.cost)}</span>
                  {t.custom && <span class="item-stats">{t.description}</span>}
                  {t.kind === 'ride' && !t.custom && (
                    <span class="item-stats">
                      Excitement {rating(t.excitement)} · Intensity {rating(t.intensity)} · Nausea {rating(t.nausea)}
                    </span>
                  )}
                  {t.kind !== 'ride' && <span class="item-stats">{t.description}</span>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </aside>
  );
}
