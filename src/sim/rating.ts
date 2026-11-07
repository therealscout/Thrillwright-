/**
 * The park rating, 0 to 100. It sums up how guests feel about the park and
 * decides how many new guests want to visit.
 */

export interface RatingInputs {
  guests: number;
  /** Average happiness 0..255. */
  happiness: number;
  /** Rides open to guests. */
  rides: number;
  /** Different kinds of ride (variety). */
  rideKinds: number;
  /** Path tiles with litter or sick on them. */
  dirtyTiles: number;
  /** Rides currently broken down. */
  brokenRides: number;
  /** Guests who left unhappy in the last few minutes. */
  unhappyLeavers: number;
}

export interface RatingParts {
  base: number;
  happiness: number;
  rides: number;
  cleanliness: number;
  breakdowns: number;
  departures: number;
}

export function ratingParts(r: RatingInputs): RatingParts {
  return {
    base: 40,
    happiness: r.guests > 0 ? Math.round((r.happiness / 255 - 0.6) * 75) : 0,
    rides: r.rides === 0 ? -15 : Math.min(14, r.rides * 2) + Math.min(10, r.rideKinds * 2),
    cleanliness: -Math.min(25, Math.round(r.dirtyTiles * 0.6)),
    breakdowns: -Math.min(20, r.brokenRides * 5),
    departures: -Math.min(15, Math.round(r.unhappyLeavers * 0.5)),
  };
}

/** The rating the park is heading towards right now. */
export function targetRating(r: RatingInputs): number {
  const p = ratingParts(r);
  const sum = p.base + p.happiness + p.rides + p.cleanliness + p.breakdowns + p.departures;
  return Math.max(0, Math.min(100, sum));
}

/** How the rating scales arrivals and the guest cap (1 at a rating of 60). */
export function demandFactor(rating: number): number {
  return 0.25 + (rating / 60) * 0.75;
}
