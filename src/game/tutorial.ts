/**
 * The guided tutorial: a list of steps, each with a short explanation and a
 * check that tells when the player has done it. The checks only read game
 * state, so the tutorial never gets in the way of playing.
 */
import { buildingType } from '../core/catalog';
import type { Park } from './park';

export interface TutorialContext {
  park: Park;
  /** Path tiles when the tutorial started. */
  startPaths: number;
  guests: number;
  /** Money taken from ride tickets so far. */
  rideIncome: number;
  /** Panels the player has opened at least once. */
  opened: ReadonlySet<string>;
  /** Whether the camera has moved or turned. */
  cameraMoved: boolean;
}

export interface TutorialStep {
  id: string;
  title: string;
  text: string;
  /** Shown under the text, in the style of a keyboard hint. */
  hint?: string;
  done(ctx: TutorialContext): boolean;
}

export function pathCount(park: Park): number {
  let n = 0;
  for (const p of park.terrain.paths) if (p) n++;
  return n;
}

const has = (park: Park, test: (kind: string, type: string) => boolean) =>
  park.buildings.some((b) => test(buildingType(b.type).kind, b.type));

export const TUTORIAL: TutorialStep[] = [
  {
    id: 'camera',
    title: 'Look around',
    text: 'This field is your new park. Move the view to get your bearings.',
    hint: 'W A S D or right-drag to move · Q / E to turn · scroll to zoom',
    done: (c) => c.cameraMoved,
  },
  {
    id: 'path',
    title: 'Lay a path',
    text: 'Guests only walk on paths. Pick the Path tool and drag out from the end of the entrance path.',
    hint: 'Path tool (5), then drag on the ground',
    done: (c) => pathCount(c.park) >= c.startPaths + 4,
  },
  {
    id: 'ride',
    title: 'Build a ride',
    text: 'Open Rides & stalls and place a Carousel beside your path. Turn its entrance with R so it faces the path.',
    hint: 'Rides & stalls (B) · R to turn the entrance',
    done: (c) => has(c.park, (kind, type) => kind === 'ride' && !buildingType(type).custom),
  },
  {
    id: 'riders',
    title: 'Welcome your first riders',
    text: 'Guests arrive at the gate and look for things to do. Once one rides your carousel, the ticket money comes in.',
    hint: 'Watch the cash in the top bar',
    done: (c) => c.rideIncome > 0,
  },
  {
    id: 'food',
    title: 'Feed them',
    text: 'Hungry and thirsty guests get grumpy. Build a Burger Stand and a Lemonade Stand next to a path.',
    done: (c) => has(c.park, (k) => k === 'food') && has(c.park, (k) => k === 'drink'),
  },
  {
    id: 'restrooms',
    title: 'Restrooms',
    text: 'What goes in must come out. Add Restrooms so guests don\'t leave in a hurry.',
    done: (c) => has(c.park, (k) => k === 'toilet'),
  },
  {
    id: 'staff',
    title: 'Hire a handyman',
    text: 'Guests drop litter, and dirty paths drag the park rating down. Hire a handyman to sweep up, and add a bin or two.',
    hint: 'Staff button · Bin tool (8)',
    done: (c) => c.park.staff.handymen > 0,
  },
  {
    id: 'thoughts',
    title: 'Listen to your guests',
    text: 'Click the ★ rating in the top bar to see what guests think and what drives your park rating.',
    done: (c) => c.opened.has('park'),
  },
  {
    id: 'manage',
    title: 'Mind the money',
    text: 'Open Manage to see your accounts, take a loan, set an entry fee, run adverts and choose what to research next.',
    done: (c) => c.opened.has('manage'),
  },
  {
    id: 'coaster',
    title: 'Build a coaster',
    text: 'Open the Coaster builder, place a station on open ground, press "Build sample" (or lay your own), test it and open it.',
    hint: 'Coaster builder (C)',
    done: (c) => c.park.buildings.some((b) => b.coaster !== undefined),
  },
  {
    id: 'goal',
    title: 'Reach the goal',
    text: 'That\'s the basics. Grow the park until you meet the goal in the Goal panel, and you\'ve passed your first scenario.',
    done: () => false,
  },
];

/** Index of the first step not yet done (steps stay done once done). */
export class TutorialProgress {
  readonly done = new Set<string>();
  index = 0;

  update(ctx: TutorialContext): number {
    for (const step of TUTORIAL) if (!this.done.has(step.id) && step.done(ctx)) this.done.add(step.id);
    const next = TUTORIAL.findIndex((s) => !this.done.has(s.id));
    this.index = next < 0 ? TUTORIAL.length - 1 : next;
    return this.index;
  }

  /** Move past a step without doing it. */
  skip(): void {
    const step = TUTORIAL[this.index];
    if (step && step.id !== 'goal') this.done.add(step.id);
    const next = TUTORIAL.findIndex((s) => !this.done.has(s.id));
    this.index = next < 0 ? TUTORIAL.length - 1 : next;
  }
}
