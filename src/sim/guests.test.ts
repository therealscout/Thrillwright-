import { describe, expect, it } from 'vitest';
import { GuestStore } from './guests';

describe('GuestStore', () => {
  it('adds guests up to capacity', () => {
    const g = new GuestStore(2);
    expect(g.add(1, 1, 7)).toBe(0);
    expect(g.add(2, 2, 8)).toBe(1);
    expect(g.add(3, 3, 9)).toBe(-1);
  });

  it('keeps rows dense and ids stable on removal', () => {
    const g = new GuestStore(4);
    g.add(0, 0, 1);
    g.add(1, 0, 2);
    g.add(2, 0, 3);
    const lastId = g.id[2];
    g.remove(0);
    expect(g.count).toBe(2);
    expect(g.id[0]).toBe(lastId);
    expect(g.fromX[0]).toBe(2);
  });

  it('gives guests varied but deterministic traits', () => {
    const a = new GuestStore(1);
    const b = new GuestStore(1);
    a.add(0, 0, 42);
    b.add(0, 0, 42);
    expect(a.speed[0]).toBe(b.speed[0]);
    expect(a.speed[0]).toBeGreaterThanOrEqual(1);
    expect(a.speed[0]).toBeLessThan(1.5);
  });
});
