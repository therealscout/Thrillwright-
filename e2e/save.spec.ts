import { expect, test } from '@playwright/test';

interface Hooks {
  thrillwright: {
    park: {
      buildings: Array<{ type: string }>;
      placeBuilding(type: string, at: { tx: number; ty: number }, facing: number): { ok: boolean };
      applyOnce(tool: string, tiles: Array<{ tx: number; ty: number }>): { ok: boolean };
    };
    management: { loan: number; borrow(n: number): boolean };
  };
}

test('saving a park and continuing it later', async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/#scenario=meadowbrook');
  await page.getByRole('button', { name: 'Got it' }).click();
  const placed = await page.evaluate(() => {
    const t = (window as unknown as Hooks).thrillwright;
    const path = t.park.applyOnce('path', [{ tx: 48, ty: 79 }, { tx: 48, ty: 78 }]).ok;
    const ride = t.park.placeBuilding('carousel', { tx: 49, ty: 78 }, 3).ok;
    t.management.borrow(2000);
    return path && ride;
  });
  expect(placed).toBe(true);
  await page.getByTestId('save').click();
  await expect(page.getByRole('status')).toContainText('Game saved');

  // Back to the menu: Continue picks up where we left off.
  await page.evaluate(() => {
    location.hash = '';
  });
  await page.reload();
  await expect(page.getByTestId('continue')).toBeVisible();
  await expect(page.getByTestId('scenario-select')).toContainText('Meadowbrook Green');
  await page.getByTestId('continue').click();
  await expect(page.getByRole('status')).toContainText('Welcome back');
  const state = await page.evaluate(() => {
    const t = (window as unknown as Hooks).thrillwright;
    return { types: t.park.buildings.map((b) => b.type), loan: t.management.loan };
  });
  expect(state.types).toEqual(['carousel']);
  expect(state.loan).toBe(7000);

  // Graphics settings apply without errors.
  await page.getByTestId('options').click();
  await page.locator('[data-quality="low"]').click();
  await page.locator('[data-ui-scale="1.3"]').click();
  await page.locator('[data-quality="high"]').click();
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});
