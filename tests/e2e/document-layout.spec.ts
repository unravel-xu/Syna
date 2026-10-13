import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const artifacts = '.artifacts/p2-layout';
const body = 'Shared document origin\n\n# A heading that can wrap naturally in a narrow document surface\n\n正文保持自然宽度，并随工作面的实际空间重新排版。' + '\n\n## Second heading\n\n### Third heading\n\n- First list item\n- Second list item\n\n$$\nE = mc^2 + \\sum_{i=1}^{n} x_i \\label{eq:energy}\n$$\n\n```ts\nconst context = "a deliberately long line that stays readable inside the document column without horizontal scrolling";\n```\n\nFinal paragraph.';
const editor = (page: Page) => page.getByRole('textbox', { name: 'Markdown editor', exact: true });
async function settle(page: Page) { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
async function create(page: Page) {
  await mkdir(artifacts, { recursive: true }); await page.goto('/');
  await page.getByRole('button', { name: 'Library', exact: true }).click(); await page.keyboard.press('Meta+Shift+n');
  await page.getByRole('textbox', { name: 'Note title' }).fill('Document layout'); await editor(page).fill(body);
  await expect(page.getByLabel('Save status')).toHaveAttribute('data-save-state', 'clean');
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
}
async function mode(page: Page, label: string) { await page.getByRole('button', { name: /View mode:/ }).click(); await page.getByRole('menuitemradio', { name: new RegExp(label) }).click(); await settle(page); }
async function width(page: Page, label: string) { await page.getByRole('button', { name: /Page width:/ }).click(); await page.getByRole('menuitemradio', { name: new RegExp(label) }).click(); await settle(page); }
async function panels(page: Page, sidebar: boolean, auxiliary: boolean) {
  const side = page.getByRole('button', { name: 'Toggle context sidebar' });
  // Narrow sidebars are modal overlays; close them before operating the document.
  if (await page.locator('.context-sidebar.overlay').isVisible()) { await side.click(); await settle(page); }
  const closeAux = page.getByRole('button', { name: 'Close Assistant Demo' });
  if (await closeAux.isVisible()) { await closeAux.click(); await settle(page); }
  if ((await side.getAttribute('aria-pressed') === 'true') !== sidebar) { await side.click(); await settle(page); }
  if (auxiliary) { await page.getByRole('button', { name: 'Toggle Assistant Demo' }).click(); await settle(page); }
}

async function geometry(page: Page) {
  return page.evaluate(() => {
    const viewport = document.querySelector<HTMLElement>('.document-viewport')!;
    const reading = document.querySelector<HTMLElement>('.reading-content');
    const scroller = document.querySelector<HTMLElement>(reading ? '.reading-surface' : '.cm-scroller')!;
    const content = reading ?? document.querySelector<HTMLElement>('.cm-content')!;
    const style = getComputedStyle(scroller), variables = getComputedStyle(document.querySelector('.document-viewport-body')!);
    const padding = parseFloat(style.paddingLeft), rail = parseFloat(variables.getPropertyValue('--document-rail'));
    const ratio = parseFloat(variables.getPropertyValue('--document-ratio')) / 100;
    const box = content.getBoundingClientRect(), gutter = document.querySelector('.cm-gutters')!.getBoundingClientRect();
    const origin = reading ? reading.querySelector('p')!.getBoundingClientRect().left : document.querySelector('.cm-line')!.getBoundingClientRect().left;
    const available = scroller.clientWidth - padding * 2, columnWidth = reading ? box.width : box.width + gutter.width;
    const overflow = [...document.querySelectorAll<HTMLElement>('html,body,.main-workspace,.page-surface,.document-viewport,.document-viewport-body,.cm-scroller,.cm-content,.reading-surface,.reading-content,.reading-content pre')].filter(element => element.getClientRects().length).filter(element => element.scrollWidth > element.clientWidth + 1).map(element => element.className || element.tagName);
    const side = document.querySelector<HTMLElement>('.context-sidebar')!, aux = document.querySelector<HTMLElement>('.auxiliary-panel')!;
    return { effectiveSidebar: side.hidden ? 'hidden' : side.classList.contains('overlay') ? 'overlay' : 'inline', effectiveAssistant: aux.hidden ? 'hidden' : aux.classList.contains('overlay') ? 'overlay' : 'inline', surface: viewport.clientWidth, requested: viewport.dataset.width, padding, ratio, rail, available, columnWidth, origin, expectedOrigin: viewport.getBoundingClientRect().left + padding + available * (1 - ratio) / 2 + rail, overflow };
  });
}
for (const [windowWidth, windowHeight] of [[1024, 768], [1280, 800], [1440, 900], [1920, 1080]]) {
  test(`percentage layout and three-mode origins at ${windowWidth}px with Sidebar/Assistant combinations`, async ({ page }) => {
    await page.setViewportSize({ width: windowWidth, height: windowHeight }); await create(page);
    const results = [], savedAt = await page.getByLabel('Save status').getAttribute('data-saved-at');
    for (const [sidebar, assistant] of [[true, false], [false, false], [true, true], [false, true]]) {
      for (const preference of ['Centered', 'Full Width']) {
        const origins = [];
        for (const view of ['Live Preview', 'Reading Mode', 'Source Mode']) {
          await panels(page, false, false); await width(page, preference); await mode(page, view); await panels(page, sidebar, assistant);
          const value = await geometry(page), expected = preference === 'Full Width' || value.surface <= 650 ? 1 : value.surface <= 900 ? .9 : .8;
          expect(value.ratio).toBe(expected); expect(value.requested).toBe(preference === 'Full Width' ? 'full' : 'centered');
          expect(Math.abs(value.columnWidth - value.available * expected)).toBeLessThan(1);
          expect(Math.abs(value.origin - value.expectedOrigin)).toBeLessThan(1);
          expect(value.padding).toBe(value.surface <= 650 ? 16 : 24); expect(value.overflow).toEqual([]);
          origins.push(value.origin); results.push({ windowWidth, sidebar, assistant, preference, view, ...value });
          if (sidebar === (windowWidth >= 1100) && !assistant || !sidebar && assistant && view === 'Live Preview') {
            await page.mouse.move(windowWidth - 2, windowHeight - 2);
            await page.screenshot({ path: `${artifacts}/${windowWidth}-${preference.toLowerCase().replaceAll(' ', '-')}-${view.split(' ')[0].toLowerCase()}${assistant ? '-assistant' : ''}.png` });
          }
        }
        expect(Math.max(...origins) - Math.min(...origins)).toBeLessThan(1);
      }
    }
    await panels(page, false, false); await width(page, 'Centered');
    await page.getByRole('button', { name: 'Enter focus mode' }).click(); await settle(page);
    const focus = await geometry(page); expect(focus.requested).toBe('centered'); expect(focus.overflow).toEqual([]);
    await page.keyboard.press('Escape'); await expect(page.getByRole('button', { name: /Page width: Centered/ })).toBeVisible();
    expect(await page.getByLabel('Save status').getAttribute('data-saved-at')).toBe(savedAt);
    await writeFile(`${artifacts}/geometry-${windowWidth}.json`, JSON.stringify(results, null, 2));
  });
}
test('block handles use actual glyph centers for headings, wrapped paragraphs, lists, math source and code', async ({ page }) => {
  await create(page); await panels(page, false, true); await mode(page, 'Live Preview');
  const cases = ['# A heading', '正文保持', 'Second heading', 'Third heading', 'First list item', '$$', 'const context'];
  const values = [];
  for (const text of cases) {
    const line = page.locator('.cm-line').filter({ hasText: text === '# A heading' ? /A heading/ : text }).first();
    await line.scrollIntoViewIfNeeded(); await settle(page); await line.hover();
    const handle = page.getByRole('button', { name: 'Block actions', exact: true });
    await expect(handle).toBeVisible(); await expect.poll(async () => (await handle.boundingBox())?.y ?? -1).toBeGreaterThanOrEqual(0);
    const rect = await handle.boundingBox();
    const glyph = await line.evaluate(element => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let node; while ((node = walker.nextNode())) { if (!node.textContent?.length) continue; const range = document.createRange(); range.setStart(node, 0); range.setEnd(node, 1); const rect = range.getBoundingClientRect(); if (rect.height) return { top: rect.top, height: rect.height }; }
      throw new Error('Missing text glyph');
    });
    expect(Math.abs(rect!.y + rect!.height / 2 - glyph.top - glyph.height / 2)).toBeLessThan(1.5);
    const column = await page.locator('.cm-content').boundingBox(); expect(rect!.x + rect!.width).toBeLessThan(column!.x);
    values.push({ text, handle: rect, glyph });
  }
  await page.locator('.live-h1').scrollIntoViewIfNeeded(); await page.locator('.live-h1').hover();
  await page.getByRole('button', { name: 'Block actions', exact: true }).click(); await settle(page);
  const before = await page.locator('.block-actions').boundingBox();
  await page.setViewportSize({ width: 1280, height: 800 }); await settle(page);
  const after = await page.locator('.block-actions').boundingBox(); expect(after!.x).not.toBe(before!.x);
  await page.screenshot({ path: `${artifacts}/block-geometry.png` });
  await writeFile(`${artifacts}/block-geometry.json`, JSON.stringify(values, null, 2));
});
test('page width is independent of mode, narrow adaptation, document switching, undo and IME', async ({ page }) => {
  await create(page); const original = await page.locator('.cm-editor').elementHandle();
  await width(page, 'Full Width'); await mode(page, 'Source Mode'); await editor(page).press('Meta+End'); await page.keyboard.insertText('\nWidth-independent edit');
  await width(page, 'Centered'); await mode(page, 'Live Preview'); await editor(page).press('Meta+z');
  await mode(page, 'Source Mode'); await expect(editor(page)).not.toContainText('Width-independent edit');
  const cdp = await page.context().newCDPSession(page);
  await editor(page).press('Meta+End'); await cdp.send('Input.imeSetComposition', { text: '中文布局', selectionStart: 4, selectionEnd: 4 }); await cdp.send('Input.insertText', { text: '中文布局最终输入' });
  await width(page, 'Full Width'); await mode(page, 'Reading Mode'); await expect(page.getByLabel('Markdown reading view')).toContainText('中文布局最终输入');
  await mode(page, 'Source Mode'); expect(await original!.evaluate(element => element === document.querySelector('.cm-editor'))).toBe(true);
  await page.keyboard.press('Meta+Shift+n'); await expect(page.getByRole('button', { name: 'Page width: Centered', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Expand Uncategorized', exact: true }).click(); await page.getByRole('button', { name: 'Document layout', exact: true }).click(); await expect(page.getByRole('button', { name: 'Page width: Full Width', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1024, height: 768 }); await panels(page, true, true); const narrow = await geometry(page); expect(narrow.ratio).toBe(1); expect(narrow.requested).toBe('full');
});

test('scrollbar presence does not shift the document between editing and reading', async ({ page }) => {
  await create(page);
  await page.addStyleTag({ content: '.cm-scroller::-webkit-scrollbar,.reading-surface::-webkit-scrollbar{width:12px}' });
  await editor(page).fill('Shared document origin' + '\n'.repeat(100) + 'Final paragraph.');
  const origins = [];
  for (const view of ['Live Preview', 'Reading Mode', 'Source Mode']) { await mode(page, view); const value = await geometry(page); origins.push(value.origin); expect(value.overflow).toEqual([]); }
  expect(Math.max(...origins) - Math.min(...origins)).toBeLessThan(1);
});
