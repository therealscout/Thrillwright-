import { describe, expect, it } from 'vitest';
import { accessTile, buildingAt } from '../core/buildings';
import { designCost, sampleLayout } from '../core/coaster';
import { tileIndex, createTerrain } from '../core/terrain';
import { CoasterEditor } from './coaster-editor';
import { Park } from './park';

function setup(cash = 50_000) {
  const t = createTerrain(40, 20);
  t.owned.fill(1);
  const park = new Park(t, cash);
  const editor = new CoasterEditor(park);
  editor.begin();
  return { park, editor, t };
}

describe('CoasterEditor', () => {
  it('places a station, charges for it and lays track from its end', () => {
    const { park, editor } = setup();
    expect(editor.placeStation({ tx: 10, ty: 5 }).ok).toBe(true);
    const station = editor.state.spent;
    expect(station).toBeGreaterThan(0);
    expect(park.cash).toBe(50_000 - station);
    expect(editor.press('straight').ok).toBe(true);
    expect(park.cash).toBe(50_000 - station - 60);
    // On level track, "Level out" is not available and "Up" starts a climb.
    const opts = editor.state.options;
    expect(opts.find((o) => o.id === 'level')?.ok).toBe(false);
    expect(opts.find((o) => o.id === 'up')?.kind).toBe('flat-up');
    editor.press('up');
    expect(editor.state.options.find((o) => o.id === 'up')?.kind).toBe('up');
    expect(editor.state.options.find((o) => o.id === 'straight')?.ok).toBe(false);
  });

  it('refunds pieces taken back and everything on cancel', () => {
    const { park, editor } = setup();
    editor.placeStation({ tx: 10, ty: 5 });
    editor.press('straight');
    editor.press('right');
    editor.removeLast();
    expect(editor.state.design?.pieces.length).toBe(4);
    editor.cancel();
    expect(park.cash).toBe(50_000);
    expect(editor.state.phase).toBe('idle');
  });

  it('turns the station with R before placing it', () => {
    const { editor } = setup();
    editor.rotateStation();
    expect(editor.state.stationDir).toBe(2);
    editor.placeStation({ tx: 10, ty: 2 });
    expect(editor.state.design?.start.dir).toBe(2);
  });

  it('refuses a station on land the park does not own', () => {
    const { editor, t } = setup();
    t.owned[tileIndex(t, 12, 5)] = 0;
    const r = editor.placeStation({ tx: 10, ty: 5 });
    expect(r.ok).toBe(false);
    expect(editor.state.phase).toBe('station');
  });

  it('builds the sample, test-runs it and opens a ride guests can find', () => {
    const { park, editor, t } = setup();
    editor.placeStation({ tx: 10, ty: 5 });
    expect(editor.buildSample().ok).toBe(true);
    const cost = designCost({ start: editor.state.design!.start, pieces: sampleLayout() });
    expect(park.cash).toBe(50_000 - cost);
    expect(editor.state.complete).toBe(true);
    expect(editor.state.options).toEqual([]);
    const test = editor.runTest();
    expect(test?.ok).toBe(true);
    editor.setSide(-1);
    t.paths[tileIndex(t, 11, 4)] = 1;
    const opened = editor.open();
    expect(opened).toMatchObject({ ok: true, connected: true });
    expect(editor.state.phase).toBe('idle');
    const ride = park.buildings[0]!;
    expect(ride.type).toBe('steel-coaster');
    expect(ride.coaster?.ratings.excitement).toBeGreaterThan(3);
    expect(accessTile(ride)).toEqual({ tx: 11, ty: 4 });
    // The track blocks land editing and can be picked with the Look tool.
    expect(t.blocked[tileIndex(t, 12, 5)]).toBe(1);
    expect(buildingAt(park.buildings, { tx: 15, ty: 5 })?.id).toBe(ride.id);
    // Undo removes the ride and refunds the track; redo builds it again.
    expect(park.undo()).toBe(true);
    expect(park.buildings).toHaveLength(0);
    expect(park.cash).toBe(50_000);
    expect(park.redo()).toBe(true);
    expect(park.cash).toBe(50_000 - cost);
    // Demolishing refunds half the track.
    park.demolish(ride.id);
    expect(park.cash).toBe(50_000 - cost + Math.round(cost / 2));
    expect(t.blocked[tileIndex(t, 12, 5)]).toBe(0);
  });

  it("won't open until the circuit is complete", () => {
    const { editor } = setup();
    editor.placeStation({ tx: 10, ty: 5 });
    editor.press('straight');
    expect(editor.open().ok).toBe(false);
  });

  it('stops charging when the cash runs out', () => {
    const { park, editor } = setup(400);
    editor.placeStation({ tx: 10, ty: 5 });
    expect(park.cash).toBe(40);
    expect(editor.state.options.find((o) => o.id === 'straight')?.ok).toBe(false);
    expect(editor.press('straight').reason).toMatch(/cash/);
    expect(editor.buildSample().ok).toBe(false);
  });
});
