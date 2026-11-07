import { useEffect, useState } from 'preact/hooks';
import type { AudioEngine, AudioSettings } from '../audio/audio-engine';
import { UI_SCALES, type DisplaySettings } from '../game/display-settings';

export interface DisplayControl {
  settings: DisplaySettings;
  update(patch: Partial<DisplaySettings>): void;
}

interface Props {
  audio: AudioEngine;
  display: DisplayControl;
  onClose(): void;
}

const SLIDERS: Array<{ key: 'music' | 'effects' | 'ambience'; label: string }> = [
  { key: 'music', label: 'Music' },
  { key: 'effects', label: 'Sound effects' },
  { key: 'ambience', label: 'Crowd and weather' },
];

/** Sound and display options. */
export function OptionsPanel({ audio, display, onClose }: Props) {
  const [sound, setSound] = useState<AudioSettings>(audio.settings);
  const [look, setLook] = useState<DisplaySettings>(display.settings);
  useEffect(() => audio.onChange(() => setSound(audio.settings)), [audio]);
  const setDisplay = (patch: Partial<DisplaySettings>) => {
    display.update(patch);
    setLook(display.settings);
  };
  return (
    <aside class="panel options" aria-label="Options" data-testid="options-panel">
      <div class="panel-head">
        <h2>Options</h2>
        <button type="button" class="close" onClick={onClose} aria-label="Close">×</button>
      </div>
      <h3>Sound</h3>
      {!audio.started && <p class="note">Sound starts after your first click or key press.</p>}
      <label class="check">
        <input type="checkbox" checked={sound.muted} onChange={(e) => audio.update({ muted: (e.target as HTMLInputElement).checked })} data-testid="mute" />
        Mute everything
      </label>
      {SLIDERS.map((s) => (
        <label class="slider" key={s.key}>
          <span>{s.label}</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={sound[s.key]}
            disabled={sound.muted}
            onInput={(e) => audio.update({ [s.key]: Number((e.target as HTMLInputElement).value) })}
            data-volume={s.key}
          />
          <span class="value">{Math.round(sound[s.key] * 100)}%</span>
        </label>
      ))}
      <h3>Display</h3>
      <label class="check">
        <input type="checkbox" checked={look.dayNight} onChange={(e) => setDisplay({ dayNight: (e.target as HTMLInputElement).checked })} data-testid="day-night" />
        Day and night
      </label>
      <label class="check">
        <input type="checkbox" checked={look.weatherEffects} onChange={(e) => setDisplay({ weatherEffects: (e.target as HTMLInputElement).checked })} />
        Show rain and clouds
      </label>
      <p class="note">Weather still affects visitors when its effects are hidden.</p>
      <h3>Graphics</h3>
      <div class="segmented" role="radiogroup" aria-label="Graphics quality">
        {(['high', 'medium', 'low'] as const).map((q) => (
          <button
            type="button"
            key={q}
            role="radio"
            aria-checked={look.quality === q}
            class={look.quality === q ? 'active' : ''}
            onClick={() => setDisplay({ quality: q })}
            data-quality={q}
          >
            {q[0]?.toUpperCase() + q.slice(1)}
          </button>
        ))}
      </div>
      <p class="note">Low turns shadows off and lowers the resolution, for older computers.</p>
      <h3>Accessibility</h3>
      <div class="segmented" role="radiogroup" aria-label="Interface size">
        {UI_SCALES.map((scale) => (
          <button
            type="button"
            key={scale}
            role="radio"
            aria-checked={look.uiScale === scale}
            class={look.uiScale === scale ? 'active' : ''}
            onClick={() => setDisplay({ uiScale: scale })}
            data-ui-scale={scale}
          >
            {Math.round(scale * 100)}%
          </button>
        ))}
      </div>
      <p class="note">Size of the menus and panels.</p>
      <label class="check">
        <input type="checkbox" checked={look.reduceMotion} onChange={(e) => setDisplay({ reduceMotion: (e.target as HTMLInputElement).checked })} data-testid="reduce-motion" />
        Reduce motion (no camera swing or falling rain)
      </label>
    </aside>
  );
}
