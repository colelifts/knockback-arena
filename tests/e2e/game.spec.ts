import { expect, test } from '@playwright/test';

test('main menu loads and bot match is playable', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /knockback arena/i })).toBeVisible();
  await page.getByRole('button', { name: /play against bot/i }).click();
  await expect(page.getByText('Choose your fighter')).toBeVisible();
  await page.getByRole('button', { name: /start bot match/i }).click();
  await expect(page.locator('#game-canvas')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__KA_TEST__?.state().running)).toBe(true);
  await expect
    .poll(() => page.evaluate(() => window.__KA_TEST__?.state().phase), { timeout: 5_000 })
    .toBe('playing');
  const before = await page.evaluate(() => window.__KA_TEST__?.state().position);
  await page.evaluate(() => window.__KA_TEST__?.key('KeyW', true));
  await page.waitForTimeout(550);
  await page.evaluate(() => window.__KA_TEST__?.key('KeyW', false));
  const after = await page.evaluate(() => window.__KA_TEST__?.state().position);
  expect(after?.y).toBeGreaterThan(0);
  expect(
    Math.hypot((after?.x ?? 0) - (before?.x ?? 0), (after?.z ?? 0) - (before?.z ?? 0)),
  ).toBeGreaterThan(0.05);
  await page.evaluate(() => window.__KA_TEST__?.punch());
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: /take a breath/i })).toBeVisible();
});

test('settings persist and private room codes validate', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  const invert = page.getByText('INVERT Y').locator('input');
  await invert.check();
  await page.getByRole('button', { name: /back/i }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByText('INVERT Y').locator('input')).toBeChecked();
  await page.getByRole('button', { name: /back/i }).click();
  await page.getByRole('button', { name: /online/i }).click();
  await page.getByRole('button', { name: /continue online/i }).click();
  await page.getByLabel('Room code').fill('BAD!');
  await page.getByRole('button', { name: 'JOIN' }).click();
  await expect(page.getByText(/valid 5-character room code/i)).toBeVisible();
});
