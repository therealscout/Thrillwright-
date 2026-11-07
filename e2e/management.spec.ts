import { expect, test } from '@playwright/test';

interface Hooks {
  thrillwright: {
    management: { advance(seconds: number): void; isUnlocked(id: string): boolean; setFunding(level: number): void };
  };
}

test('finances, marketing and research in the Manage window', async ({ page }) => {
  // Many UI steps on a software-rendered page, often beside another test.
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/?scenario=meadowbrook');
  await page.getByRole('button', { name: 'Got it' }).click();
  await expect(page.getByTestId('date')).toContainText('March, Year 1');
  // Hold research until the test is ready for it (software rendering is slow).
  await page.evaluate(() => (window as unknown as Hooks).thrillwright.management.setFunding(0));

  // Locked rides stay out of the build menu until researched.
  await page.locator('[data-tool="build"]').click();
  await expect(page.locator('[data-build="popcorn-cart"]')).toHaveCount(0);
  await expect(page.getByTestId('locked-count')).toContainText('to discover');
  await page.locator('[data-tool="build"]').click();

  await page.locator('[data-tool="manage"]').click();
  const panel = page.getByTestId('manage-panel');
  await expect(panel).toBeVisible();

  // Borrow, then pay it back.
  const cashBefore = await page.getByTestId('cash').textContent();
  await page.getByTestId('borrow').click();
  await expect(page.getByTestId('loan')).toHaveText('$6,000');
  await expect(page.getByTestId('cash')).not.toHaveText(cashBefore ?? '');
  await page.getByTestId('repay').click();
  await expect(page.getByTestId('loan')).toHaveText('$5,000');

  // Entry fee.
  await page.getByRole('button', { name: 'Raise entry fee' }).click();
  await page.getByRole('button', { name: 'Raise entry fee' }).click();
  await expect(page.getByTestId('entry-fee')).toHaveText('$2');
  await expect(page.getByTestId('profit-chart')).toBeVisible();
  await page.getByTestId('chart-toggle').click();
  await expect(panel.locator('table')).toHaveCount(2);

  // Marketing.
  await panel.locator('[data-tab="marketing"]').click();
  await panel.locator('[data-campaign="flyers"]').click();
  await expect(page.getByTestId('campaign-flyers')).toContainText('days left');

  // Research: let time pass and the first item becomes available.
  await panel.locator('[data-tab="research"]').click();
  await expect(page.getByTestId('research-current')).toContainText('Popcorn Cart');
  await expect(page.getByTestId('research-current')).toContainText('Waiting for funding');
  await panel.locator('[data-funding="normal"]').click();
  await page.evaluate(() => (window as unknown as Hooks).thrillwright.management.advance(70));
  await expect(page.getByTestId('research-current')).toContainText('Swing Tower');
  await page.locator('[data-tool="build"]').click();
  await expect(page.locator('[data-build="popcorn-cart"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});
