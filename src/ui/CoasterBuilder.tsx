import { coasterType } from '../core/coaster-types';
import type { BuilderState, CoasterEditor } from '../game/coaster-editor';
import { STATION_LENGTH } from '../core/track';
import { money, rating } from './format';

const DIRS = ['north', 'east', 'south', 'west'];

interface Props {
  editor: CoasterEditor;
  state: BuilderState;
  /** Switch back to placing the station with the mouse. */
  onPlaceStation(): void;
  onMessage(text: string, tone?: 'error' | 'info'): void;
}

export function CoasterBuilder({ editor, state, onPlaceStation, onMessage }: Props) {
  const report = (r: { ok: boolean; reason?: string }, success?: string) => {
    if (!r.ok && r.reason) onMessage(r.reason);
    else if (r.ok && success) onMessage(success, 'info');
  };
  const pieces = state.design ? state.design.pieces.length - STATION_LENGTH : 0;
  const ratings = state.test?.ok ? state.test.ratings : undefined;

  return (
    <aside class="panel coaster-builder" aria-label="Coaster builder" data-testid="coaster-builder">
      <div class="panel-head">
        <h2>{coasterType(state.type).name}</h2>
        <button type="button" class="close" onClick={() => editor.cancel()} aria-label="Cancel and refund" title="Cancel and refund">×</button>
      </div>

      {state.phase === 'station' && (
        <>
          <div class="segmented" role="group" aria-label="How to build">
            <button type="button" class={state.template ? '' : 'active'} aria-pressed={!state.template} onClick={() => report(editor.choosePremade(null))}>
              Design your own
            </button>
            <button
              type="button"
              class={state.template ? 'active' : ''}
              aria-pressed={!!state.template}
              data-testid="premade-tab"
              onClick={() => report(editor.choosePremade(state.premades.find((p) => !p.locked)?.id ?? null))}
            >
              Ready-made
            </button>
          </div>
          {state.template ? (
            <>
              <ul class="premade-list" role="listbox" aria-label="Ready-made designs">
                {state.premades.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={state.template === p.id}
                      class={state.template === p.id ? 'premade active' : 'premade'}
                      data-premade={p.id}
                      disabled={p.locked}
                      onClick={() => report(editor.choosePremade(p.id))}
                    >
                      <span class="premade-name">
                        {p.locked && <span aria-hidden="true">🔒 </span>}
                        {p.name}
                      </span>
                      <span class="item-cost">{money.format(p.price)}</span>
                      <span class="item-stats">{p.locked ? 'Research the loop first.' : p.blurb}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <p class="note">
                Click the map to drop it there and open it. <kbd>R</kbd> turns it (now heading {DIRS[state.stationDir]}).
              </p>
            </>
          ) : (
            <p class="note">
              Click flat, owned land to place the three-tile station. <kbd>R</kbd> turns it (now heading {DIRS[state.stationDir]}).
            </p>
          )}
          <div class="row">
            <button type="button" onClick={onPlaceStation}>{state.template ? 'Place it' : 'Place station'}</button>
            <button type="button" onClick={() => editor.cancel()}>Cancel</button>
          </div>
        </>
      )}

      {state.phase === 'track' && (
        <>
          <p class="status-line" data-testid="coaster-status">
            {state.complete ? 'Circuit complete' : `${pieces} pieces · keep building back to the station`}
          </p>
          {!state.complete && (
            <>
              <div class="piece-grid" role="group" aria-label="Track pieces">
                {state.options.map((o) => (
                  <button
                    type="button"
                    key={o.id}
                    data-piece={o.id}
                    disabled={!o.ok}
                    class={o.locked ? 'locked' : undefined}
                    title={o.ok ? `${o.label}: ${money.format(o.cost)}` : o.locked ? `${o.label}: research it in Manage first` : o.reason}
                    onClick={() => report(editor.press(o.id))}
                  >
                    {o.locked && <span aria-hidden="true">🔒 </span>}
                    {o.label}
                  </button>
                ))}
              </div>
              <div class="row">
                <button type="button" class={state.lift ? 'active' : ''} aria-pressed={state.lift} onClick={() => editor.setLift(!state.lift)} title="Chain lift on climbing pieces (+$40 each)">
                  Chain lift {state.lift ? 'on' : 'off'}
                </button>
                {pieces === 0 && (
                  <button type="button" data-testid="coaster-sample" onClick={() => report(editor.buildSample(), 'Sample track laid.')} title="Lay a ready-made circuit with a lift hill, a drop and a loop">
                    Sample track
                  </button>
                )}
              </div>
            </>
          )}
          <div class="row">
            <button type="button" onClick={() => editor.removeLast()} title="Full refund">
              {pieces === 0 ? 'Remove station' : 'Remove last piece'}
            </button>
          </div>

          {state.complete && (
            <>
              <h3>Entrance</h3>
              <div class="row" role="group" aria-label="Entrance side">
                <button type="button" class={state.side === -1 ? 'active' : ''} onClick={() => editor.setSide(-1)}>Left side</button>
                <button type="button" class={state.side === 1 ? 'active' : ''} onClick={() => editor.setSide(1)}>Right side</button>
              </div>
              {state.entrance && !state.entrance.ok && <p class="note warn">{state.entrance.reason}</p>}
              {state.entrance?.ok && !state.entrance.connected && <p class="note">Connect a path to the entrance so guests can reach it.</p>}
              <div class="row">
                <button type="button" data-testid="coaster-test" onClick={() => report(editor.runTest() ?? { ok: false })}>Test run</button>
                <button
                  type="button"
                  data-testid="coaster-open"
                  disabled={!ratings || !state.entrance?.ok}
                  onClick={() => report(editor.open(), 'Coaster open! Guests can ride it now.')}
                >
                  Open ride
                </button>
              </div>
              {state.test && !state.test.ok && <p class="note warn">{state.test.reason}</p>}
              {ratings && (
                <dl data-testid="coaster-ratings">
                  <dt>Excitement</dt><dd>{rating(ratings.excitement)}</dd>
                  <dt>Intensity</dt><dd>{rating(ratings.intensity)}</dd>
                  <dt>Nausea</dt><dd>{rating(ratings.nausea)}</dd>
                  <dt>Top speed</dt><dd>{Math.round(ratings.maxSpeed * 3.6)} km/h</dd>
                  <dt>Length</dt><dd>{ratings.length} m</dd>
                  <dt>Ride time</dt><dd>{ratings.duration} s</dd>
                  <dt>G-forces</dt><dd>{ratings.maxPositiveG.toFixed(1)} / {ratings.maxNegativeG.toFixed(1)} / {ratings.maxLateralG.toFixed(1)} lat</dd>
                  <dt>Drops</dt><dd>{ratings.drops} (highest {Math.round(ratings.highestDrop)} m)</dd>
                  <dt>Inversions</dt><dd>{ratings.inversions}</dd>
                </dl>
              )}
            </>
          )}
          <p class="note">Track so far: {money.format(state.spent)}. Cancelling refunds it all.</p>
        </>
      )}
    </aside>
  );
}
