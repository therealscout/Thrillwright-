# Milestone 3: guest engine (2026-11-07)

The performance proof for the whole game: thousands of individual guests, simulated and drawn smoothly in the browser.

## Results

| Measure | Result |
| --- | --- |
| Simulation cost, 10,000 guests (Node, unit test) | about 1.7 ms per tick including the snapshot; budget is 50 ms |
| Simulation cost in the browser worker | 0.2 to 1.7 ms per tick at 10,000 guests |
| Frame rate, 10,000 guests, software-only rendering (no GPU) | about 33 fps; real GPUs will be well above 60 |
| Guest draw calls | 1, for every guest |

A unit test fails the build if 10,000 guests ever take more than 10 ms per tick, and a browser test checks a 5,000-guest park loads without errors.

## How it works

- **Simulation worker** (`src/sim/sim.worker.ts`): runs the simulation at a fixed 20 ticks per second, off the main thread.
- **Guest storage** (`src/sim/guests.ts`): one row per guest across flat typed arrays. Needs (hunger, thirst, energy and so on) are already stored, ready for milestone 4.
- **Walking** (`src/sim/sim-core.ts`): guests move tile to tile along paths, prefer to keep going straight, avoid turning back, and keep to their own lane so crowds spread out. When their visit is over they follow a distance map back to the entrance and leave.
- **Distance maps** (`src/sim/path-map.ts`): rebuilt only when paths change, so routing costs nothing per guest.
- **Snapshots**: after each tick the worker sends positions and velocities in a transferred buffer (no copying). The main thread moves each guest along its velocity between snapshots for smooth motion.
- **Rendering** (`src/render/guest-layer.ts`): one instanced low-poly guest mesh. Shirt and skin colours are chosen in the shader, and guests bob as they walk.

## Trying it

- Guests now arrive at the entrance on their own (1.5 per second, up to 500 for now).
- Click the ⚡ button for the performance panel: lay a test path grid (free, undoable), then add guests or fill to 10,000.
- Open the game with `?bench=10000` in the URL to start straight into a 10,000-guest test.

## Next: milestone 4, rides, stalls and needs

Flat rides with entrances, exits and queues; food, drink and toilets; guest needs, money and ride choice.
