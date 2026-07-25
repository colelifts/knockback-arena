/* global console, performance, process, window */
import { chromium } from 'playwright';

const baseURL = process.env.PLAYTEST_URL ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch({ headless: true, args: ['--enable-precise-memory-info'] });
const report = { botMatches: [], onlineMatches: [], consoleErrors: [] };

const watchErrors = (page, label) => {
  page.on('pageerror', (error) => report.consoleErrors.push(`${label}: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') report.consoleErrors.push(`${label}: ${message.text()}`);
  });
};

const botPage = await browser.newPage({ viewport: { width: 1280, height: 720 } });
watchErrors(botPage, 'bot');
await botPage.goto(`${baseURL}/?debug=1`);
for (const difficulty of ['easy', 'normal', 'hard', 'easy', 'hard']) {
  await botPage.evaluate((value) => window.__KA_TEST__.startBot(value), difficulty);
  await botPage.waitForFunction(() => window.__KA_TEST__.state().phase === 'playing');
  await botPage.evaluate(() => window.__KA_TEST__.key('KeyW', true));
  await botPage.waitForTimeout(700);
  await botPage.evaluate(() => {
    window.__KA_TEST__.key('KeyW', false);
    window.__KA_TEST__.punch();
  });
  await botPage.keyboard.press('Space');
  await botPage.keyboard.press('ShiftLeft');
  const roundMemory = [];
  for (let round = 1; round <= 3; round += 1) {
    await botPage.waitForFunction(() => window.__KA_TEST__.state().phase === 'playing', null, {
      timeout: 8_000,
    });
    await botPage.evaluate(() => window.__KA_TEST__.ringOut());
    await botPage.waitForFunction(
      (score) => {
        const state = window.__KA_TEST__.state();
        return state.opponentScore >= score || state.phase === 'matchOver';
      },
      round,
      { timeout: 5_000 },
    );
    roundMemory.push(await botPage.evaluate(() => performance.memory?.usedJSHeapSize ?? 0));
  }
  const state = await botPage.evaluate(() => window.__KA_TEST__.state());
  if (state.phase !== 'matchOver') throw new Error(`Bot ${difficulty} match did not complete`);
  report.botMatches.push({
    difficulty,
    score: `${state.score}-${state.opponentScore}`,
    roundMemory,
    renderer: state.debug,
  });
}

const firstContext = await browser.newContext();
const secondContext = await browser.newContext();
const first = await firstContext.newPage();
const second = await secondContext.newPage();
watchErrors(first, 'online-host');
watchErrors(second, 'online-guest');
for (const page of [first, second]) {
  await page.goto(`${baseURL}/?debug=1`);
  await page.getByRole('button', { name: /online/i }).click();
  await page.getByRole('button', { name: /continue online/i }).click();
}
await first.getByRole('button', { name: /create private room/i }).click();
await first.getByRole('heading', { name: /room/i }).waitFor({ timeout: 12_000 });
const roomText = (await first.getByRole('heading', { name: /room/i }).textContent()) ?? '';
const roomCode = roomText.match(/[A-HJ-NP-Z2-9]{5}/)?.[0];
if (!roomCode) throw new Error('Private room code missing');
await second.getByLabel('Room code').fill(roomCode);
await second.getByRole('button', { name: 'JOIN' }).click();
await second.getByRole('heading', { name: /room/i }).waitFor({ timeout: 12_000 });

for (let match = 1; match <= 3; match += 1) {
  await first.getByRole('button', { name: /ready up|rematch/i }).click();
  await second.getByRole('button', { name: /ready up|rematch/i }).click();
  await first.waitForFunction(() => window.__KA_TEST__.state().phase === 'playing', null, {
    timeout: 10_000,
  });
  const before = await first.evaluate(() => window.__KA_TEST__.state().position);
  await first.evaluate(() => window.__KA_TEST__.key('KeyS', true));
  await first.waitForTimeout(250);
  const predicted = await first.evaluate(() => window.__KA_TEST__.state().position);
  const immediateTravel = Math.hypot(predicted.x - before.x, predicted.z - before.z);
  await first.evaluate(() => window.__KA_TEST__.key('KeyS', false));
  for (let round = 1; round <= 3; round += 1) {
    await first.evaluate(() => window.__KA_TEST__.onlineRingOut());
    await first.waitForFunction(
      (score) => {
        const state = window.__KA_TEST__.state();
        return state.opponentScore >= score || state.phase === 'matchOver';
      },
      round,
      { timeout: 8_000 },
    );
    if (round < 3)
      await first.waitForFunction(() => window.__KA_TEST__.state().phase === 'playing', null, {
        timeout: 8_000,
      });
  }
  await first.waitForFunction(() => window.__KA_TEST__.state().phase === 'matchOver', null, {
    timeout: 8_000,
  });
  report.onlineMatches.push({
    roomCode,
    match,
    immediateTravel,
    host: await first.evaluate(() => window.__KA_TEST__.state()),
    guest: await second.evaluate(() => window.__KA_TEST__.state()),
  });
}

await firstContext.close();
await secondContext.close();
await botPage.close();
await browser.close();

const memorySamples = report.botMatches.flatMap((match) => match.roundMemory);
report.memory = {
  samples: memorySamples.length,
  firstBytes: memorySamples[0] ?? 0,
  lastBytes: memorySamples.at(-1) ?? 0,
  deltaBytes: memorySamples.length ? memorySamples.at(-1) - memorySamples[0] : 0,
};
console.log(JSON.stringify(report, null, 2));
if (report.consoleErrors.length) process.exitCode = 1;
