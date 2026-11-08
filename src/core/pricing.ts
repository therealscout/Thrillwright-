/** What guests think rides are worth. */

/** Most a typical guest will pay for a ride this exciting, in dollars. */
export function fairPrice(excitement: number): number {
  return excitement * 0.9 + 1.5;
}

/** A ticket price nearly every guest will pay for a ride this exciting (whole or half dollars). */
export function suggestedTicket(excitement: number): number {
  return Math.max(1, Math.min(20, Math.floor((fairPrice(excitement) - 0.5) * 2) / 2));
}

/** How much more intense than they like a ride may be before a guest refuses it. */
export const INTENSITY_MARGIN = 3;

/**
 * Share of guests (0..1) brave enough for a ride this intense. Guests' liking
 * runs from 1.5 to 8.5, mostly at the gentle end (see GuestStore.spawn).
 */
export function riderShare(intensity: number): number {
  const need = (intensity - INTENSITY_MARGIN - 1.5) / 7;
  if (need <= 0) return 1;
  if (need >= 1) return 0;
  return 1 - Math.pow(need, 1 / 1.4);
}
