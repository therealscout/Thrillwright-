/** What guests think rides are worth. */

/** Most a typical guest will pay for a ride this exciting, in dollars. */
export function fairPrice(excitement: number): number {
  return excitement * 0.9 + 1.5;
}

/** A ticket price nearly every guest will pay for a ride this exciting (whole or half dollars). */
export function suggestedTicket(excitement: number): number {
  return Math.max(1, Math.min(20, Math.floor((fairPrice(excitement) - 0.5) * 2) / 2));
}
