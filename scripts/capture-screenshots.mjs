import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const output = resolve('docs/screenshots');
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
await page.screenshot({ path: resolve(output, 'main-menu.png') });
await page.getByRole('button', { name: /play against bot/i }).click();
await page.getByRole('button', { name: /nova/i }).click();
await page.getByRole('button', { name: /start bot match/i }).click();
await page.waitForFunction(() => globalThis.__KA_TEST__?.state().phase === 'playing');
await page.evaluate(() => globalThis.__KA_TEST__?.key('KeyD', true));
await page.waitForTimeout(700);
await page.evaluate(() => globalThis.__KA_TEST__?.key('KeyD', false));
await page.screenshot({ path: resolve(output, 'bot-match.png') });
await page.waitForTimeout(6_500);
await page.screenshot({ path: resolve(output, 'meteor-warning.png') });
await browser.close();
