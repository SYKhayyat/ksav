const { chromium } = require('C:/Users/Administrator/Videos/Ksav/ksav/app/node_modules/playwright-core');
const S = 'C:/Users/Administrator/Videos/Ksav-audit/shots/';

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true, args: ['--window-size=1440,1000'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  const status = async () => await page.evaluate(() => {
    const sb = document.querySelector('.status-bar, #status, [class*=status]');
    return sb ? sb.textContent.trim().replace(/\s+/g, ' ').slice(0, 120) : '(none)';
  });
  const src = async () => await page.evaluate(() => {
    const cm = document.querySelector('.cm-content');
    return cm ? cm.textContent.slice(0, 300) : '(none)';
  });
  const log = (...a) => console.log(...a);

  await page.goto('http://127.0.0.1:7899/', { waitUntil: 'load', timeout: 20000 });
  await page.waitForTimeout(1800);
  try { await page.locator('button', { hasText: 'התחל ריק' }).first().click({ timeout: 3000 }); } catch (e) {}
  await page.waitForTimeout(500);
  await page.locator('.cm-content').first().click();
  await page.keyboard.type('משפט אחד. ', { delay: 12 });

  // footnote dialog flow: Ctrl+Shift+F then commit with the add button
  await page.keyboard.press('Control+Shift+f');
  await page.waitForTimeout(500);
  await page.keyboard.type('גוף ההערה', { delay: 12 });
  let committed = false;
  for (const label of ['הוסף', 'אישור', 'הוספה']) {
    const b = page.locator('button', { hasText: label }).first();
    if (await b.count() > 0 && await b.isVisible().catch(() => false)) {
      await b.click(); committed = true; log('committed via', label); break;
    }
  }
  if (!committed) { await page.keyboard.press('Enter'); log('committed via Enter'); }
  await page.waitForTimeout(1000);
  log('status after footnote commit:', await status());
  log('source:', JSON.stringify(await src()));
  await page.screenshot({ path: S + '06-footnote-committed.png' });

  // notes chooser: find the notes/destinations picker. Try the † toolbar chip then Insert menu.
  let chooserOpened = false;
  for (const attempt of [
    () => page.locator('button[title*="הערה"], button[aria-label*="הערות"]').first(),
    () => page.locator('button', { hasText: 'הערות' }).first(),
  ]) {
    try {
      const b = await attempt();
      if (await b.count() > 0 && await b.isVisible().catch(() => false)) { await b.click({ timeout: 2500 }); chooserOpened = true; break; }
    } catch (e) {}
  }
  await page.waitForTimeout(800);
  await page.screenshot({ path: S + '07-chooser.png' });
  const chooserText = await page.evaluate(() => document.body.innerText.slice(0, 100));
  log('chooser opened:', chooserOpened, '| body head:', chooserText.replace(/\n/g, ' | ').slice(0, 90));
  // harvest any destination-looking options now visible
  const options = await page.evaluate(() => {
    const els = [...document.querySelectorAll('button, [role=option], [role=menuitem], label')];
    return els.map(e => (e.textContent || '').trim().replace(/\s+/g, ' ')).filter(t => t && t.length < 60).slice(0, 40);
  });
  log('visible options:', JSON.stringify(options));
  await page.keyboard.press('Escape');

  // language flip with git drawer open (A2#2 check)
  try {
    await page.keyboard.press('Control+s'); // ensure doc exists in library
    await page.waitForTimeout(400);
    // open git drawer via status/toolbar: find ניהול גרסאות
    const g = page.locator('button[aria-label*="גרסאות"], button[title*="גרסאות"]').first();
    if (await g.count() > 0) { await g.click({ timeout: 2500 }); await page.waitForTimeout(700); }
    const en = page.locator('button', { hasText: 'EN' }).first();
    if (await en.count() > 0) { await en.click({ timeout: 2500 }); }
    await page.waitForTimeout(900);
    await page.screenshot({ path: S + '08-langflip-gitdrawer.png' });
    const drawerLang = await page.evaluate(() => {
      const drawers = [...document.querySelectorAll('[class*=drawer], [class*=panel]')];
      const vis = drawers.find(d => d.offsetParent !== null && d.textContent.length > 40);
      return vis ? vis.textContent.trim().replace(/\s+/g, ' ').slice(0, 200) : '(no visible drawer)';
    });
    log('drawer text after EN flip:', drawerLang);
  } catch (e) { log('langflip check failed:', String(e).slice(0, 120)); }

  log('pageerrors:', errors.length ? errors.join(' || ') : '(none)');
  await browser.close();
  console.log('CDP3 DONE');
})().catch(e => { console.error('FATAL', String(e).slice(0, 300)); process.exit(1); });
