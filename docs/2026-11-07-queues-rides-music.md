# Queues, new rides and music (2026-11-07)

The second round of changes on 7 November, and where each lives in the code.

## Why guests skipped custom coasters
- Guests counted as finding a ride "too intense" even when they couldn't reach it, so the ride panel could blame intensity for a path problem. Refusals now only count for rides a guest could walk to.
- Rides that were far away or only modestly exciting were passed over silently. The distance penalty is smaller, and guests who pass a ride by now show up as "not worth the walk or the ticket".
- Guests accept rides up to 3 points more intense than they like (was 2.5). `riderShare()` in `src/core/pricing.ts` estimates how many guests are brave enough; the builder and ride panel show it, and the builder warns under 40%.

## Queues
- Queue tiles store which neighbours they join (`queueLinks`, bits N, E, S, W) in the terrain and in saves. A tile joins the one laid just before it in a drag, or the open end of a queue next to it. Older saves join every pair of touching queue tiles, as before.
- `queueRoom()` in `src/sim/sim-core.ts`: a queue holds as many guests as fit along it (or 8 by the entrance with no line). Guests on their way count toward it; a full queue turns new guests away with a "queue too long" thought.
- Guests stand 0.26 tiles apart (was 0.34).

## Bins and benches
- The path items layer is now a set of bits (bin 1, bench 2), so a tile can hold both.

## New rides and stalls (research)
- Gentle: Bumper Cars, Ghost Manor. Thrill: Swinging Galleon, Whirlwind.
- Shops: Hot Dog Cart, Pizza Slice Stand, Candy Floss Cart, Smoothie Bar.
- Models in `src/render/building-models.ts`; catalog and research in `src/core/`.

## Music
- `src/audio/music.ts` has five styles (waltz, march, calypso, rag, lullaby), each with its own tempo, metre and instruments. Each tune is 32 bars in a random key; the next tune is a different style, and the lullaby comes in at night.
