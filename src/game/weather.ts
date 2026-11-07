/**
 * The weather: sunny, cloudy or rain, changing every couple of minutes of
 * play. Spring and autumn are wetter than summer. Rain keeps some visitors
 * away. Changes ease in so the sky never snaps from one to the other.
 */

export type WeatherKind = 'sunny' | 'cloudy' | 'rain';

export const WEATHER_NAMES: Record<WeatherKind, string> = {
  sunny: 'Sunny',
  cloudy: 'Cloudy',
  rain: 'Rain',
};

/** Chance of each kind by month (0 = January): [sunny, cloudy, rain]. */
const CLIMATE: ReadonlyArray<readonly [number, number, number]> = [
  [0.3, 0.4, 0.3], [0.3, 0.4, 0.3], [0.4, 0.35, 0.25], [0.45, 0.3, 0.25],
  [0.55, 0.3, 0.15], [0.65, 0.25, 0.1], [0.7, 0.2, 0.1], [0.65, 0.25, 0.1],
  [0.5, 0.3, 0.2], [0.4, 0.35, 0.25], [0.3, 0.4, 0.3], [0.3, 0.4, 0.3],
];

const TARGET: Record<WeatherKind, { cloud: number; rain: number }> = {
  sunny: { cloud: 0, rain: 0 },
  cloudy: { cloud: 0.7, rain: 0 },
  rain: { cloud: 1, rain: 1 },
};

export class Weather {
  kind: WeatherKind = 'sunny';
  /** Eased 0..1 values for drawing. */
  cloud = 0;
  rain = 0;
  /** Seconds of play until the next change. */
  private left: number;
  private seed: number;
  private readonly listeners = new Set<(kind: WeatherKind) => void>();

  constructor(seed = 12345) {
    this.seed = seed >>> 0 || 1;
    this.left = 90 + this.random() * 90;
  }

  onChange(listener: (kind: WeatherKind) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Let time pass; `month` is the calendar month (0 = January). */
  advance(seconds: number, month: number): void {
    if (seconds <= 0) return;
    this.left -= seconds;
    if (this.left <= 0) {
      this.left = 90 + this.random() * 120;
      this.set(this.pick(month));
    }
    // Ease towards the look of the current weather over about 10 seconds.
    const goal = TARGET[this.kind];
    const k = 1 - Math.exp(-seconds / 4);
    this.cloud += (goal.cloud - this.cloud) * k;
    this.rain += (goal.rain - this.rain) * k;
  }

  set(kind: WeatherKind): void {
    if (kind === this.kind) return;
    this.kind = kind;
    for (const l of this.listeners) l(kind);
  }

  /** How rain scales new arrivals: fewer people set out in the wet. */
  get demandFactor(): number {
    return this.kind === 'rain' ? 0.6 : this.kind === 'cloudy' ? 0.95 : 1;
  }

  private pick(month: number): WeatherKind {
    const odds = CLIMATE[((month % 12) + 12) % 12] as readonly [number, number, number];
    const r = this.random();
    return r < odds[0] ? 'sunny' : r < odds[0] + odds[1] ? 'cloudy' : 'rain';
  }

  private random(): number {
    let x = this.seed;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.seed = x >>> 0;
    return this.seed / 4294967296;
  }
}
