import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { InMemoryWorkspace, createNoteService, uuidV7, reconcileBlocks } from '@syna/core';
import { SQLiteWorkspace } from '@syna/storage';
import type { NoteRepositoryPort } from '@syna/core';
import type { WorkspacePersistencePort } from '@syna/contracts';
test('block IDs survive edits and inserted preceding blocks without matching equal text', () => {
  const source = 'First paragraph\n\nSecond paragraph';
  const before = reconcileBlocks(source);
  const prefix = 'New paragraph\n\n';
  const inserted = reconcileBlocks(prefix + source, before, [{ from: 0, to: 0, insert: prefix }]);
  assert.notEqual(inserted[0].id, before[0].id); assert.equal(inserted[1].id, before[0].id); assert.equal(inserted[2].id, before[1].id);
  const edited = reconcileBlocks('First paragraph changed\n\nSecond paragraph', before, [{ from: 15, to: 15, insert: ' changed' }]);
  assert.equal(edited[0].id, before[0].id); assert.equal(edited[1].id, before[1].id);
});
for (const mode of ['memory', 'sqlite'] as const) {
  test(`${mode}: create, CAS, idempotent replay, collision rejection, conflict and recovery semantics`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'syna-p2-contract-'));
    const dbPath = join(root, '.syna', 'state.sqlite');
    const repo: NoteRepositoryPort & WorkspacePersistencePort = mode === 'memory' ? new InMemoryWorkspace() : new SQLiteWorkspace(dbPath, true);
    const service = createNoteService(repo);
    try {
      const command = { commandId: uuidV7() }, input = { title: '真实中文', markdown: '# Hello\n\n中文笔记\n\n$$ E=mc^2 \\label{eq:energy} $$' };
      const created = await service.createNote(input, command); assert.ok(created.ok); if (!created.ok) return;
      const note = created.value;
      assert.match(note.id, /^[\da-f-]{14}7/); assert.equal(note.revision, 1);
      assert.deepEqual(await service.createNote(input, command), created);
      const collision = await service.createNote({ ...input, title: 'different' }, command); assert.equal(collision.ok, false);
      const update = { noteId: note.id, title: note.title, markdown: note.markdown + '\n尾字', blocks: reconcileBlocks(note.markdown + '\n尾字'), expectedRevision: 1, changeSeq: 1 };
      const saveCommand = { commandId: uuidV7() };
      const saved = await service.saveNote(update, saveCommand); assert.ok(saved.ok);
      assert.deepEqual(await service.saveNote(update, saveCommand), saved);
      const conflict = await service.saveNote({ ...update, markdown: 'stale', blocks: [], changeSeq: 2 }, { commandId: uuidV7() });
      assert.equal(conflict.ok, false); if (!conflict.ok) assert.equal(conflict.error.code, 'conflict');
      const stored = await service.getNote(note.id); assert.ok(stored.ok); if (stored.ok) { assert.equal(stored.value.markdown, update.markdown); assert.equal(stored.value.revision, 2); if (saved.ok) assert.equal(saved.value.updatedAt, stored.value.updatedAt); }
      if (repo instanceof InMemoryWorkspace) repo.failNextSave = true; else await writeFile(join(dirname(dbPath), 'test-fail-save'), 'failure');
      const failed = await service.saveNote({ ...update, expectedRevision: 2, changeSeq: 2 }, { commandId: uuidV7() }); assert.equal(failed.ok, false);
      const sessionId = uuidV7();
      const draft = { noteId: note.id, sessionId, baseRevision: 2, changeSeq: 3, title: 'draft', markdown: '未保存草稿', blocks: [], updatedAt: new Date().toISOString() };
      assert.ok((await repo.putRecovery(draft)).ok);
      await repo.clearRecovery(note.id, sessionId, 2); assert.deepEqual(await repo.readRecovery(note.id), { ok: true, value: draft });
      await repo.putRecovery({ ...draft, changeSeq: 1, markdown: 'older' }); assert.deepEqual(await repo.readRecovery(note.id), { ok: true, value: draft });
      await repo.clearRecovery(note.id, uuidV7(), 99); assert.deepEqual(await repo.readRecovery(note.id), { ok: true, value: draft });
      const scene = { schemaVersion: 1 as const, recentNoteId: note.id, editors: { [note.id]: { anchor: 3, head: 7, scrollTop: 120, scrollLeft: 0, viewMode: 'reading' as const, readingScrollTop: 260, pageWidth: 'full' as const } } };
      await repo.saveScene(scene); assert.deepEqual(await repo.loadScene(), { ok: true, value: scene });
      if (repo instanceof SQLiteWorkspace) {
        repo.close(); const reopened = new SQLiteWorkspace(dbPath, true);
        assert.deepEqual(await reopened.readRecovery(note.id), { ok: true, value: draft });
        assert.deepEqual(await reopened.loadScene(), { ok: true, value: scene }); reopened.close();
      }
    } finally { if (repo instanceof SQLiteWorkspace) { try { repo.close(); } catch { /* already closed for restart check */ } } await rm(root, { recursive: true, force: true }); }
  });
}
test('SQLite atomically preserves unknown extension payloads and versioned block identities', async () => {
  const root = await mkdtemp(join(tmpdir(), 'syna-p2-extensions-')), path = join(root, '.syna', 'state.sqlite');
  const repo = new SQLiteWorkspace(path), service = createNoteService(repo);
  try {
    const result = await service.createNote({ title: 'Unknown extension', markdown: 'Original block' }, { commandId: uuidV7() }); assert.ok(result.ok); if (!result.ok) return;
    const extension = { extensionId: 'future.extension', schemaVersion: 42, payload: { untouched: ['保留', 42] } };
    const external = new DatabaseSync(path);
    external.prepare('UPDATE notes SET document=? WHERE id=?').run(JSON.stringify({ ...result.value, extensions: [extension] }), result.value.id); external.close();
    const markdown = 'Original block updated', blocks = reconcileBlocks(markdown, result.value.blocks, [{ from: 14, to: 14, insert: ' updated' }]);
    const saved = await service.saveNote({ noteId: result.value.id, title: result.value.title, markdown, blocks, changeSeq: 1, expectedRevision: 1 }, { commandId: uuidV7() }); assert.ok(saved.ok);
    const read = await service.getNote(result.value.id); assert.ok(read.ok); if (read.ok) assert.deepEqual(read.value.extensions, [extension]);
    const db = new DatabaseSync(path); assert.equal(db.prepare('SELECT COUNT(*) AS count FROM note_revisions').get()!.count, 2); assert.equal(db.prepare('SELECT block_id FROM block_identities').get()!.block_id, blocks[0].id); db.close();
  } finally { repo.close(); await rm(root, { recursive: true, force: true }); }
});

test('legacy SQLite save receipts recover their exact revision timestamp without a new write', async () => {
  const root = await mkdtemp(join(tmpdir(), 'syna-p2-legacy-receipt-')), path = join(root, '.syna', 'state.sqlite');
  const repo = new SQLiteWorkspace(path), service = createNoteService(repo);
  try {
    const created = await service.createNote({ title: 'Legacy receipt', markdown: 'one' }, { commandId: uuidV7() }); assert.ok(created.ok); if (!created.ok) return;
    const command = { commandId: uuidV7() }, input = { noteId: created.value.id, title: 'Legacy receipt', markdown: 'two', blocks: reconcileBlocks('two'), changeSeq: 1, expectedRevision: 1 };
    const confirmed = await service.saveNote(input, command); assert.ok(confirmed.ok); if (!confirmed.ok) return;
    const db = new DatabaseSync(path), legacy = { ...confirmed.value, updatedAt: undefined };
    db.prepare('UPDATE command_receipts SET result=? WHERE command_id=?').run(JSON.stringify({ ok: true, value: legacy }), command.commandId); db.close();
    assert.deepEqual(await service.saveNote(input, command), confirmed);
    const note = await service.getNote(created.value.id); assert.ok(note.ok); if (note.ok) assert.equal(note.value.revision, 2);
  } finally { repo.close(); await rm(root, { recursive: true, force: true }); }
});
