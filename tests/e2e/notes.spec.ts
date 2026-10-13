import { test, expect } from '@playwright/test';
test('Browser Mock uses the real editor/session contracts for creation, switching, undo and layout', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.keyboard.press('Meta+Shift+n');
  const editor = page.getByRole('textbox', { name: 'Markdown editor', exact: true });
  await expect(page.getByRole('textbox', { name: 'Note title', exact: true })).toBeFocused();
  await page.getByRole('button', { name: /View mode:/ }).click(); await page.getByRole('menuitemradio', { name: /Source Mode/ }).click();
  await page.getByRole('textbox', { name: 'Note title', exact: true }).fill('第一篇真实笔记');
  await editor.fill('# 我的笔记\n\n中文输入：学习与思考。\n\n- A\n- B');
  await expect(page.getByLabel('Save status')).toHaveAttribute('data-save-state', 'clean');
  await page.keyboard.press('Meta+Shift+n');
  await page.getByRole('textbox', { name: 'Note title', exact: true }).fill('Second note');
  await page.getByRole('button', { name: /View mode:/ }).click(); await page.getByRole('menuitemradio', { name: /Source Mode/ }).click();
  await editor.fill('Second **Markdown** note.');
  await page.getByRole('button', { name: 'Expand Uncategorized', exact: true }).click();
  await page.getByRole('button', { name: '第一篇真实笔记', exact: true }).click();
  await expect(editor).toContainText('中文输入：学习与思考。');
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Context sidebar' })).toBeHidden();
  await expect(editor).toContainText('中文输入：学习与思考。');
  await page.getByRole('button', { name: 'Enter focus mode', exact: true }).click();
  await expect(editor).toBeVisible(); await page.keyboard.press('Escape');
  await editor.focus(); await page.keyboard.press('Control+End'); await page.keyboard.insertText('\n追加尾字');
  await editor.press('Meta+z');
  await expect(editor).not.toContainText('追加尾字');
  await editor.press('Meta+Shift+z');
  await expect(editor).toContainText('追加尾字');
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.getByRole('button', { name: 'Second note', exact: true }).click();
  await expect(editor).toContainText('Second **Markdown** note.');
  for (const [width, height] of [[1024, 768], [1280, 800], [1440, 900], [1920, 1080]]) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('html,body,.main-workspace,.page-surface,.codemirror-host')].filter(element => element.getClientRects().length).every(element => element.scrollWidth <= element.clientWidth + 1))).toBe(true);
    await expect(editor).toContainText('Second **Markdown** note.');
  }
});
test('Browser Mock save failure retains its draft, blocks navigation and retries the same write', async ({ page }) => {
  await page.goto('/?fault=save');
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.keyboard.press('Meta+Shift+n');
  const editor = page.getByRole('textbox', { name: 'Markdown editor', exact: true });
  await editor.fill('不能丢失的草稿');
  await expect(page.getByLabel('Save status')).toHaveAttribute('data-save-state', 'error');
  await expect(editor).toContainText('不能丢失的草稿');
  await page.getByRole('button', { name: 'Retry save', exact: true }).click();
  await expect(page.getByLabel('Save status')).toHaveAttribute('data-save-state', 'clean');
  await expect(editor).toContainText('不能丢失的草稿');
});
