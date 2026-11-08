/**
 * Every ride and stall the player can build. All names and numbers are
 * original to Thrillwright. Ratings use a 0 to 10 scale.
 */

export type BuildingKind = 'ride' | 'food' | 'drink' | 'toilet';

export interface BuildingType {
  id: string;
  name: string;
  kind: BuildingKind;
  /** Footprint in tiles (square). */
  size: number;
  /** Build price in dollars. */
  cost: number;
  /** Default ticket or item price. */
  price: number;
  description: string;
  // Rides only.
  excitement?: number;
  intensity?: number;
  nausea?: number;
  /** Riders per cycle. */
  capacity?: number;
  /** Seconds per ride cycle. */
  cycle?: number;
  // Stalls only: how much of a need one purchase satisfies (0..255).
  satisfies?: number;
  /** Track rides: designed in the coaster builder, priced per piece and rated by a test run. */
  custom?: boolean;
}

export const CATALOG: BuildingType[] = [
  {
    id: 'carousel', name: 'Carousel', kind: 'ride', size: 3, cost: 900, price: 2,
    description: 'Gentle and charming. Every park needs one.',
    excitement: 3.1, intensity: 1.0, nausea: 0.6, capacity: 16, cycle: 25,
  },
  {
    id: 'spin-cups', name: 'Spinning Cups', kind: 'ride', size: 3, cost: 1100, price: 2,
    description: 'Twirling cups. Fun, but not right after lunch.',
    excitement: 3.8, intensity: 3.2, nausea: 4.6, capacity: 12, cycle: 30,
  },
  {
    id: 'swing-tower', name: 'Swing Tower', kind: 'ride', size: 3, cost: 1600, price: 3,
    description: 'Chair swings fly out as the top spins.',
    excitement: 4.6, intensity: 4.1, nausea: 2.8, capacity: 16, cycle: 35,
  },
  {
    id: 'sky-wheel', name: 'Sky Wheel', kind: 'ride', size: 3, cost: 1800, price: 3,
    description: 'A slow, tall wheel with views of the whole park.',
    excitement: 3.5, intensity: 0.8, nausea: 0.4, capacity: 16, cycle: 60,
  },
  {
    id: 'drop-tower', name: 'Drop Tower', kind: 'ride', size: 3, cost: 2400, price: 4,
    description: 'Up slowly, down very fast. Thrill-seekers love it.',
    excitement: 5.8, intensity: 7.5, nausea: 3.6, capacity: 12, cycle: 30,
  },
  {
    id: 'bumper-cars', name: 'Bumper Cars', kind: 'ride', size: 3, cost: 1300, price: 2,
    description: 'Little electric cars, a big rubber bumper, and no rules about steering.',
    excitement: 3.9, intensity: 2.2, nausea: 0.8, capacity: 12, cycle: 40,
  },
  {
    id: 'ghost-manor', name: 'Ghost Manor', kind: 'ride', size: 3, cost: 1700, price: 3,
    description: 'A slow ride through a creaky old house. More giggles than screams.',
    excitement: 4.3, intensity: 1.8, nausea: 0.5, capacity: 16, cycle: 50,
  },
  {
    id: 'swinging-galleon', name: 'Swinging Galleon', kind: 'ride', size: 3, cost: 2000, price: 3,
    description: 'A big wooden boat that swings higher and higher until it nearly tips over.',
    excitement: 5.0, intensity: 5.3, nausea: 4.2, capacity: 20, cycle: 40,
  },
  {
    id: 'whirlwind', name: 'Whirlwind', kind: 'ride', size: 3, cost: 2300, price: 4,
    description: 'A ring of gondolas spins fast, then tilts up on its side.',
    excitement: 5.4, intensity: 6.3, nausea: 6.0, capacity: 16, cycle: 35,
  },
  {
    id: 'steel-coaster', name: 'Steel Coaster', kind: 'ride', size: 1, cost: 0, price: 5, custom: true,
    description: 'Design your own track: lift hills, drops, turns and loops. Priced per piece.',
  },
  {
    id: 'junior-coaster', name: 'Little Dipper', kind: 'ride', size: 1, cost: 0, price: 3, custom: true,
    description: 'A small, gentle coaster with tight little turns. Good for everyone.',
  },
  {
    id: 'wild-mouse', name: 'Zippy Mouse', kind: 'ride', size: 1, cost: 0, price: 4, custom: true,
    description: 'Small cars whip round hairpin turns that feel far too tight.',
  },
  {
    id: 'wooden-coaster', name: 'Timber Twister', kind: 'ride', size: 1, cost: 0, price: 5, custom: true,
    description: 'A rattling wooden classic with big hills and lots of airtime. No loops.',
  },
  {
    id: 'inverted-coaster', name: 'Skyhanger', kind: 'ride', size: 1, cost: 0, price: 6, custom: true,
    description: 'Riders hang below the track with their feet in the air. Loops allowed.',
  },
  {
    id: 'burger-stand', name: 'Burger Stand', kind: 'food', size: 1, cost: 300, price: 3,
    description: 'Hearty food for hungry guests.', satisfies: 150,
  },
  {
    id: 'popcorn-cart', name: 'Popcorn Cart', kind: 'food', size: 1, cost: 200, price: 2,
    description: 'A light snack.', satisfies: 80,
  },
  {
    id: 'lemonade-stand', name: 'Lemonade Stand', kind: 'drink', size: 1, cost: 250, price: 2,
    description: 'Cold drinks on a hot day.', satisfies: 160,
  },
  {
    id: 'ice-cream-cart', name: 'Ice Cream Cart', kind: 'food', size: 1, cost: 250, price: 2,
    description: 'A sweet treat. Not very filling.', satisfies: 70,
  },
  {
    id: 'coffee-kiosk', name: 'Coffee Kiosk', kind: 'drink', size: 1, cost: 300, price: 2,
    description: 'Hot drinks that perk tired guests up.', satisfies: 120,
  },
  {
    id: 'hot-dog-cart', name: 'Hot Dog Cart', kind: 'food', size: 1, cost: 250, price: 3,
    description: 'A quick, filling bite.', satisfies: 130,
  },
  {
    id: 'pizza-stand', name: 'Pizza Slice Stand', kind: 'food', size: 1, cost: 350, price: 3,
    description: 'Big cheesy slices. Very filling.', satisfies: 170,
  },
  {
    id: 'candy-floss', name: 'Candy Floss Cart', kind: 'food', size: 1, cost: 200, price: 2,
    description: 'Spun sugar on a stick. Kids love it.', satisfies: 60,
  },
  {
    id: 'smoothie-bar', name: 'Smoothie Bar', kind: 'drink', size: 1, cost: 350, price: 3,
    description: 'Fruit smoothies. Pricier, but they really hit the spot.', satisfies: 190,
  },
  {
    id: 'restrooms', name: 'Restrooms', kind: 'toilet', size: 1, cost: 400, price: 0,
    description: 'Guests who need to go will thank you.', satisfies: 255,
  },
];

const byId = new Map(CATALOG.map((t) => [t.id, t]));

export function buildingType(id: string): BuildingType {
  const t = byId.get(id);
  if (!t) throw new Error(`Unknown building type: ${id}`);
  return t;
}
