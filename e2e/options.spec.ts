import { expect, test } from '@playwright/test';

test('sound and display options are remembered', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/?scenario=sandbox');
  await page.getByRole('button', { name: 'Got it' }).click();
  await expect(page.getByTestId('weather')).toHaveAttribute('title', /Weather: (Sunny|Cloudy|Rain)/);

  await page.getByTestId('options').click();
  const panel = page.getByTestId('options-panel');
  await expect(panel).toBeVisible();
  // Volume first: the sliders are disabled while muted.
  await page.locator('[data-volume="music"]').fill('0.2');
  await expect(panel).toContainText('20%');
  await page.getByTestId('mute').check();
  await expect(page.locator('[data-volume="music"]')).toBeDisabled();
  await page.getByTestId('day-night').uncheck();

  await page.reload();
  await page.getByRole('button', { name: 'Got it' }).click();
  await page.getByTestId('options').click();
  await expect(page.getByTestId('mute')).toBeChecked();
  await expect(page.getByTestId('day-night')).not.toBeChecked();
  expect(errors).toEqual([]);
});
