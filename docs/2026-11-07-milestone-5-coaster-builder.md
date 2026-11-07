# Milestone 5: coaster builder v1 (2026-11-07)

Design your own steel roller coaster piece by piece, test it, and open it to guests. Its ratings come from a physics test run of the track you built, not from a table.

## How to build one

1. Open the **Coaster builder** (Build bar, `C`, or Steel Coaster in the Rides & stalls menu).
2. Click flat, owned land to place the three-tile **station**. `R` turns it before you click.
3. Lay track from the green arrow with the piece buttons. Each piece is paid for as you lay it; **Remove last piece** gives a full refund.
4. Bring the track back into the station from behind. The builder says **Circuit complete** when it closes.
5. Pick the **entrance side** and connect a path to it.
6. **Test run**, then **Open ride**. Guests start queuing straight away.

**Sample track** lays a ready-made circuit (lift hill, drop, loop, two pairs of turns) from a bare station. It needs a clear 13 by 4 tile area.

Cancelling (×) refunds everything laid so far. Once open, the whole coaster is one undo step (undo refunds the track); demolishing refunds half.

## Track pieces

| Piece | Cost | Notes |
| --- | --- | --- |
| Station | $120 per tile | 3 tiles, on flat ground |
| Straight | $60 | |
| Left / right turn | $180 | 2 by 2 tiles |
| Banked left / right turn | $220 | Leans into the turn; much less sideways force |
| Up, Down, Level out | $80 | The builder picks the right transition piece for you (start climb, climb, level off, and so on). 45° slopes |
| Chain lift | +$40 per climbing piece | Pulls the train up at a steady speed. On by default |
| Vertical loop | $900 | 3 tiles long, about 10 m tall |
| Brakes | $90 | Slows the train before the station |

## Placement rules

- Track must stay on owned land, inside the map, and above the ground and any water.
- It needs 2 m (4 height steps) of headroom over paths and over other parts of the same track.
- It can't pass through other rides or stalls. Once open, the ground under it can't be reshaped.

## The test run and ratings

A train is rolled once round the circuit at 60 steps per second, under gravity, rolling resistance and air drag, with the chain lift, station tyres and brakes driving it. If it stalls, the builder says on which piece.

It records top speed, length, ride time, vertical and lateral G-forces (averaged over a train length, as riders feel them), drops and the highest drop, inversions and airtime. These become:

- **Excitement**: speed, drops, drop height, inversions, ride time, airtime and turns. Very intense rides lose excitement.
- **Intensity**: G-forces, speed and inversions.
- **Nausea**: sideways G, strong positive G, inversions, negative G and lots of turning.

The sample track rates about 5.3 excitement, 6.3 intensity and 2.7 nausea, with a top speed of 55 km/h.

## In the park

- A coaster is a ride like any other for guests: 16 riders per train, a cycle of the ride time plus 4 seconds to unload, $5 default ticket. Guests choose it by the same rules: thrill-seekers love it, timid guests stay away.
- A coaster draws a crowd like two flat rides.
- The train runs on the real timeline from the test run, in step with the simulation, with riders aboard.
- The Look tool shows its ratings, top speed, length and inversions.

## Known simplifications

- One train per coaster; no block sections yet.
- A path can't be laid under a coaster after it's built. Lay paths first, then build the track over them.
- No tunnels, helixes, S-bends or diagonal track yet.
- One coaster style (steel looping). More styles and pieces come later.

## Next: milestone 6, opinions, park rating, staff, litter and breakdowns

Guest thoughts, a park rating that drives attendance, handymen and mechanics, litter and vomit, and ride breakdowns.
