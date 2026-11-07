# Milestone 6: guest opinions, park rating, staff, litter and breakdowns (2026-11-07)

The park now has a reputation. Guests say what they think, make a mess, get sick, and judge you for it. Rides wear out and break. Staff keep it all running.

## Guest thoughts

Guests think out loud now and then. The **Park** window (click the ★ rating or the guest count) shows the most common thoughts right now and a feed of thoughts overheard, with ride names.

| Good | Bad |
| --- | --- |
| *{ride} was great!* | *I'm hungry / thirsty / tired*, *I really need the restroom* |
| *{ride} is good value* | *I'm not paying that much for {ride}* |
| *What a lovely park!* | *The queue for {ride} is too long* |
| *It was nice to sit down* | *{ride} looks too intense for me* |
| | *{ride} has broken down*, *This path is disgusting*, *I feel sick* |
| | *There's nothing to do here*, *I've run out of money* |

Ticket prices now matter: guests won't pay much more than a ride is worth (about $0.90 per point of excitement, plus $1.50). Queues more than about four loads long put guests off.

## Park rating (0 to 100)

Shown in the top bar. It moves gradually towards a target made of:

- Base 40
- Guest happiness: up to about +30, or negative if guests are miserable
- Rides and variety: +2 per open ride (up to 14) and +2 per kind of ride (up to 10); −15 with no rides
- Clean paths: up to −25 for litter and sick
- Breakdowns: −5 per broken ride, up to −20
- Unhappy guests leaving: up to −15

A rating of 60 gives the normal number of visitors. Higher brings more, lower fewer (a quarter at 0).

## Litter, sick, bins and benches

- Guests who buy food or drink carry the wrapper or cup for a while. They drop it in a bin if they pass one (on their tile or the next), or on the path when they get bored of holding it.
- Very queasy guests may be sick on the path.
- Dirty paths make guests unhappy and lower the rating.
- **Bin** (`8`, $40) holds 40 pieces of litter before it's full. **Bench** (`9`, $60) lets tired guests rest. Both go on path tiles; removing the path removes them.

## Breakdowns and reliability

Every ride run wears a ride a little (intense rides wear faster). Worn rides break down more often. A broken ride stops, sends its queue away with a refund, and stays broken until a mechanic fixes it. You'll get a message when a ride breaks down and when it's fixed. The info window shows reliability and total downtime.

## Staff

Open **Staff** on the build bar.

| Staff | Wage | Job |
| --- | --- | --- |
| Handyman (green) | $15 per minute | Walks to the nearest litter or sick within about 24 path tiles, sweeps it up and empties bins; patrols otherwise |
| Mechanic (orange) | $20 per minute | Goes to the nearest broken ride and fixes it (+30 reliability); otherwise inspects rides below 70% reliability (+20) |

Wages are charged for simulated time while the park runs. Staff start at the entrance.

## Known simplifications

- Guests sit on benches without stopping to sit down visibly.
- Staff can't be picked up and placed, or given patrol areas, yet.
- Guests don't yet carry visible items or balloons.

## Next: milestone 7, management

Prices, loans, marketing, finance charts, and a research tree with unlocks.
