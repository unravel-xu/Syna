import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fail, ok, sceneSchema, recoverySchema } from '@syna/contracts';
import type { CreateNoteInput, WriteMeta, NoteDocument, NoteSummary, Result, SaveReceipt, SaveNoteInput, WorkScene, RecoveryDraft, WorkspacePersistencePort } from '@syna/contracts';
import { activeNotes, applyLibraryCommand, createDeletePlan, isAvailable, placeNewNote, projectLibrary, stateOnly, uuidV7, reconcileBlocks } from '@syna/core';
import { SQLiteLibraryStore, libraryMigration } from './SQLiteLibraryStore';
import type { LibrarySnapshot, LibraryTarget, LibraryWrite, DeletePlan } from '@syna/contracts';
import type { NoteRepositoryPort } from '@syna/core';

export class SQLiteWorkspace implements NoteRepositoryPort, WorkspacePersistencePort {
  private db: DatabaseSync;
  private library: SQLiteLibraryStore;
  constructor(readonly path: string, private testMode = false) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    const version = (this.db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
    if (version > 2) { this.db.close(); throw new Error('This workspace uses a newer schema. No data was modified.'); }
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;');
    if (version === 0) this.db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE notes(id TEXT PRIMARY KEY, title TEXT NOT NULL, revision INTEGER NOT NULL, updated_at TEXT NOT NULL, document TEXT NOT NULL);
      CREATE TABLE note_revisions(note_id TEXT NOT NULL, revision INTEGER NOT NULL, document TEXT NOT NULL, PRIMARY KEY(note_id,revision), FOREIGN KEY(note_id) REFERENCES notes(id));
      CREATE TABLE block_identities(note_id TEXT NOT NULL, block_id TEXT NOT NULL, kind TEXT NOT NULL, from_utf16 INTEGER NOT NULL, to_utf16 INTEGER NOT NULL, PRIMARY KEY(note_id,block_id), FOREIGN KEY(note_id) REFERENCES notes(id));
      CREATE TABLE command_receipts(command_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, result TEXT NOT NULL);
      CREATE TABLE work_scenes(id TEXT PRIMARY KEY, schema_version INTEGER NOT NULL, payload TEXT NOT NULL);
      CREATE TABLE recovery_drafts(note_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, change_seq INTEGER NOT NULL, payload TEXT NOT NULL, FOREIGN KEY(note_id) REFERENCES notes(id));
      PRAGMA user_version=1; COMMIT;`);
    if (version < 2) {
      try {
        if (version === 1) this.db.prepare('VACUUM INTO ?').run(`${path}.before-v2-${Date.now()}.sqlite`);
        this.db.exec('BEGIN IMMEDIATE;'); this.db.exec(libraryMigration); this.db.exec('COMMIT;');
      } catch (error) { if (this.db.isTransaction) this.db.exec('ROLLBACK'); this.db.close(); throw error; }
    }
    this.library = new SQLiteLibraryStore(this.db);
  }
  close() { this.db.close(); }
  private transaction<T>(operation: () => Result<T>): Result<T> {
    try { this.db.exec('BEGIN IMMEDIATE'); const result = operation(); this.db.exec(result.ok ? 'COMMIT' : 'ROLLBACK'); return result; }
    catch { if (this.db.isTransaction) this.db.exec('ROLLBACK'); return fail('storage-error', 'SQLite could not save. Your draft has been retained.', true); }
  }
  private replay<T>(meta: WriteMeta, fingerprint: string): Result<T> | undefined {
    const row = this.db.prepare('SELECT fingerprint,result FROM command_receipts WHERE command_id=?').get(meta.commandId) as { fingerprint: string; result: string } | undefined;
    return row ? row.fingerprint === fingerprint ? JSON.parse(row.result) : fail('validation', 'Command ID was already used for a different write.') : undefined;
  }
  private receipt(meta: WriteMeta, fingerprint: string, result: Result<unknown>) { this.db.prepare('INSERT INTO command_receipts VALUES(?,?,?)').run(meta.commandId, fingerprint, JSON.stringify(result)); }
  private write(note: NoteDocument, fresh: boolean) {
    const json = JSON.stringify(note);
    if (fresh) this.db.prepare('INSERT INTO notes(id,title,revision,updated_at,document,created_at) VALUES(?,?,?,?,?,?)').run(note.id, note.title, note.revision, note.updatedAt, json, note.createdAt);
    else this.db.prepare('UPDATE notes SET title=?,revision=?,updated_at=?,document=? WHERE id=?').run(note.title, note.revision, note.updatedAt, json, note.id);
    this.db.prepare('INSERT INTO note_revisions VALUES(?,?,?)').run(note.id, note.revision, json);
    this.db.prepare('DELETE FROM block_identities WHERE note_id=?').run(note.id);
    const insert = this.db.prepare('INSERT INTO block_identities VALUES(?,?,?,?,?)');
    for (const block of note.blocks) insert.run(note.id, block.id, block.kind, block.from, block.to);
  }
  private summaries(): readonly NoteSummary[] { return this.db.prepare('SELECT document FROM notes ORDER BY updated_at DESC,id').all().map(row => { const { id, title, revision, updatedAt, createdAt } = JSON.parse(row.document as string) as NoteDocument; return { id, title, revision, updatedAt, createdAt }; }); }
  async list(): Promise<Result<readonly NoteSummary[]>> { return ok(activeNotes(this.library.read(), this.summaries())); }
  async read(id: string): Promise<Result<NoteDocument>> { const row = this.db.prepare('SELECT document FROM notes WHERE id=?').get(id) as { document: string } | undefined; return row && isAvailable(this.library.read(), { kind: 'note', id }) ? ok(JSON.parse(row.document)) : fail('not-found', 'Note not found or in Trash.'); }
  async getLibrary(): Promise<Result<LibrarySnapshot>> { return ok(projectLibrary(this.library.read(), this.summaries())); }
  async previewTrash(target: LibraryTarget): Promise<Result<DeletePlan>> { return this.transaction(() => { const plan = createDeletePlan(projectLibrary(this.library.read(), this.summaries()), target); if (plan.ok) this.library.retainPlan(plan.value); return plan; }); }
  async writeLibrary(input: LibraryWrite, meta: WriteMeta): Promise<Result<LibrarySnapshot>> {
    return this.transaction(() => {
      const fingerprint = JSON.stringify(['library', input]), replay = this.replay<LibrarySnapshot>(meta, fingerprint); if (replay) return replay;
      if (this.testMode && existsSync(join(dirname(this.path), 'test-fail-library'))) return fail('storage-error', 'Library write failed. Previous arrangement restored.', true);
      const plan = input.command.type === 'trash' ? this.library.plan(input.command.planId) : undefined;
      const result = applyLibraryCommand(projectLibrary(this.library.read(), this.summaries()), input, plan);
      if (result.ok) { this.library.write(stateOnly(result.value)); this.receipt(meta, fingerprint, result); }
      return result;
    });
  }
  async insert(input: CreateNoteInput, meta: WriteMeta): Promise<Result<NoteDocument>> {
    return this.transaction(() => {
      const fingerprint = JSON.stringify(['create', input]), replay = this.replay<NoteDocument>(meta, fingerprint);
      if (replay) { if (replay.ok && !replay.value.createdAt) { const row = this.db.prepare('SELECT created_at FROM notes WHERE id=?').get(replay.value.id); return row ? ok({ ...replay.value, createdAt: row.created_at as string }) : fail('storage-error', 'The original creation could not be verified.', true); } return replay; }
      const timestamp = new Date().toISOString();
      const note: NoteDocument = { title: input.title, markdown: input.markdown, id: uuidV7(), revision: 1, createdAt: timestamp, updatedAt: timestamp, blocks: reconcileBlocks(input.markdown), extensions: [] };
      const placed = placeNewNote(this.library.read(), note.id, input.folderId ?? null); if (!placed.ok) return placed;
      this.write(note, true); this.library.write(placed.value); const result = ok(note); this.receipt(meta, fingerprint, result); return result;
    });
  }
  async compareAndSwap(input: SaveNoteInput, meta: WriteMeta): Promise<Result<SaveReceipt>> {
    // Deterministic latency, restricted to explicitly isolated E2E workspaces.
    if (this.testMode && existsSync(join(dirname(this.path), 'test-delay-save'))) await new Promise(resolve => setTimeout(resolve, 900));
    return this.transaction(() => {
      const fingerprint = JSON.stringify(['save', input]), replay = this.replay<SaveReceipt>(meta, fingerprint);
      if (replay) {
        // Receipts written by P2 predate updatedAt. Derive it from that exact immutable revision.
        if (replay.ok && !replay.value.updatedAt) {
          const row = this.db.prepare('SELECT document FROM note_revisions WHERE note_id=? AND revision=?').get(replay.value.noteId, replay.value.revision) as { document: string } | undefined;
          if (!row) return fail('storage-error', 'The original save confirmation could not be verified.', true);
          return ok({ ...replay.value, updatedAt: (JSON.parse(row.document) as NoteDocument).updatedAt });
        }
        return replay;
      }
      if (this.testMode && existsSync(join(dirname(this.path), 'test-fail-save'))) return fail('storage-error', 'Test workspace: SQLite save failure. Draft retained.', true);
      const row = this.db.prepare('SELECT document FROM notes WHERE id=?').get(input.noteId) as { document: string } | undefined;
      if (!row || !isAvailable(this.library.read(), { kind: 'note', id: input.noteId })) return fail('not-found', 'Note not found or in Trash.');
      const current: NoteDocument = JSON.parse(row.document);
      if (current.revision !== input.expectedRevision) return fail('conflict', 'A newer saved version exists. Your draft has been retained.', false, current.revision);
      const note: NoteDocument = { ...current, title: input.title, markdown: input.markdown, blocks: input.blocks, revision: current.revision + 1, updatedAt: new Date().toISOString() };
      this.write(note, false);
      const result = ok({ noteId: note.id, revision: note.revision, acknowledgedChangeSeq: input.changeSeq, updatedAt: note.updatedAt }); this.receipt(meta, fingerprint, result); return result;
    });
  }
  async loadScene(): Promise<Result<WorkScene | null>> { const row = this.db.prepare("SELECT payload FROM work_scenes WHERE id='library'").get() as { payload: string } | undefined; if (!row) return ok(null); const scene = sceneSchema.safeParse(JSON.parse(row.payload)); return scene.success ? ok(scene.data) : fail('validation', 'The saved work scene could not be restored. Notes remain available.'); }
  async saveScene(scene: WorkScene): Promise<Result<void>> { return this.transaction(() => { this.db.prepare("INSERT INTO work_scenes VALUES('library',1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload").run(JSON.stringify(scene)); return ok(undefined); }); }
  async readRecovery(noteId: string): Promise<Result<RecoveryDraft | null>> { const row = this.db.prepare('SELECT payload FROM recovery_drafts WHERE note_id=?').get(noteId) as { payload: string } | undefined; if (!row) return ok(null); const draft = recoverySchema.safeParse(JSON.parse(row.payload)); return draft.success ? ok(draft.data) : fail('validation', 'The recovery draft is invalid; it was retained for inspection.'); }
  async putRecovery(draft: RecoveryDraft): Promise<Result<void>> { return this.transaction(() => { this.db.prepare('INSERT INTO recovery_drafts VALUES(?,?,?,?) ON CONFLICT(note_id) DO UPDATE SET session_id=excluded.session_id,change_seq=excluded.change_seq,payload=excluded.payload WHERE recovery_drafts.session_id != excluded.session_id OR recovery_drafts.change_seq <= excluded.change_seq').run(draft.noteId, draft.sessionId, draft.changeSeq, JSON.stringify(draft)); return ok(undefined); }); }
  async clearRecovery(noteId: string, sessionId: string, throughSeq: number): Promise<Result<void>> { return this.transaction(() => { this.db.prepare('DELETE FROM recovery_drafts WHERE note_id=? AND session_id=? AND change_seq<=?').run(noteId, sessionId, throughSeq); return ok(undefined); }); }
}
