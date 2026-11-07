# Milestone 8: scenarios, goals and a guided tutorial (2026-11-07)

Thrillwright now opens on a scenario list. Each park has its own map, starting money and research, and a goal to reach by a deadline. Finishing one opens the next.

## Scenarios

| Park | Difficulty | Map | Start | Goal |
| --- | --- | --- | --- | --- |
| First Steps Fairground | Tutorial | Flat field with a pond | $25,000 | 60 guests and a rating of 45 by the end of October, Year 1 |
| Meadowbrook Green | Easy | Flat field with a pond | $12,000, $5,000 loan | 250 guests and a rating of 55 by the end of October, Year 1 |
| Lakeshore Landing | Medium | A long lake along the east side | $15,000, $10,000 loan | 400 guests and a coaster with excitement 5.0 or more by Year 2 |
| Hilltop Hollow | Medium | Rolling hills, no water | $8,000, $15,000 loan | A month with $1,500 profit, and the loan paid off, by Year 2 |
| Thunder Summit | Hard | Hills and a lake | $20,000, $10,000 loan, three items already researched | 1,000 guests and a rating of 70 by Year 3 |
| Sandbox | | Flat field with a pond | $50,000, everything researched | None |

Meadowbrook Green, the tutorial and the sandbox are open from the start. Each of the others opens when you finish the one before it. Finished parks get a ✓, which is saved in the browser.

## Goals

- The **◎ Goal** chip in the top bar shows how many parts of the goal are met. Click it for the details: each part with its current progress, the deadline and the months left.
- You win as soon as every part is met at the same time. You lose if November of the deadline year arrives first.
- When the scenario ends, the game pauses and a message appears. After a win you can go to the next scenario or keep playing. After a loss you can try again or keep building for fun.

## Tutorial

First Steps Fairground comes with a step-by-step guide in the top-left corner. Each step moves on by itself once you've done it:

1. Look around (move, turn or zoom the view)
2. Lay a path
3. Build a ride
4. Welcome your first riders (the first ticket money comes in)
5. Build food and drink stalls
6. Build restrooms
7. Hire a handyman
8. Open the Park window to read guest thoughts
9. Open Manage
10. Build a coaster
11. Reach the goal

Any step can be skipped, and the guide can be folded away.

## Pause and game speed

The top bar now has pause (also the **P** key) and 1×, 2× and 3× speed. Faster speed runs more simulation ticks; money, the calendar and research all keep pace with it.

## Maps

`createStarterTerrain` takes a style: a seed for the shape of the hills, hills inside the plot (kept flat near the entrance), and a pond, a large lake or no water.

## Under the hood

- `src/game/scenarios.ts`: scenario list, unlock rule, saved progress.
- `src/game/goals.ts`: goal lines, deadline, `GoalTracker` (win or lose, once).
- `src/game/tutorial.ts`: tutorial steps and `TutorialProgress`.
- `src/ui/ScenarioSelect.tsx`, `src/ui/GoalPanel.tsx` (goal panel and win or lose message), `src/ui/TutorialCard.tsx`.
- The scenario is picked with `#scenario=<id>` (or `?scenario=<id>`), and the page reloads into it. With no scenario, the list opens over a paused sandbox.
- The performance panel now opens by itself only with `?bench=`.

## Tests

- 13 new unit tests for scenarios, map styles, goals, deadlines and the tutorial (140 in total).
- A new browser test for the scenario list, locked parks, the tutorial's first steps, the goal panel, winning, and starting the next park (9 browser tests in total).
- The older browser tests open the sandbox (or Meadowbrook Green, for research) directly.

## Next

Milestone 9: an art and audio pass (models, day and night, weather, music, sound effects and UI polish).
