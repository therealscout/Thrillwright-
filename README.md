# Thrillwright

An original, browser-based theme park builder: grow a park from an empty field, design roller coasters piece by piece, and keep thousands of guests happy, each with their own needs and opinions.

Status: **milestone 4 (rides, stalls and needs)**. Open with `?bench=10000` for a 10,000-guest performance test. See [docs/](docs/) for milestone notes.

## Play locally

Requires Node.js 22+.

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173).

## Controls

| Action | Input |
| --- | --- |
| Move camera | W A S D or arrow keys, or right-drag |
| Zoom | Mouse wheel, or + / − |
| Rotate view | Q / E |
| Land tools | 1–7 (Esc for none) |
| Rides and stalls | B, then R to turn the entrance |
| Ride details | Look tool (Esc), click a ride |
| Brush size | [ / ] |
| Undo / redo | Ctrl+Z / Ctrl+Y |

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server with hot reload |
| `npm run build` | Type-check and build to `dist/` |
| `npm test` | Unit tests (Vitest) |
| `npm run e2e` | Browser smoke test (Playwright) |
| `npm run lint` | ESLint |
| `npm run check` | Lint, type-check, test and build |

## Project layout

```
src/
  core/     pure game math, data and rules (grid, terrain, editing), unit tested
  game/     game state: park, tools, starter map
  sim/      guest simulation, run in a Web Worker at 20 ticks per second
  render/   Three.js scene, camera, input and instanced guests
  ui/       Preact HUD and windows
e2e/        Playwright browser tests
docs/       milestone notes (YYYY-MM-DD-name.md)
```

## Originality

Thrillwright is an original game in the theme park management genre. All names, art, audio and scenarios are original or openly licensed.
