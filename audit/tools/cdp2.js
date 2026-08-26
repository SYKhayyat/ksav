const { chromium } = require('C:/Users/Administrator/Videos/Ksav/ksav/app/node_modules/playwright-core');
const fs = require('fs');
const S = 'C:/Users/Administrator/Videos/Ksav-audit/shots/';

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true, args: ['--window-size=1440,1000'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 180)); });
  page.on('pageerror', e => errors.push('pageerror: ' + String(e).slice(0, 250)));
  const status = async () => await page.evaluate(() => {
    const sb = document.querySelector('.status-bar, #status, [class*=status]');
    return sb ? sb.textContent.trim().replace(/\s+/g, ' ').slice(0, 160) : '(none)';
  });
  const shot = (n) => page.screenshot({ path: S + n + '.png' });
  const log = (...a) => console.log(...a);

  await page.goto('http://127.0.0.1:7899/', { waitUntil: 'load', timeout: 20000 });
  await page.waitForTimeout(2000);

  // dismiss welcome with "start empty"
  try {
    await page.locator('button', { hasText: 'התחל ריק' }).first().click({ timeout: 4000 });
    log('dismissed welcome');
  } catch (e) { log('welcome dismiss failed:', String(e).slice(0, 100)); }
  await page.waitForTimeout(800);
  await shot('02-clean');

  // click into editor, type Hebrew
  try {
    await page.locator('.cm-content').first().click();
    await page.keyboard.type('פסקת הניסיון שלי. ', { delay: 15 });
    await page.keyboard.type('ועוד משפט אחריו.', { delay: 15 });
    await page.waitForTimeout(900);
    log('status after typing:', await status());
  } catch (e) { log('typing failed:', String(e).slice(0, 120)); }

  // footnote via Ctrl+Shift+F, then type body
  try {
    await page.keyboard.press('Control+Shift+f');
    await page.waitForTimeout(400);
    await page.keyboard.type('גוף ההערה שלי', { delay: 15 });
    await page.waitForTimeout(1200);
    log('status after footnote:', await status());
    await shot('03-footnote');
  } catch (e) { log('footnote failed:', String(e).slice(0, 120)); }

  // source view of what got written
  const src = await page.evaluate(() => {
    const cm = document.querySelector('.cm-content');
    return cm ? cm.textContent.slice(0, 400) : '(no editor)';
  });
  log('SOURCE NOW:', JSON.stringify(src));

  // open command drawer Ctrl+Shift+K
  try {
    await page.keyboard.press('Control+Shift+k');
    await page.waitForTimeout(900);
    await shot('04-command-drawer');
    const rows = await page.evaluate(() => {
      const els = [...document.querySelectorAll('[class*=drawer] button, [class*=command] button, [role=dialog] button')];
      return els.length;
    });
    log('drawer buttons:', rows);
    await page.keyboard.press('Escape');
  } catch (e) { log('drawer failed:', String(e).slice(0, 120)); }

  // save to library
  try {
    await page.keyboard.press('Control+s');
    await page.waitForTimeout(900);
    log('status after Ctrl+S:', await status());
    await shot('05-after-save');
  } catch (e) { log('save failed:', String(e).slice(0, 120)); }

  log('CONSOLE ERRORS:', errors.length ? '\n' + errors.slice(0, 15).join('\n') : '(none)');
  await browser.close();
})().catch(e => { console.error('FATAL', String(e).slice(0, 400)); process.exit(1); });
