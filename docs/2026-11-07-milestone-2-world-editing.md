# Milestone 2: world editing (2026-11-07)

## What's in this milestone

- **Terrain with slopes.** Heights live on tile corners, so tiles can be flat, ramped or uneven. Raising or lowering land reshapes the land around it into slopes automatically (no corner is more than one step from its neighbour). Raising an uneven area levels it first, which makes preparing ground for rides easy.
- **Water.** Dig a hole, then raise the water level to make a lake. Drain it again with the drain tool.
- **Footpaths.** Click and drag to lay paths on flat ground or gentle ramps. Paths join up visually with their neighbours. Terrain edits that would break a path, or flood one, are refused with a clear message.
- **Land ownership.** You can only edit land the park owns (the brighter area). Land outside it can be bought with the Buy land tool.
- **Cash.** The park starts with $20,000. Every edit has a price (see `src/core/costs.ts`) and is refused if you can't afford it.
- **Undo and redo.** Every click or drag is one undo step (Ctrl+Z, Ctrl+Y), and refunds its cost.
- **Build bar.** Tool buttons with icons, brush sizes 1, 3, 5 and 7, hints with prices, and feedback messages.

## Shortcuts

| Key | Action |
| --- | --- |
| 1–7 | Raise, lower, add water, drain water, path, remove path, buy land |
| Esc | Look (no tool) |
| [ / ] | Smaller / larger brush |
| Ctrl+Z / Ctrl+Y | Undo / redo |

## Code map

- `src/core/terrain.ts`: terrain data (corner heights, water, paths, ownership).
- `src/core/terrain-edit.ts`: the editing rules; pure functions, fully unit tested.
- `src/game/park.ts`: cash and undo history.
- `src/game/tool-controller.ts`: tools, brush, drag strokes, shortcuts.
- `src/game/starter-park.ts`: the default map (owned plot, pond, hills, entrance path).
- `src/render/terrain-mesh.ts`: builds the 3D meshes from terrain data.

## Next: milestone 3, guest engine

The performance proof: a simulation worker, guests spawning at the entrance and walking the paths, and instanced rendering of up to 10,000 guests.
