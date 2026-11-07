import { describe, expect, it } from 'vitest';
import { COASTER_TYPES, seatsFor } from '../core/coaster-types';
import { createTerrain } from '../core/terrain';
import { CoasterEditor } from './coaster-editor';
import { Park } from './park';

function setup(type: Parameters<CoasterEditor['begin']>[0], unlocked = (_: string) => true) {
  const t = createTerrain(40, 30);
  t.owned.fill(1);
  const park = new Park(t, 100_000);
  const editor = new CoasterEditor(park, unlocked);
  editor.begin(type);
  return { park, editor };
}

describe('kinds of coaster', () => {
  it('offers only the pieces a kind of coaster can use', () => {
    const { editor } = setup('wooden-coaster');
    editor.placeStation({ tx: 10, ty: 10 });
    const ids = editor.state.options.map((o) => o.id);
    expect(ids).not.toContain('loop');
    expect(ids).not.toContain('small-left');
    expect(editor.add('loop').ok).toBe(false);
    const mouse = setup('wild-mouse').editor;
    mouse.placeStation({ tx: 10, ty: 10 });
    expect(mouse.state.options.map((o) => o.id)).toContain('small-right');
    expect(mouse.add('small-right').ok).toBe(true);
  });

  it('keeps a junior coaster low', () => {
    const { editor } = setup('junior-coaster');
    editor.placeStation({ tx: 10, ty: 10 });
    editor.add('flat-up');
    let last = { ok: true } as { ok: boolean; reason?: string };
    for (let i = 0; i < 6 && last.ok; i++) last = editor.add('up');
    expect(last.ok).toBe(false);
    expect(last.reason).toContain('as high as a Little Dipper can go');
  });

  it('drops a ready-made design for its price and opens it', () => {
    const { park, editor } = setup('inverted-coaster');
    const option = editor.state.premades.find((p) => p.id === 'bat-wing')!;
    expect(editor.choosePremade('bat-wing').ok).toBe(true);
    const before = park.cash;
    const r = editor.placeStation({ tx: 10, ty: 10 });
    expect(r.ok).toBe(true);
    expect(park.cash).toBe(before - option.price);
    const b = park.buildings[0]!;
    expect(b.type).toBe('inverted-coaster');
    expect(b.coaster?.type).toBe('inverted-coaster');
    expect(editor.state.phase).toBe('idle');
    expect(seatsFor(b.coaster?.type)).toBe(16);
  });

  it('refuses a ready-made loop before the loop is researched, and swaps in plain turns', () => {
    const { editor } = setup('steel-coaster', (f) => f !== 'loop' && f !== 'banked-turns');
    expect(editor.state.premades.find((p) => p.id === 'loop-runner')?.locked).toBe(true);
    expect(editor.choosePremade('loop-runner').ok).toBe(false);
    expect(editor.choosePremade('camelback').ok).toBe(true);
    expect(editor.placeStation({ tx: 10, ty: 10 }).ok).toBe(true);
  });

  it('rates the same track differently for each kind', () => {
    const { editor } = setup('steel-coaster');
    editor.placeStation({ tx: 10, ty: 10 });
    editor.buildSample();
    const base = editor.runTest()!.ratings!;
    const pieces = editor.state.design!.pieces;
    const rate = (id: keyof typeof COASTER_TYPES) => COASTER_TYPES[id].rate(base, pieces);
    expect(rate('steel-coaster').excitement).toBe(base.excitement);
    expect(rate('inverted-coaster').excitement).toBeGreaterThan(base.excitement);
    expect(rate('junior-coaster').intensity).toBeLessThan(base.intensity);
    expect(rate('wooden-coaster').intensity).toBeGreaterThan(base.intensity);
  });
});
