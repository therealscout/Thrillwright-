import { expect, test } from '@playwright/test';

test('hiring staff, checking the park rating and choosing the bin tool', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Got it' }).click();

  await page.locator('[data-tool="staff"]').click();
  await expect(page.getByTestId('staff-panel')).toBeVisible();
  await page.getByRole('button', { name: 'Hire a handyman' }).click();
  await page.getByRole('button', { name: 'Hire a mechanic' }).click();
  await expect(page.getByTestId('staff-handymen')).toHaveText('1');
  await expect(page.getByTestId('staff-mechanics')).toHaveText('1');
  await expect(page.getByTestId('staff-panel')).toContainText('$35 per minute');

  await page.getByTestId('rating').click();
  await expect(page.getByTestId('park-panel')).toBeVisible();
  await expect(page.getByTestId('park-rating')).toHaveText(/^\d+$/);

  await page.keyboard.press('8');
  await expect(page.getByTestId('hint')).toContainText('Bin');
  expect(errors).toEqual([]);
});
