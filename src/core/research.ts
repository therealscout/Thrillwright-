/**
 * The research tree: rides, stalls and coaster pieces the park unlocks over
 * time by funding research. All names are original to Thrillwright.
 */

export type ResearchCategory = 'gentle' | 'thrill' | 'coaster' | 'shops';

export interface ResearchItem {
  id: string;
  name: string;
  category: ResearchCategory;
  /** Research points needed. */
  cost: number;
  /** What it unlocks: a building type id, or a coaster feature. */
  unlocks: string;
}

export const CATEGORY_NAMES: Record<ResearchCategory, string> = {
  gentle: 'Gentle rides',
  thrill: 'Thrill rides',
  coaster: 'Roller coasters',
  shops: 'Shops and stalls',
};

/** Coaster features that research can unlock. */
export const COASTER_FEATURES = ['banked-turns', 'loop'] as const;
export type CoasterFeature = (typeof COASTER_FEATURES)[number];

/** In the order the lab works through them, within each category. */
export const RESEARCH: ResearchItem[] = [
  { id: 'r-popcorn', name: 'Popcorn Cart', category: 'shops', cost: 120, unlocks: 'popcorn-cart' },
  { id: 'r-swing', name: 'Swing Tower', category: 'thrill', cost: 240, unlocks: 'swing-tower' },
  { id: 'r-bank', name: 'Banked turns', category: 'coaster', cost: 240, unlocks: 'banked-turns' },
  { id: 'r-wheel', name: 'Sky Wheel', category: 'gentle', cost: 300, unlocks: 'sky-wheel' },
  { id: 'r-icecream', name: 'Ice Cream Cart', category: 'shops', cost: 260, unlocks: 'ice-cream-cart' },
  { id: 'r-loop', name: 'Vertical loop', category: 'coaster', cost: 420, unlocks: 'loop' },
  { id: 'r-drop', name: 'Drop Tower', category: 'thrill', cost: 480, unlocks: 'drop-tower' },
  { id: 'r-coffee', name: 'Coffee Kiosk', category: 'shops', cost: 360, unlocks: 'coffee-kiosk' },
];

/** Available from the start in a fresh sandbox park. */
export const STARTING_UNLOCKS = ['carousel', 'spin-cups', 'burger-stand', 'lemonade-stand', 'restrooms', 'steel-coaster'];

export const FUNDING = [
  { name: 'None', perMonth: 0, points: 0 },
  { name: 'Low', perMonth: 150, points: 1 },
  { name: 'Normal', perMonth: 300, points: 2 },
  { name: 'High', perMonth: 600, points: 3.5 },
] as const;
