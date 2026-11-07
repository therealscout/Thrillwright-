import { expect, test } from '@playwright/test';

interface Hooks {
  thrillwright: {
    goals: { check(s: Record<string, number>): string };
  };
}

test('choosing a scenario, following the tutorial and winning', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/');
  const menu = page.getByTestId('scenario-select');
  await expect(menu).toBeVisible();
  // Later parks are locked until the earlier ones are finished.
  await page.locator('[data-scenario="lakeshore"]').click();
  await expect(menu).toContainText('Finish Meadowbrook Green to unlock');
  await expect(page.getByTestId('play')).toHaveCount(0);

  await page.locator('[data-scenario="first-steps"]').click();
  await page.getByTestId('play').click();
  await expect(page.getByTestId('tutorial')).toBeVisible();
  await expect(page.getByTestId('tutorial-title')).toHaveText('Look around');
  await page.keyboard.down('w');
  await page.waitForTimeout(300);
  await page.keyboard.up('w');
  await expect(page.getByTestId('tutorial-title')).toHaveText('Lay a path');

  // The goal panel lists what's needed.
  await page.getByTestId('goal').click();
  await expect(page.getByTestId('goal-panel')).toContainText('60 guests in the park');
  await expect(page.getByTestId('goal-panel')).toContainText('End of October, Year 1');

  // Meet the goal (the parts are covered by unit tests) and win.
  await page.evaluate(() => (window as unknown as Hooks).thrillwright.goals.check({ guests: 80, rating: 60, bestCoaster: 0, bestMonthProfit: 0, loan: 0, monthIndex: 1 }));
  await expect(page.getByTestId('outcome')).toContainText('Scenario complete!');
  await page.getByRole('button', { name: 'Next scenario' }).click();
  await expect(menu).toBeVisible();
  await expect(page.locator('[data-scenario="first-steps"]')).toContainText('✓');

  await page.locator('[data-scenario="meadowbrook"]').click();
  await page.getByTestId('play').click();
  await expect(page.getByTestId('tutorial')).toHaveCount(0);
  await page.getByTestId('goal').click();
  await expect(page.getByTestId('goal-panel')).toContainText('Meadowbrook Green');
  await expect(page.getByTestId('goal-panel')).toContainText('250 guests in the park');
  expect(errors).toEqual([]);
});
