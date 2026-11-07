/** Build prices in dollars. Tuned later with the economy (milestone 7). */
export const COSTS = {
  /** Per corner, per height step moved. */
  landStep: 4,
  /** Per tile, per water step. */
  waterStep: 6,
  path: 12,
  landPurchase: 40,
  bin: 40,
  bench: 60,
} as const;

/** Staff wages in dollars per minute of play. */
export const WAGES = {
  handyman: 15,
  mechanic: 20,
} as const;

export const STARTING_CASH = 20_000;
