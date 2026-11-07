# Thrillwright

An original, browser-based theme park builder: grow a park from an empty field, design roller coasters piece by piece, and keep thousands of guests happy, each with their own needs and opinions.

Status: **milestone 2 (world editing)**. See [docs/](docs/) for milestone notes.

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
| Build tools | 1–7 (Esc for none) |
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
  render/   Three.js scene, camera and input
  ui/       Preact HUD and windows
e2e/        Playwright browser tests
docs/       milestone notes (YYYY-MM-DD-name.md)
```

## Originality

Thrillwright is an original game in the theme park management genre. All names, art, audio and scenarios are original or openly licensed.
