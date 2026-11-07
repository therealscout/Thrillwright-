# Milestone 1: project setup (2026-11-07)

Full game plan: https://claude.ai/artifact/49vPx1i6A47pCFCfdVCtTv

## What's in this milestone

- Vite + TypeScript + Three.js + Preact project.
- Starter scene: 96 x 96 tile grid, low-poly placeholder trees (instanced), pond, entrance gate and path.
- Isometric orthographic camera with 4 smooth rotations, zoom, keyboard and right-drag panning, tile cursor.
- Unit tests (Vitest) for grid and terrain math; a Playwright smoke test that loads the game in a real browser.
- GitHub Actions: CI on every pull request, and automatic deploy of a playable build to GitHub Pages on `main`.

## Next: milestone 2, world and camera

Terrain raise/lower, water, land ownership, and a path-building tool.
