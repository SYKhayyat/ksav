const { chromium } = require('C:/Users/Administrator/Videos/Ksav/ksav/app/node_modules/playwright-core');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    args: ['--force-device-scale-factor=1', '--window-size=1440,1000'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text().slice(0, 200)); });
  page.on('pageerror', e => errors.push('pageerror: ' + String(e).slice(0, 300)));

  fs.mkdirSync('C:/Users/Administrator/Videos/Ksav-audit/shots', { recursive: true });
  await page.goto('http://127.0.0.1:7899/', { waitUntil: 'load', timeout: 20000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'C:/Users/Administrator/Videos/Ksav-audit/shots/01-initial.png' });

  const inv = await page.evaluate(() => {
    const out = { title: document.title, statusbar: '', buttons: [], menus: [], editorPresent: false };
    const sb = document.querySelector('.status-bar, #status, [class*=status]');
    out.statusbar = sb ? sb.textContent.trim().slice(0, 150) : '(none found)';
    const els = [...document.querySelectorAll('button, [role=button], [role=menuitem], select')];
    for (const el of els.slice(0, 160)) {
      const t = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
      const dis = el.disabled || el.getAttribute('aria-disabled') === 'true';
      if (t) out.buttons.push((dis ? '[greyed] ' : '') + t);
    }
    out.editorPresent = !!document.querySelector('.cm-editor, [contenteditable=true]');
    return out;
  });
  fs.writeFileSync('C:/Users/Administrator/Videos/Ksav-audit/fuzzout/cdp-inventory.json', JSON.stringify(inv, null, 1), 'utf8');
  console.log('title:', inv.title, '| statusbar:', inv.statusbar, '| editor:', inv.editorPresent);
  console.log('controls:', inv.buttons.length);
  console.log('console problems:', errors.length ? errors.slice(0, 12).join('\n') : '(none)');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
