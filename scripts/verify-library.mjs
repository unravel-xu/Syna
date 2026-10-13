import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { uuidV7 } from '@syna/core';
const root = await mkdtemp(join(tmpdir(), 'syna-p3-electron-'));
const path = join(root,'workspace','.syna','state.sqlite'), artifacts = '.artifacts/p3';
const env = { ...process.env, SYNA_USER_DATA: join(root,'profile'), SYNA_WORKSPACE: join(root,'workspace'), SYNA_TEST_MODE:'1', SYNA_SCENE:'' }; delete env.SYNA_DEV; delete env.ELECTRON_RUN_AS_NODE;
await mkdir(artifacts,{recursive:true});
const report = { checks:[], errors:[], screenshots:[], database: 'isolated temporary workspace; removed after test' };
let app, page, clipboard;
const openedProcesses = [];
const read = (sql,...args) => { const db = new DatabaseSync(path); try { return db.prepare(sql).all(...args); } finally { db.close(); } };
const ipc = async (method,...args) => page.evaluate(async ({method,args}) => { const result = await window.synaShell.library[method](...args); if (!result.ok) throw Error(result.error.message); return result.value; },{method,args});
const state = () => ipc('getLibrary');
const sidebar = () => page.getByRole('complementary',{name:'Context sidebar'});
const list = () => page.locator('.file-list');
const editor = () => page.getByRole('textbox',{name:'Markdown editor',exact:true});
const title = () => page.getByRole('textbox',{name:'Note title',exact:true});
const allNotes = () => sidebar().getByRole('button',{name:/^All Notes/}).click();
async function launch() { app = await electron.launch({args:[resolve('apps/desktop')],env}); openedProcesses.push(app.process()); page = await app.firstWindow(); page.on('pageerror',error=>report.errors.push(error.message)); await page.waitForSelector('.app-shell[data-runtime="electron"]'); if (clipboard === undefined) clipboard = await app.evaluate(({clipboard})=>clipboard.readText()); }
async function shot(name) { const target = `${artifacts}/electron-${name}.png`; await page.screenshot({path:target,animations:'disabled',scale:'css'}); report.screenshots.push(target); }
async function folder(name,parent) { await (parent ? sidebar().getByRole('button',{name:`Create in ${parent}`,exact:true}) : page.getByRole('button',{name:'Create in Library',exact:true})).click(); await page.getByRole('menuitem',{name:'New Folder',exact:true}).click(); await page.getByRole('textbox',{name:'New Folder',exact:true}).fill(name); await page.getByRole('button',{name:'Save',exact:true}).click(); await expect(page.getByRole('dialog')).toHaveCount(0); return (await state()).folders.find(item=>item.name===name).id; }
async function note(name,parent) { if (parent) { await sidebar().getByRole('button',{name:`Create in ${parent}`,exact:true}).click(); await page.getByRole('menuitem',{name:'New Note',exact:true}).click(); } else await page.keyboard.press('Meta+Shift+n'); await expect(title()).toBeFocused(); await title().fill(name); await editor().fill(`# ${name}\n\n真实持久化正文。`); await editor().press('Meta+s'); await expect(page.getByLabel('Save status')).toHaveAttribute('data-save-state','clean'); return await page.locator('.real-markdown').getAttribute('data-note-id'); }
async function sort(label) { await page.getByRole('button',{name:'Sort files',exact:true}).click(); await page.getByRole('menuitemradio',{name:label,exact:true}).click(); }
async function rowMore(name,item) { await list().getByRole('button',{name:`More actions for ${name}`,exact:true}).click(); await page.getByRole('menuitem',{name:item,exact:true}).click(); }
async function restoreLayout() { const toggle = page.getByRole('button',{name:'Exit focus mode',exact:true}); if (await toggle.isVisible()) await toggle.click(); if (!await sidebar().isVisible()) await page.getByRole('button',{name:'Toggle context sidebar',exact:true}).click(); }
try {
  await launch(); await page.getByRole('button',{name:'Library',exact:true}).click();
  const research = await folder('Research'), archive = await folder('Archive'), nested = await folder('Sources','Research');
  await sidebar().getByRole('button',{name:'Expand Research',exact:true}).click();
  const first = await note('Note 10','Research'), second = await note('Note 2','Research'), shared = await note('共享笔记','Research');
  assert.equal(read('PRAGMA user_version')[0].user_version,2); assert.equal(read('SELECT * FROM folders').length,3); assert.equal(read('SELECT * FROM notes').length,3);
  report.checks.push('real UI creates three UUIDv7 notes and nested folders through restricted preload → Library/Note services → Storage Worker → SQLite v2; new-note title is focused');
  const host = await page.locator('.cm-editor').elementHandle(), version = read('SELECT revision FROM notes WHERE id=?',shared)[0].revision;
  await sidebar().getByRole('button',{name:'More actions for Research',exact:true}).click(); await page.getByRole('menuitem',{name:'Rename',exact:true}).click(); await page.getByRole('textbox',{name:'Rename Folder',exact:true}).fill('Research & Notes'); await page.getByRole('button',{name:'Save',exact:true}).click();
  assert.ok(await host.evaluate(element=>element===document.querySelector('.cm-editor'))); assert.equal(read('SELECT revision FROM notes WHERE id=?',shared)[0].revision,version);
  const ime = await page.context().newCDPSession(page); await editor().focus(); await editor().press('Meta+End'); await ime.send('Input.imeSetComposition',{text:'中文输入',selectionStart:4,selectionEnd:4}); await ime.send('Input.insertText',{text:'中文输入与目录管理'});
  await sidebar().getByRole('button',{name:'More actions for Research & Notes',exact:true}).click(); await page.getByRole('menuitem',{name:'Move to Folder…',exact:true}).click(); await page.getByRole('dialog',{name:'Move to Folder'}).getByRole('button',{name:'Archive',exact:true}).click();
  await expect(editor()).toContainText('中文输入与目录管理'); assert.ok(await host.evaluate(element=>element===document.querySelector('.cm-editor'))); await editor().press('Meta+s'); await expect(page.getByLabel('Save status')).toHaveAttribute('data-save-state','clean');
  report.checks.push('active editor DOM and buffer survive folder rename/move during Chinese IME commit; directory metadata creates no Markdown revision; final IME text saves once');
  await allNotes();
  await sort('Name A–Z'); assert.deepEqual(await list().locator('.explorer-title').allTextContents(),['Note 10','Note 2','共享笔记'].sort(new Intl.Collator('zh-CN',{numeric:true,sensitivity:'base'}).compare));
  await sort('Name Z–A'); assert.deepEqual(await list().locator('.explorer-title').allTextContents(),['Note 10','Note 2','共享笔记'].sort(new Intl.Collator('zh-CN',{numeric:true,sensitivity:'base'}).compare).reverse());
  for (const label of ['Created: Newest First','Modified: Newest First']) { await sort(label); assert.equal((await list().locator('.explorer-title').allTextContents())[0],'共享笔记'); }
  for (const label of ['Created: Oldest First','Modified: Oldest First']) { await sort(label); assert.equal((await list().locator('.explorer-title').allTextContents())[0],'Note 10'); }
  const noOpBefore=await state(); const noOp=await ipc('writeLibrary',{expectedRevision:noOpBefore.revision,command:{type:'move',target:{kind:'note',id:first},parentFolderId:research}},{commandId:uuidV7()}); assert.deepEqual(noOp.placements,noOpBefore.placements);
  await sort('Manual');
  // Capture an actual native drag, including the insertion indicator before committing the drop.
  const from = await list().getByRole('button',{name:'Drag 共享笔记',exact:true}).boundingBox(), to = await list().locator(`[data-item-id="${first}"]`).boundingBox();
  await page.mouse.move(from.x+from.width/2,from.y+from.height/2); await page.mouse.down(); await page.mouse.move(from.x+40,from.y-12,{steps:8}); await page.mouse.move(to.x+100,to.y+3,{steps:12}); await page.mouse.move(to.x+101,to.y+3);
  await expect(list().locator(`[data-item-id="${first}"]`)).toHaveAttribute('data-drop','before'); await shot('manual-drag'); await page.mouse.up();
  await expect.poll(()=>list().locator('.explorer-title').allTextContents()).toEqual(['共享笔记','Note 10','Note 2']);
  await rowMore('Note 2','Move Up'); await expect.poll(()=>list().locator('.explorer-title').allTextContents()).toEqual(['共享笔记','Note 2','Note 10']);
  const manual = (await state()).viewOrders.notes;
  await sort('Name A–Z'); await rowMore('Note 2','Move to Folder…'); await page.keyboard.press('Escape');
  await sort('Manual'); assert.deepEqual((await state()).viewOrders.notes,manual);
  await page.getByRole('button',{name:'Sort files',exact:true}).click(); await shot('sort-menu'); await page.keyboard.press('Escape');
  report.checks.push('seven sort modes use actual title/createdAt/updatedAt with natural numeric collation; native drag and keyboard Move Up persist virtual-view placement order; automatic sort leaves Manual order intact');
  // Membership fixture is inserted only into this temporary workspace; no project pipeline is exposed.
  const links = [{id:uuidV7(),project:uuidV7()},{id:uuidV7(),project:uuidV7()}]; const db = new DatabaseSync(path); for (const link of links) db.prepare('INSERT INTO project_note_links VALUES(?,?,?)').run(link.id,link.project,shared); db.close();
  await page.reload(); await expect(title()).toHaveValue('共享笔记'); await allNotes();
  await rowMore('共享笔记','Move to Folder…'); await page.getByRole('dialog',{name:'Move to Folder'}).getByRole('button',{name:'Archive',exact:true}).click();
  assert.equal(read('SELECT * FROM project_note_links WHERE note_id=?',shared).length,2); assert.equal(read('SELECT parent_folder_id FROM placements WHERE entity_id=?',shared)[0].parent_folder_id,archive);
  await rowMore('Note 2','Rename'); await page.getByRole('textbox',{name:'Rename Note',exact:true}).fill('Note 3'); await page.getByRole('button',{name:'Save',exact:true}).click(); assert.equal(read('SELECT title FROM notes WHERE id=?',second)[0].title,'Note 3');
  await rowMore('Note 3','Add to Favorites'); await sidebar().getByRole('button',{name:'Favorites',exact:true}).click(); await expect(list().locator('.explorer-title')).toHaveText('Note 3'); await allNotes();
  await list().getByRole('button',{name:'More actions for Note 3',exact:true}).click(); await shot('note-actions'); await page.keyboard.press('Escape');
  await rowMore('Note 3','Copy Note Link'); assert.equal(await app.evaluate(({clipboard})=>clipboard.readText()),`syna://note/${second}`);
  report.checks.push('inactive rename uses Note CAS; favorites persist independently; real Electron clipboard receives a stable note link; moving a note preserves both project memberships');
  // A committed out-of-band association increments the Library revision; stale writes roll back and refresh.
  await page.getByRole('button',{name:'Create in Library',exact:true}).click(); await page.keyboard.press('Escape');
  await sort('Manual'); const before = await state();
  await writeFile(join(root,'workspace','.syna','test-fail-library'),'fail');
  await rowMore('Note 10','Move Up'); await expect(page.locator('.library-feedback')).toContainText('Previous arrangement restored');
  assert.deepEqual((await state()).viewOrders.notes,before.viewOrders.notes); await expect.poll(()=>list().locator('.explorer-title').allTextContents()).toEqual(['共享笔记','Note 3','Note 10']); await shot('write-failure-rollback'); await rm(join(root,'workspace','.syna','test-fail-library'));
  report.checks.push('injected SQLite metadata failure rolls optimistic order back, retains the previous persisted order and displays an error; Markdown content is untouched');
  // Move a folder with native HTML drag and exercise delayed expansion of the collapsed target.
  await sidebar().getByRole('button',{name:'Expand Archive',exact:true}).click();
  const researchRow = sidebar().locator(`[data-item-id="${research}"]`), sourceRow = sidebar().getByRole('button',{name:'Drag Sources',exact:true});
  if (await sidebar().getByRole('button',{name:'Expand Research & Notes',exact:true}).isVisible()) await sidebar().getByRole('button',{name:'Expand Research & Notes',exact:true}).click();
  // Move Sources to Archive so both distinct folder operations are visible in the gallery.
  const archiveRow = sidebar().locator(`[data-item-id="${archive}"]`); await sourceRow.dragTo(archiveRow,{targetPosition:{x:90,y:16}});
  await expect.poll(()=>read('SELECT parent_id FROM folders WHERE id=?',nested)[0].parent_id).toBe(archive);
  await sidebar().getByRole('button',{name:'More actions for Archive',exact:true}).click(); await page.getByRole('menuitem',{name:'Move to Folder…',exact:true}).click(); const move = page.getByRole('dialog',{name:'Move to Folder'}); await expect(move.getByRole('button',{name:'Archive / Sources',exact:true})).toBeDisabled(); await shot('folder-move'); await page.keyboard.press('Escape');
  assert.ok(await researchRow.isVisible());
  const cycle = await page.evaluate(async ({archive,research,id})=>{const data=await window.synaShell.library.getLibrary(); return window.synaShell.library.writeLibrary({expectedRevision:data.value.revision,command:{type:'move',target:{kind:'folder',id:archive},parentFolderId:research}},{commandId:id});},{archive,research,id:uuidV7()}); assert.equal(cycle.ok,false);
  report.checks.push('native folder drag updates parentId in SQLite; Move to Folder disables self/descendant targets and IPC independently rejects a cycle');
  await sidebar().getByRole('button',{name:'Archive',exact:true}).click(); await list().getByRole('button',{name:'共享笔记',exact:true}).click(); const sharedEditor=await page.locator('.cm-editor').elementHandle();
  await sidebar().getByRole('button',{name:'More actions for Archive',exact:true}).click(); await page.getByRole('menuitem',{name:'Move to Trash…'}).click(); await expect(page.getByRole('dialog',{name:'Move to Trash'})).toContainText('1 shared notes will remain in Uncategorized'); await shot('trash-preview'); await page.getByRole('button',{name:'Move to Trash',exact:true}).click();
  await expect(title()).toHaveValue('共享笔记'); assert.ok(await sharedEditor.evaluate(element=>element===document.querySelector('.cm-editor')));
  let trashed = await state(); assert.equal(trashed.placements.find(item=>item.id===shared).trashedBy,null); assert.equal(trashed.placements.find(item=>item.id===shared).parentFolderId,null); assert.equal(trashed.links.length,2);
  await sidebar().getByRole('button',{name:/^Trash/}).click(); await shot('trash'); await page.getByRole('button',{name:'Restore Archive',exact:true}).click();
  trashed = await state(); assert.equal(trashed.trash.length,0); assert.equal(trashed.placements.find(item=>item.id===first).trashedBy,null);
  report.checks.push('folder deletion previews actual descendant count and two retained project links, keeps the shared note available in Uncategorized, soft-trashes remaining entities and restores the same folder/note IDs without deleting content or history');
  await allNotes(); await list().getByRole('button',{name:'Note 10',exact:true}).click(); await editor().focus(); await editor().press('Meta+End'); await page.keyboard.insertText('\n重启后仍然存在'); await editor().press('Meta+s'); await expect(page.getByLabel('Save status')).toHaveAttribute('data-save-state','clean');
  await page.getByRole('button',{name:'Switch to light theme',exact:true}).click(); await shot('editor-light');
  await page.getByRole('button',{name:'Library',exact:true}).click(); await shot('sidebar-collapsed'); await page.getByRole('button',{name:'Enter focus mode',exact:true}).click(); await shot('focus'); await page.keyboard.press('Escape'); await restoreLayout();
  const placements = (await state()).placements, preferences = (await state()).preferences;
  await app.close(); app=null; await launch(); await expect(title()).toHaveValue('Note 10'); await expect(editor()).toContainText('重启后仍然存在'); assert.deepEqual((await state()).placements,placements); assert.deepEqual((await state()).preferences,preferences); assert.deepEqual((await state()).viewOrders.notes,manual);
  report.checks.push('full Electron restart restores directory relationships, Manual order, per-view sorting, recent document, Markdown buffer and theme; Focus and sidebar toggles preserve the editor');
  await allNotes(); await shot('explorer-light'); await page.getByRole('button',{name:'Switch to dark theme',exact:true}).click(); await shot('explorer-dark');
  for (const [width,height] of [[1024,768],[1280,800],[1440,900],[1920,1080]]) {
    await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setContentSize(size.width,size.height),{width,height}); await page.waitForFunction(width=>innerWidth===width,width);
    if (width===1024) await page.getByRole('button',{name:'Toggle context sidebar',exact:true}).click();
    for(const theme of ['light','dark']) { const toggle=page.getByRole('button',{name:`Switch to ${theme} theme`,exact:true}); if(await toggle.isVisible()) await toggle.click(); await page.getByRole('button',{name:'Create in Library',exact:true}).click(); const bounds=await page.getByRole('menu').boundingBox(); assert.ok(bounds.x>=0 && bounds.y>=0 && bounds.x+bounds.width<=width && bounds.y+bounds.height<=height); if(width===1024) await shot(`narrow-${theme}-menu`); await page.keyboard.press('Escape'); }
    if(width===1024) await page.getByRole('button',{name:'Toggle context sidebar',exact:true}).click();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
  report.checks.push('1024/1280/1440/1920 real Electron windows, light/dark themes, collapsed/sidebar overlay and Focus have bounded menus without horizontal page overflow');
  const invalid = await page.evaluate(async id=>window.synaShell.library.writeLibrary({expectedRevision:0,command:{type:'sort',key:'../../private',mode:'manual'}},{commandId:id}),uuidV7()); assert.equal(invalid.ok,false);
  const probePreload=join(root,'origin-probe.cjs');
  await writeFile(probePreload, `const {contextBridge,ipcRenderer}=require('electron'); contextBridge.exposeInMainWorld('probeLibrary',()=>ipcRenderer.invoke('syna:library',{protocolVersion:1,requestId:'${uuidV7()}',method:'getLibrary',args:[]}));`);
  const origin = await app.evaluate(async ({BrowserWindow},preload)=>{const win=new BrowserWindow({show:false,webPreferences:{preload,contextIsolation:true,sandbox:true}}); try { await win.loadURL('data:text/html,untrusted'); return await win.webContents.executeJavaScript('window.probeLibrary()'); } finally {win.destroy();} },probePreload); assert.equal(origin.ok,false); assert.equal(origin.error.code,'unavailable');
  report.checks.push('strict IPC schema rejects invalid sort scopes; an untrusted-origin window cannot access Library storage');
  const evidence={schemaVersion:read('PRAGMA user_version')[0].user_version,notes:read('SELECT id,title,revision,created_at,updated_at FROM notes ORDER BY id'),folders:read('SELECT id,parent_id,payload FROM folders ORDER BY id'),placements:read('SELECT * FROM placements ORDER BY kind,entity_id'),viewPlacements:read('SELECT * FROM view_placements ORDER BY view_key,order_key'),projectLinks:read('SELECT * FROM project_note_links ORDER BY id'),integrity:read('PRAGMA integrity_check'),foreignKeys:read('PRAGMA foreign_key_check')};
  assert.equal(evidence.integrity[0].integrity_check,'ok'); assert.deepEqual(evidence.foreignKeys,[]); await writeFile(`${artifacts}/sqlite-evidence.json`,JSON.stringify(evidence,null,2));
  assert.deepEqual(report.errors,[]); report.passed=true;
} catch(error) { report.errors.push(error.stack??String(error)); throw error; }
finally { await writeFile(`${artifacts}/electron-results.json`,JSON.stringify(report,null,2)); if(app) { if(clipboard!==undefined) try {await app.evaluate(({clipboard},text)=>clipboard.writeText(text),clipboard);}catch{ /* process already stopped */ } try {await app.close();}catch{ /* process already stopped */ } } for(const process of openedProcesses) if(process.exitCode===null) process.kill('SIGKILL'); await rm(root,{recursive:true,force:true}); }
console.log(JSON.stringify(report,null,2));
