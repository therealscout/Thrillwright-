/**
 * Thrillwright's park music, composed on the fly. The park plays a run of
 * tunes in different styles (a fairground waltz, an oom-pah march, a breezy
 * calypso, a bouncy rag, and a music-box lullaby at night), each in its own
 * key and tempo. Every tune is generated from a seed, so it is original and
 * never quite repeats. This file only decides the notes; the audio engine
 * plays them.
 */

/** Instruments. The audio engine gives each its own sound. */
export type Voice = 'bass' | 'chord' | 'melody' | 'bell' | 'brass' | 'marimba' | 'piano' | 'musicbox' | 'pad' | 'tuba';

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

export type StyleId = 'waltz' | 'march' | 'calypso' | 'rag' | 'lullaby';

export interface Style {
  id: StyleId;
  name: string;
  beatsPerBar: number;
  tempo: number;
  /** Instruments for the tune and its accompaniment. */
  lead: Voice;
  bass: Voice;
  chords: Voice;
  /** Beats where the bass plays (it alternates root and fifth), and where chords play. */
  bassBeats: readonly number[];
  chordBeats: readonly number[];
  chordLength: number;
  /** Melody rhythms: start beats and lengths within a bar. The last one ends a phrase. */
  rhythms: ReadonlyArray<ReadonlyArray<readonly [number, number]>>;
  /** For the gentle night tune only. */
  night?: boolean;
}

const FOUR_RHYTHMS: Style['rhythms'] = [
  [[0, 1], [1, 1], [2, 1], [3, 1]],
  [[0, 1.5], [1.5, 0.5], [2, 2]],
  [[0, 0.5], [0.5, 0.5], [1, 1], [2, 1], [3, 1]],
  [[0, 2], [2, 1], [3, 1]],
  [[0, 1], [1, 0.5], [1.5, 0.5], [2, 1.5], [3.5, 0.5]],
  [[0, 4]],
];

export const STYLES: Record<StyleId, Style> = {
  waltz: {
    id: 'waltz', name: 'Fairground waltz', beatsPerBar: 3, tempo: 138, lead: 'melody', bass: 'bass', chords: 'chord',
    bassBeats: [0], chordBeats: [1, 2], chordLength: 0.45,
    rhythms: [
      [[0, 1], [1, 1], [2, 1]],
      [[0, 2], [2, 1]],
      [[0, 1.5], [1.5, 0.5], [2, 1]],
      [[0, 1], [1, 0.5], [1.5, 0.5], [2, 1]],
      [[0, 3]],
      [[0.5, 0.5], [1, 1], [2, 1]],
    ],
  },
  march: {
    id: 'march', name: 'Oom-pah march', beatsPerBar: 4, tempo: 116, lead: 'brass', bass: 'tuba', chords: 'chord',
    bassBeats: [0, 2], chordBeats: [1, 3], chordLength: 0.4, rhythms: FOUR_RHYTHMS,
  },
  calypso: {
    id: 'calypso', name: 'Island calypso', beatsPerBar: 4, tempo: 108, lead: 'marimba', bass: 'bass', chords: 'chord',
    bassBeats: [0, 1.5, 2, 3.5], chordBeats: [0.5, 1.5, 2.5, 3.5], chordLength: 0.3,
    rhythms: [
      [[0, 0.5], [0.5, 1], [1.5, 0.5], [2, 1], [3, 1]],
      [[0, 1.5], [1.5, 1], [2.5, 1.5]],
      [[0.5, 0.5], [1, 0.5], [1.5, 1], [2.5, 0.5], [3, 1]],
      [[0, 1], [1, 0.5], [1.5, 1.5], [3, 1]],
      [[0, 1.5], [1.5, 0.5], [2, 1], [3, 1]],
      [[0, 4]],
    ],
  },
  rag: {
    id: 'rag', name: 'Boardwalk rag', beatsPerBar: 4, tempo: 126, lead: 'piano', bass: 'piano', chords: 'piano',
    bassBeats: [0, 2], chordBeats: [1, 3], chordLength: 0.5,
    rhythms: [
      [[0, 0.5], [0.5, 1], [1.5, 0.5], [2, 0.5], [2.5, 1], [3.5, 0.5]],
      [[0, 1], [1, 0.5], [1.5, 1], [2.5, 0.5], [3, 1]],
      [[0, 0.5], [0.5, 0.5], [1, 0.5], [1.5, 1], [2.5, 1.5]],
      [[0, 1.5], [1.5, 0.5], [2, 0.5], [2.5, 1.5]],
      [[0.5, 0.5], [1, 1], [2, 0.5], [2.5, 1], [3.5, 0.5]],
      [[0, 4]],
    ],
  },
  lullaby: {
    id: 'lullaby', name: 'Music-box lullaby', beatsPerBar: 3, tempo: 84, lead: 'musicbox', bass: 'pad', chords: 'pad',
    bassBeats: [0], chordBeats: [0], chordLength: 2.9, night: true,
    rhythms: [
      [[0, 1], [1, 1], [2, 1]],
      [[0, 2], [2, 1]],
      [[0, 1.5], [1.5, 0.5], [2, 1]],
      [[0, 3]],
    ],
  },
};

/** Bars in one tune, before the park moves on to the next. */
export const TUNE_BARS = 32;

/** Keys to play in, as semitones from C, chosen so tunes sit comfortably. */
const KEYS = [0, 2, 3, -2, 5, -3, 7, -5];

/**
 * What to play next: a different style from the last one (the lullaby only
 * at night, and mostly then), in a key of its own.
 */
export function nextTune(previous: StyleId | null, night: boolean, random: () => number): { style: StyleId; key: number; seed: number } {
  const day: StyleId[] = ['waltz', 'march', 'calypso', 'rag'];
  let pool: StyleId[] = night && random() < 0.6 ? ['lullaby'] : day;
  if (pool.length > 1) pool = pool.filter((s) => s !== previous);
  const style = pool[Math.floor(random() * pool.length)] as StyleId;
  return { style, key: KEYS[Math.floor(random() * KEYS.length)] as number, seed: Math.floor(random() * 1e9) };
}

/** Chords as scale degrees of C major (0 = C). Each phrase is eight bars. */
const PHRASES: ReadonlyArray<readonly number[]> = [
  [0, 0, 3, 0, 4, 4, 0, 0],
  [0, 5, 3, 4, 0, 5, 1, 4],
  [3, 3, 0, 0, 1, 4, 0, 0],
  [0, 2, 3, 0, 5, 1, 4, 4],
];

const SCALE = [0, 2, 4, 5, 7, 9, 11];

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
export function composeBar(seed: number, bar: number, state: { melody: number } = { melody: 7 }, styleId: StyleId = 'waltz'): Note[] {
  const style = STYLES[styleId];
  const r = rng(seed * 31337 + bar * 7907);
  r();
  const root = chordFor(seed, bar);
  const chord = [root, root + 2, root + 4];
  const notes: Note[] = [];
  const end = style.beatsPerBar;

  // Bass: the root on the first beat, then alternating with the fifth.
  style.bassBeats.forEach((beat, i) => {
    const degree = i % 2 === 0 ? root : root + 4;
    const length = Math.min(0.9, ((style.bassBeats[i + 1] ?? end) - beat) * 0.9);
    notes.push({ beat, length, midi: degreeToMidi(degree, 36), voice: style.bass, velocity: i === 0 ? 0.9 : 0.7 });
  });
  // Chords, a little higher.
  for (const beat of style.chordBeats) {
    for (const d of chord) notes.push({ beat, length: style.chordLength, midi: degreeToMidi(d, 55), voice: style.chords, velocity: 0.45 });
  }

  // Melody: mostly chord tones, stepping rather than leaping.
  const lastBarOfPhrase = bar % 8 === 7;
  const rhythms = style.rhythms;
  const rhythm = lastBarOfPhrase ? (rhythms.find((x) => x.length === 1) ?? rhythms[0])! : rhythms[Math.floor(r() * rhythms.length)]!;
  for (const [beat, length] of rhythm) {
    const onBeat = Number.isInteger(beat) && beat % (end === 4 ? 2 : 1) === 0;
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
    notes.push({ beat, length: length * 0.9, midi: degreeToMidi(target, 60), voice: style.lead, velocity: 0.7 });
  }

  // A bell on the first beat of every fourth bar.
  if (bar % 4 === 0) notes.push({ beat: 0, length: 1.5, midi: degreeToMidi(root + 14, 60), voice: 'bell', velocity: style.night ? 0.2 : 0.35 });
  return notes;
}

export const secondsPerBeat = () => 60 / TEMPO;

/** Equal-temperament frequency of a MIDI note. */
export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}
