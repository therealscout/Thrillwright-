# Thrillwright

An original, browser-based theme park builder: grow a park from an empty field, design roller coasters piece by piece, and keep thousands of guests happy, each with their own needs and opinions.

Status: **milestone 1 (project setup)**. See [docs/](docs/) for milestone notes.

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
  core/     pure game math and data (grid, terrain), unit tested
  render/   Three.js scene, camera and input
  ui/       Preact HUD and windows
e2e/        Playwright browser tests
docs/       milestone notes (YYYY-MM-DD-name.md)
```

## Originality

Thrillwright is an original game in the theme park management genre. All names, art, audio and scenarios are original or openly licensed.
