import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
const sidebar = (page: Page) => page.getByRole('complementary', { name: 'Context sidebar' });
const files = (page: Page) => page.locator('.file-list');
async function newFolder(page: Page, name: string, parent?: string) {
  if (parent) await sidebar(page).getByRole('button', { name: `Create in ${parent}`, exact: true }).click();
  else await page.getByRole('button', { name: 'Create in Library', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New Folder', exact: true }).click();
  await page.getByRole('textbox', { name: 'New Folder', exact: true }).fill(name); await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
async function newNote(page: Page, title: string, parent?: string) {
  if (parent) { await sidebar(page).getByRole('button', { name: `Create in ${parent}`, exact: true }).click(); await page.getByRole('menuitem', { name: 'New Note', exact: true }).click(); }
  else await page.keyboard.press('Meta+Shift+n');
  const input = page.getByRole('textbox', { name: 'Note title', exact: true }); await expect(input).toBeFocused(); await input.fill(title);
  await page.getByRole('textbox', { name: 'Markdown editor', exact: true }).fill(`正文：${title}`); await expect(page.getByLabel('Save status')).toHaveAttribute('data-save-state', 'clean');
}
async function allNotes(page: Page) { await sidebar(page).getByRole('button', { name: /^All Notes/ }).click(); }
async function sort(page: Page, label: string) { await page.getByRole('button', { name: 'Sort files', exact: true }).click(); await page.getByRole('menuitemradio', { name: label, exact: true }).click(); }
async function more(page: Page, title: string, item: string) { await files(page).getByRole('button', { name: `More actions for ${title}`, exact: true }).click(); await page.getByRole('menuitem', { name: item, exact: true }).click(); }
const titles = (page: Page) => files(page).locator('.explorer-title').allTextContents();
test.beforeEach(async ({ page }) => { await page.goto('/'); await page.getByRole('button', { name: 'Library', exact: true }).click(); });
test('one creation entry, real nested folders, title focus, rename, favorite and move', async ({ page }) => {
  await expect(page.locator('.global-header').getByRole('button', { name: /New note/i })).toHaveCount(0);
  await expect(page.locator('.notes-library').getByRole('button', { name: /Create|New note/i })).toHaveCount(0);
  await newFolder(page, 'Research'); await newFolder(page, 'Sources', 'Research');
  await sidebar(page).getByRole('button', { name: 'Expand Research', exact: true }).click(); await expect(sidebar(page).getByRole('button', { name: 'Sources', exact: true })).toBeVisible();
  await newNote(page, '原始标题', 'Research'); await allNotes(page);
  await more(page, '原始标题', 'Rename'); await page.getByRole('textbox', { name: 'Rename Note', exact: true }).fill('改名后的笔记'); await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(files(page).getByRole('button', { name: '改名后的笔记', exact: true })).toBeVisible();
  await more(page, '改名后的笔记', 'Add to Favorites'); await sidebar(page).getByRole('button', { name: 'Favorites', exact: true }).click(); await expect(files(page).locator('.explorer-title')).toHaveText('改名后的笔记');
  await more(page, '改名后的笔记', 'Move to Folder…'); await page.getByRole('dialog', { name: 'Move to Folder' }).getByRole('button', { name: 'Research / Sources', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0); await expect(files(page).locator('.file-folder')).toHaveText('Research / Sources');
  await page.screenshot({ path: '.artifacts/p3/browser-library-light.png' });
  await sidebar(page).getByRole('button', { name: 'Collections', exact: true }).click(); await expect(page.getByText('This view is not connected yet.')).toBeVisible();
});
test('all sort modes, filter, Manual drag order and keyboard reorder keep separate preferences', async ({ page }) => {
  for (const name of ['Note 10', 'Note 2', 'Note 1']) await newNote(page, name);
  await allNotes(page); await sort(page, 'Name A–Z'); expect(await titles(page)).toEqual(['Note 1', 'Note 2', 'Note 10']);
  await sort(page, 'Name Z–A'); expect(await titles(page)).toEqual(['Note 10', 'Note 2', 'Note 1']);
  for (const label of ['Created: Newest First','Modified: Newest First']) { await sort(page,label); expect(await titles(page)).toEqual(['Note 1','Note 2','Note 10']); }
  for (const label of ['Created: Oldest First','Modified: Oldest First']) { await sort(page,label); expect(await titles(page)).toEqual(['Note 10','Note 2','Note 1']); }
  await sort(page, 'Manual');
  const source = files(page).getByRole('button', { name: 'Drag Note 1', exact: true }), target = files(page).locator('.explorer-row').filter({ has: page.getByRole('button', { name: 'Note 10', exact: true }) });
  await source.dragTo(target, { targetPosition: { x: 100, y: 3 } }); await expect.poll(() => titles(page)).toEqual(['Note 1','Note 10','Note 2']);
  await more(page, 'Note 2', 'Move Up'); await expect.poll(() => titles(page)).toEqual(['Note 1','Note 2','Note 10']);
  await sort(page, 'Name Z–A'); await files(page).getByRole('button', { name: 'More actions for Note 2', exact: true }).click(); await expect(page.getByRole('menuitem', { name: 'Move Up', exact: true })).toBeDisabled(); await page.keyboard.press('Escape');
  await sort(page, 'Manual'); expect(await titles(page)).toEqual(['Note 1','Note 2','Note 10']);
  await page.getByRole('button', { name: 'Sort files', exact: true }).click(); await page.screenshot({ path: '.artifacts/p3/browser-sort-menu.png' }); await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Filter files' }).click(); await page.getByRole('textbox', { name: 'Filter by name' }).fill('10'); await expect(files(page).locator('.explorer-title')).toHaveText('Note 10');
});
test('native drag moves folders, hover expands destinations and prevents cycles', async ({ page }) => {
  await newFolder(page,'Parent'); await newFolder(page,'Child'); await newNote(page,'可移动笔记'); await allNotes(page); await sort(page,'Manual');
  const parent = sidebar(page).locator('.explorer-row').filter({ has: page.getByRole('button', { name: 'Parent', exact: true }) });
  await sidebar(page).getByRole('button', { name: 'Drag Child', exact: true }).dragTo(parent, { targetPosition: { x: 85, y: 16 } });
  await sidebar(page).getByRole('button', { name: 'Expand Parent', exact: true }).click();
  await expect(sidebar(page).getByRole('group', { name: 'Parent contents' }).getByRole('button', { name: 'Child', exact: true })).toBeVisible();
  await files(page).getByRole('button', { name: 'Drag 可移动笔记', exact: true }).dragTo(parent, { targetPosition: { x: 85, y: 16 } });
  await expect(files(page).locator('.file-folder')).toHaveText('Parent');
  await sidebar(page).getByRole('button', { name: 'More actions for Parent', exact: true }).click(); await page.getByRole('menuitem', { name: 'Move to Folder…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Move to Folder' }); await expect(dialog.getByRole('button', { name: 'Parent', exact: true })).toBeDisabled(); await expect(dialog.getByRole('button', { name: 'Parent / Child', exact: true })).toBeDisabled(); await page.keyboard.press('Escape');
  await page.screenshot({ path: '.artifacts/p3/browser-folder-move.png' });
});
test('trash previews a subtree, restores stable IDs and does not mutate the editor on move', async ({ page }) => {
  await newFolder(page,'Archive'); await newNote(page,'不丢失正文','Archive');
  const noteId = await page.locator('.real-markdown').getAttribute('data-note-id'); const original = await page.locator('.cm-editor').elementHandle();
  await sidebar(page).getByRole('button', { name: 'More actions for Archive', exact: true }).click(); await page.getByRole('menuitem', { name: 'Rename', exact: true }).click(); await page.getByRole('textbox', { name: 'Rename Folder' }).fill('Renamed'); await page.getByRole('button', { name: 'Save', exact: true }).click();
  expect(await original!.evaluate(element=>element === document.querySelector('.cm-editor'))).toBe(true);
  await sidebar(page).getByRole('button', { name: 'More actions for Renamed', exact: true }).click(); await page.getByRole('menuitem', { name: 'Move to Trash…' }).click();
  await expect(page.getByRole('dialog', { name: 'Move to Trash' })).toContainText('1 folders · 1 notes'); await page.screenshot({path:'.artifacts/p3/browser-trash-preview.png'});
  await page.getByRole('button',{name:'Move to Trash',exact:true}).click(); await expect(page.getByRole('textbox',{name:'Markdown editor',exact:true})).toHaveCount(0);
  await sidebar(page).getByRole('button',{name:/^Trash/}).click(); await page.getByRole('button',{name:'Restore Renamed',exact:true}).click();
  await sidebar(page).getByRole('button',{name:'Renamed',exact:true}).click(); await files(page).getByRole('button',{name:'不丢失正文',exact:true}).click();
  await expect(page.locator('.real-markdown')).toHaveAttribute('data-note-id',noteId!); await expect(page.getByRole('textbox',{name:'Markdown editor',exact:true})).toContainText('正文：不丢失正文');
});
test('keyboard context actions, menu Escape, Focus and responsive theme bounds', async ({ page }) => {
  await newNote(page,'Keyboard'); await allNotes(page); const row = files(page).getByRole('button',{name:'Keyboard',exact:true});
  await row.focus(); await row.press('Shift+F10'); await expect(page.getByRole('menu')).toBeVisible(); await page.keyboard.press('End'); await expect(page.getByRole('menuitem',{name:'Move to Trash…'})).toBeFocused(); await page.keyboard.press('Escape'); await expect(row).toBeFocused();
  await row.click(); const editor = page.getByRole('textbox',{name:'Markdown editor',exact:true}); await editor.focus(); await page.keyboard.insertText('未保存尾字');
  await page.getByRole('button',{name:'Enter focus mode',exact:true}).click(); await expect(editor).toContainText('未保存尾字'); await page.keyboard.press('Escape'); await expect(sidebar(page)).toBeVisible();
  await page.getByRole('button',{name:'Library',exact:true}).click(); await expect(sidebar(page)).toBeHidden(); await expect(editor).toContainText('未保存尾字'); await page.getByRole('button',{name:'Library',exact:true}).click();
  for (const [width,height] of [[1024,768],[1280,800],[1440,900],[1920,1080]]) {
    await page.setViewportSize({width,height}); if (width === 1024) await page.getByRole('button',{name:'Toggle context sidebar',exact:true}).click();
    for (const theme of ['light','dark']) { const toggle=page.getByRole('button',{name:`Switch to ${theme} theme`,exact:true}); if(await toggle.isVisible()) await toggle.click(); await page.getByRole('button',{name:'Create in Library',exact:true}).click(); const bounds = await page.getByRole('menu').boundingBox(); expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(width); expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(height); await page.keyboard.press('Escape'); }
    if (width === 1024) await page.getByRole('button',{name:'Toggle context sidebar',exact:true}).click();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByRole('button',{name:'Switch to light theme',exact:true}).click(); await allNotes(page); await page.screenshot({path:'.artifacts/p3/browser-library-light.png'});
  await page.getByRole('button',{name:'Switch to dark theme',exact:true}).click(); await page.screenshot({path:'.artifacts/p3/browser-library-dark.png'});
});
test('mock persistence failure restores optimistic order and reports a real error', async ({ page }) => {
  // Fail the first metadata write in a fresh isolated mock; folder creation must not appear successful.
  await page.goto('/?fault=library'); await page.getByRole('button',{name:'Library',exact:true}).click(); await page.getByRole('button',{name:'Create in Library',exact:true}).click(); await page.getByRole('menuitem',{name:'New Folder',exact:true}).click(); await page.getByRole('textbox',{name:'New Folder',exact:true}).fill('Failed folder'); await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('Previous arrangement restored.'); await expect(sidebar(page).getByRole('button',{name:'Failed folder',exact:true})).toHaveCount(0); await page.getByRole('button',{name:'Save',exact:true}).click(); await expect(page.getByRole('dialog')).toHaveCount(0); await expect(sidebar(page).getByRole('button',{name:'Failed folder',exact:true})).toBeVisible();
});

test('folder and tree sort preferences are independent; mixed siblings reorder only in Manual', async ({page}) => {
  await newFolder(page,'Projects'); await newFolder(page,'Child 10','Projects'); await newFolder(page,'Child 2','Projects'); await newNote(page,'同级笔记','Projects');
  await sidebar(page).getByRole('button',{name:'Projects',exact:true}).click(); await sort(page,'Name A–Z');
  expect(await titles(page)).toEqual(['同级笔记','Child 2','Child 10']);
  await page.getByRole('button',{name:'Folder tree options',exact:true}).click(); await page.getByRole('menuitemradio',{name:'Name Z–A',exact:true}).click();
  await expect(page.getByRole('button',{name:'Sort files',exact:true})).toContainText('Name A–Z');
  await sort(page,'Manual');
  await files(page).getByRole('button',{name:'Drag 同级笔记',exact:true}).dragTo(files(page).locator('.explorer-row').filter({has:page.getByRole('button',{name:'Child 10',exact:true})}),{targetPosition:{x:90,y:3}});
  expect(await titles(page)).toEqual(['同级笔记','Child 10','Child 2']);
  await allNotes(page); await sort(page,'Name Z–A'); await sidebar(page).getByRole('button',{name:'Projects',exact:true}).click();
  await expect(page.getByRole('button',{name:'Sort files',exact:true})).toContainText('Manual'); expect(await titles(page)).toEqual(['同级笔记','Child 10','Child 2']);
});
test('drag hover expands a collapsed folder and sidebar scrolling preserves drop targets', async ({page}) => {
  await newFolder(page,'Destination'); await newFolder(page,'Source'); await newFolder(page,'Existing child','Destination');
  const destination=sidebar(page).locator('.explorer-row').filter({has:page.getByRole('button',{name:'Destination',exact:true})});
  const from=await sidebar(page).getByRole('button',{name:'Drag Source',exact:true}).boundingBox(), to=await destination.boundingBox();
  await page.mouse.move(from!.x+8,from!.y+13); await page.mouse.down(); await page.mouse.move(from!.x+35,from!.y-5,{steps:5}); await page.mouse.move(to!.x+85,to!.y+16,{steps:10}); await page.mouse.move(to!.x+86,to!.y+16);
  await expect(sidebar(page).getByRole('button',{name:'Collapse Destination',exact:true})).toBeVisible(); await expect(destination).toHaveAttribute('data-drop','inside');
  await page.screenshot({path:'.artifacts/p3/browser-hover-drop.png'}); await page.mouse.up(); await expect(sidebar(page).getByRole('group',{name:'Destination contents'}).getByRole('button',{name:'Source',exact:true})).toBeVisible();
  for(let index=0;index<15;index++) await newFolder(page,`Folder ${index}`);
  await page.setViewportSize({width:1024,height:768}); await page.getByRole('button',{name:'Toggle context sidebar',exact:true}).click();
  await sidebar(page).locator('.sidebar-scroll').evaluate(element=>{element.scrollTop=element.scrollHeight;}); await sidebar(page).getByRole('button',{name:'More actions for Folder 14',exact:true}).click();
  const bounds=await page.getByRole('menu').boundingBox(); expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(768); await page.keyboard.press('Escape');
  expect(await sidebar(page).locator('.sidebar-scroll').evaluate(element=>element.scrollTop)).toBeGreaterThan(0);
  await sidebar(page).getByRole('button',{name:'Drag Folder 13',exact:true}).dragTo(sidebar(page).locator('.explorer-row').filter({has:page.getByRole('button',{name:'Folder 14',exact:true})}),{targetPosition:{x:85,y:16}});
  await sidebar(page).getByRole('button',{name:'Expand Folder 14',exact:true}).click(); await expect(sidebar(page).getByRole('group',{name:'Folder 14 contents'}).getByRole('button',{name:'Folder 13',exact:true})).toBeVisible();
  await page.screenshot({path:'.artifacts/p3/browser-narrow-scrolled.png'});
});
