import { describe, expect, it } from 'vitest';
import { BEATS_PER_BAR, STYLES, chordFor, composeBar, degreeToMidi, midiToHz, nextTune, type StyleId } from './music';

describe('Music', () => {
  it('converts notes to pitches', () => {
    expect(midiToHz(69)).toBeCloseTo(440);
    expect(degreeToMidi(0)).toBe(60);
    expect(degreeToMidi(7)).toBe(72);
    expect(degreeToMidi(-1)).toBe(59);
  });

  it('writes a waltz: bass on one, chords on two and three', () => {
    const notes = composeBar(1, 0);
    expect(notes.filter((n) => n.voice === 'bass').map((n) => n.beat)).toEqual([0]);
    expect(new Set(notes.filter((n) => n.voice === 'chord').map((n) => n.beat))).toEqual(new Set([1, 2]));
    for (const n of notes) expect(n.beat + n.length).toBeLessThanOrEqual(BEATS_PER_BAR + 1.5);
  });

  it('is the same for the same seed and different for another', () => {
    const tune = (seed: number) => {
      const state = { melody: 7 };
      return Array.from({ length: 32 }, (_, bar) => composeBar(seed, bar, state).map((n) => n.midi).join(',')).join('|');
    };
    expect(tune(5)).toBe(tune(5));
    expect(tune(5)).not.toBe(tune(6));
  });

  it('keeps the melody in a singable range and lands on the chord at phrase ends', () => {
    const state = { melody: 7 };
    for (let bar = 0; bar < 64; bar++) {
      const notes = composeBar(9, bar, state).filter((n) => n.voice === 'melody');
      for (const n of notes) {
        expect(n.midi).toBeGreaterThanOrEqual(degreeToMidi(4));
        expect(n.midi).toBeLessThanOrEqual(degreeToMidi(13));
      }
      if (bar % 8 === 7) {
        const root = chordFor(9, bar);
        const pcs = [root, root + 2, root + 4].map((d) => degreeToMidi(d) % 12);
        expect(pcs).toContain((notes[0]!.midi) % 12);
      }
    }
  });

  it('plays each style in its own time and instruments', () => {
    for (const style of Object.values(STYLES)) {
      const state = { melody: 7 };
      for (let bar = 0; bar < 16; bar++) {
        const notes = composeBar(3, bar, state, style.id);
        expect(notes.some((n) => n.voice === style.lead)).toBe(true);
        for (const n of notes) expect(n.beat).toBeLessThan(style.beatsPerBar);
      }
    }
    expect(composeBar(3, 0, { melody: 7 }, 'march').filter((n) => n.voice === 'tuba').map((n) => n.beat)).toEqual([0, 2]);
  });

  it('moves on to a different style each tune, and the lullaby only at night', () => {
    let seed = 1;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    let last: StyleId = 'waltz';
    const seen = new Set<StyleId>();
    for (let i = 0; i < 40; i++) {
      const next = nextTune(last, false, random);
      expect(next.style).not.toBe(last);
      expect(next.style).not.toBe('lullaby');
      seen.add(next.style);
      last = next.style;
    }
    expect(seen.size).toBe(4);
    const nights = Array.from({ length: 40 }, () => nextTune('waltz', true, random).style);
    expect(nights).toContain('lullaby');
  });
});
