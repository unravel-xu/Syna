import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { InMemoryWorkspace, LibraryExplorer, NotesWorkspace, createShellApplication, createLibraryService, createNoteService, folderScope, isAvailable, sortItems, uuidV7 } from '@syna/core';
import { SQLiteWorkspace } from '@syna/storage';
import type { LibraryCommand, LibraryService, Result } from '@syna/contracts';
const value = <T>(result: Result<T>): T => { if (!result.ok) assert.fail(result.error.message); return result.value; };
async function mutate(service: LibraryService, command: LibraryCommand) { const state = value(await service.getLibrary()); return value(await service.writeLibrary({ expectedRevision: state.revision, command }, { commandId: uuidV7() })); }
for (const mode of ['memory', 'sqlite'] as const) {
  test(`${mode}: folders, placements, CAS ordering, natural sort, trash, restore and shared project links`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'syna-p3-contract-')), path = join(root, '.syna', 'state.sqlite');
    const repo = mode === 'memory' ? new InMemoryWorkspace() : new SQLiteWorkspace(path, true), notes = createNoteService(repo), library = createLibraryService(repo);
    try {
      let state = await mutate(library, { type: 'create-folder', name: '研究 2', parentFolderId: null });
      const first = state.folders[0];
      state = await mutate(library, { type: 'create-folder', name: '研究 10', parentFolderId: null }); const second = state.folders.find(folder => folder.id !== first.id)!;
      state = await mutate(library, { type: 'create-folder', name: '子目录', parentFolderId: first.id }); const nested = state.folders.find(folder => folder.parentId === first.id)!;
      const a = value(await notes.createNote({ title: 'Note 10', markdown: 'A', folderId: first.id }, { commandId: uuidV7() }));
      const b = value(await notes.createNote({ title: 'Note 2', markdown: 'B', folderId: first.id }, { commandId: uuidV7() }));
      const c = value(await notes.createNote({ title: '共享笔记', markdown: 'shared', folderId: nested.id }, { commandId: uuidV7() }));
      assert.equal(a.createdAt, a.updatedAt);
      state = await mutate(library, { type: 'sort', key: folderScope(first.id), mode: 'manual' });
      state = await mutate(library, { type: 'move', target: { kind: 'note', id: b.id }, parentFolderId: first.id, beforeId: a.id, scope: folderScope(first.id) });
      const manualOrder = state.placements.filter(item => item.kind === 'note' && item.parentFolderId === first.id).sort((a, b) => a.orderKey - b.orderKey).map(item => item.id);
      assert.deepEqual(manualOrder, [b.id, a.id]);
      for (const sort of ['name-asc', 'name-desc', 'created-asc', 'created-desc', 'modified-asc', 'modified-desc'] as const) {
        state = await mutate(library, { type: 'sort', key: folderScope(first.id), mode: sort });
        const items = state.notes.map(note => ({ ...note, orderKey: state.placements.find(item => item.id === note.id)!.orderKey }));
        const sorted = sortItems(items, sort), reversed = sortItems(items, sort.endsWith('asc') ? sort.replace('asc', 'desc') as typeof sort : sort.replace('desc', 'asc') as typeof sort);
        assert.equal(new Set(sorted.map(item => item.id)).size, 3);
        if (sort === 'name-asc') assert.ok(sorted.findIndex(item => item.id === b.id) < sorted.findIndex(item => item.id === a.id));
        if (sort === 'name-desc') assert.ok(sorted.findIndex(item => item.id === a.id) < sorted.findIndex(item => item.id === b.id));
        assert.equal(reversed.length, sorted.length);
      }
      let current = value(await library.getLibrary());
      const unchanged = current.placements;
      const sameParent = await mutate(library,{type:'move',target:{kind:'note',id:a.id},parentFolderId:first.id});
      assert.deepEqual(sameParent.placements,unchanged,'dropping into the current folder must not change Manual order in automatic mode');
      assert.equal((await library.writeLibrary({ expectedRevision: current.revision, command: { type: 'move', target: { kind: 'note', id: a.id }, parentFolderId: first.id, scope: folderScope(first.id) } }, { commandId: uuidV7() })).ok, false, 'automatic sorting cannot reorder even at end');
      state = await mutate(library, { type: 'sort', key: folderScope(first.id), mode: 'manual' });
      assert.deepEqual(state.placements.filter(item => item.kind === 'note' && item.parentFolderId === first.id).sort((a, b) => a.orderKey - b.orderKey).map(item => item.id), manualOrder);
      state = await mutate(library, { type: 'sort', key: 'notes', mode: 'manual' });
      state = await mutate(library, { type: 'reorder-view', key: 'notes', noteId: c.id, beforeId: a.id });
      assert.equal(state.placements.find(item => item.id === c.id)!.parentFolderId, nested.id, 'view order is distinct from primary folder placement');
      const beforeConflict = state;
      state = await mutate(library, { type: 'favorite', noteId: a.id, value: true });
      assert.equal((await library.writeLibrary({ expectedRevision: beforeConflict.revision, command: { type: 'rename-folder', id: first.id, name: 'stale' } }, { commandId: uuidV7() })).ok, false);
      const input = { expectedRevision: state.revision, command: { type: 'rename-folder' as const, id: second.id, name: 'Renamed' } }, meta = { commandId: uuidV7() };
      const renamed = await library.writeLibrary(input, meta); assert.ok(renamed.ok); assert.deepEqual(await library.writeLibrary(input, meta), renamed);
      assert.equal((await library.writeLibrary({ ...input, command: { ...input.command, name: 'collision' } }, meta)).ok, false);
      state = value(await library.getLibrary());
      for (const parentFolderId of [first.id, nested.id]) assert.equal((await library.writeLibrary({ expectedRevision: state.revision, command: { type: 'move', target: { kind: 'folder', id: first.id }, parentFolderId } }, { commandId: uuidV7() })).ok, false, 'cycles refused');
      state = await mutate(library, { type: 'move', target: { kind: 'folder', id: second.id }, parentFolderId: nested.id });
      assert.equal(state.folders.find(folder => folder.id === second.id)!.parentId, nested.id);
      const links = [{ id: uuidV7(), projectId: uuidV7(), noteId: c.id }, { id: uuidV7(), projectId: uuidV7(), noteId: c.id }];
      if (repo instanceof InMemoryWorkspace) repo.seedProjectLinks(links);
      else { const db = new DatabaseSync(path); for (const link of links) db.prepare('INSERT INTO project_note_links VALUES(?,?,?)').run(link.id, link.projectId, link.noteId); db.close(); }
      state = await mutate(library, { type: 'move', target: { kind: 'note', id: c.id }, parentFolderId: first.id }); assert.deepEqual([...state.links].sort((a,b)=>a.id.localeCompare(b.id)), [...links].sort((a,b)=>a.id.localeCompare(b.id)));
      const associationPlan = value(await library.previewTrash({kind:'folder',id:first.id}));
      if (repo instanceof InMemoryWorkspace) repo.seedProjectLinks(links.slice(1));
      else { const db = new DatabaseSync(path); db.prepare('DELETE FROM project_note_links WHERE id=?').run(links[0].id); db.close(); }
      assert.ok((await notes.getNote(c.id)).ok, 'unlinking one project does not delete the shared note');
      const changedLinks = value(await library.getLibrary());
      assert.equal((await library.writeLibrary({expectedRevision:changedLinks.revision,command:{type:'trash',planId:associationPlan.id,fingerprint:associationPlan.fingerprint}},{commandId:uuidV7()})).ok,false,'relationship changes invalidate deletion previews');
      if (repo instanceof InMemoryWorkspace) repo.seedProjectLinks(links);
      else { const db = new DatabaseSync(path); db.prepare('INSERT INTO project_note_links VALUES(?,?,?)').run(links[0].id,links[0].projectId,links[0].noteId); db.close(); }

      const stalePlan = value(await library.previewTrash({ kind: 'folder', id: first.id }));
      value(await notes.saveNote({ noteId: a.id, title: a.title, markdown: 'changed after preview', blocks: [], expectedRevision: 1, changeSeq: 1 }, { commandId: uuidV7() }));
      current = value(await library.getLibrary()); assert.deepEqual(current.viewOrders.notes, state.viewOrders.notes);
      const stale = await library.writeLibrary({ expectedRevision: current.revision, command: { type: 'trash', planId: stalePlan.id, fingerprint: stalePlan.fingerprint } }, { commandId: uuidV7() }); assert.equal(stale.ok, false);
      const plan = value(await library.previewTrash({ kind: 'folder', id: first.id })); assert.equal(plan.preservedNotes.length, 1); assert.equal(plan.affectedLinks, 2);
      state = await mutate(library, { type: 'trash', planId: plan.id, fingerprint: plan.fingerprint });
      assert.equal(isAvailable(state, { kind: 'note', id: a.id }), false); assert.equal(isAvailable(state, { kind: 'note', id: c.id }), true); assert.equal(state.placements.find(item => item.id === c.id)!.parentFolderId, null); assert.equal(state.links.length, 2);
      assert.equal((await notes.getNote(a.id)).ok, false); assert.equal((await notes.saveNote({ noteId: a.id, expectedRevision: 2, changeSeq: 2, title: a.title, markdown: 'illegal', blocks: [] }, { commandId: uuidV7() })).ok, false);
      assert.equal((await notes.createNote({ title: 'bad', markdown: '', folderId: first.id }, { commandId: uuidV7() })).ok, false);
      // A new sibling can reuse the old display name; restore never overwrites it.
      await mutate(library, { type: 'create-folder', name: first.name, parentFolderId: null });
      state = await mutate(library, { type: 'restore', batchId: state.trash[0].id });
      assert.ok(state.folders.find(folder => folder.id === first.id)!.name.startsWith(first.name + ' (restored'));
      assert.equal(value(await notes.getNote(a.id)).markdown, 'changed after preview'); assert.equal(value(await notes.getNote(a.id)).revision, 2); assert.equal(state.links.length, 2);
      assert.equal(state.placements.find(item=>item.id===c.id)!.parentFolderId,first.id,'restore reattaches an untouched shared note placement');
      const notePlan=value(await library.previewTrash({kind:'note',id:c.id})); assert.equal(notePlan.preservedNotes.length,0);
      state=await mutate(library,{type:'trash',planId:notePlan.id,fingerprint:notePlan.fingerprint}); assert.equal((await notes.getNote(c.id)).ok,false); assert.equal(state.links.length,2);
      state=await mutate(library,{type:'restore',batchId:state.trash[0].id}); assert.ok((await notes.getNote(c.id)).ok); assert.equal(state.links.length,2);
      await mutate(library, { type: 'visit', noteId: b.id });
      state = value(await library.getLibrary()); assert.ok(state.flags[b.id].lastVisitedAt); assert.equal(value(await notes.getNote(b.id)).revision, 1);
      if (repo instanceof SQLiteWorkspace) { repo.close(); const reopened = new SQLiteWorkspace(path); const restored = value(await reopened.getLibrary()); assert.deepEqual(restored.preferences, state.preferences); assert.deepEqual(restored.viewOrders, state.viewOrders); assert.deepEqual(restored.placements, state.placements); assert.equal(restored.links.length, 2); reopened.close(); }
    } finally { if (repo instanceof SQLiteWorkspace) { try { repo.close(); } catch { /* reopened above */ } } await rm(root, { recursive: true, force: true }); }
  });
  test(`${mode}: failed metadata write is atomic and can be retried with the same command`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'syna-p3-failure-')), path = join(root, '.syna', 'state.sqlite');
    const repo = mode === 'memory' ? new InMemoryWorkspace() : new SQLiteWorkspace(path, true);
    try { const service = createLibraryService(repo), before = value(await service.getLibrary()), input = { expectedRevision: before.revision, command: { type: 'create-folder' as const, name: 'Retained', parentFolderId: null } }, meta = { commandId: uuidV7() };
      if (repo instanceof InMemoryWorkspace) repo.failNextLibrary = true; else await writeFile(join(dirname(path), 'test-fail-library'), 'fail');
      assert.equal((await service.writeLibrary(input, meta)).ok, false); assert.deepEqual(value(await service.getLibrary()), before);
      if (repo instanceof SQLiteWorkspace) await rm(join(dirname(path), 'test-fail-library'));
      assert.ok((await service.writeLibrary(input, meta)).ok); assert.equal(value(await service.getLibrary()).folders.length, 1);
    } finally { if (repo instanceof SQLiteWorkspace) repo.close(); await rm(root, { recursive: true, force: true }); }
  });
}
test('stable sort uses real timestamps and natural Chinese/English numeric titles', () => {
  const items = [{ id: 'a', title: '笔记 10', createdAt: '2020-01-01', updatedAt: '2024-01-03', orderKey: 2 }, { id: 'b', title: '笔记 2', createdAt: '2020-01-03', updatedAt: '2024-01-01', orderKey: 0 }, { id: 'c', title: '笔记 1', createdAt: '2020-01-02', updatedAt: '2024-01-02', orderKey: 1 }];
  const expected = { manual: 'bca', 'name-asc': 'cba', 'name-desc': 'abc', 'created-asc': 'acb', 'created-desc': 'bca', 'modified-asc': 'bca', 'modified-desc': 'acb' } as const;
  for (const [mode, order] of Object.entries(expected)) assert.equal(sortItems(items, mode as keyof typeof expected).map(item => item.id).join(''), order);
  const english = items.map((item,index)=>({ ...item, title: `Note ${[10,2,1][index]}` })); assert.equal(sortItems(english,'name-asc').map(item=>item.id).join(''),'cba');
  assert.deepEqual(sortItems(items.map(item=>({ ...item,title:'same' })), 'name-desc').map(item=>item.id), ['a','b','c']);
});
test('v1 migration makes a consistent backup, backfills creation from revision 1 and refuses newer schemas', async () => {
  const root = await mkdtemp(join(tmpdir(), 'syna-p3-migration-')), path = join(root, '.syna', 'state.sqlite'); await mkdir(dirname(path), { recursive: true });
  const repo = new SQLiteWorkspace(path), notes = createNoteService(repo);
  const note = value(await notes.createNote({ title: 'Before migration', markdown: '原始数据' }, { commandId: uuidV7() })); repo.close();
  const db = new DatabaseSync(path); db.exec(`PRAGMA foreign_keys=OFF; DROP TABLE placements; DROP TABLE folders; DROP TABLE library_meta; DROP TABLE note_flags; DROP TABLE view_placements; DROP TABLE trash_batches; DROP TABLE deletion_plans; DROP TABLE project_note_links; ALTER TABLE notes DROP COLUMN created_at; UPDATE notes SET document=json_remove(document,'$.createdAt'); PRAGMA user_version=1;`); db.close();
  try { const migrated = new SQLiteWorkspace(path); assert.equal(value(await migrated.read(note.id)).createdAt, note.createdAt); assert.equal(value(await migrated.list()).length, 1); migrated.close();
    const files = await readdir(dirname(path)), backup = files.find(name=>name.includes('before-v2')); assert.ok(backup); const copy = new DatabaseSync(join(dirname(path), backup!)); assert.equal(copy.prepare('PRAGMA user_version').get()!.user_version,1); assert.equal(JSON.parse(copy.prepare('SELECT document FROM notes').get()!.document as string).markdown,'原始数据'); copy.close();
    const newer = new DatabaseSync(path); newer.exec('PRAGMA user_version=99'); newer.close(); assert.throws(()=>new SQLiteWorkspace(path),/newer schema/);
  } finally { await rm(root,{recursive:true,force:true}); }
});

test('Explorer publishes optimistic order, rolls back on failure and refreshes external changes', async () => {
  const repo = new InMemoryWorkspace(), notes = createNoteService(repo), service = createLibraryService(repo);
  const a = value(await notes.createNote({title:'A',markdown:'preserved A'}, {commandId:uuidV7()}));
  const b = value(await notes.createNote({title:'B',markdown:'preserved B'}, {commandId:uuidV7()}));
  await mutate(service,{type:'sort',key:'notes',mode:'manual'});
  await mutate(service,{type:'reorder-view',key:'notes',noteId:a.id,beforeId:b.id});
  const app = createShellApplication({load:()=>undefined,save:()=>{}});
  const workspace = new NotesWorkspace(app,notes,repo,()=>{throw Error('Metadata must not mount an editor');});
  let release!:()=>void;
  const gate = new Promise<void>(resolve=>{release=resolve;});
  const delayed: LibraryService = {...service,writeLibrary:async(input,meta)=>{await gate;return service.writeLibrary(input,meta);}};
  const explorer = new LibraryExplorer(delayed,notes,workspace,app,()=>{throw Error('Metadata must not edit a title');});
  await explorer.refresh(); repo.failNextLibrary = true;
  const operation = explorer.command({type:'reorder-view',key:'notes',noteId:b.id,beforeId:a.id},true);
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(explorer.getSnapshot().data.viewOrders.notes,[b.id,a.id]);
  release(); assert.equal((await operation).ok,false);
  assert.deepEqual(explorer.getSnapshot().data.viewOrders.notes,[a.id,b.id]);
  assert.match(explorer.getSnapshot().error!.message,/restored/i);
  assert.equal(value(await notes.getNote(a.id)).revision,1); assert.equal(value(await notes.getNote(b.id)).markdown,'preserved B');
});

test('restoring a separately trashed child falls back to root and never overwrites a newer shared placement', async () => {
  const repo=new InMemoryWorkspace(), service=createLibraryService(repo), notes=createNoteService(repo);
  let state=await mutate(service,{type:'create-folder',name:'Parent',parentFolderId:null}); const parent=state.folders[0].id;
  state=await mutate(service,{type:'create-folder',name:'Child',parentFolderId:parent}); const child=state.folders.find(folder=>folder.parentId===parent)!.id;
  const draft=value(await notes.createNote({title:'Shared',markdown:'kept',folderId:parent},{commandId:uuidV7()}));
  repo.seedProjectLinks([{id:uuidV7(),projectId:uuidV7(),noteId:draft.id}]);
  const childPlan=value(await service.previewTrash({kind:'folder',id:child})); state=await mutate(service,{type:'trash',planId:childPlan.id,fingerprint:childPlan.fingerprint}); const childBatch=state.trash[0].id;
  const parentPlan=value(await service.previewTrash({kind:'folder',id:parent})); state=await mutate(service,{type:'trash',planId:parentPlan.id,fingerprint:parentPlan.fingerprint}); const parentBatch=state.trash.find(batch=>batch.target.id===parent)!.id;
  state=await mutate(service,{type:'restore',batchId:childBatch}); assert.equal(state.folders.find(folder=>folder.id===child)!.parentId,null);
  await mutate(service,{type:'move',target:{kind:'note',id:draft.id},parentFolderId:child});
  state=await mutate(service,{type:'restore',batchId:parentBatch}); assert.equal(state.placements.find(item=>item.id===draft.id)!.parentFolderId,child,'restore must respect the newer explicit move'); assert.equal(value(await notes.getNote(draft.id)).revision,1);
});
