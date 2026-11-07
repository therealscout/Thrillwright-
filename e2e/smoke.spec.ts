import { expect, test } from '@playwright/test';

test('game loads, renders and responds to camera controls', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');
  await expect(page.getByText('Thrillwright', { exact: true })).toBeVisible();

  // The FPS counter updates once the render loop is running.
  await expect(page.getByTestId('fps')).toHaveText(/\d+ fps/, { timeout: 10_000 });

  await page.keyboard.press('e');
  await expect(page.getByTestId('status')).toContainText('South-east');

  await page.mouse.move(400, 400);
  await expect(page.getByTestId('status')).toContainText(/Tile: \d+, \d+/);

  expect(errors).toEqual([]);
});
