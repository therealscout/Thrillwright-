# Milestone 4: rides, stalls and needs (2026-11-07)

The park becomes a business: build rides and stalls, and guests now have needs, tastes and money.

## What's in this milestone

- **Rides & stalls menu** (Build bar, or `B`): 5 flat rides, 3 stalls and restrooms, all original designs with animated low-poly models.

| Ride | Excitement | Intensity | Nausea | Riders per cycle | Cost |
| --- | --- | --- | --- | --- | --- |
| Carousel | 3.1 | 1.0 | 0.6 | 16 per 25 s | $900 |
| Spinning Cups | 3.8 | 3.2 | 4.6 | 12 per 30 s | $1,100 |
| Swing Tower | 4.6 | 4.1 | 2.8 | 16 per 35 s | $1,600 |
| Sky Wheel | 3.5 | 0.8 | 0.4 | 16 per 60 s | $1,800 |
| Drop Tower | 5.8 | 7.5 | 3.6 | 12 per 30 s | $2,400 |

Stalls: Burger Stand, Popcorn Cart (food), Lemonade Stand (drink), Restrooms.

- **Placement**: rides need flat, owned, empty land. A see-through preview shows where it goes (red when it can't). `R` turns the entrance; it should face a path. The ground under a building can't be reshaped or flooded. Placing and demolishing are undoable.
- **Guest needs**: hunger, thirst, bathroom and nausea grow over time, energy drains, and happiness falls when needs are ignored. Hungry guests look for food, thirsty ones for drinks, and so on.
- **Ride tastes**: each guest has a favourite intensity and a nausea tolerance. Timid guests refuse intense rides; queasy guests skip spinning ones. Guests weigh excitement, distance, queue length and price.
- **Money**: guests arrive with $25–100. Tickets are paid on joining the queue; stall items when bought. Income goes straight to park cash. Broke, tired or unhappy guests go home.
- **Ride cycles**: rides wait up to 8 seconds to fill, run their cycle with riders hidden aboard, then unload. Riders get happier (more for exciting rides they can handle) and a bit queasier.
- **Info window** (Look tool, click a building): ratings, status, queue, riders so far, income, ticket price (±$0.50), open or close (refunds anyone queuing), demolish (half refund).
- **Guests window** (click the guest count): average happiness, energy, hunger, thirst, bathroom and nausea.
- **Demand**: more rides attract more guests (about 220 more per ride for now; park rating takes over in milestone 6).

## Known simplifications

- Queues are a cluster at the ride entrance for now; proper queue-line paths come with the visual polish pass.
- Guests think once per second, staggered, so 10,000 guests still cost under 2 ms per tick.

## Next: milestone 5, coaster builder v1

Track pieces, generated track meshes, train physics, test runs and excitement, intensity and nausea ratings from the ride itself.
