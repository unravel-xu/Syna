import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { SQLiteWorkspace } from '@syna/storage';
import { createNoteService, uuidV7, reconcileBlocks } from '@syna/core';
import { buildElectron } from './build-electron.mjs';

const root = await mkdtemp(join(tmpdir(), 'syna-p2-e2e-'));
const database = join(root, 'workspace', '.syna', 'state.sqlite');
const failureFlag = join(root, 'workspace', '.syna', 'test-fail-save');
const delayFlag = join(root, 'workspace', '.syna', 'test-delay-save');
const development = process.argv.includes('--dev');
const documentLayout = process.argv.includes('--layout');
const redesign = process.argv.includes('--editor') || documentLayout;
const artifacts = process.env.SYNA_TEST_ARTIFACTS ?? (documentLayout ? '.artifacts/p2-layout' : redesign ? '.artifacts/p2-editor' : '.artifacts/p2');
const env = { ...process.env, SYNA_USER_DATA: join(root, 'profile'), SYNA_WORKSPACE: join(root, 'workspace'), SYNA_TEST_MODE: '1', SYNA_SCENE: '' };
if (development) env.SYNA_DEV = '1'; else delete env.SYNA_DEV;
delete env.ELECTRON_RUN_AS_NODE;
await mkdir(artifacts, { recursive: true }); await buildElectron();
const result = { mode: development ? 'development' : 'production', checks: [], errors: [], screenshots: [] };
let app, page, persistentBlockLink, originalClipboard;
const processes = [];
async function launch() {
  app = await electron.launch({ args: [resolve('apps/desktop')], env }); processes.push(app.process()); page = await app.firstWindow();
  if (originalClipboard === undefined) originalClipboard = await app.evaluate(({ clipboard }) => clipboard.readText());
  page.on('pageerror', error => result.errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') result.errors.push(message.text()); });
  await page.waitForSelector('.app-shell[data-runtime="electron"]');
}
function dbRead(sql, ...args) { const db = new DatabaseSync(database); try { return db.prepare(sql).get(...args); } finally { db.close(); } }
const editor = () => page.getByRole('textbox', { name: 'Markdown editor', exact: true });
const title = () => page.getByRole('textbox', { name: 'Note title', exact: true });
const status = () => page.getByLabel('Save status');
async function openSidebarNote(name) { const expand = page.getByRole('button', { name: 'Expand Uncategorized', exact: true }); if (await expand.isVisible()) await expand.click(); await page.getByRole('button', { name, exact: true }).click(); }
async function mode(name) { await page.getByRole('button', { name: /View mode:/ }).click(); await page.getByRole('menuitemradio', { name: new RegExp(name) }).click(); }
async function pageWidth(name) { await page.getByRole('button', { name: /Page width:/ }).click(); await page.getByRole('menuitemradio', { name: new RegExp(name) }).click(); }
async function screenshot(name) { const path = `${artifacts}/${development ? 'electron-dev' : 'electron'}-${name}.png`; if (/failure|conflict/.test(name)) await page.locator('.cm-scroller').evaluate(element => { element.scrollTop = element.scrollHeight; }); await page.mouse.move(1430, 890); await page.screenshot({ path, animations: 'disabled', scale: 'css' }); result.screenshots.push(path); }
try {
  await launch();
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.keyboard.press('Meta+Shift+n'); await expect(title()).toBeFocused(); await editor().focus();
  const firstId = await page.locator('.real-markdown').getAttribute('data-note-id');
  await mode('Source Mode');
  await title().fill('连接与思考');
  const firstText = '# 连接与思考\n\n第一篇真实 Markdown 笔记。\n\n- 捕获问题\n- 建立连接\n\n$$\nE = mc^2 \\label{eq:energy}\n$$\n\n原文保留 \\eqref{eq:energy}。';
  await editor().fill(firstText); await expect(status()).toHaveAttribute('data-save-state', 'clean');
  assert.equal(JSON.parse(dbRead('SELECT document FROM notes WHERE id=?', firstId).document).markdown, firstText);
  await screenshot('markdown-editing');
  if (redesign) {
    const revision = dbRead('SELECT revision FROM notes WHERE id=?', firstId).revision;
    const original = await page.locator('.cm-editor').elementHandle();
    for (const name of ['Live Preview', 'Reading Mode', 'Source Mode']) {
      await mode(name); await screenshot(name.toLowerCase().replaceAll(' ', '-'));
      assert.equal(dbRead('SELECT revision FROM notes WHERE id=?', firstId).revision, revision);
      assert.ok(await original.evaluate(element => element === document.querySelector('.cm-editor')));
    }
    assert.equal(await status().getAttribute('data-saved-at'), JSON.parse(dbRead('SELECT document FROM notes WHERE id=?', firstId).document).updatedAt);
    if (documentLayout) {
      for (const width of ['Full Width', 'Centered']) for (const view of ['Live Preview', 'Reading Mode', 'Source Mode']) {
        await pageWidth(width); await mode(view);
        assert.equal(dbRead('SELECT revision FROM notes WHERE id=?', firstId).revision, revision);
        assert.ok(await original.evaluate(element => element === document.querySelector('.cm-editor')));
      }
      const matrix = [];
      for (const [windowWidth, windowHeight] of [[1024, 768], [1280, 800], [1440, 900], [1920, 1080]]) {
        await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(size.width, size.height), { width: windowWidth, height: windowHeight });
        await page.waitForFunction(width => window.innerWidth === width, windowWidth);
        for (const preference of ['Centered', 'Full Width']) {
          const origins = [];
          for (const viewMode of ['Live Preview', 'Reading Mode', 'Source Mode']) {
            await pageWidth(preference); await mode(viewMode);
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            const geometry = await page.evaluate(() => {
              const viewport = document.querySelector('.document-viewport'), body = document.querySelector('.document-viewport-body'), reading = document.querySelector('.reading-content');
              const scroller = document.querySelector(reading ? '.reading-surface' : '.cm-scroller'), content = reading ?? document.querySelector('.cm-content');
              const padding = parseFloat(getComputedStyle(scroller).paddingLeft), rail = parseFloat(getComputedStyle(body).getPropertyValue('--document-rail')), ratio = parseFloat(getComputedStyle(body).getPropertyValue('--document-ratio')) / 100;
              const columnWidth = reading ? content.getBoundingClientRect().width : content.getBoundingClientRect().width + document.querySelector('.cm-gutters').getBoundingClientRect().width;
              const origin = document.querySelector(reading ? '.reading-content h1' : '.cm-line').getBoundingClientRect().left;
              return { surface: viewport.clientWidth, requested: viewport.dataset.width, padding, rail, ratio, columnWidth, available: scroller.clientWidth - 2 * padding, origin, overflow: scroller.scrollWidth > scroller.clientWidth + 1 };
            });
            const ratio = preference === 'Full Width' || geometry.surface <= 650 ? 1 : geometry.surface <= 900 ? .9 : .8;
            assert.equal(geometry.ratio, ratio); assert.equal(geometry.requested, preference === 'Full Width' ? 'full' : 'centered');
            assert.ok(Math.abs(geometry.columnWidth - geometry.available * ratio) < 1); assert.equal(geometry.overflow, false);
            assert.equal(dbRead('SELECT revision FROM notes WHERE id=?', firstId).revision, revision);
            origins.push(geometry.origin); matrix.push({ windowWidth, preference, viewMode, ...geometry });
          }
          assert.ok(Math.max(...origins) - Math.min(...origins) < 1);
        }
      }
      await writeFile(`${artifacts}/electron-${development ? 'development' : 'production'}-geometry.json`, JSON.stringify(matrix, null, 2));
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1440, 900));
      await pageWidth('Full Width'); await page.waitForTimeout(300);
      const scene = JSON.parse(dbRead("SELECT payload FROM work_scenes WHERE id='library'").payload);
      assert.equal(scene.editors[firstId].pageWidth, 'full');
      await pageWidth('Centered');
      result.checks.push('four real Electron window sizes × two width preferences × three modes have matching origins and percentage columns without horizontal overflow or extra SQLite revisions; only requested pageWidth is persisted in WorkScene');
    }
    result.checks.push('all three view modes retain the same mounted CodeMirror, derive current text and create zero document revisions; save timestamp equals the confirmed SQLite revision');
    await editor().press('Meta+Home'); await editor().press('Shift+F10');
    await page.getByRole('menuitem', { name: '复制块链接' }).click();
    const link = await app.evaluate(({ clipboard }) => clipboard.readText());
    const firstBlock = JSON.parse(dbRead('SELECT document FROM notes WHERE id=?', firstId).document).blocks[0];
    assert.equal(link, `syna://note/${firstId}#^${firstBlock.id}`); persistentBlockLink = link;
    await editor().press('Shift+F10'); await page.getByRole('menuitem', { name: '复制 Markdown' }).click();
    assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), firstText.split('\n')[0]);
    await editor().press('Meta+End'); await page.keyboard.insertText(`\n\n[引用此段](${link})`);
    await mode('Reading Mode'); await page.getByRole('link', { name: '引用此段', exact: true }).click();
    await expect(page.locator('.real-markdown')).toHaveAttribute('data-view-mode', 'live');
    await expect(editor()).toBeFocused(); await mode('Source Mode'); await editor().press('Meta+z');
    await editor().press('Meta+End'); await editor().press('Enter'); await editor().press('Enter');
    await editor().pressSequentially('/head'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
    await page.keyboard.insertText('Slash 事务'); await expect(editor()).toContainText('## Slash 事务');
    await editor().press('Meta+s'); await expect(status()).toHaveAttribute('data-save-state', 'clean');
    assert.ok(JSON.parse(dbRead('SELECT document FROM notes WHERE id=?', firstId).document).markdown.includes('## Slash 事务'));
    await editor().fill(firstText); await editor().press('Meta+s'); await expect(status()).toHaveAttribute('data-save-state', 'clean');
    result.checks.push('real system clipboard receives the persisted UUIDv7 block link and exact block Markdown; Reading links resolve through existing Navigation; Slash transactions persist through the same save queue');
  }
  const blockIds = JSON.parse(dbRead('SELECT document FROM notes WHERE id=?', firstId).document).blocks.map(block => block.id);
  await editor().focus(); await editor().press('Meta+a'); await editor().press('Backspace');
  await expect.poll(() => JSON.parse(dbRead('SELECT document FROM notes WHERE id=?', firstId).document).markdown).toBe('');
  await editor().press('Meta+z');
  await expect.poll(() => JSON.parse(dbRead('SELECT document FROM notes WHERE id=?', firstId).document).markdown).toBe(firstText);
  assert.deepEqual(JSON.parse(dbRead('SELECT document FROM notes WHERE id=?', firstId).document).blocks.map(block => block.id), blockIds);
  result.checks.push('CodeMirror undo restores persisted UUIDv7 block identities together with Markdown instead of assigning new IDs');
  await page.keyboard.press('Meta+Shift+n');
  await expect(page.locator('.real-markdown')).not.toHaveAttribute('data-note-id', firstId);
  const secondId = await page.locator('.real-markdown').getAttribute('data-note-id');
  await mode('Source Mode');
  assert.notEqual(firstId, secondId);
  await title().fill('第二篇 · 工作现场');
  if (documentLayout) await pageWidth('Full Width');
  const secondText = '# 第二篇\n\n' + Array.from({ length: 100 }, (_, index) => `段落 ${index + 1}：在独立工作面里继续思考。`).join('\n\n');
  await editor().fill(secondText); await editor().focus(); await editor().press('Meta+End');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.imeSetComposition', { text: '中文输入', selectionStart: 4, selectionEnd: 4 });
  await cdp.send('Input.insertText', { text: '中文输入法完成' });
  await expect(editor()).toContainText('中文输入法完成'); await expect(status()).toHaveAttribute('data-save-state', 'clean');
  await cdp.send('Input.imeSetComposition', { text: '切换中文', selectionStart: 4, selectionEnd: 4 });
  await cdp.send('Input.insertText', { text: '切换时尾字' });
  await openSidebarNote('连接与思考');
  await expect(title()).toHaveValue('连接与思考');
  const actualSecond = JSON.parse(dbRead('SELECT document FROM notes WHERE id=?', secondId).document).markdown;
  assert.ok(actualSecond.includes('中文输入法完成')); assert.equal(actualSecond.split('中文输入法完成').length - 1, 1);
  await openSidebarNote('连接与思考'); await expect(editor()).toContainText('第一篇真实 Markdown');
  await openSidebarNote('第二篇 · 工作现场'); await expect(editor()).toContainText('中文输入法完成');
  result.checks.push('two UUIDv7 notes created, stored in SQLite, edited and switched; Chromium IME composition committed without lost or duplicate Chinese characters; TeX label/ref source retained');
  await page.getByRole('button', { name: 'Library', exact: true }).click(); await expect(page.getByRole('complementary', { name: 'Context sidebar' })).toBeHidden();
  await screenshot('sidebar-collapsed');
  await page.getByRole('button', { name: 'Enter focus mode', exact: true }).click(); await expect(editor()).toContainText('中文输入法完成'); await screenshot('focus'); await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  result.checks.push('sidebar collapse and Focus keep the mounted editor, content and session; Escape restores requested layout');
  await editor().focus(); await editor().press('Meta+Home'); await editor().press('ArrowRight'); await editor().press('Shift+ArrowRight'); await editor().press('Shift+ArrowRight');
  await page.waitForTimeout(100);
  await page.locator('.cm-scroller').evaluate(element => { element.scrollTop = 450; });
  await page.waitForTimeout(400);
  const sceneBefore = await page.evaluate(() => ({ selection: window.getSelection()?.toString(), scroll: document.querySelector('.cm-scroller').scrollTop }));
  await app.close(); app = null;
  await launch(); await expect(title()).toHaveValue('第二篇 · 工作现场');
  if (documentLayout) await expect(page.getByRole('button', { name: 'Page width: Full Width', exact: true })).toBeVisible();
  await expect.poll(() => page.locator('.cm-scroller').evaluate(element => element.scrollTop)).toBe(sceneBefore.scroll);
  assert.equal(await page.evaluate(() => window.getSelection()?.toString()), sceneBefore.selection);
  result.checks.push('graceful full process restart restores recent note, both contents, selection and scroll');
  if (redesign) {
    await mode('Live Preview'); await editor().focus(); await editor().press('Meta+End');
    const ime = await page.context().newCDPSession(page);
    const imeHost = await page.locator('.cm-editor').elementHandle();
    await ime.send('Input.imeSetComposition', { text: '实时中文', selectionStart: 4, selectionEnd: 4 });
    await expect(page.getByRole('listbox', { name: 'Insert block' })).toBeHidden();
    await ime.send('Input.insertText', { text: '实时预览中文完成' });
    await expect(editor()).toContainText('实时预览中文完成'); await editor().press('Meta+s');
    const liveSaved = JSON.parse(dbRead('SELECT document FROM notes WHERE id=?', secondId).document).markdown;
    assert.equal(liveSaved.split('实时预览中文完成').length - 1, 1);
    assert.ok(await imeHost.evaluate(element => element === document.querySelector('.cm-editor')));
    await editor().press('Meta+End'); await page.keyboard.insertText(`\n\n[引用前一篇](${persistentBlockLink})`);
    await mode('Reading Mode'); await page.getByRole('link', { name: '引用前一篇', exact: true }).click();
    await expect(title()).toHaveValue('连接与思考'); await expect(editor()).toBeFocused();
    await openSidebarNote('第二篇 · 工作现场');
    await expect(page.locator('.real-markdown')).toHaveAttribute('data-view-mode', 'reading');
    await page.getByLabel('Markdown reading view').evaluate(element => { element.scrollTop = 260; });
    await app.close(); app = null; await launch();
    await expect(page.locator('.real-markdown')).toHaveAttribute('data-view-mode', 'reading');
    if (documentLayout) await expect(page.getByRole('button', { name: 'Page width: Full Width', exact: true })).toBeVisible();
    await expect.poll(() => page.getByLabel('Markdown reading view').evaluate(element => element.scrollTop)).toBe(260);
    await mode('Source Mode');
    result.checks.push('Cross-note UUIDv7 links reveal the target after mount and preserve Navigation; Live Preview Chromium IME survives decoration updates and saves the final Chinese text; full restart restores Reading Mode and its independent scroll without changing editor selection/history on mode switches');
  }
  if (redesign) {
    await writeFile(delayFlag, 'deterministic test latency');
    const confirmed = await status().getAttribute('data-saved-at');
    await editor().focus(); await editor().press('Meta+End'); await page.keyboard.insertText('\n快速连续输入：一二三四五');
    await expect(status()).toHaveAttribute('data-save-state', 'dirty'); await screenshot('save-dirty');
    await expect(status()).toHaveAttribute('data-save-state', 'saving');
    assert.equal(await status().getAttribute('data-saved-at'), confirmed); await screenshot('save-in-progress');
    await page.keyboard.insertText(' · 保存中到达的新输入');
    await openSidebarNote('连接与思考');
    await expect(title()).toHaveValue('连接与思考');
    assert.ok(JSON.parse(dbRead('SELECT document FROM notes WHERE id=?', secondId).document).markdown.includes('保存中到达的新输入'));
    await rm(delayFlag); await openSidebarNote('第二篇 · 工作现场');
    await expect(status()).toHaveAttribute('data-save-state', 'clean'); await screenshot('save-confirmed');
    result.checks.push('deterministic SQLite latency exposes Dirty/Saving/Clean feedback; timestamp stays at the prior commit during saving; newer rapid input and navigation during saving pass the serial flush barrier');
  }
  await writeFile(failureFlag, 'injected only in this isolated E2E workspace');
  await editor().focus(); await editor().press('Meta+End'); await page.keyboard.insertText('\n\n保存失败时必须保留这份草稿。');
  await expect(status()).toHaveAttribute('data-save-state', 'error'); await screenshot('save-failure');
  await openSidebarNote('连接与思考');
  await expect(title()).toHaveValue('第二篇 · 工作现场'); await expect(editor()).toContainText('必须保留这份草稿');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await expect(status()).toHaveAttribute('data-save-state', 'error'); assert.equal((await app.windows()).length, 1);
  await expect.poll(() => dbRead('SELECT change_seq FROM recovery_drafts WHERE note_id=?', secondId)?.change_seq).toBeGreaterThan(0);
  result.checks.push('real SQLite fault retains draft, blocks note/history navigation and window close, and writes an independent recovery checkpoint');
  try { await app.evaluate(({ app }) => app.exit(17)); } catch { /* intentional crash of isolated test process */ } app = null;
  await rm(failureFlag); await launch();
  await expect(page.getByRole('button', { name: 'Restore draft', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Restore draft', exact: true }).click();
  await editor().focus(); await editor().press('Meta+End');
  await expect(editor()).toContainText('必须保留这份草稿'); await expect(status()).toHaveAttribute('data-save-state', 'clean');
  result.checks.push('forced process exit recovers the independent draft after explicit Restore; restored content then saves normally');
  const external = new SQLiteWorkspace(database), service = createNoteService(external);
  const saved = await service.getNote(secondId); assert.ok(saved.ok);
  const remoteText = '另一位写入者的新版本，不能被旧草稿覆盖。';
  const other = await service.saveNote({ noteId: secondId, expectedRevision: saved.value.revision, changeSeq: 1, title: saved.value.title, markdown: remoteText, blocks: reconcileBlocks(remoteText) }, { commandId: uuidV7() }); assert.ok(other.ok); external.close();
  await editor().focus(); await editor().press('Meta+End'); await page.keyboard.insertText('\n我的本地冲突草稿');
  await expect(status()).toHaveAttribute('data-save-state', 'conflict');
  assert.equal(JSON.parse(dbRead('SELECT document FROM notes WHERE id=?', secondId).document).markdown, remoteText);
  await expect(editor()).toContainText('我的本地冲突草稿');
  if (redesign) { await page.getByRole('button', { name: '版本冲突 · 查看详情' }).click(); await expect(page.locator('.conflict-comparison')).toContainText(remoteText); await expect(editor()).toContainText('我的本地冲突草稿'); }
  await screenshot('revision-conflict');
  await expect.poll(() => dbRead('SELECT change_seq FROM recovery_drafts WHERE note_id=?', secondId)?.change_seq).toBeGreaterThan(0);
  try { await app.evaluate(({ app }) => app.exit(18)); } catch { /* recovery revision audit */ } app = null;
  await launch(); await expect(status()).toHaveAttribute('data-save-state', 'conflict');
  await editor().focus(); await editor().press('Meta+End');
  await expect(editor()).toContainText('我的本地冲突草稿');
  assert.equal(JSON.parse(dbRead('SELECT document FROM notes WHERE id=?', secondId).document).markdown, remoteText);
  result.checks.push('a recovery draft with an older base revision reopens as a conflict after restart and never auto-overwrites the saved note');
  await page.getByRole('button', { name: 'Save a copy', exact: true }).click(); await expect(title()).toHaveValue('第二篇 · 工作现场 (copy)');
  await editor().focus(); await editor().press('Meta+End');
  await expect(editor()).toContainText('我的本地冲突草稿'); assert.equal(JSON.parse(dbRead('SELECT document FROM notes WHERE id=?', secondId).document).markdown, remoteText);
  result.checks.push('external revision conflict never overwrites saved content; local text is retained and Save a copy creates a separate stable note');
  await mode('Source Mode');
  const malformed = await page.evaluate(() => window.synaShell.notes.saveNote({ noteId: 'invalid' }, { commandId: 'invalid' })); assert.equal(malformed.ok, false);
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  result.checks.push('restricted preload uses fixed validated methods; malformed writes rejected; renderer has no Node access');
  if (development) {
    const cssPath = 'apps/desktop/src/renderer/styles/editor.css', css = await readFile(cssPath, 'utf8');
    try { await writeFile(cssPath, `${css}\n:root { --p2-hmr: verified; }`); await page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue('--p2-hmr').trim() === 'verified'); await expect(editor()).toContainText('我的本地冲突草稿'); } finally { await writeFile(cssPath, css); }
    result.checks.push('editor CSS HMR preserves the live document session');
  }
  assert.deepEqual(result.errors, []); result.passed = true;
} catch (error) { result.passed = false; result.failure = String(error); throw error; }
finally {
  await writeFile(`${artifacts}/electron-${development ? 'development' : 'production'}-results.json`, JSON.stringify(result, null, 2));
  if (app) { try { if (originalClipboard !== undefined) await app.evaluate(({ clipboard }, text) => clipboard.writeText(text), originalClipboard); await app.evaluate(({ app }) => app.exit(0)); } catch { /* isolate cleanup */ } }
  await Promise.all(processes.map(process => new Promise(resolve => { if (process.exitCode !== null || process.signalCode !== null) { resolve(); return; } const timer = setTimeout(() => { process.kill('SIGKILL'); }, 5000); process.once('exit', () => { clearTimeout(timer); resolve(); }); })));
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
console.log(JSON.stringify(result, null, 2));
