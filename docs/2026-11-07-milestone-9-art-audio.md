# Milestone 9: day and night, weather, music and sound (2026-11-07)

The park now has days, nights and changing weather, and it sounds like a fairground. All the sound is made in the browser as the game runs. There are no audio files, and every note is original.

## Day and night

- One day and night passes each game month (four minutes at normal speed). The park opens mid-morning.
- Nights are short. The light dims and turns blue, the sky goes dark, and rides and stalls light up so they stand out.
- Sunrise and sunset tint the light warm, and the sun crosses the sky so shadows move through the day.
- Turn it off under ⚙ Options → Display to keep it noon all the time.

## Weather

- Sunny, cloudy or rain, changing every two or three minutes of play. Rain is likelier in spring and autumn than in summer.
- The current weather shows in the top bar (☀ ☁ 🌧, or 🌙 on a clear night).
- Clouds and rain dim the light, and rain falls around the view.
- Rain keeps visitors away: about 40% fewer arrive while it lasts, and a message says when it starts.
- Rain and clouds can be hidden in Options. The weather still happens.

## Music

An original fairground waltz in 3/4, made up as it plays:

- A low "oom" on the first beat and "pah, pah" chords on the second and third.
- A reedy organ melody that moves mostly by steps and lands on the chord at the end of each phrase.
- A bell every fourth bar.
- Four chord phrases arranged in a different order each time you load the game, so the tune never quite repeats.

## Sound effects and background sound

- Effects for building, errors, research unlocks, breakdowns and repairs, winning and losing, and UI clicks.
- A crowd murmur that grows with the number of guests, and the sound of rain.
- Sound starts on your first click or key press, as browsers require.

## Options (⚙, top right)

- Mute everything, plus separate volumes for music, sound effects and crowd and weather.
- Day and night on or off, and rain and clouds shown or hidden.
- Both are saved in the browser.

## Under the hood

- `src/render/atmosphere.ts`: `skyState` (pure: sky colour, sun colour, direction and strength, ambient light, how dark it is) and `Atmosphere` (applies it to the scene and draws rain as instanced line segments around the camera target).
- `src/game/weather.ts`: a seeded weather model with monthly odds, eased cloud and rain values, and its effect on demand.
- `src/audio/music.ts`: the composer (pure, seeded). `src/audio/audio-engine.ts`: Web Audio playback with music scheduled ahead of time, synthesised effects, noise-based ambience, and saved volumes.
- `src/game/display-settings.ts`, `src/ui/OptionsPanel.tsx`.
- Building colours get a matching glow at night (`setModelGlow`).
- The sim worker gained a speed setting, used by the 2× and 3× buttons added in milestone 8.

## Tests

- 10 new unit tests for the weather, the sky and the music (150 in total).
- A new browser test for the Options panel and its saved settings (10 browser tests in total).

## Next

Milestone 10: release prep (save and load, a settings screen, performance tuning, accessibility, and the public deploy).
