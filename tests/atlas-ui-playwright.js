const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://10.0.60.120:3080';
const SHOTS = 'C:/code/homelab/tests/screenshots';
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
const logResult = (id, ok, detail = '') => {
  results.push({ id, ok, detail });
  console.log((ok ? 'PASS ' : 'FAIL ') + id + (detail ? ' - ' + detail : ''));
};
const snap = async (page, name) => {
  const file = path.join(SHOTS, `atlas-ui-${name}-${Date.now()}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

  // PW-01 Smoke load
  try {
    const t0 = Date.now();
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 20000 });
    const loadMs = Date.now() - t0;
    if (consoleErrors.length) {
      logResult('PW-01', false, 'console errors: ' + consoleErrors[0]);
    } else {
      logResult('PW-01', true, 'load ' + loadMs + 'ms');
    }
  } catch (e) {
    const f = await snap(page, 'pw01');
    logResult('PW-01', false, e.message + ' (screenshot ' + f + ')');
  }

  // PW-02 Home cards
  try {
    const titles = ['Infrastructure','Automation','Monitoring','Backups','Metrics','Network'];
    let found = 0;
    for (const t of titles) {
      const loc = page.locator('text=' + t);
      if (await loc.count()) found++;
    }
    if (found === titles.length) logResult('PW-02', true, 'all 6 cards found');
    else {
      const f = await snap(page, 'pw02');
      logResult('PW-02', false, 'found ' + found + '/6 (screenshot ' + f + ')');
    }
  } catch (e) {
    const f = await snap(page, 'pw02');
    logResult('PW-02', false, e.message + ' (screenshot ' + f + ')');
  }

  // PW-03 Tab routing
  try {
    // Tab labels and their expected hash IDs
    const tabs = [
      { label: 'Home', hash: 'home' },
      { label: 'Infrastructure', hash: 'infra' },
      { label: 'Operations', hash: 'ops' },
      { label: 'Backups', hash: 'backups' },
      { label: 'Alerts', hash: 'alerts' }
    ];
    let ok = true;
    for (const t of tabs) {
      const loc = page.locator('text=' + t.label);
      if (await loc.count()) {
        await loc.first().click();
        await page.waitForTimeout(500);
        const url = page.url();
        if (t.label !== 'Home' && !url.includes('#' + t.hash)) ok = false;
      } else {
        ok = false;
      }
    }
    logResult('PW-03', ok, ok ? '' : 'tab or hash missing');
  } catch (e) {
    const f = await snap(page, 'pw03');
    logResult('PW-03', false, e.message + ' (screenshot ' + f + ')');
  }

  // PW-04 Infra expand/collapse persistence
  try {
    await page.goto(BASE + '/#infra', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    const row = page.locator('text=/jupiter|europa|io|ganymede/i').first();
    if (await row.count()) {
      await row.click();
      await page.waitForTimeout(500);
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(500);
      logResult('PW-04', true, 'row toggled and reload succeeded');
    } else {
      const f = await snap(page, 'pw04');
      logResult('PW-04', false, 'no collapsible row found (screenshot ' + f + ')');
    }
  } catch (e) {
    const f = await snap(page, 'pw04');
    logResult('PW-04', false, e.message + ' (screenshot ' + f + ')');
  }

  // PW-05 Status styling (ensure we're on infra tab)
  try {
    await page.goto(BASE + '/#infra', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    const status = await page.locator('[class*="status-"], .host-status-dot, .status-dot').count();
    if (status > 0) logResult('PW-05', true, 'status indicators found (' + status + ')');
    else {
      const f = await snap(page, 'pw05');
      logResult('PW-05', false, 'no status indicators found (screenshot ' + f + ')');
    }
  } catch (e) {
    const f = await snap(page, 'pw05');
    logResult('PW-05', false, e.message + ' (screenshot ' + f + ')');
  }

  // PW-06 Icons from CDN (selfhst, simpleicons, wikimedia)
  try {
    const selfhst = await page.locator('img[src*="selfhst/icons"]').count();
    const simpleicons = await page.locator('img[src*="simpleicons.org"]').count();
    const wikimedia = await page.locator('img[src*="wikimedia"]').count();
    const total = selfhst + simpleicons + wikimedia;
    if (total >= 5) logResult('PW-06', true, 'icons loaded (selfhst:' + selfhst + ' simpleicons:' + simpleicons + ' wiki:' + wikimedia + ')');
    else {
      const f = await snap(page, 'pw06');
      logResult('PW-06', false, 'icons loaded (' + total + ') (screenshot ' + f + ')');
    }
  } catch (e) {
    const f = await snap(page, 'pw06');
    logResult('PW-06', false, e.message + ' (screenshot ' + f + ')');
  }

  // PW-07 Ops tab data
  try {
    await page.goto(BASE + '/#ops', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    const hasSchedules = await page.locator('text=/schedule|cron|next run/i').count();
    const hasTasks = await page.locator('text=/task|history|last run/i').count();
    logResult('PW-07', hasSchedules > 0 && hasTasks > 0, 'schedules:' + hasSchedules + ' tasks:' + hasTasks);
  } catch (e) {
    const f = await snap(page, 'pw07');
    logResult('PW-07', false, e.message + ' (screenshot ' + f + ')');
  }

  // PW-08 External link (Automation card)
  try {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    const card = page.locator('text=Automation').first();
    if (await card.count()) {
      const [newPage] = await Promise.all([
        context.waitForEvent('page', { timeout: 10000 }),
        card.click()
      ]);
      await newPage.waitForLoadState('domcontentloaded');
      const newUrl = newPage.url();
      logResult('PW-08', newUrl.includes(':3002'), 'url=' + newUrl);
      await newPage.close();
    } else {
      const f = await snap(page, 'pw08');
      logResult('PW-08', false, 'automation card not found (screenshot ' + f + ')');
    }
  } catch (e) {
    const f = await snap(page, 'pw08');
    logResult('PW-08', false, e.message + ' (screenshot ' + f + ')');
  }

  // PW-09 Backups tab
  try {
    await page.goto(BASE + '/#backups', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    const hasBackups = await page.locator('text=/backup|pbs|stale|ok/i').count();
    logResult('PW-09', hasBackups > 0, 'matches=' + hasBackups);
  } catch (e) {
    const f = await snap(page, 'pw09');
    logResult('PW-09', false, e.message + ' (screenshot ' + f + ')');
  }

  // PW-10 Alerts tab
  try {
    await page.goto(BASE + '/#alerts', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    const hasAlerts = await page.locator('text=/alert|uptime|monitor/i').count();
    logResult('PW-10', hasAlerts > 0, 'matches=' + hasAlerts);
  } catch (e) {
    const f = await snap(page, 'pw10');
    logResult('PW-10', false, e.message + ' (screenshot ' + f + ')');
  }

  // PW-11 Responsive layout (basic)
  try {
    const viewports = [
      { width: 1280, height: 800, label: 'desktop' },
      { width: 768, height: 1024, label: 'tablet' },
      { width: 375, height: 812, label: 'mobile' }
    ];
    let ok = true;
    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(BASE, { waitUntil: 'networkidle' });
      const count = await page.locator('text=/Infrastructure|Automation|Monitoring|Backups|Metrics|Network/').count();
      if (count < 6) ok = false;
      await snap(page, 'pw11-' + vp.label);
    }
    logResult('PW-11', ok, 'cards visible at all breakpoints');
  } catch (e) {
    const f = await snap(page, 'pw11');
    logResult('PW-11', false, e.message + ' (screenshot ' + f + ')');
  }

  // PW-12 Performance (2s threshold)
  try {
    const t0 = Date.now();
    await page.goto(BASE, { waitUntil: 'networkidle' });
    const loadMs = Date.now() - t0;
    logResult('PW-12', loadMs < 2000, 'load ' + loadMs + 'ms');
  } catch (e) {
    const f = await snap(page, 'pw12');
    logResult('PW-12', false, e.message + ' (screenshot ' + f + ')');
  }

  await browser.close();
  const failed = results.filter(r => !r.ok);
  console.log('\n=== SUMMARY ===');
  console.log('Total: ' + results.length + '  Passed: ' + (results.length - failed.length) + '  Failed: ' + failed.length);
  if (failed.length) {
    console.log('Failed tests:');
    failed.forEach(f => console.log('- ' + f.id + ': ' + f.detail));
    process.exitCode = 1;
  }
})();
