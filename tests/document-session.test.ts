import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNoteService, InMemoryWorkspace, NoteDocumentSession, uuidV7, reconcileBlocks, createShellApplication, NotesWorkspace } from '@syna/core';
import { ok, fail } from '@syna/contracts';
import type { DocumentBufferPort, DocumentBufferSnapshot, NoteDocument, NoteService, EditorScene } from '@syna/contracts';
class Buffer implements DocumentBufferPort {
  private snapshot: DocumentBufferSnapshot;
  private listeners = new Set<() => void>();
  scene: EditorScene = { anchor: 0, head: 0, scrollTop: 0, scrollLeft: 0 };
  composing = false;
  constructor(note: NoteDocument) { this.snapshot = { title: note.title, markdown: note.markdown, blocks: note.blocks, changeSeq: 0 }; }
  edit(markdown: string) { this.snapshot = { ...this.snapshot, markdown, blocks: reconcileBlocks(markdown), changeSeq: this.snapshot.changeSeq + 1 }; for (const listener of this.listeners) listener(); }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  isComposing = () => this.composing;
  finishPendingInput = async () => this.composing ? fail('busy', 'IME active') : ok(undefined);
  acknowledgeSave() {}
  captureScene = () => this.scene;
  restoreScene = (scene: EditorScene) => { this.scene = scene; };
  dispose() {}
}
async function fixture() { const repo = new InMemoryWorkspace(), service = createNoteService(repo), result = await service.createNote({ title: 'Session', markdown: '' }, { commandId: uuidV7() }); if (!result.ok) throw new Error('fixture'); return { repo, service, note: result.value }; }
test('serial save queue acknowledges submitted sequences without replacing newer input', async () => {
  const { repo, service, note } = await fixture();
  let release!: () => void; const wait = new Promise<void>(resolve => { release = resolve; });
  let started!: () => void; const begin = new Promise<void>(resolve => { started = resolve; });
  let active = 0, max = 0, calls = 0;
  const delayed: NoteService = { ...service, saveNote: async (input, meta) => { active++; max = Math.max(max, active); if (++calls === 1) { started(); await wait; } const result = await service.saveNote(input, meta); active--; return result; } };
  const buffer = new Buffer(note), session = new NoteDocumentSession(note, buffer, delayed, repo);
  try { buffer.edit('first'); const flush = session.flush(); await begin; buffer.edit('first + newer 中文尾字'); release(); assert.ok((await flush).ok); assert.equal(max, 1); assert.equal(calls, 2); assert.equal(buffer.getSnapshot().markdown, 'first + newer 中文尾字'); assert.equal(session.getSnapshot().savedChangeSeq, 2); assert.equal(session.getSnapshot().baseRevision, 3); } finally { session.dispose(); }
});
test('ambiguous committed write reuses its command ID on retry instead of creating another revision', async () => {
  const { repo, service, note } = await fixture(); let first = true; const commands: string[] = [];
  const uncertain: NoteService = { ...service, saveNote: async (input, meta) => { commands.push(meta.commandId); const result = await service.saveNote(input, meta); if (first) { first = false; return fail('storage-error', 'Reply lost', true); } return result; } };
  const buffer = new Buffer(note), session = new NoteDocumentSession(note, buffer, uncertain, repo);
  try { buffer.edit('committed'); assert.equal((await session.flush()).ok, false); buffer.edit('newer edit'); assert.ok((await session.flush()).ok); assert.equal(commands[0], commands[1]); assert.equal(session.getSnapshot().baseRevision, 3); } finally { session.dispose(); }
});
test('failed navigation and history keep the current note, draft and scene; recovery conflict cannot auto-save', async () => {
  const { repo, service, note } = await fixture();
  const second = await service.createNote({ title: 'Second', markdown: '' }, { commandId: uuidV7() }); assert.ok(second.ok); if (!second.ok) return;
  const app = createShellApplication({ load: () => undefined, save: () => {} }, undefined, {}, { prepare: to => workspace.prepare(to) });
  const workspace = new NotesWorkspace(app, service, repo, document => new Buffer(document));
  await workspace.start(); await app.navigate({ page: 'library', section: 'notes', noteId: note.id });
  const current = workspace.getSnapshot().active!, buffer = current.buffer as Buffer;
  buffer.edit('不可丢失的草稿'); repo.failNextSave = true;
  const navigation = app.getSnapshot().navigation;
  assert.equal((await app.navigate({ page: 'library', section: 'notes', noteId: second.value.id })).ok, false);
  assert.equal(app.getSnapshot().navigation, navigation); assert.equal(workspace.getSnapshot().active, current);
  assert.equal((await repo.readRecovery(note.id)).ok, true); assert.equal(buffer.getSnapshot().markdown, '不可丢失的草稿');
  current.session.markConflict('Newer revision', 2); assert.equal((await current.session.flush()).ok, false); assert.equal((await app.back()).ok, false); assert.equal(app.getSnapshot().navigation, navigation);
  current.session.dispose();
});
test('navigation epoch rejects slow stale targets and rechecks edits made during target loading', async () => {
  const { repo, service, note } = await fixture();
  const next = await service.createNote({ title: 'Next', markdown: '' }, { commandId: uuidV7() }); assert.ok(next.ok); if (!next.ok) return;
  let release!: () => void, start!: () => void; const delayed = new Promise<void>(resolve => { release = resolve; }), begun = new Promise<void>(resolve => { start = resolve; });
  const slow: NoteService = { ...service, getNote: async id => { if (id === next.value.id) { start(); await delayed; } return service.getNote(id); } };
  const app = createShellApplication({ load: () => undefined, save: () => {} }, undefined, {}, { prepare: to => workspace.prepare(to) });
  const workspace = new NotesWorkspace(app, slow, repo, document => new Buffer(document)); await workspace.start(); await app.navigate({ page: 'library', section: 'notes', noteId: note.id });
  const buffer = workspace.getSnapshot().active!.buffer as Buffer;
  const stale = app.navigate({ page: 'library', section: 'notes', noteId: next.value.id }); await begun;
  buffer.edit('edit while target loads'); const latest = app.navigate({ page: 'dashboard' }); release();
  const result = await stale; assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.code, 'superseded');
  assert.ok((await latest).ok); assert.equal(app.getSnapshot().navigation.location.page, 'dashboard'); const saved = await service.getNote(note.id); assert.ok(saved.ok); if (saved.ok) assert.equal(saved.value.markdown, 'edit while target loads');
});
test('uncertain creation retries the same command and opens exactly one persisted note', async () => {
  const repo = new InMemoryWorkspace(), service = createNoteService(repo); let first = true;
  const uncertain: NoteService = { ...service, createNote: async (input, meta) => { const result = await service.createNote(input, meta); if (first) { first = false; return fail('unavailable', 'Reply lost', true); } return result; } };
  const app = createShellApplication({ load: () => undefined, save: () => {} }, undefined, {}, { prepare: to => workspace.prepare(to) });
  const workspace = new NotesWorkspace(app, uncertain, repo, document => new Buffer(document)); await workspace.start();
  assert.equal((await workspace.createNote()).ok, false); assert.ok((await workspace.createNote()).ok);
  const notes = await service.listNotes(); assert.ok(notes.ok); if (notes.ok) assert.equal(notes.value.length, 1);
  workspace.getSnapshot().active?.session.dispose();
});

test('save feedback uses the confirmed revision timestamp and never labels newer input clean', async () => {
  const { repo, service, note } = await fixture();
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  let signal!: () => void; const started = new Promise<void>(resolve => { signal = resolve; });
  const delayed: NoteService = { ...service, saveNote: async (input, meta) => { signal(); await gate; return service.saveNote(input, meta); } };
  const buffer = new Buffer(note), session = new NoteDocumentSession(note, buffer, delayed, repo);
  try {
    buffer.edit('one'); assert.equal(session.getSnapshot().state, 'dirty'); assert.equal(session.getSnapshot().savedAt, note.updatedAt);
    const flush = session.flush(); await started; buffer.edit('one + newer');
    assert.equal(session.getSnapshot().state, 'saving'); assert.equal(session.getSnapshot().savedAt, note.updatedAt);
    release(); const result = await flush; assert.ok(result.ok);
    const saved = await service.getNote(note.id); assert.ok(saved.ok);
    if (saved.ok && result.ok) { assert.equal(session.getSnapshot().savedAt, saved.value.updatedAt); assert.equal(result.value.updatedAt, saved.value.updatedAt); }
    assert.equal(session.getSnapshot().state, 'clean'); assert.equal(session.getSnapshot().savedChangeSeq, 2);
  } finally { session.dispose(); }
});
test('conflict details read the committed version without replacing the draft or advancing its base revision', async () => {
  const { repo, service, note } = await fixture();
  const app = createShellApplication({ load: () => undefined, save: () => {} }, undefined, {}, { prepare: to => workspace.prepare(to) });
  const workspace = new NotesWorkspace(app, service, repo, document => new Buffer(document));
  await workspace.start(); await app.navigate({ page: 'library', section: 'notes', noteId: note.id });
  const active = workspace.getSnapshot().active!, buffer = active.buffer as Buffer;
  try {
    buffer.edit('本地冲突草稿');
    assert.ok((await service.saveNote({ noteId: note.id, title: note.title, markdown: '已提交的新版本', blocks: reconcileBlocks('已提交的新版本'), changeSeq: 1, expectedRevision: 1 }, { commandId: uuidV7() })).ok);
    assert.equal((await active.session.flush()).ok, false);
    assert.ok((await workspace.inspectConflict()).ok);
    assert.equal(workspace.getSnapshot().conflictRemote?.markdown, '已提交的新版本');
    assert.equal(buffer.getSnapshot().markdown, '本地冲突草稿');
    assert.equal(active.session.getSnapshot().baseRevision, 1); assert.equal(active.session.getSnapshot().state, 'conflict');
    const draft = await repo.readRecovery(note.id); assert.ok(draft.ok); if (draft.ok) assert.equal(draft.value?.markdown, '本地冲突草稿');
  } finally { active.session.dispose(); }
});
