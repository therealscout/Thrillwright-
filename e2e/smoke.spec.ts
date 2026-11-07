import { expect, test } from '@playwright/test';

test('game loads, renders and responds to camera controls', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto('/');
  await expect(page.getByText('Thrillwright', { exact: true })).toBeVisible();

  // The FPS counter updates once the render loop is running.
  await expect(page.getByTestId('fps')).toHaveText(/\d+ fps/, { timeout: 10_000 });

  await page.keyboard.press('e');
  await expect(page.getByTestId('status')).toContainText('South-east');

  await page.mouse.move(640, 300);
  await expect(page.getByTestId('status')).toContainText(/Tile: \d+, \d+/);

  expect(errors).toEqual([]);
});

test('building a path costs money and can be undone', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Got it' }).click();
  const cash = page.getByTestId('cash');
  await expect(cash).toHaveText('$20,000');

  await page.locator('[data-tool="path"]').click();
  await expect(page.getByTestId('hint')).toContainText('Path');
  await page.mouse.move(640, 300);
  await page.mouse.down();
  await page.mouse.move(660, 300, { steps: 4 });
  await page.mouse.up();
  await expect(cash).not.toHaveText('$20,000');

  await page.keyboard.press('Control+z');
  await expect(cash).toHaveText('$20,000');
});

test('guests arrive at the entrance', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('guests')).not.toHaveText('0 guests', { timeout: 10_000 });
});

test('performance test fills the park with thousands of guests', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/?bench=5000');
  await expect(page.getByTestId('perf-guests')).toHaveText('5,000', { timeout: 15_000 });
  // The worker reports its own tick time; it must stay far below the 50 ms budget.
  await expect(page.getByTestId('perf-tick')).toHaveText(/^\d\.\d\d ms per tick$/);
  expect(errors).toEqual([]);
});

test('building a stall from the menu and inspecting it', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Got it' }).click();
  await page.locator('[data-tool="build"]').click();
  await expect(page.getByTestId('build-menu')).toBeVisible();
  await page.locator('[data-build="restrooms"]').click();
  await expect(page.getByTestId('hint')).toContainText('Restrooms');

  // The view starts centred just past the end of the entrance path.
  const box = page.locator('#game');
  const size = (await box.boundingBox())!;
  await page.mouse.move(size.width / 2, size.height / 2);
  await page.mouse.click(size.width / 2, size.height / 2);
  await expect.poll(() => page.evaluate(() => (window as unknown as { thrillwright: { park: { buildings: unknown[] } } }).thrillwright.park.buildings.length)).toBe(1);
  await expect(page.getByTestId('cash')).toHaveText('$19,600');

  // Inspect it with the Look tool.
  await page.keyboard.press('Escape');
  await page.mouse.click(size.width / 2, size.height / 2);
  await expect(page.getByTestId('building-info')).toContainText('Restrooms');
  expect(errors).toEqual([]);
});
