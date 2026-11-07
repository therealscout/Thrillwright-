export const count = new Intl.NumberFormat('en-US');
export const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
export const price = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

/** A 0..10 rating with one decimal. */
export const rating = (v: number | undefined) => (v ?? 0).toFixed(1);
