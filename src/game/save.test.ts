import { describe, expect, it } from 'vitest';
import { tileIndex } from '../core/terrain';
import { Management, MONTH_SECONDS } from './management';
import { Park } from './park';
import { applySave, isSave, makeSave, packBytes, terrainFromSave, unpackBytes } from './save';
import { createStarterTerrain, starterLayout } from './starter-park';

describe('Save games', () => {
  it('packs bytes and unpacks them unchanged', () => {
    const bytes = new Uint8Array(5000);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 700 < 600 ? 4 : (i * 7) % 256;
    expect(unpackBytes(packBytes(bytes), bytes.length)).toEqual(bytes);
    // Flat land packs small.
    expect(packBytes(new Uint8Array(9409).fill(4)).length).toBeLessThan(200);
  });

  it('brings back the land, buildings, money and research', () => {
    const park = new Park(createStarterTerrain(), 30_000);
    const m = new Management(park);
    const { tx, ty } = starterLayout().entrance;
    park.applyOnce('path', [{ tx, ty: ty - 14 }, { tx, ty: ty - 15 }]);
    park.placeBuilding('carousel', { tx: tx + 1, ty: ty - 20 }, 3);
    park.setStaff('handymen', 2);
    m.borrow(4000);
    m.setEntryFee(6);
    m.startCampaign('tv', 3);
    m.advance(MONTH_SECONDS * 1.5);
    const save = JSON.parse(JSON.stringify(makeSave({ scenario: 'meadowbrook', park, management: m, outcome: 'playing', weather: 'rain' }))) as unknown;
    expect(isSave(save)).toBe(true);
    if (!isSave(save)) return;

    const terrain = terrainFromSave(save);
    expect(terrain.paths[tileIndex(terrain, tx, ty - 15)]).toBe(1);
    expect(terrain.corners).toEqual(park.terrain.corners);
    expect(terrain.owned).toEqual(park.terrain.owned);
    const park2 = new Park(terrain, 0);
    const m2 = new Management(park2);
    applySave(save, park2, m2);
    expect(park2.cash).toBeCloseTo(park.cash, 6);
    expect(park2.buildings).toEqual(park.buildings);
    expect(park2.staff).toEqual({ handymen: 2, mechanics: 0 });
    expect(m2.loan).toBe(4000);
    expect(m2.entryFee).toBe(6);
    expect(m2.date).toEqual(m.date);
    expect(m2.campaigns.get('tv')).toBeCloseTo(m.campaigns.get('tv')!);
    expect([...m2.researched]).toEqual([...m.researched]);
    expect(m2.progress).toBeCloseTo(m.progress);
    expect(m2.months).toEqual(m.months);
    expect(save.dateText).toBe(`${m.date.day} ${m.date.month}, Year ${m.date.year}`);

    // New buildings get fresh ids, and money keeps being booked to the right month.
    const placed = park2.placeBuilding('spin-cups', { tx: tx + 1, ty: ty - 26 }, 3);
    expect(placed.building!.id).toBeGreaterThan(park.buildings[0]!.id);
    park2.earn(10, 'rides');
    expect(m2.months[m2.months.length - 1]!.amounts.rides).toBeCloseTo(m.months[m.months.length - 1]!.amounts.rides + 10);
  });

  it('rejects things that are not saves', () => {
    expect(isSave(null)).toBe(false);
    expect(isSave({ version: 99 })).toBe(false);
    expect(isSave({ version: 1, scenario: 'x', terrain: { width: 2 } })).toBe(false);
  });
});
