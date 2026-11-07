/**
 * Thrillwright's park music, composed on the fly: a cheerful fairground
 * waltz in 3/4. Every tune is generated from a seed, so it is original and
 * never quite repeats. This file only decides the notes; the audio engine
 * plays them.
 */

export type Voice = 'bass' | 'chord' | 'melody' | 'bell';

export interface Note {
  /** Start, in beats from the start of the bar. */
  beat: number;
  /** Length in beats. */
  length: number;
  /** MIDI note number (60 = middle C). */
  midi: number;
  voice: Voice;
  /** 0..1 loudness. */
  velocity: number;
}

export const BEATS_PER_BAR = 3;
export const TEMPO = 138;

/** Chords as scale degrees of C major (0 = C). Each phrase is eight bars. */
const PHRASES: ReadonlyArray<readonly number[]> = [
  [0, 0, 3, 0, 4, 4, 0, 0],
  [0, 5, 3, 4, 0, 5, 1, 4],
  [3, 3, 0, 0, 1, 4, 0, 0],
  [0, 2, 3, 0, 5, 1, 4, 4],
];

const SCALE = [0, 2, 4, 5, 7, 9, 11];

/** Rhythms for a melody bar: start beats and lengths. */
const RHYTHMS: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [[0, 1], [1, 1], [2, 1]],
  [[0, 2], [2, 1]],
  [[0, 1.5], [1.5, 0.5], [2, 1]],
  [[0, 1], [1, 0.5], [1.5, 0.5], [2, 1]],
  [[0, 3]],
  [[0.5, 0.5], [1, 1], [2, 1]],
];

/** Tiny seeded random numbers, so a tune is the same every time for its seed. */
function rng(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x / 4294967296;
  };
}

/** MIDI note for a scale degree (can be negative or above 7), from a base note. */
export function degreeToMidi(degree: number, base = 60): number {
  const octave = Math.floor(degree / 7);
  const step = ((degree % 7) + 7) % 7;
  return base + octave * 12 + (SCALE[step] as number);
}

/** The chord (scale degree of its root) for a bar of a tune. */
export function chordFor(seed: number, bar: number): number {
  const phrase = Math.floor(bar / 8);
  // Each tune walks through the phrases in its own order.
  const r = rng(seed * 7919 + phrase * 104729);
  r();
  const pick = PHRASES[Math.floor(r() * PHRASES.length)] as readonly number[];
  return pick[bar % 8] as number;
}

/**
 * The notes of one bar. The melody remembers where it was through `state`,
 * so it moves smoothly from bar to bar.
 */
export function composeBar(seed: number, bar: number, state: { melody: number } = { melody: 7 }): Note[] {
  const r = rng(seed * 31337 + bar * 7907);
  r();
  const root = chordFor(seed, bar);
  const chord = [root, root + 2, root + 4];
  const notes: Note[] = [];

  // Oom: the root, low.
  notes.push({ beat: 0, length: 0.9, midi: degreeToMidi(root, 36), voice: 'bass', velocity: 0.9 });
  // Pah, pah: the chord, a little higher, on beats two and three.
  for (const beat of [1, 2]) {
    for (const d of chord) notes.push({ beat, length: 0.45, midi: degreeToMidi(d, 55), voice: 'chord', velocity: 0.45 });
  }

  // Melody: mostly chord tones, stepping rather than leaping.
  const lastBarOfPhrase = bar % 8 === 7;
  const rhythm = lastBarOfPhrase ? RHYTHMS[4]! : RHYTHMS[Math.floor(r() * RHYTHMS.length)]!;
  for (const [beat, length] of rhythm) {
    const onBeat = beat === 0 || beat === 1 || beat === 2;
    let target = state.melody + Math.round((r() - 0.5) * 4);
    if (onBeat || lastBarOfPhrase) {
      // Snap to the nearest chord tone in the melody's range.
      let best = target;
      let bestDist = 99;
      for (let d = 4; d <= 13; d++) {
        if (!chord.some((c) => ((d - c) % 7 + 7) % 7 === 0)) continue;
        const dist = Math.abs(d - target);
        if (dist < bestDist) {
          best = d;
          bestDist = dist;
        }
      }
      target = best;
    }
    target = Math.max(4, Math.min(13, target));
    state.melody = target;
    notes.push({ beat, length: length * 0.9, midi: degreeToMidi(target, 60), voice: 'melody', velocity: 0.7 });
  }

  // A bell on the first beat of every fourth bar.
  if (bar % 4 === 0) notes.push({ beat: 0, length: 1.5, midi: degreeToMidi(root + 14, 60), voice: 'bell', velocity: 0.35 });
  return notes;
}

export const secondsPerBeat = () => 60 / TEMPO;

/** Equal-temperament frequency of a MIDI note. */
export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}
