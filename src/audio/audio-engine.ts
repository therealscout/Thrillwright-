/**
 * All of Thrillwright's sound, made in the browser with Web Audio: the park
 * music, short effects for building and money, and the background sound of
 * the crowd and the rain. There are no sound files to load.
 *
 * Browsers only allow sound after the player has clicked or pressed a key,
 * so the engine starts on the first gesture.
 */
import { composeBar, midiToHz, nextTune, STYLES, TUNE_BARS, type Note, type StyleId } from './music';

export type Sfx = 'click' | 'build' | 'coins' | 'error' | 'unlock' | 'win' | 'lose' | 'breakdown' | 'fixed';

export interface AudioSettings {
  music: number;
  effects: number;
  ambience: number;
  muted: boolean;
}

const SETTINGS_KEY = 'thrillwright.audio';
const DEFAULTS: AudioSettings = { music: 0.5, effects: 0.7, ambience: 0.5, muted: false };

export function loadAudioSettings(): AudioSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULTS };
    const v = JSON.parse(raw) as Partial<AudioSettings>;
    const n = (x: unknown, d: number) => (typeof x === 'number' && x >= 0 && x <= 1 ? x : d);
    return { music: n(v.music, DEFAULTS.music), effects: n(v.effects, DEFAULTS.effects), ambience: n(v.ambience, DEFAULTS.ambience), muted: v.muted === true };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveAudioSettings(s: AudioSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // Storage can be unavailable; settings just won't be remembered.
  }
}

export class AudioEngine {
  settings: AudioSettings = loadAudioSettings();
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private ambienceBus!: GainNode;
  private crowd!: GainNode;
  private rainGain!: GainNode;
  private nextBarTime = 0;
  private bar = 0;
  /** The tune playing now: its style, key (semitones from C) and seed. */
  private tune: { style: StyleId; key: number; seed: number } = { style: 'waltz', key: 0, seed: Math.floor(Math.random() * 1e9) };
  private readonly melody = { melody: 7 };
  private night = false;
  private timer: number | null = null;
  private lastSfx = new Map<Sfx, number>();
  private readonly listeners = new Set<() => void>();

  /** Start on the first click or key press (browsers require a gesture). */
  armOnGesture(target: EventTarget = window): void {
    const start = () => {
      this.start();
      target.removeEventListener('pointerdown', start);
      target.removeEventListener('keydown', start);
    };
    target.addEventListener('pointerdown', start);
    target.addEventListener('keydown', start);
  }

  get started(): boolean {
    return this.ctx !== null;
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    if (this.ctx) return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.musicBus = this.bus(this.master);
    this.sfxBus = this.bus(this.master);
    this.ambienceBus = this.bus(this.master);
    this.crowd = this.noiseLoop(700, 1.2, 0);
    this.rainGain = this.noiseLoop(3000, 0.4, 0);
    this.applySettings();
    this.nextBarTime = ctx.currentTime + 0.2;
    this.timer = window.setInterval(() => this.schedule(), 100);
    this.emit();
  }

  update(patch: Partial<AudioSettings>): void {
    this.settings = { ...this.settings, ...patch };
    saveAudioSettings(this.settings);
    this.applySettings();
    this.emit();
  }

  /** Night brings the occasional quiet music-box tune. */
  setNight(amount: number): void {
    this.night = amount > 0.5;
  }

  /** The style of the tune playing now, e.g. "Oom-pah march". */
  get tuneName(): string {
    return STYLES[this.tune.style].name;
  }

  /** Background sound: the crowd grows with guests, the rain with the weather. */
  setAmbience(guests: number, rain: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const crowd = Math.min(1, Math.sqrt(guests / 800)) * 0.35;
    this.crowd.gain.setTargetAtTime(crowd, t, 0.8);
    this.rainGain.gain.setTargetAtTime(rain * 0.5, t, 1.5);
  }

  play(sfx: Sfx): void {
    const ctx = this.ctx;
    if (!ctx || this.settings.muted || this.settings.effects === 0) return;
    // Don't pile up the same sound when lots happen at once.
    const now = ctx.currentTime;
    if (now - (this.lastSfx.get(sfx) ?? -1) < 0.08) return;
    this.lastSfx.set(sfx, now);
    const tone = (midi: number, at: number, len: number, type: OscillatorType, vol: number, slideTo?: number) =>
      this.tone(this.sfxBus, midiToHz(midi), now + at, len, type, vol, slideTo !== undefined ? midiToHz(slideTo) : undefined);
    switch (sfx) {
      case 'click':
        tone(84, 0, 0.04, 'square', 0.08);
        break;
      case 'build':
        tone(48, 0, 0.12, 'triangle', 0.5, 40);
        this.noiseBurst(this.sfxBus, now, 0.08, 1200, 0.25);
        break;
      case 'coins':
        tone(88, 0, 0.08, 'square', 0.12);
        tone(93, 0.07, 0.16, 'square', 0.12);
        break;
      case 'error':
        tone(50, 0, 0.12, 'sawtooth', 0.15);
        tone(47, 0.12, 0.18, 'sawtooth', 0.15);
        break;
      case 'unlock':
        [72, 76, 79, 84].forEach((m, i) => tone(m, i * 0.08, 0.25, 'triangle', 0.3));
        break;
      case 'win':
        [67, 72, 76, 79, 84, 88].forEach((m, i) => tone(m, i * 0.11, i === 5 ? 0.9 : 0.3, 'square', 0.14));
        [48, 55, 60].forEach((m) => tone(m, 0.55, 1.1, 'triangle', 0.3));
        break;
      case 'lose':
        [67, 63, 60, 55].forEach((m, i) => tone(m, i * 0.22, 0.4, 'triangle', 0.3));
        break;
      case 'breakdown':
        tone(55, 0, 0.25, 'square', 0.12, 43);
        tone(55, 0.3, 0.25, 'square', 0.12, 43);
        break;
      case 'fixed':
        tone(72, 0, 0.1, 'triangle', 0.3);
        tone(79, 0.1, 0.2, 'triangle', 0.3);
        break;
    }
  }

  dispose(): void {
    if (this.timer !== null) clearInterval(this.timer);
    void this.ctx?.close();
    this.ctx = null;
  }

  // ---- internals -------------------------------------------------------------

  private emit(): void {
    for (const l of this.listeners) l();
  }

  private applySettings(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = this.settings;
    this.master.gain.setTargetAtTime(s.muted ? 0 : 0.8, t, 0.05);
    this.musicBus.gain.setTargetAtTime(s.music * 0.5, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(s.effects, t, 0.05);
    this.ambienceBus.gain.setTargetAtTime(s.ambience, t, 0.05);
  }

  private bus(to: AudioNode): GainNode {
    const g = (this.ctx as AudioContext).createGain();
    g.connect(to);
    return g;
  }

  /** Schedule music a little ahead of time so it never stutters. */
  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (this.nextBarTime < ctx.currentTime) this.nextBarTime = ctx.currentTime + 0.05;
    while (this.nextBarTime < ctx.currentTime + 0.5) {
      // At the end of each tune, a short rest and then something different.
      if (this.bar >= TUNE_BARS) {
        this.tune = nextTune(this.tune.style, this.night, Math.random);
        this.bar = 0;
        this.melody.melody = 7;
        this.nextBarTime += 1.5;
        this.emit();
      }
      const style = STYLES[this.tune.style];
      const beat = 60 / style.tempo;
      if (this.settings.music > 0 && !this.settings.muted) {
        for (const n of composeBar(this.tune.seed, this.bar, this.melody, this.tune.style)) {
          this.playNote({ ...n, midi: n.midi + this.tune.key }, this.nextBarTime + n.beat * beat, beat);
        }
      }
      this.nextBarTime += style.beatsPerBar * beat;
      this.bar++;
    }
  }

  private playNote(n: Note, at: number, beat: number): void {
    const hz = midiToHz(n.midi);
    const len = n.length * beat;
    switch (n.voice) {
      case 'bass':
        this.tone(this.musicBus, hz, at, len, 'triangle', 0.5 * n.velocity);
        break;
      case 'chord':
        this.tone(this.musicBus, hz, at, len, 'triangle', 0.12 * n.velocity);
        break;
      case 'melody':
        // A reedy organ: a soft square with a sine an octave up.
        this.tone(this.musicBus, hz, at, len, 'square', 0.09 * n.velocity, undefined, 2400);
        this.tone(this.musicBus, hz * 2, at, len, 'sine', 0.08 * n.velocity);
        break;
      case 'bell':
        this.tone(this.musicBus, hz, at, len, 'sine', 0.25 * n.velocity, undefined, undefined, true);
        break;
      case 'brass':
        // A bright horn: a filtered sawtooth.
        this.tone(this.musicBus, hz, at, len, 'sawtooth', 0.07 * n.velocity, undefined, 1800);
        break;
      case 'tuba':
        this.tone(this.musicBus, hz, at, len, 'sawtooth', 0.16 * n.velocity, undefined, 500);
        break;
      case 'marimba':
        // A struck bar: a sine that dies away, with a hint of its fourth harmonic.
        this.tone(this.musicBus, hz, at, Math.max(len, 0.5), 'sine', 0.3 * n.velocity, undefined, undefined, true);
        this.tone(this.musicBus, hz * 4, at, 0.12, 'sine', 0.04 * n.velocity, undefined, undefined, true);
        break;
      case 'piano':
        this.tone(this.musicBus, hz, at, Math.max(len, 0.4), 'triangle', (n.midi < 50 ? 0.35 : 0.16) * n.velocity, undefined, 3000, true);
        break;
      case 'musicbox':
        this.tone(this.musicBus, hz * 2, at, Math.max(len, 0.8), 'sine', 0.16 * n.velocity, undefined, undefined, true);
        break;
      case 'pad':
        // Soft and held, for the night tune.
        this.tone(this.musicBus, hz, at, len, 'sine', (n.midi < 50 ? 0.22 : 0.05) * n.velocity);
        break;
    }
  }

  /** One enveloped oscillator note. */
  private tone(bus: AudioNode, hz: number, at: number, len: number, type: OscillatorType, vol: number, slideTo?: number, lowpass?: number, ring = false): void {
    const ctx = this.ctx as AudioContext;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(hz, at);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, at + len);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(vol, at + 0.01);
    if (ring) env.gain.exponentialRampToValueAtTime(0.0001, at + len);
    else {
      env.gain.setValueAtTime(vol, at + Math.max(0.01, len - 0.04));
      env.gain.linearRampToValueAtTime(0, at + len);
    }
    let out: AudioNode = osc;
    if (lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lowpass;
      osc.connect(f);
      out = f;
    }
    out.connect(env);
    env.connect(bus);
    osc.start(at);
    osc.stop(at + len + 0.05);
  }

  private noiseBuffer(): AudioBuffer {
    const ctx = this.ctx as AudioContext;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  private noiseBurst(bus: AudioNode, at: number, len: number, cutoff: number, vol: number): void {
    const ctx = this.ctx as AudioContext;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const env = ctx.createGain();
    env.gain.setValueAtTime(vol, at);
    env.gain.exponentialRampToValueAtTime(0.001, at + len);
    src.connect(f).connect(env).connect(bus);
    src.start(at);
    src.stop(at + len + 0.02);
  }

  /** A looping, filtered noise for crowd or rain, starting silent. */
  private noiseLoop(centre: number, q: number, vol: number): GainNode {
    const ctx = this.ctx as AudioContext;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = centre;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.ambienceBus);
    src.start();
    return g;
  }
}
