/**
 * What guests think. Each guest keeps their latest thought; the park keeps
 * a short feed of recent ones and a running tally of each kind, so the
 * player can see what the crowd likes and what it complains about.
 */

export const Thought = {
  None: 0,
  Hungry: 1,
  Thirsty: 2,
  NeedToilet: 3,
  Tired: 4,
  Sick: 5,
  LovedRide: 6,
  TooIntense: 7,
  TooExpensive: 8,
  GoodValue: 9,
  QueueTooLong: 10,
  RideBroken: 11,
  PathDirty: 12,
  ParkLovely: 13,
  Bored: 14,
  OutOfCash: 15,
  NiceBench: 16,
} as const;
export type Thought = (typeof Thought)[keyof typeof Thought];

export const THOUGHT_COUNT = 17;

/** Whether a thought is good news (true), bad news (false) or neutral (null). */
export const THOUGHT_MOOD: ReadonlyArray<boolean | null> = [
  null, false, false, false, false, false, true, false, false, true, false, false, false, true, false, false, true,
];

/** Thought text; `{ride}` is replaced with the ride or stall's name. */
export const THOUGHT_TEXT: readonly string[] = [
  '',
  "I'm hungry",
  "I'm thirsty",
  'I really need the restroom',
  "I'm tired",
  "I feel sick",
  '{ride} was great!',
  "{ride} looks too intense for me",
  "I'm not paying that much for {ride}",
  '{ride} is good value',
  'The queue for {ride} is too long',
  '{ride} has broken down',
  'This path is disgusting',
  'What a lovely park!',
  "There's nothing to do here",
  "I've run out of money",
  'It was nice to sit down',
];

export interface ThoughtEntry {
  guest: number;
  thought: Thought;
  /** Building the thought is about, or 0. */
  about: number;
  /** Simulation tick it was thought on. */
  tick: number;
}

/** Recent thoughts, plus a decaying tally of each kind. */
export class ThoughtLog {
  readonly recent: ThoughtEntry[] = [];
  /** Roughly "guests who thought this in the last minute or so". */
  readonly tally = new Float32Array(THOUGHT_COUNT);
  constructor(private readonly keep = 12) {}

  add(entry: ThoughtEntry): void {
    this.tally[entry.thought] = (this.tally[entry.thought] as number) + 1;
    // Keep the feed varied: skip a repeat of something said just now.
    if (this.recent.slice(0, 4).some((r) => r.thought === entry.thought && r.about === entry.about)) return;
    this.recent.unshift(entry);
    if (this.recent.length > this.keep) this.recent.length = this.keep;
  }

  /** Fade the tally; call once per second. */
  decay(factor = 0.97): void {
    for (let k = 0; k < THOUGHT_COUNT; k++) this.tally[k] = (this.tally[k] as number) * factor;
  }

  /** The most common thoughts right now, biggest first. */
  top(n: number): Array<{ thought: Thought; count: number }> {
    const out: Array<{ thought: Thought; count: number }> = [];
    for (let k = 1; k < THOUGHT_COUNT; k++) {
      const c = this.tally[k] as number;
      if (c >= 0.5) out.push({ thought: k as Thought, count: Math.round(c) });
    }
    return out.sort((a, b) => b.count - a.count).slice(0, n);
  }
}

export function thoughtText(thought: Thought, rideName = 'this ride'): string {
  return (THOUGHT_TEXT[thought] ?? '').replace('{ride}', rideName);
}
