import { _electron as electron } from '@playwright/test';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { buildElectron } from './build-electron.mjs';

const development = process.argv.includes('--dev');
const userData = await mkdtemp(join(tmpdir(), 'syna-p1a-electron-'));
const env = { ...process.env, SYNA_USER_DATA: userData, SYNA_SCENE: 'library' };
delete env.ELECTRON_RUN_AS_NODE;
if (development) env.SYNA_DEV = '1'; else delete env.SYNA_DEV;
await mkdir('.artifacts/p1a', { recursive: true });
await buildElectron();
let app = await electron.launch({ args: [resolve('apps/desktop')], env });
const result = { mode: development ? 'development' : 'production', checks: [], screenshots: [], viewports: [], errors: [] };
try {
  const page = await app.firstWindow();
  page.on('pageerror', error => result.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') result.errors.push(message.text()); });
  await page.waitForSelector('.app-shell[data-runtime="electron"]');
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  const security = await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    const p = window.webContents.getLastWebPreferences();
    return { contextIsolation: p.contextIsolation, sandbox: p.sandbox, nodeIntegration: p.nodeIntegration, webSecurity: p.webSecurity, url: window.webContents.getURL() };
  });
  assert.deepEqual({ ...security, url: undefined }, { contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true, url: undefined });
  assert.ok(security.url.startsWith('syna://app/'));
  result.security = security; result.checks.push('isolated, sandboxed renderer; controlled origin; no Node globals');
  const cdp = await page.context().newCDPSession(page);
  for (const [width, height] of [[1024, 768], [1280, 800], [1440, 900], [1920, 1080]]) {
    await cdp.send('Emulation.clearDeviceMetricsOverride');
    await app.evaluate(({ BrowserWindow }, size) => { BrowserWindow.getAllWindows()[0].setContentSize(size[0], size[1]); }, [width, height]);
    const nativeSize = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getContentSize());
    const emulated = nativeSize[0] !== width || nativeSize[1] !== height;
    if (emulated) await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await page.waitForFunction(size => window.innerWidth === size[0] && window.innerHeight === size[1], [width, height]);
    result.viewports.push({ requested: [width, height], native: nativeSize, rendererEmulated: emulated });
    for (const name of ['Dashboard', 'Workspaces', 'Library', 'Inbox', 'Search']) {
      await page.getByRole('navigation', { name: 'Global navigation' }).getByRole('button', { name, exact: true }).click();
      assert.equal(await page.locator('.rail-button[aria-current="page"]').count(), 1);
      const overflow = await page.evaluate(() => [...document.querySelectorAll('html, body, .main-workspace, .document-scroll')].filter(e => e.getClientRects().length).some(e => e.scrollWidth > e.clientWidth + 1));
      assert.equal(overflow, false, `${name} overflow at ${width}x${height}`);
      if (name === 'Library' || name === 'Dashboard') {
        const path = `.artifacts/p1a/electron-${development ? 'dev' : 'build'}-${name.toLowerCase()}-${width}x${height}${emulated ? '-emulated' : ''}.png`;
        await page.mouse.move(width - 16, height - 36);
        await page.screenshot({ path, scale: 'css', fullPage: true }); result.screenshots.push(path);
      }
    }
  }
  result.checks.push('five destinations × four sizes; exactly one active global destination; no horizontal overflow');
  await cdp.send('Emulation.clearDeviceMetricsOverride');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1440, 900));
  await page.waitForFunction(() => innerWidth === 1440 && innerHeight === 900);
  const rail = name => page.getByRole('navigation', { name: 'Global navigation' }).getByRole('button', { name, exact: true });
  const sidebar = page.getByRole('complementary', { name: 'Context sidebar' });
  async function activityScreenshot(name) {
    const path = `.artifacts/p1a/electron-${development ? 'dev' : 'build'}-activity-${name}.png`;
    await page.mouse.move(1430, 890); await page.screenshot({ path, scale: 'css', animations: 'disabled' }); result.screenshots.push(path);
  }
  await rail('Dashboard').click();
  assert.equal(await sidebar.isVisible(), false);
  assert.equal(await page.getByRole('button', { name: 'Toggle context sidebar', exact: true }).count(), 0);
  await activityScreenshot('dashboard');
  await rail('Workspaces').click();
  await page.getByRole('button', { name: 'RSI', exact: true }).click();
  await page.getByRole('button', { name: 'Collapse Research', exact: true }).click();
  const sidebarResize = page.getByRole('separator', { name: 'Resize context sidebar' });
  await sidebarResize.focus(); await sidebarResize.press('End'); await sidebarResize.press('ArrowLeft');
  assert.equal(await sidebarResize.getAttribute('aria-valuenow'), '312');
  await activityScreenshot('workspaces-expanded');
  await rail('Workspaces').press('Enter'); assert.equal(await sidebar.isVisible(), false);
  await activityScreenshot('workspaces-collapsed');
  await page.getByRole('button', { name: 'Toggle context sidebar', exact: true }).press('Space');
  assert.equal(await sidebarResize.getAttribute('aria-valuenow'), '312');
  assert.equal(await page.getByRole('heading', { name: 'RSI', exact: true }).isVisible(), true);
  assert.equal(await page.getByRole('button', { name: 'Expand Research', exact: true }).isVisible(), true);
  await rail('Library').click();
  await page.getByRole('button', { name: 'Questions worth keeping', exact: true }).click();
  await page.getByRole('button', { name: 'Getting started', exact: true }).click();
  const document = await page.locator('.document-scroll').elementHandle();
  await document.evaluate(e => { e.scrollTop = 80; });
  const scrollTop = await document.evaluate(e => e.scrollTop);
  await activityScreenshot('library-expanded');
  await rail('Library').press('Space'); assert.equal(await sidebar.isVisible(), false);
  await activityScreenshot('library-collapsed');
  await page.getByRole('button', { name: 'Enter focus mode' }).press('Enter'); await page.keyboard.press('Escape');
  assert.equal(await sidebar.isVisible(), false);
  await rail('Dashboard').click(); await rail('Library').click();
  assert.equal(await page.getByRole('heading', { name: 'Questions worth keeping', exact: true }).isVisible(), true);
  assert.equal(await sidebar.isVisible(), false);
  assert.equal(await document.evaluate((e, top) => e.isConnected && e.scrollTop === top, scrollTop), true);
  await rail('Library').press('Enter');
  assert.equal(await sidebarResize.getAttribute('aria-valuenow'), '312');
  assert.equal(await page.getByRole('button', { name: 'Getting started', exact: true }).getAttribute('aria-expanded'), 'false');
  await sidebar.hover(); assert.equal(await page.locator('.sidebar-heading button').count(), 0);
  result.checks.push('Activity Bar click/Enter/Space toggles; Header shares layout action; task, width, tree, mounted document and scroll survive; Focus restores collapsed preference; no sidebar title button');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1024, 768));
  await page.waitForFunction(() => innerWidth === 1024 && innerHeight === 768);
  await sidebar.waitFor({ state: 'hidden' });
  assert.equal(await sidebar.isVisible(), false);
  await rail('Library').click(); assert.equal(await sidebar.isVisible(), true);
  await rail('Library').click(); assert.equal(await sidebar.isVisible(), false);
  await page.getByRole('button', { name: 'Toggle context sidebar', exact: true }).click();
  await page.keyboard.press('Escape'); assert.equal(await sidebar.isVisible(), false);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1440, 900));
  await page.waitForFunction(() => innerWidth === 1440 && innerHeight === 900);
  await sidebar.waitFor({ state: 'visible' });
  assert.equal(await sidebar.isVisible(), true);
  result.checks.push('narrow temporary sidebar can close via Rail, Header, and Escape; widening restores requested visibility and width');
  await rail('Dashboard').click();
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.getByRole('button', { name: 'Toggle Assistant Demo', exact: true }).click();
  await page.getByLabel('Assistant demo draft · Not sent').fill('Electron draft survives hiding and HMR.');
  await page.getByRole('button', { name: 'Close Assistant Demo' }).click();
  await page.getByRole('button', { name: 'Enter focus mode' }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Toggle Assistant Demo', exact: true }).click();
  assert.equal(await page.getByLabel('Assistant demo draft · Not sent').inputValue(), 'Electron draft survives hiding and HMR.');
  result.checks.push('assistant draft survives hiding and focus; Escape restores layout');
  if (development) {
    const path = 'apps/desktop/src/renderer/styles/tokens.css';
    const source = await readFile(path, 'utf8');
    try {
      await writeFile(path, `${source}\n:root { --hmr-verification: syna-p1a; }\n`);
      await page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue('--hmr-verification').trim() === 'syna-p1a');
      assert.equal(await page.getByLabel('Assistant demo draft · Not sent').inputValue(), 'Electron draft survives hiding and HMR.');
      assert.ok((await page.url()).startsWith('syna://app/'));
      result.checks.push('real CSS HMR through controlled origin preserves the current surface and local draft');
    } finally { await writeFile(path, source); }
    const reactPath = 'apps/desktop/src/renderer/shell/AuxiliaryPanel.tsx';
    const reactSource = await readFile(reactPath, 'utf8');
    try {
      await writeFile(reactPath, reactSource.replace('A thinking partner,', 'A thinking partner (HMR verified),'));
      await page.getByRole('heading', { name: 'A thinking partner (HMR verified), in context.' }).waitFor();
      assert.equal(await page.getByLabel('Assistant demo draft · Not sent').inputValue(), 'Electron draft survives hiding and HMR.');
      result.checks.push('real React Fast Refresh preserves assistant draft');
    } finally { await writeFile(reactPath, reactSource); }
  }
  // Use the normal entry point: explicit fixture scenes intentionally do not persist preferences.
  await page.goto('syna://app/');
  await page.waitForSelector('.app-shell');
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'More actions', exact: true }).count(), 0);
  assert.deepEqual(await page.locator('.rail-utilities button').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label'))), ['Switch to light theme', 'Settings']);
  for (const theme of ['dark', 'light']) {
    if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('.theme-toggle').click();
    await page.waitForFunction(value => document.documentElement.dataset.theme === value, theme);
    const before = await page.locator('.global-header button').evaluateAll(buttons => buttons.map(button => { const r = button.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }));
    const normal = `.artifacts/p1a/electron-${development ? 'dev' : 'build'}-toolbar-${theme}-normal.png`;
    await page.mouse.move(1430, 890); await page.screenshot({ path: normal, animations: 'disabled' }); result.screenshots.push(normal);
    await page.getByRole('button', { name: 'Enter focus mode', exact: true }).click();
    assert.equal(await page.locator('.focus-exit').count(), 0);
    const after = await page.locator('.global-header button').evaluateAll(buttons => buttons.map(button => { const r = button.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }));
    assert.deepEqual(after, before);
    const focus = `.artifacts/p1a/electron-${development ? 'dev' : 'build'}-toolbar-${theme}-focus.png`;
    await page.mouse.move(1430, 890); await page.screenshot({ path: focus, animations: 'disabled' }); result.screenshots.push(focus);
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('complementary', { name: 'Context sidebar' }).isVisible(), true);
  }
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  assert.equal(await page.getByRole('heading', { name: 'Appearance', exact: true }).isVisible(), true);
  for (const name of ['System', 'Light', 'Dark']) assert.equal(await page.getByRole('button', { name, exact: true }).isVisible(), true);
  await page.keyboard.press('Escape');
  result.checks.push('no Workspace Actions or text exit; Focus preserves all Header button positions; Theme Toggle sits above Settings; light/dark normal/Focus screenshots; Appearance offers System/Light/Dark');
  let currentPage = page;
  for (const theme of ['light', 'dark']) {
    if (await currentPage.locator('html').getAttribute('data-theme') !== theme) await currentPage.locator('.theme-toggle').click();
    await currentPage.waitForFunction(value => document.documentElement.dataset.theme === value, theme);
    await app.close();
    app = await electron.launch({ args: [resolve('apps/desktop')], env: { ...env, SYNA_SCENE: '' } });
    currentPage = await app.firstWindow();
    currentPage.on('pageerror', error => result.errors.push(error.message));
    currentPage.on('console', message => { if (message.type() === 'error') result.errors.push(message.text()); });
    await currentPage.waitForSelector('.app-shell[data-runtime="electron"]');
    await currentPage.waitForFunction(value => document.documentElement.dataset.theme === value, theme);
    assert.equal(await currentPage.locator('.theme-toggle').getAttribute('aria-label'), `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`);
  }
  result.checks.push('light and dark preferences survive separate full Electron process restarts in the same isolated profile');
  assert.deepEqual(result.errors, []);
  result.passed = true;
} catch (error) {
  result.passed = false; result.failure = String(error); throw error;
} finally {
  await writeFile(`.artifacts/p1a/electron-${result.mode}-results.json`, JSON.stringify(result, null, 2));
  await app.close(); await rm(userData, { recursive: true, force: true });
}
console.log(JSON.stringify(result, null, 2));
