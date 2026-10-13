import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => { const errors: string[] = []; pageErrors.set(page, errors); page.on('pageerror', error => errors.push(error.message)); });
test.afterEach(({ page }) => { expect(pageErrors.get(page)).toEqual([]); });
const editor = (page: Page) => page.getByRole('textbox', { name: 'Markdown editor', exact: true });
async function create(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.keyboard.press('Meta+Shift+n');
}
async function mode(page: Page, name: string) {
  await page.getByRole('button', { name: /View mode:/ }).click(); await page.getByRole('menuitemradio', { name: new RegExp(name) }).click(); await page.mouse.move(1430, 880);
}
const content = '# A quieter workspace\n\nA place for **connected thinking**, _careful reading_, and [useful references](https://example.com).\n\n## Today’s questions\n\n- What matters most?\n- What connects these ideas?\n\n> Good notes leave room for thought.\n\n```ts\nconst focus = "one thing at a time";\n```\n\n中文写作：让想法自然流动。\n';
test('P2.1 modes share one editor, preserve undo/selection and derive a safe read-only view', async ({ page }) => {
  await create(page); await mode(page, 'Source Mode');
  await page.getByRole('textbox', { name: 'Note title' }).fill('A quieter workspace'); await editor(page).fill(content);
  await expect(page.getByLabel('Save status')).toHaveAttribute('data-save-state', 'clean');
  const savedAt = await page.getByLabel('Save status').getAttribute('data-saved-at');
  await editor(page).press('Meta+Home'); await editor(page).press('ArrowDown'); await editor(page).press('ArrowDown'); await editor(page).press('Shift+ArrowRight');
  const selection = await page.evaluate(() => window.getSelection()?.toString());
  const original = await page.locator('.cm-editor').elementHandle();
  await mode(page, 'Live Preview');
  await expect(page.locator('.live-h1')).toContainText('A quieter workspace');
  await expect(page.locator('.live-h1')).not.toContainText('#');
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(selection);
  expect(await original?.evaluate(element => element === document.querySelector('.cm-editor'))).toBe(true);
  await page.getByRole('button', { name: 'Document outline' }).click();
  await expect(page.locator('.outline-menu')).toContainText('Today’s questions'); await page.keyboard.press('Escape');
  await mode(page, 'Reading Mode'); await expect(editor(page)).toBeHidden();
  await expect(page.getByLabel('Markdown reading view').locator('strong')).toHaveText('connected thinking');
  await expect(page.getByLabel('Markdown reading view')).not.toHaveAttribute('contenteditable', 'true');
  await page.getByLabel('Markdown reading view').focus(); await page.keyboard.type('should not be inserted');
  await mode(page, 'Source Mode'); expect((await page.locator('.cm-line').allTextContents()).join('\n')).toBe(content);
  expect(await original?.evaluate(element => element === document.querySelector('.cm-editor'))).toBe(true);
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(selection);
  expect(await page.getByLabel('Save status').getAttribute('data-saved-at')).toBe(savedAt);
  await editor(page).press('Meta+End'); await page.keyboard.insertText('\nA fresh sentence.');
  await mode(page, 'Reading Mode'); await expect(page.getByLabel('Markdown reading view')).toContainText('A fresh sentence.');
  await mode(page, 'Live Preview'); await editor(page).press('Meta+z');
  await mode(page, 'Source Mode'); await expect(editor(page)).not.toContainText('A fresh sentence.');
  await expect(editor(page)).toContainText('中文写作：让想法自然流动。');
});
test('P2.1 presentation fits four window sizes and both themes', async ({ page }) => {
  await create(page); await mode(page, 'Source Mode'); await editor(page).fill(content);
  await page.getByRole('textbox', { name: 'Note title' }).fill('A quieter workspace');
  await expect(page.getByLabel('Save status')).toHaveAttribute('data-save-state', 'clean');
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  for (const name of ['Live Preview', 'Reading Mode', 'Source Mode']) {
    await mode(page, name); await page.getByRole('button', { name: /View mode:/ }).focus();
    await page.screenshot({ path: `.artifacts/p2-editor/${name.toLowerCase().replaceAll(' ', '-')}-light.png` });
  }
  await mode(page, 'Live Preview');
  for (const [width, height] of [[1024, 768], [1280, 800], [1440, 900], [1920, 1080]]) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('html,body,.main-workspace,.page-surface,.codemirror-host')].filter(element => element.getClientRects().length).every(element => element.scrollWidth <= element.clientWidth + 1))).toBe(true);
    await page.screenshot({ path: `.artifacts/p2-editor/live-${width}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Switch to dark theme' }).click(); await page.screenshot({ path: '.artifacts/p2-editor/live-preview-dark.png' });
  await page.getByRole('button', { name: 'Library', exact: true }).click(); await page.screenshot({ path: '.artifacts/p2-editor/sidebar-collapsed.png' });
  await page.getByRole('button', { name: 'Enter focus mode' }).click(); await page.screenshot({ path: '.artifacts/p2-editor/focus.png' }); await page.keyboard.press('Escape');
});
test('P2.2 slash filters, runs real Markdown transactions and isolates Undo/Escape', async ({ page }) => {
  await create(page); await mode(page, 'Source Mode');
  await editor(page).pressSequentially('/head');
  const menu = page.getByRole('listbox', { name: 'Insert block' });
  await expect(menu.getByRole('option')).toHaveCount(3);
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  await expect(menu).toBeHidden(); expect((await page.locator('.cm-line').allTextContents()).join('\n')).toBe('## ');
  await expect(editor(page)).toBeFocused(); await editor(page).press('Meta+z');
  expect((await page.locator('.cm-line').allTextContents()).join('\n')).toBe('/head');
  await editor(page).fill(''); await page.getByRole('button', { name: 'Enter focus mode' }).click();
  await editor(page).focus(); await editor(page).pressSequentially('/'); await expect(menu).toBeVisible();
  await page.keyboard.press('Escape'); await expect(menu).toBeHidden();
  await expect(page.getByRole('button', { name: 'Exit focus mode' })).toBeVisible(); await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Enter focus mode' })).toBeVisible();
  for (const [command, source] of [['普通文本', ''], ['Heading 1', '# '], ['Heading 2', '## '], ['Heading 3', '### '], ['Bullet List', '- '], ['Numbered List', '1. '], ['Task List', '- [ ] '], ['Quote', '> '], ['Code Block', '```\n\n```'], ['Divider', '---\n\n']]) {
    await editor(page).fill(''); await editor(page).pressSequentially('/');
    await menu.getByRole('option', { name: command, exact: false }).click();
    expect((await page.locator('.cm-line').allTextContents()).join('\n')).toBe(source);
    await expect(editor(page)).toBeFocused();
  }
});
test('P2.2 slash respects code, URLs, paths, outside dismissal, IME and viewport edges', async ({ page }) => {
  await create(page); await mode(page, 'Source Mode');
  const menu = page.getByRole('listbox', { name: 'Insert block' });
  for (const source of ['```md\n\n```', 'https://example.com', '/Users/bx', '\\/escape', 'text /', '`code /`']) {
    await editor(page).fill(source);
    if (source.startsWith('```')) { await editor(page).press('Meta+Home'); await editor(page).press('ArrowDown'); }
    await editor(page).pressSequentially('/'); await expect(menu).toBeHidden();
  }
  await editor(page).fill(''); await editor(page).pressSequentially('/'); await expect(menu).toBeVisible();
  await page.getByRole('textbox', { name: 'Note title' }).click(); await expect(menu).toBeHidden();
  await editor(page).fill(''); await editor(page).focus();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.imeSetComposition', { text: '中文输入', selectionStart: 4, selectionEnd: 4 });
  await expect(menu).toBeHidden();
  await cdp.send('Input.insertText', { text: '中文输入完成' }); await expect(editor(page)).toContainText('中文输入完成');
  await editor(page).press('Enter'); await editor(page).pressSequentially('/'); await expect(menu).toBeVisible();
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await editor(page).fill(content + '\n'); await mode(page, 'Live Preview'); await editor(page).press('Meta+End'); await editor(page).pressSequentially('/');
  await page.screenshot({ path: '.artifacts/p2-editor/slash-command-light.png' });
  await page.setViewportSize({ width: 1024, height: 768 });
  await editor(page).fill('\n'.repeat(28)); await editor(page).press('Meta+End'); await editor(page).pressSequentially('/');
  await expect(menu).toBeVisible();
  await expect.poll(async () => (await menu.boundingBox())?.y ?? -1).toBeGreaterThanOrEqual(0);
  const box = await menu.boundingBox(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.y).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(1024); expect(box!.y + box!.height).toBeLessThanOrEqual(768);
  await page.screenshot({ path: '.artifacts/p2-editor/slash-command-edge.png' });
});
async function selectCareful(page: Page) {
  await editor(page).focus(); await editor(page).press('Meta+Home'); await editor(page).press('ArrowRight'); await editor(page).press('ArrowRight');
  for (let i = 0; i < 7; i++) await editor(page).press('Shift+ArrowRight');
}
test('P2.3 selection formatting preserves selection, modifies source, supports Undo and keyboard access', async ({ page }) => {
  await create(page); await mode(page, 'Source Mode'); await editor(page).fill('A careful thought.');
  const toolbar = page.getByRole('toolbar', { name: 'Selection formatting' });
  await selectCareful(page); await expect(toolbar).toBeVisible();
  await toolbar.getByRole('button', { name: 'Bold', exact: true }).click();
  expect((await page.locator('.cm-line').allTextContents()).join('\n')).toBe('A **careful** thought.');
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('careful');
  await editor(page).press('Meta+z'); expect((await page.locator('.cm-line').allTextContents()).join('\n')).toBe('A careful thought.');
  await selectCareful(page); await toolbar.getByRole('button', { name: 'Italic', exact: true }).click();
  expect((await page.locator('.cm-line').allTextContents()).join('\n')).toBe('A _careful_ thought.'); await editor(page).press('Meta+z');
  await selectCareful(page); await toolbar.getByRole('button', { name: 'Link', exact: true }).click();
  await page.getByRole('textbox', { name: 'Link address' }).fill('javascript:alert(1)'); await page.getByRole('button', { name: 'Apply link' }).click();
  await expect(page.getByRole('textbox', { name: 'Link address' })).toHaveAttribute('aria-invalid', 'true');
  await page.getByRole('textbox', { name: 'Link address' }).fill('https://example.com'); await page.getByRole('button', { name: 'Apply link' }).click();
  expect((await page.locator('.cm-line').allTextContents()).join('\n')).toBe('A [careful](https://example.com) thought.'); await editor(page).press('Meta+z');
  await selectCareful(page); await editor(page).press('Meta+Shift+Space'); await expect(toolbar.getByRole('button', { name: 'Text style' })).toBeFocused();
  await page.keyboard.press('Escape'); await expect(toolbar).toBeHidden();
  await mode(page, 'Live Preview'); await selectCareful(page); await expect(toolbar).toBeVisible();
  await toolbar.getByRole('button', { name: 'Bold', exact: true }).click();
  await mode(page, 'Source Mode'); expect((await page.locator('.cm-line').allTextContents()).join('\n')).toBe('A **careful** thought.');
  await mode(page, 'Reading Mode'); await expect(toolbar).toBeHidden(); await expect(page.getByLabel('Markdown reading view').locator('strong')).toHaveText('careful');
});
test('P2.3 selection, block menus and their viewport bounds are reviewable', async ({ page }) => {
  await create(page); await mode(page, 'Source Mode'); await editor(page).fill(content);
  await page.getByRole('textbox', { name: 'Note title' }).fill('A quieter workspace');
  await expect(page.getByLabel('Save status')).toHaveAttribute('data-save-state', 'clean');
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await mode(page, 'Live Preview');
  await editor(page).press('Meta+Home'); await editor(page).press('ArrowDown'); await editor(page).press('ArrowDown');
  for (let i = 0; i < 24; i++) await editor(page).press('Shift+ArrowRight');
  const toolbar = page.getByRole('toolbar', { name: 'Selection formatting' }); await expect(toolbar).toBeVisible();
  await page.screenshot({ path: '.artifacts/p2-editor/selection-toolbar-light.png' });
  await editor(page).press('ArrowRight'); await editor(page).press('Shift+F10');
  const menu = page.getByRole('menu', { name: 'Block actions' }); await expect(menu).toBeVisible();
  await page.screenshot({ path: '.artifacts/p2-editor/block-actions-light.png' });
  await menu.getByRole('menuitem', { name: '删除当前块' }).click();
  await expect(editor(page)).not.toContainText('connected thinking'); await editor(page).press('Meta+z'); await expect(editor(page)).toContainText('connected thinking');
  await editor(page).press('Meta+Home'); await editor(page).press('Shift+F10');
  await menu.getByRole('menuitem', { name: '转换块类型' }).click(); await menu.getByRole('menuitem', { name: 'Heading 2' }).click();
  await mode(page, 'Source Mode'); await expect(page.locator('.cm-line').first()).toHaveText('## A quieter workspace');
  await editor(page).press('Meta+z'); await expect(page.locator('.cm-line').first()).toHaveText('# A quieter workspace');
  await page.setViewportSize({ width: 1024, height: 768 }); await editor(page).press('Meta+Home');
  await editor(page).press('Shift+ArrowRight'); await expect(toolbar).toBeVisible();
  await expect.poll(async () => (await toolbar.boundingBox())?.y ?? -1).toBeGreaterThanOrEqual(0);
  const box = await toolbar.boundingBox(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.y).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(1024); expect(box!.y + box!.height).toBeLessThanOrEqual(768);
});
test('Reading links decode stable block identities across notes and return focus after the editor becomes visible', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await create(page); await mode(page, 'Source Mode');
  await page.getByRole('textbox', { name: 'Note title' }).fill('Anchor note');
  await editor(page).fill('# Anchor\n\nStable target paragraph.'); await editor(page).press('Meta+End');
  const noteId = await page.locator('.real-markdown').getAttribute('data-note-id');
  await editor(page).press('Shift+F10'); await page.getByRole('menuitem', { name: '复制块链接' }).click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(new RegExp(`^syna://note/${noteId}#\\^[\\da-f-]+$`));
  await page.keyboard.press('Meta+Shift+n');
  await editor(page).fill(`[Reference](${link})`); await mode(page, 'Reading Mode');
  await expect(page.getByRole('link', { name: 'Reference' })).toHaveAttribute('href', /%5E/);
  await page.getByRole('link', { name: 'Reference' }).click();
  await expect(page.getByRole('textbox', { name: 'Note title' })).toHaveValue('Anchor note');
  await expect(editor(page)).toBeFocused(); await expect(page.locator('.real-markdown')).toHaveAttribute('data-note-id', noteId!);
  await mode(page, 'Reading Mode'); await expect(page.getByLabel('Markdown reading view')).toBeFocused();
  await mode(page, 'Live Preview'); await expect(editor(page)).toBeFocused();
});
test('Reading derives sanitized HTML without editable content or executable links', async ({ page }) => {
  await create(page); await mode(page, 'Source Mode');
  await editor(page).fill('## Safe heading\n\n<script>window.unsafeExecuted=true</script>\n\n<div contenteditable="true" autofocus>Read-only content</div>\n\n[unsafe](javascript:alert(1))');
  await mode(page, 'Reading Mode');
  await expect(page.getByLabel('Markdown reading view').locator('script,[contenteditable],iframe')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'unsafe' })).toHaveCount(0);
  expect(await page.evaluate(() => 'unsafeExecuted' in window)).toBe(false);
  await expect(page.getByLabel('Markdown reading view')).toContainText('Read-only content');
});

test('Live Preview slash and direct mode shortcuts keep the same editor and history', async ({ page }) => {
  await create(page);
  await editor(page).pressSequentially('/head'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  await page.keyboard.insertText('实时标题');
  await expect(page.locator('.live-h2')).toContainText('实时标题');
  await editor(page).press('Meta+Alt+2'); await expect(page.locator('.real-markdown')).toHaveAttribute('data-view-mode', 'reading');
  await expect(page.getByLabel('Markdown reading view').locator('h2')).toHaveText('实时标题');
  await page.keyboard.press('Meta+Alt+3'); await expect(editor(page)).toBeFocused();
  expect((await page.locator('.cm-line').allTextContents()).join('\n')).toBe('## 实时标题');
  await editor(page).press('Meta+z'); expect((await page.locator('.cm-line').allTextContents()).join('\n')).toBe('## ');
  await editor(page).press('Meta+Alt+1'); await expect(page.locator('.real-markdown')).toHaveAttribute('data-view-mode', 'live');
  await expect(page.locator('.live-h2')).toHaveText('## ');
});

test('Live and Reading web links open through the supported link action', async ({ page, context }) => {
  await context.route('https://example.com/**', route => route.fulfill({ body: '<title>Reference</title>Verified reference', contentType: 'text/html' }));
  await create(page); await editor(page).fill('[Useful reference](https://example.com/reference)');
  await page.getByRole('textbox', { name: 'Note title' }).focus();
  const popup = page.waitForEvent('popup'); await page.locator('.live-link').click({ modifiers: ['Meta'] });
  const liveTab = await popup; expect(liveTab.url()).toBe('https://example.com/reference'); await liveTab.close();
  await mode(page, 'Reading Mode');
  const readingPopup = page.waitForEvent('popup'); await page.getByRole('link', { name: 'Useful reference' }).click();
  const readingTab = await readingPopup; expect(readingTab.url()).toBe('https://example.com/reference'); await readingTab.close();
});
