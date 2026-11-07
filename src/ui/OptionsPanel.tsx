import { useEffect, useState } from 'preact/hooks';
import type { AudioEngine, AudioSettings } from '../audio/audio-engine';
import type { DisplaySettings } from '../game/display-settings';

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
    </aside>
  );
}
