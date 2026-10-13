import { fail, ok } from '@syna/contracts';
import type { NoteDocument, NoteSummary, Result, SaveReceipt, WorkScene, RecoveryDraft, WorkspacePersistencePort, CreateNoteInput, WriteMeta, SaveNoteInput } from '@syna/contracts';
import type { DeletePlan, LibrarySnapshot, LibraryState, LibraryTarget, LibraryWrite, ProjectNoteLink } from '@syna/contracts';
import { activeNotes, applyLibraryCommand, createDeletePlan, emptyLibrary, isAvailable, placeNewNote, projectLibrary, stateOnly } from '../library/library';
import type { NoteRepositoryPort } from '../notes/NoteService';
import { uuidV7 } from '../notes/identity';
import { reconcileBlocks } from '../notes/blocks';
export class InMemoryWorkspace implements NoteRepositoryPort, WorkspacePersistencePort {
  private notes = new Map<string, NoteDocument>();
  private receipts = new Map<string, { fingerprint: string; result: Result<unknown> }>();
  private drafts = new Map<string, RecoveryDraft>();
  private scene: WorkScene | null = null;
  failNextSave = false;
  failNextLibrary = false;
  private library: LibraryState = emptyLibrary();
  private plans = new Map<string, DeletePlan>();
  seedProjectLinks(links: readonly ProjectNoteLink[]) { this.library = { ...this.library, links, revision: this.library.revision + 1 }; }
  private summaries() { return [...this.notes.values()].map(({ id, title, revision, updatedAt, createdAt }) => ({ id, title, revision, updatedAt, createdAt })); }
  async getLibrary(): Promise<Result<LibrarySnapshot>> { return ok(projectLibrary(this.library, this.summaries())); }
  async previewTrash(target: LibraryTarget): Promise<Result<DeletePlan>> { const plan = createDeletePlan(projectLibrary(this.library, this.summaries()), target); if (plan.ok) this.plans.set(plan.value.id, plan.value); return plan; }
  async writeLibrary(input: LibraryWrite, meta: WriteMeta): Promise<Result<LibrarySnapshot>> {
    const fingerprint = JSON.stringify(['library', input]), replay = this.replay<LibrarySnapshot>(meta, fingerprint); if (replay) return replay;
    if (this.failNextLibrary) { this.failNextLibrary = false; return fail('storage-error', 'Library write failed. Previous arrangement restored.', true); }
    const result = applyLibraryCommand(projectLibrary(this.library, this.summaries()), input, input.command.type === 'trash' ? this.plans.get(input.command.planId) : undefined);
    if (result.ok) { this.library = stateOnly(result.value); this.receipts.set(meta.commandId, { fingerprint, result }); } return result;
  }
  async list(): Promise<Result<readonly NoteSummary[]>> { return ok(activeNotes(this.library, this.summaries()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))); }
  async read(id: string): Promise<Result<NoteDocument>> { return this.notes.has(id) && isAvailable(this.library, { kind: 'note', id }) ? ok(structuredClone(this.notes.get(id)!)) : fail('not-found', 'Note not found or in Trash.'); }
  private replay<T>(meta: WriteMeta, fingerprint: string): Result<T> | undefined {
    const prior = this.receipts.get(meta.commandId);
    return prior ? prior.fingerprint === fingerprint ? structuredClone(prior.result) as Result<T> : fail('validation', 'Command ID was already used for a different write.') : undefined;
  }
  async insert(input: CreateNoteInput, meta: WriteMeta): Promise<Result<NoteDocument>> {
    const fingerprint = JSON.stringify(['create', input]), replay = this.replay<NoteDocument>(meta, fingerprint); if (replay) return replay;
    const timestamp = new Date().toISOString();
    const note: NoteDocument = { title: input.title, markdown: input.markdown, id: uuidV7(), revision: 1, createdAt: timestamp, updatedAt: timestamp, blocks: reconcileBlocks(input.markdown), extensions: [] };
    const placed = placeNewNote(this.library, note.id, input.folderId ?? null); if (!placed.ok) return placed;
    this.library = placed.value; this.notes.set(note.id, note); const result = ok(note); this.receipts.set(meta.commandId, { fingerprint, result }); return structuredClone(result);
  }
  async compareAndSwap(input: SaveNoteInput, meta: WriteMeta): Promise<Result<SaveReceipt>> {
    const fingerprint = JSON.stringify(['save', input]), replay = this.replay<SaveReceipt>(meta, fingerprint); if (replay) return replay;
    if (this.failNextSave) { this.failNextSave = false; return fail('storage-error', 'Test storage failure. Draft retained.', true); }
    const current = this.notes.get(input.noteId); if (!current || !isAvailable(this.library, { kind: 'note', id: input.noteId })) return fail('not-found', 'Note not found or in Trash.');
    if (current.revision !== input.expectedRevision) return fail('conflict', 'A newer version exists. Your draft was retained.', false, current.revision);
    const updatedAt = new Date().toISOString();
    this.notes.set(current.id, { ...current, title: input.title, markdown: input.markdown, blocks: structuredClone(input.blocks), revision: current.revision + 1, updatedAt });
    const result = ok({ noteId: current.id, revision: current.revision + 1, acknowledgedChangeSeq: input.changeSeq, updatedAt }); this.receipts.set(meta.commandId, { fingerprint, result }); return result;
  }
  async loadScene() { return ok(structuredClone(this.scene)); }
  async saveScene(scene: WorkScene) { this.scene = structuredClone(scene); return ok(undefined); }
  async readRecovery(noteId: string) { return ok(structuredClone(this.drafts.get(noteId) ?? null)); }
  async putRecovery(draft: RecoveryDraft) { const old = this.drafts.get(draft.noteId); if (!old || old.sessionId !== draft.sessionId || old.changeSeq <= draft.changeSeq) this.drafts.set(draft.noteId, structuredClone(draft)); return ok(undefined); }
  async clearRecovery(noteId: string, sessionId: string, throughSeq: number) { const draft = this.drafts.get(noteId); if (draft?.sessionId === sessionId && draft.changeSeq <= throughSeq) this.drafts.delete(noteId); return ok(undefined); }
}
