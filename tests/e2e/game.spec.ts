import { expect, test } from '@playwright/test';

test('main menu loads and bot match is playable', async ({ page }) => {
  const failedAssets: string[] = [];
  page.on('response', (response) => {
    if (response.url().includes('/assets/') && !response.ok()) failedAssets.push(response.url());
  });
  await page.goto('/?debug=1');
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
  await page.waitForTimeout(1000);
  await page.evaluate(() => window.__KA_TEST__?.key('KeyW', false));
  const after = await page.evaluate(() => window.__KA_TEST__?.state().position);
  expect(after?.y).toBeGreaterThan(0);
  expect(
    Math.hypot((after?.x ?? 0) - (before?.x ?? 0), (after?.z ?? 0) - (before?.z ?? 0)),
  ).toBeGreaterThan(4.5);
  const debug = await page.getByTestId('debug-overlay').textContent();
  expect(debug).toMatch(/draws \d+ \| triangles \d+/);
  expect(debug).toMatch(/physics \d+\.\d+ ms/);
  const performanceState = await page.evaluate(() => window.__KA_TEST__?.state().debug);
  expect(performanceState?.bodies).toBeLessThan(40);
  expect(performanceState?.draws).toBeLessThan(80);
  expect(performanceState?.frameP95Ms).toBeLessThan(40);
  expect(failedAssets).toEqual([]);
  await page.evaluate(() => window.__KA_TEST__?.punch());
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: /take a breath/i })).toBeVisible();
});

test('two clients create, join, ready, and exchange predicted movement', async ({ browser }) => {
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();
  for (const page of [first, second]) {
    await page.goto('/?debug=1');
    await page.getByRole('button', { name: /online/i }).click();
    await page.getByRole('button', { name: /continue online/i }).click();
  }
  await first.getByRole('button', { name: /create private room/i }).click();
  await expect(first.getByText(/room [A-HJ-NP-Z2-9]{5}/i)).toBeVisible({ timeout: 12_000 });
  const roomText = (await first.getByRole('heading', { name: /room/i }).textContent()) ?? '';
  const roomCode = roomText.match(/[A-HJ-NP-Z2-9]{5}/)?.[0];
  expect(roomCode).toBeTruthy();
  await second.getByLabel('Room code').fill(roomCode!);
  await second.getByRole('button', { name: 'JOIN' }).click();
  await expect(second.getByText(new RegExp(`room ${roomCode}`, 'i'))).toBeVisible({
    timeout: 12_000,
  });
  await first.getByRole('button', { name: /ready up/i }).click();
  await second.getByRole('button', { name: /ready up/i }).click();
  await expect
    .poll(() => first.evaluate(() => window.__KA_TEST__?.state().phase), { timeout: 8_000 })
    .toBe('playing');
  await expect
    .poll(() => second.evaluate(() => window.__KA_TEST__?.state().players.length))
    .toBe(2);
  const before = await first.evaluate(() => window.__KA_TEST__?.state().position);
  await first.evaluate(() => window.__KA_TEST__?.key('KeyW', true));
  await first.waitForTimeout(250);
  const immediate = await first.evaluate(() => window.__KA_TEST__?.state().position);
  await first.evaluate(() => window.__KA_TEST__?.key('KeyW', false));
  expect(
    Math.hypot((immediate?.x ?? 0) - (before?.x ?? 0), (immediate?.z ?? 0) - (before?.z ?? 0)),
  ).toBeGreaterThan(0.15);
  await expect
    .poll(() => second.evaluate(() => window.__KA_TEST__?.state().players.length))
    .toBe(2);
  await firstContext.close();
  await secondContext.close();
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
