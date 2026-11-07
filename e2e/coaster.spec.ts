import { expect, test } from '@playwright/test';

interface Hooks {
  thrillwright: {
    coaster: { placeStation(tile: { tx: number; ty: number }): { ok: boolean } };
    park: { buildings: Array<{ type: string }> };
  };
}

test('designing, testing and opening a coaster', async ({ page }) => {
  // Many UI steps on a software-rendered page: allow more than the default time.
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/?scenario=sandbox');
  await page.getByRole('button', { name: 'Got it' }).click();
  await page.locator('[data-tool="build"]').click();
  await page.locator('[data-build="steel-coaster"]').click();
  await expect(page.getByTestId('coaster-builder')).toContainText('place the three-tile station');

  // Clicking the map is covered by unit tests; place the station on open ground directly.
  const placed = await page.evaluate(() => (window as unknown as Hooks).thrillwright.coaster.placeStation({ tx: 33, ty: 70 }).ok);
  expect(placed).toBe(true);
  await expect(page.getByTestId('coaster-status')).toContainText('0 pieces');
  await page.locator('[data-piece="straight"]').click();
  await expect(page.getByTestId('coaster-status')).toContainText('1 pieces');
  await page.getByRole('button', { name: 'Remove last piece' }).click();

  await page.getByTestId('coaster-sample').click();
  await expect(page.getByTestId('coaster-status')).toHaveText('Circuit complete');
  await page.getByRole('button', { name: 'Left side' }).click();
  await page.getByTestId('coaster-test').click();
  await expect(page.getByTestId('coaster-ratings')).toContainText('Excitement');
  await page.getByTestId('coaster-open').click();
  await expect(page.getByTestId('coaster-builder')).toHaveCount(0);
  const types = await page.evaluate(() => (window as unknown as Hooks).thrillwright.park.buildings.map((b) => b.type));
  expect(types).toEqual(['steel-coaster']);
  expect(errors).toEqual([]);
});
