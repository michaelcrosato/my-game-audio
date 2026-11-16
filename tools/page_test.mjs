// Browser test of the listening page (web/index.html, after `npm run page`): a short piece renders whole and plays,
// a long one streams. Needs Playwright (npm i -D playwright, npx playwright install chromium); CHROME=/path uses
// an installed Chrome instead.
// usage: node tools/page_test.mjs [STREAMED_PIECE] [SECONDS_TO_LISTEN]
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
const name = process.argv[2] ?? 'beethoven5';
const listen = Number(process.argv[3] ?? 20) * 1000;
const page_url = new URL('../web/index.html', import.meta.url).href;
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 1300 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(page_url);
await page.waitForTimeout(800);
console.log('cards:', await page.$$eval('.card', (cs) => cs.map((c) => c.dataset.name + (c.dataset.norm ? ' (streams)' : '')).join(', ')));
await page.click('#render-chiptune');
await page.waitForFunction(() => /Rendered|failed|blocked/.test(document.getElementById('status-chiptune').textContent), null, { timeout: 120000 });
console.log('chiptune:', await page.textContent('#status-chiptune'));
await page.click('#stop-chiptune');
const t0 = Date.now();
await page.click(`#render-${name}`);
await page.waitForFunction((n) => /Playing|failed|blocked/.test(document.getElementById('status-' + n).textContent), name, { timeout: 120000 });
console.log(`${name}: first "Playing" after ${Date.now() - t0} ms:`, await page.textContent(`#status-${name}`));
await page.waitForTimeout(listen);
console.log(`${name} after ${(Date.now() - t0) / 1000} s:`, await page.textContent(`#status-${name}`));
const card = await page.$(`#${name}`);
await card.scrollIntoViewIfNeeded();
await page.screenshot({ path: fileURLToPath(new URL(`../out/page_${name}.png`, import.meta.url)) });
await page.click(`#stop-${name}`);
console.log('after stop:', await page.textContent(`#status-${name}`));
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
if (errors.length) process.exit(1);
