/**
 * How the game looks, chosen by the player and remembered in the browser.
 */

export interface DisplaySettings {
  /** Let the sky go through day and night (off keeps it noon). */
  dayNight: boolean;
  /** Show rain and clouds (the weather still happens either way). */
  weatherEffects: boolean;
}

const KEY = 'thrillwright.display';
const DEFAULTS: DisplaySettings = { dayNight: true, weatherEffects: true };

export function loadDisplaySettings(): DisplaySettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const v = JSON.parse(raw) as Partial<DisplaySettings>;
    return {
      dayNight: typeof v.dayNight === 'boolean' ? v.dayNight : DEFAULTS.dayNight,
      weatherEffects: typeof v.weatherEffects === 'boolean' ? v.weatherEffects : DEFAULTS.weatherEffects,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveDisplaySettings(s: DisplaySettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Not remembered when storage is unavailable.
  }
}
