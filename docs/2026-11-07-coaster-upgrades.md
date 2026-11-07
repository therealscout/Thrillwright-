# Coaster upgrades (2026-11-07)

What changed in this round, and where it lives in the code.

## Riders and the Watch camera
- Trains carry little riders dressed like the guests who boarded. Their arms go up on drops and in loops.
- **🎥 Watch** on a coaster's details follows the front car. Moving the camera stops watching.
- Code: `src/render/coaster-layer.ts` (riders, `trainPosition`), `src/render/game-renderer.ts` (`watch`).

## Crossings
- A coaster only blocks the ground under its station and wherever the track runs low. Paths, queues and other coasters can pass beneath raised track and supports.
- Terrain keeps two derived layers, `trackLow` and `trackHigh`, rebuilt by `refreshOccupancy` whenever buildings change (this also fixes older saves when they load).
- Code: `src/core/buildings.ts`, `src/core/coaster.ts`, `src/game/crossings.test.ts`.

## Coaster types and ready-made designs
- Five kinds: Steel Coaster, Timber Twister (wooden), Skyhanger (inverted), Zippy Mouse (wild mouse, tight hairpins) and Little Dipper (junior). Each has its own pieces, height limit, train, colours, supports and ratings. The new four are unlocked by research.
- Fifteen ready-made designs (three per kind) can be dropped for a fixed price and open straight away.
- Code: `src/core/coaster-types.ts`, `src/core/premade.ts`, `src/game/coaster-editor.ts`.

## Queue lines
- A queue is a separate path kind (`paths` value 2) with blue railings. Guests join at the far end, shuffle forward, and the ride's details show the expected wait.
- Code: `src/sim/sim-core.ts` (`findQueueLine`, `shuffleQueues`), `src/render/path-layer.ts`.

## Water
- Water now ripples, is clear and teal in the shallows and deep blue in the middle, and has animated foam along the shore and where it meets water at another level.
- Raised pools show their sides, and spill into lower water as small waterfalls. Lake beds shade into the bank.
- Code: `src/render/water.ts`; the lakes in new scenario maps get gently sloping shores (`src/game/starter-park.ts`).

## Prices and staff
- Manage → **Prices** sets the price for every stall or ride of a kind at once; a stall's details can copy its price to all the others like it.
- Handymen wear yellow hard hats and mechanics blue caps, each with a glowing badge overhead.

## Fix: guests skipping custom coasters
- New coasters open at a fair ticket price for their excitement, and a ride's details explain why guests are passing it by (price, intensity or queue), with a one-click fair price.
