import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('html, body, .main-workspace, .page-surface, .document-scroll, .sidebar-scroll')].filter(e => e.getClientRects().length).every(e => e.scrollWidth <= e.clientWidth + 1))).toBe(true);
}
test('five destinations, context rules, and navigation history', async ({ page }) => {
  await page.goto('/');
  for (const [name, sidebar] of [['Dashboard', false], ['Inbox', false], ['Workspaces', true], ['Library', true], ['Search', false]] as const) {
    await page.getByRole('navigation', { name: 'Global navigation' }).getByRole('button', { name, exact: true }).click();
    await expect(page.locator('.rail-button[aria-current="page"]')).toHaveCount(1);
    await expect(page.locator('.rail-button[aria-current="page"]')).toHaveAttribute('aria-label', name);
    if (sidebar) await expect(page.getByRole('complementary', { name: 'Context sidebar' })).toBeVisible();
    else await expect(page.getByRole('complementary', { name: 'Context sidebar' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Toggle context sidebar', exact: true })).toHaveCount(sidebar ? 1 : 0);
    await noOverflow(page);
  }
  await page.getByRole('button', { name: 'Go back', exact: true }).click();
  await expect(page.locator('.rail-button[aria-current="page"]')).toHaveAttribute('aria-label', 'Library');
  await page.getByRole('button', { name: 'Go forward', exact: true }).click();
  await expect(page.locator('.rail-button[aria-current="page"]')).toHaveAttribute('aria-label', 'Search');
});
test('project tree and library categories respond to real navigation', async ({ page }) => {
  await page.goto('/?scene=workspaces');
  await page.getByRole('button', { name: 'Collapse Research', exact: true }).click();
  await expect(page.locator('.project-item')).toHaveCount(0);
  await page.getByRole('button', { name: 'Expand Research', exact: true }).click();
  await page.getByRole('button', { name: 'RSI', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'RSI', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.getByRole('button', { name: 'References', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Context sidebar' })).toBeHidden();
  await expect(page.getByRole('heading', { name: 'References', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Toggle context sidebar', exact: true }).click();
  await page.getByRole('button', { name: 'Assets', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Assets', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'All Notes', exact: false }).click();
  await page.getByRole('button', { name: 'Questions worth keeping', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Questions worth keeping', exact: true })).toBeVisible();
});
test('resizing, responsive recovery, focus, and preference persistence', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Library', exact: true }).click();
  const handle = page.getByRole('separator', { name: 'Resize context sidebar' });
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + 3, box.y + 200); await page.mouse.down(); await page.mouse.move(box.x + 51, box.y + 200); await page.mouse.up();
  await expect(handle).toHaveAttribute('aria-valuenow', '296');
  await page.setViewportSize({ width: 1024, height: 768 }); await expect(page.getByRole('complementary', { name: 'Context sidebar' })).toBeHidden();
  await page.setViewportSize({ width: 1440, height: 900 }); await expect(handle).toHaveAttribute('aria-valuenow', '296');
  await page.getByRole('button', { name: 'Toggle Assistant Demo', exact: true }).click();
  await page.getByRole('button', { name: 'Enter focus mode', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Global navigation' })).toHaveCount(0);
  await page.keyboard.press('Escape'); await expect(handle).toHaveAttribute('aria-valuenow', '296');
  await expect(page.getByRole('complementary', { name: 'Assistant Demo' })).toBeVisible();
  await page.getByRole('button', { name: 'Close Assistant Demo' }).click();
  await page.reload(); await page.getByRole('button', { name: 'Library', exact: true }).click();
  await expect(handle).toHaveAttribute('aria-valuenow', '296');
  await page.getByRole('button', { name: 'Toggle context sidebar', exact: true }).click();
  await page.getByRole('button', { name: 'Workspaces', exact: true }).click();
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Context sidebar' })).toBeHidden();
});
test('assistant keeps local draft, supports keyboard resize and overlay escape', async ({ page }) => {
  await page.goto('/?scene=library'); await page.getByRole('button', { name: 'Toggle Assistant Demo' }).click();
  await page.getByLabel('Assistant demo draft · Not sent').fill('A draft that survives hiding.');
  const resize = page.getByRole('separator', { name: 'Resize assistant', exact: true }); await resize.focus(); await page.keyboard.press('ArrowLeft'); await expect(resize).toHaveAttribute('aria-valuenow', '408');
  await page.getByRole('button', { name: 'Close Assistant Demo' }).click(); await page.getByRole('button', { name: 'Toggle Assistant Demo' }).click();
  await expect(page.getByLabel('Assistant demo draft · Not sent')).toHaveValue('A draft that survives hiding.');
  await page.setViewportSize({ width: 1024, height: 768 });
  // At 1024 the sidebar adapts; requesting the widest assistant forces overlay.
  await page.getByRole('separator', { name: 'Resize assistant', exact: true }).focus(); await page.keyboard.press('End');
  await expect(page.getByRole('dialog', { name: 'Assistant Demo', exact: true })).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog', { name: 'Assistant Demo', exact: true })).toBeHidden();
  await noOverflow(page);
});
test('search keyboard navigation, dialogs, themes, and truthful unavailable actions', async ({ page }) => {
  await page.goto('/?scene=dashboard');
  await page.keyboard.press('Meta+k');
  await expect(page.getByRole('dialog', { name: 'Global search' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Search demo notes and projects' }).fill('RSI'); await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'RSI', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Create · Development preview' }).click();
  await expect(page.getByRole('dialog', { name: 'Create preview' }).getByRole('button', { name: /New note/ })).toBeDisabled();
  await page.keyboard.press('Escape'); await expect(page.getByRole('button', { name: 'Create · Development preview' })).toBeFocused();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('dialog', { name: 'Settings', exact: true }).getByRole('button', { name: 'Light', exact: true }).click(); await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.keyboard.press('Escape'); await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Enter focus mode' }).focus(); await page.keyboard.press('Enter');
  await page.keyboard.press('Escape'); await expect(page.getByRole('button', { name: 'Enter focus mode' })).toBeFocused();
});
test('independent document scroll leaves global navigation fixed', async ({ page }) => {
  await page.goto('/?scene=library'); await page.setViewportSize({ width: 1280, height: 800 });
  const before = await page.locator('.global-rail').boundingBox();
  await page.locator('.document-scroll').evaluate(e => { e.scrollTop = e.scrollHeight; });
  expect(await page.locator('.document-scroll').evaluate(e => e.scrollTop)).toBeGreaterThan(0);
  expect(await page.locator('.global-rail').boundingBox()).toEqual(before);
});
test('narrow context sidebar keeps activity controls available and closes on navigation or Escape', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 }); await page.goto('/?scene=library');
  await page.getByRole('button', { name: 'Toggle context sidebar', exact: true }).click();
  const sidebar = page.getByRole('complementary', { name: 'Context sidebar' });
  await expect(sidebar).toBeVisible();
  await expect(sidebar.getByRole('button', { name: 'All Notes', exact: false })).toBeFocused();
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await expect(sidebar).toBeHidden();
  await expect(page.getByRole('button', { name: 'Library', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Library', exact: true }).press('Enter');
  await expect(sidebar).toBeVisible();
  await page.getByRole('button', { name: 'Trash', exact: true }).click();
  await expect(sidebar).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Trash', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Toggle context sidebar', exact: true }).click();
  await page.keyboard.press('Escape'); await expect(sidebar).toBeHidden();
  await expect(page.getByRole('button', { name: 'Toggle context sidebar', exact: true })).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 900 }); await expect(page.getByRole('complementary', { name: 'Context sidebar' })).toBeVisible();
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Dashboard', exact: true })).toBeFocused();
  await expect(sidebar).toBeHidden();
  await expect(page.getByRole('button', { name: 'Toggle context sidebar', exact: true })).toHaveCount(0);
  await noOverflow(page);
});

test('activity clicks preserve tasks, history, width, scroll, and expanded nodes', async ({ page }) => {
  await page.goto('/?scene=workspaces');
  const rail = page.getByRole('navigation', { name: 'Global navigation' });
  const sidebar = page.getByRole('complementary', { name: 'Context sidebar' });
  const toggle = page.getByRole('button', { name: 'Toggle context sidebar', exact: true });
  const handle = page.getByRole('separator', { name: 'Resize context sidebar' });
  await page.getByRole('button', { name: 'RSI', exact: true }).click();
  await page.getByRole('button', { name: 'Collapse Research', exact: true }).click();
  await handle.focus(); await handle.press('End'); await handle.press('ArrowLeft');
  await expect(handle).toHaveAttribute('aria-valuenow', '312');
  await page.setViewportSize({ width: 1440, height: 280 });
  const workspaceScroll = page.locator('.sidebar-scroll[data-context="workspaces"]');
  const workspace = page.locator('.page-surface[data-page="workspaces"]');
  await workspaceScroll.evaluate(e => { e.scrollTop = e.scrollHeight; });
  const sidebarTop = await workspaceScroll.evaluate(e => e.scrollTop);
  expect(sidebarTop).toBeGreaterThan(0);
  await workspace.evaluate(e => { e.scrollTop = 120; });
  const mainTop = await workspace.evaluate(e => e.scrollTop);
  const sameWorkspace = await workspace.elementHandle();
  await rail.getByRole('button', { name: 'Workspaces', exact: true }).press('Enter');
  await expect(sidebar).toBeHidden();
  await toggle.press('Space');
  await expect(sidebar).toBeVisible();
  await expect(rail.getByRole('button', { name: 'Workspaces', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('button', { name: 'Expand Research', exact: true })).toBeVisible();
  await expect(handle).toHaveAttribute('aria-valuenow', '312');
  expect(await workspaceScroll.evaluate(e => e.scrollTop)).toBe(sidebarTop);
  expect(await workspace.evaluate(e => e.scrollTop)).toBe(mainTop);
  expect(await sameWorkspace!.evaluate(e => e.isConnected)).toBe(true);
  await rail.getByRole('button', { name: 'Library', exact: true }).click();
  await rail.getByRole('button', { name: 'Workspaces', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'RSI', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Expand Research', exact: true })).toBeVisible();
  expect(await workspaceScroll.evaluate(e => e.scrollTop)).toBe(sidebarTop);
  expect(await workspace.evaluate(e => e.scrollTop)).toBe(mainTop);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Go back', exact: true }).click();
  await expect(rail.getByRole('button', { name: 'Library', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.sidebar-heading button')).toHaveCount(0);
  await sidebar.hover();
  await expect(page.locator('.sidebar-heading button')).toHaveCount(0);
  await expect(page.getByText('A little more context.', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Navigation', { exact: true })).toHaveCount(0);
});

test('Library document and Search input survive activity changes and Focus', async ({ page }) => {
  await page.goto('/?scene=library');
  const rail = page.getByRole('navigation', { name: 'Global navigation' });
  await page.getByRole('button', { name: 'Questions worth keeping', exact: true }).click();
  await page.getByRole('button', { name: 'Getting started', exact: true }).click();
  const handle = page.getByRole('separator', { name: 'Resize context sidebar' });
  await handle.focus(); await handle.press('Home'); await handle.press('ArrowRight');
  await page.setViewportSize({ width: 1440, height: 400 });
  const sidebarScroll = page.locator('.sidebar-scroll[data-context="library"]');
  await sidebarScroll.evaluate(e => { e.scrollTop = e.scrollHeight; });
  const sidebarTop = await sidebarScroll.evaluate(e => e.scrollTop);
  expect(sidebarTop).toBeGreaterThan(0);
  const documentScroll = page.locator('.document-scroll');
  await documentScroll.evaluate(e => { e.scrollTop = 160; });
  const top = await documentScroll.evaluate(e => e.scrollTop);
  const document = await documentScroll.elementHandle();
  await rail.getByRole('button', { name: 'Library', exact: true }).press('Space');
  await expect(page.getByRole('complementary', { name: 'Context sidebar' })).toBeHidden();
  await page.getByRole('button', { name: 'Enter focus mode' }).press('Enter');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('complementary', { name: 'Context sidebar' })).toBeHidden();
  await rail.getByRole('button', { name: 'Workspaces', exact: true }).click();
  await rail.getByRole('button', { name: 'Library', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Questions worth keeping', exact: true })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Context sidebar' })).toBeHidden();
  await rail.getByRole('button', { name: 'Library', exact: true }).press('Enter');
  await expect(handle).toHaveAttribute('aria-valuenow', '208');
  await expect(page.getByRole('button', { name: 'Getting started', exact: true })).toHaveAttribute('aria-expanded', 'false');
  expect(await sidebarScroll.evaluate(e => e.scrollTop)).toBe(sidebarTop);
  expect(await documentScroll.evaluate(e => e.scrollTop)).toBe(top);
  expect(await document!.evaluate(e => e.isConnected)).toBe(true);
  await rail.getByRole('button', { name: 'Search', exact: true }).click();
  const query = page.getByRole('textbox', { name: 'Search demo notes and projects' });
  await query.fill('Agentic');
  await rail.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await rail.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(query).toHaveValue('Agentic');
  await rail.getByRole('button', { name: 'Search', exact: true }).press('Enter');
  await expect(query).toHaveValue('Agentic');
  await expect(page.getByRole('button', { name: 'Toggle context sidebar', exact: true })).toHaveCount(0);
  await noOverflow(page);
});

test('activity navigation review screenshots', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const theme of ['dark', 'light']) {
    await page.goto(`/?scene=dashboard&theme=${theme}`);
    await expect(page.getByRole('button', { name: 'Toggle context sidebar', exact: true })).toHaveCount(0);
    await page.mouse.move(1430, 890);
    await page.screenshot({ path: `.artifacts/p1a/activity-dashboard-${theme}.png`, animations: 'disabled' });
    for (const name of ['Workspaces', 'Library']) {
      const button = page.getByRole('navigation', { name: 'Global navigation' }).getByRole('button', { name, exact: true });
      await button.click();
      await expect(page.getByRole('complementary', { name: 'Context sidebar' })).toBeVisible();
      expect((await page.locator('.sidebar-heading').boundingBox())!.height).toBe(44);
      expect((await page.locator('.sidebar-scroll:not([hidden]) .sidebar-item').first().boundingBox())!.height).toBe(32);
      await page.mouse.move(1430, 890);
      await page.screenshot({ path: `.artifacts/p1a/activity-${name.toLowerCase()}-expanded-${theme}.png`, animations: 'disabled' });
      await button.click();
      await expect(page.getByRole('complementary', { name: 'Context sidebar' })).toBeHidden();
      await page.mouse.move(1430, 890);
      await page.screenshot({ path: `.artifacts/p1a/activity-${name.toLowerCase()}-collapsed-${theme}.png`, animations: 'disabled' });
    }
  }
});

test('Rail theme toggle, Appearance settings, system changes, and persisted preference stay in sync', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  const toggle = page.locator('.theme-toggle');
  await expect(page.locator('.rail-utilities button')).toHaveCount(2);
  await expect(page.locator('.rail-utilities button').nth(0)).toHaveAttribute('aria-label', 'Switch to light theme');
  await expect(page.locator('.rail-utilities button').nth(1)).toHaveAttribute('aria-label', 'Settings');
  await expect(toggle.locator('svg')).toHaveClass(/lucide-sun/);
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.keyboard.press('Meta+Shift+n');
  await page.getByRole('textbox', { name: 'Note title', exact: true }).fill('Questions worth keeping');
  await page.getByRole('separator', { name: 'Resize context sidebar' }).press('End');
  const preferences = () => page.evaluate(() => JSON.parse(localStorage.getItem('syna.shell.preferences.v1')!).preferences);
  const before = await preferences();
  await toggle.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(toggle.locator('svg')).toHaveClass(/lucide-moon/);
  await expect(page.getByRole('textbox', { name: 'Note title', exact: true })).toHaveValue('Questions worth keeping');
  const after = await preferences();
  expect({ ...after, theme: before.theme }).toEqual(before);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  await expect(settings.getByRole('heading', { name: 'Appearance', exact: true })).toBeVisible();
  await expect(settings.getByRole('button', { name: 'Light', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(settings.getByText(/Shell preview|Mock mode|P0 \+ P1a/i)).toHaveCount(0);
  await settings.getByRole('button', { name: 'System', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const systemPreference = await preferences();
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(settings.getByRole('button', { name: 'System', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await preferences()).toEqual(systemPreference);
  await page.keyboard.press('Escape');
  await page.reload();
  expect((await preferences()).theme).toBe('system');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await toggle.press('Space');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(settings.getByRole('button', { name: 'Dark', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(settings.getByRole('button', { name: 'System', exact: true })).toHaveAttribute('aria-pressed', 'false');
});

test('Focus changes only its icon and restores panels without shifting Header controls', async ({ page }) => {
  await page.goto('/?scene=library&assistant=1');
  await page.getByRole('separator', { name: 'Resize context sidebar' }).press('End');
  // Keep Assistant inline while checking Focus's saved panel arrangement.
  await page.setViewportSize({ width: 1920, height: 1080 });
  const controls = ['Open global search', 'Toggle context sidebar', 'Toggle Assistant Demo'];
  const positions = async () => Promise.all(controls.map(name => page.getByRole('button', { name, exact: true }).boundingBox()));
  const before = await positions();
  const enter = page.getByRole('button', { name: 'Enter focus mode', exact: true });
  await expect(enter).toHaveAttribute('title', /Enter focus mode.*(⌘⇧F|Ctrl\+Shift\+F)/);
  await expect(page.getByRole('button', { name: 'More actions', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Workspace actions', exact: true })).toHaveCount(0);
  await enter.press('Enter');
  const exit = page.getByRole('button', { name: 'Exit focus mode', exact: true });
  await expect(exit.locator('svg')).toHaveClass(/lucide-minimize/);
  await expect(exit).toHaveAttribute('title', /Exit focus mode.*(⌘⇧F|Ctrl\+Shift\+F).*Esc/);
  await expect(exit).toHaveText('');
  await expect(page.locator('.focus-exit')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Toggle context sidebar', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Toggle Assistant Demo', exact: true })).toBeDisabled();
  expect(await positions()).toEqual(before);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('separator', { name: 'Resize context sidebar' })).toHaveAttribute('aria-valuenow', '320');
  await expect(page.getByRole('complementary', { name: 'Assistant Demo', exact: true })).toBeVisible();
  expect(await positions()).toEqual(before);
  await page.keyboard.press('Meta+Shift+f');
  await expect(exit).toBeVisible();
  await exit.press('Space');
  await expect(enter).toBeVisible();
  await expect(enter.locator('svg')).toHaveClass(/lucide-maximize/);
  await expect(page.getByRole('complementary', { name: 'Assistant Demo', exact: true })).toBeVisible();
  await noOverflow(page);
});

test('simplified toolbar light, dark, normal, Focus, and Appearance screenshots', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const theme of ['dark', 'light']) {
    await page.goto(`/?scene=library&theme=${theme}`);
    await page.mouse.move(1430, 890);
    await page.screenshot({ path: `.artifacts/p1a/toolbar-${theme}-normal.png`, animations: 'disabled' });
    await page.getByRole('button', { name: 'Enter focus mode', exact: true }).click();
    await page.mouse.move(1430, 890);
    await page.screenshot({ path: `.artifacts/p1a/toolbar-${theme}-focus.png`, animations: 'disabled' });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.mouse.move(1430, 890);
    await page.screenshot({ path: `.artifacts/p1a/toolbar-${theme}-appearance.png`, animations: 'disabled' });
  }
});
test('acceptance screenshot matrix, geometry, and console errors', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  for (const [width, height] of [[1024, 768], [1280, 800], [1440, 900], [1920, 1080]]) {
    await page.setViewportSize({ width, height });
    for (const scene of ['dashboard', 'inbox', 'workspaces', 'library', 'search', 'compact', 'focus']) {
      await page.goto(`/?scene=${scene}`); await expect(page.locator('.app-shell')).toBeVisible();
      await noOverflow(page);
      if (scene !== 'focus') expect((await page.locator('.global-rail').boundingBox())!.width).toBe(56);
      expect((await page.locator('.global-header').boundingBox())!.height).toBe(48);
      await page.screenshot({ path: `.artifacts/p1a/browser-${scene}-${width}x${height}-dark.png` });
    }
    await page.goto('/?scene=library&theme=light'); await expect(page.locator('html')).toHaveAttribute('data-theme', 'light'); await noOverflow(page);
    await page.screenshot({ path: `.artifacts/p1a/browser-library-${width}x${height}-light.png` });
  }
  await page.setViewportSize({ width: 1440, height: 900 }); await page.goto('/?scene=library&assistant=1');
  await expect(page.getByRole('complementary', { name: 'Assistant Demo' })).toBeVisible();
  await noOverflow(page); await page.screenshot({ path: '.artifacts/p1a/browser-library-assistant-inline-dark.png' });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole('separator', { name: 'Resize context sidebar' }).focus(); await page.keyboard.press('End');
  await expect(page.getByRole('dialog', { name: 'Assistant Demo' })).toBeVisible();
  await page.screenshot({ path: '.artifacts/p1a/browser-library-assistant-overlay-dark.png' });
  await page.goto('/?scene=dashboard&theme=light'); await page.screenshot({ path: '.artifacts/p1a/browser-dashboard-light.png' });
  await page.setViewportSize({ width: 1024, height: 768 }); await page.goto('/?scene=library');
  await page.getByRole('button', { name: 'Toggle context sidebar', exact: true }).click();
  await page.screenshot({ path: '.artifacts/p1a/browser-library-context-overlay-1024x768-dark.png' });
  expect(errors).toEqual([]);
});
