# Milestone 7: running the park as a business (2026-11-07)

The park has a calendar, a bank manager, an advertising budget and a research lab. Open everything from the new **Manage** button on the build bar.

## Calendar

The top bar shows the date. A park opens on 1 March, Year 1, and a month lasts four minutes of play (about eight seconds a day). Time only passes while the game runs, so nothing is charged while paused.

## Finances

- **Accounts:** every dollar in or out is booked to a category: ride tickets, food and drink, park entry, construction, staff wages, marketing, research and loan interest. The Finances tab shows this month and last month side by side, with the profit for each.
- **Profit chart:** the last twelve months as bars, green above zero and pink below. Hover a month for its exact figure; "Show table" lists the same numbers as text.
- **Loan:** borrow and repay in steps of $1,000, up to $20,000. Interest is 8% a year, charged a little at a time. Borrowed money is not counted as income.
- **Entry fee:** $0 to $40 per guest. Guests judge what the park is worth from its rides (about $2 plus $0.80 per point of excitement across open rides). Charge more than that and fewer people come: each dollar over costs about 5% of visitors, down to a floor of 15%. Guests who pay to get in bring a little extra spending money to make up half of it.

## Marketing

Three campaigns, each running for one month at a time (start again to extend):

| Campaign | Cost a month | Extra visitors |
| --- | --- | --- |
| Flyers in town | $300 | +15% |
| Radio spots | $900 | +35% |
| TV advert | $2,200 | +70% |

They stack, up to +120% in total. More visitors also raise the guest cap a little.

## Research

The lab works through new rides, stalls and coaster pieces one at a time:

| Item | Category | Points |
| --- | --- | --- |
| Popcorn Cart | Shops and stalls | 120 |
| Swing Tower | Thrill rides | 240 |
| Banked turns (coaster) | Roller coasters | 240 |
| Sky Wheel | Gentle rides | 300 |
| Ice Cream Cart (new) | Shops and stalls | 260 |
| Vertical loop (coaster) | Roller coasters | 420 |
| Drop Tower | Thrill rides | 480 |
| Coffee Kiosk (new) | Shops and stalls | 360 |

Funding sets the speed: None ($0), Low ($150 a month, 1 point a second), Normal ($300, 2 points) or High ($600, 3.5 points). Untick categories to skip them. A message pops up when something new is ready.

A fresh park starts with the Carousel, Spinning Cups, Burger Stand, Lemonade Stand, Restrooms and the Steel Coaster with flat turns, hills and brakes. Items still to research are hidden from the build menu, and locked track pieces show a 🔒 in the coaster builder. The "Build sample" circuit swaps in flat turns and straight track when banked turns or the loop aren't researched yet.

## Under the hood

- `src/game/management.ts`: the `Management` class (calendar, accounts, loan, entry fee, campaigns, research). It follows simulated time through `SimClient.onTime`.
- `src/core/research.ts`: the research list, categories, funding levels and starting unlocks.
- `Park` books every change of cash to a ledger category (`earn`, `charge`, `transfer` for loans).
- The simulation now splits income into rides, stalls and entry, and charges the entry fee as guests arrive.
- New stalls: Ice Cream Cart and Coffee Kiosk.

## Tests

- 14 new unit tests for the calendar, accounts, loans and interest, entry fee demand, park value, campaigns, research order and funding, and locked coaster pieces (127 in total).
- A new browser test for the Manage window: loan, entry fee, chart and table, a campaign, and research unlocking the Popcorn Cart in the build menu (8 browser tests in total).
- The cash checks in the smoke tests switch research off first and compare with the cash at that moment.

## Next

Milestone 8: scenarios with goals, a scenario select screen with unlocks, and a guided tutorial park.
