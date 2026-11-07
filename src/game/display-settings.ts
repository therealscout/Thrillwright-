/**
 * How the game looks, chosen by the player and remembered in the browser.
 */

export interface DisplaySettings {
  /** Let the sky go through day and night (off keeps it noon). */
  dayNight: boolean;
  /** Show rain and clouds (the weather still happens either way). */
  weatherEffects: boolean;
  /** Shadows and resolution. */
  quality: 'high' | 'medium' | 'low';
  /** Snap the camera round and leave out falling rain. */
  reduceMotion: boolean;
  /** Size of the menus and panels. */
  uiScale: number;
}

export const UI_SCALES = [1, 1.15, 1.3, 1.5];

/** Start from what the device and the player's system settings suggest. */
function defaults(): DisplaySettings {
  let reduceMotion = false;
  let quality: DisplaySettings['quality'] = 'high';
  try {
    reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Phones and small tablets: go easier on the GPU.
    if (window.matchMedia('(pointer: coarse)').matches) quality = 'medium';
  } catch {
    // No window (tests): keep the defaults.
  }
  return { dayNight: true, weatherEffects: true, quality, reduceMotion, uiScale: 1 };
}

const KEY = 'thrillwright.display';

export function loadDisplaySettings(): DisplaySettings {
  try {
    const raw = localStorage.getItem(KEY);
    const base = defaults();
    if (!raw) return base;
    const v = JSON.parse(raw) as Partial<DisplaySettings>;
    const bool = (x: unknown, d: boolean) => (typeof x === 'boolean' ? x : d);
    return {
      dayNight: bool(v.dayNight, base.dayNight),
      weatherEffects: bool(v.weatherEffects, base.weatherEffects),
      quality: v.quality === 'low' || v.quality === 'medium' || v.quality === 'high' ? v.quality : base.quality,
      reduceMotion: bool(v.reduceMotion, base.reduceMotion),
      uiScale: typeof v.uiScale === 'number' && UI_SCALES.includes(v.uiScale) ? v.uiScale : base.uiScale,
    };
  } catch {
    return defaults();
  }
}

export function saveDisplaySettings(s: DisplaySettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Not remembered when storage is unavailable.
  }
}
