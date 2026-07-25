import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const productionUrl = 'https://knockback-arena.vercel.app';
const browser = await chromium.launch();
const contextA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const contextB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const pageA = await contextA.newPage();
const pageB = await contextB.newPage();
const consoleErrors = [];
for (const [label, page] of [
  ['A', pageA],
  ['B', pageB],
]) {
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(`${label}: ${message.text()}`);
  });
  page.on('pageerror', (error) => consoleErrors.push(`${label}: ${error.message}`));
}

const enterOnline = async (page) => {
  await page.goto(productionUrl, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /online/i }).click();
  await page.getByRole('button', { name: /continue online/i }).click();
  await page.getByRole('heading', { name: /find a rival/i }).waitFor();
};

try {
  await enterOnline(pageA);
  await pageA.getByRole('button', { name: /create private room/i }).click();
  const roomButton = pageA.locator('.room-code');
  await roomButton.waitFor({ timeout: 15_000 });
  const roomCode = (await roomButton.textContent()).match(/[A-HJ-NP-Z2-9]{5}/)?.[0];
  if (!roomCode) throw new Error('Production room code was not rendered');

  await enterOnline(pageB);
  await pageB.getByLabel('Room code').fill(roomCode);
  await pageB.getByRole('button', { name: /^join$/i }).click();
  await pageB.locator('.room-code').waitFor({ timeout: 15_000 });
  await pageA.getByRole('button', { name: /ready up/i }).click();
  await pageB.getByRole('button', { name: /ready up/i }).click();
  await Promise.all([
    pageA.locator('#game-canvas').waitFor({ state: 'visible', timeout: 15_000 }),
    pageB.locator('#game-canvas').waitFor({ state: 'visible', timeout: 15_000 }),
  ]);
  await Promise.all([
    pageA.waitForFunction(() => globalThis.__KA_TEST__?.state().phase === 'playing'),
    pageB.waitForFunction(() => globalThis.__KA_TEST__?.state().phase === 'playing'),
  ]);

  const before = await pageA.evaluate(() => globalThis.__KA_TEST__.state());
  await pageA.evaluate(() => globalThis.__KA_TEST__.key('KeyW', true));
  await pageA.waitForTimeout(900);
  await pageA.evaluate(() => globalThis.__KA_TEST__.key('KeyW', false));
  await pageA.waitForTimeout(400);
  const afterA = await pageA.evaluate(() => globalThis.__KA_TEST__.state());
  const afterB = await pageB.evaluate(() => globalThis.__KA_TEST__.state());
  const moved = Math.hypot(
    afterA.position.x - before.position.x,
    afterA.position.z - before.position.z,
  );
  const remoteA = afterB.players.find((player) => player.id === afterA.localId);
  if (moved < 0.1 || !remoteA)
    throw new Error('Authoritative movement did not propagate to both browsers');

  const tickBeforeDisconnect = afterB.tick;
  await contextB.setOffline(true);
  await pageA.waitForTimeout(1_500);
  await contextB.setOffline(false);
  await pageB.waitForFunction(
    (tick) => (globalThis.__KA_TEST__?.state().tick ?? 0) > tick,
    tickBeforeDisconnect,
    { timeout: 15_000 },
  );
  const restored = await pageB.evaluate(() => globalThis.__KA_TEST__.state());
  const unexpectedConsoleErrors = consoleErrors.filter(
    (message) => !message.includes('ERR_INTERNET_DISCONNECTED'),
  );
  await mkdir(resolve('docs/screenshots'), { recursive: true });
  await pageA.screenshot({ path: resolve('docs/screenshots/online-production.png') });
  const report = {
    checkedAt: new Date().toISOString(),
    productionUrl,
    roomCode,
    twoBrowsersStarted: true,
    authoritativeMovementMeters: Number(moved.toFixed(2)),
    remoteSnapshotReceived: Boolean(remoteA),
    reconnectResumedAtTick: restored.tick,
    expectedOfflineErrors: consoleErrors.filter((message) =>
      message.includes('ERR_INTERNET_DISCONNECTED'),
    ),
    unexpectedConsoleErrors,
  };
  await writeFile(resolve('docs/production-smoke.json'), `${JSON.stringify(report, null, 2)}\n`);
  if (unexpectedConsoleErrors.length > 0)
    throw new Error(`Production console errors: ${unexpectedConsoleErrors.join(' | ')}`);
  globalThis.console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
