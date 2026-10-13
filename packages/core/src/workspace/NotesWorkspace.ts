import { fail, ok } from '@syna/contracts';
import type { AppError, CreateNoteInput, DocumentBufferPort, Location, NoteDocument, NoteService, NoteSummary, RecoveryDraft, Result, ShellApplication, WorkScene, WorkspacePersistencePort } from '@syna/contracts';
import { NoteDocumentSession } from './DocumentSession';
import { uuidV7 } from '../notes/identity';
export interface ActiveNote { readonly document: NoteDocument; readonly buffer: DocumentBufferPort; readonly session: NoteDocumentSession }
export interface NotesWorkspaceSnapshot { readonly notes: readonly NoteSummary[]; readonly active: ActiveNote | null; readonly loading: boolean; readonly error?: AppError; readonly recovery?: RecoveryDraft; readonly conflictRemote?: NoteDocument }
export interface PreparedNavigation { commit(): void; cancel?(): void; ready?(): boolean }
export type BufferFactory = (document: NoteDocument, draft?: RecoveryDraft) => DocumentBufferPort;
export class NotesWorkspace {
  private snapshot: NotesWorkspaceSnapshot = { notes: [], active: null, loading: true };
  private scene: WorkScene = { schemaVersion: 1, recentNoteId: null, editors: {} };
  private listeners = new Set<() => void>();
  private starting?: Promise<void>;
  private creating = false;
  private pendingCreate?: { input: CreateNoteInput; commandId: string };
  private sceneQueue: Promise<Result<void>> = Promise.resolve(ok(undefined));
  constructor(private application: ShellApplication, private service: NoteService, private persistence: WorkspacePersistencePort, private createBuffer: BufferFactory) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(next: NotesWorkspaceSnapshot) { this.snapshot = next; for (const listener of this.listeners) listener(); }
  report(error: AppError) { this.publish({ ...this.snapshot, error }); }
  private saveScene(scene: WorkScene) { this.sceneQueue = this.sceneQueue.then(() => this.persistence.saveScene(scene)).catch(() => fail('storage-error', 'The work scene could not be saved.', true)); return this.sceneQueue; }
  async refresh() { const result = await this.service.listNotes(); if (result.ok) this.publish({ ...this.snapshot, notes: result.value, error: undefined }); else this.report(result.error); }
  async inspectConflict(): Promise<Result<void>> {
    const active = this.snapshot.active;
    if (!active || active.session.getSnapshot().state !== 'conflict') return fail('validation', 'There is no active revision conflict.');
    const saved = await this.service.getNote(active.document.id);
    if (this.snapshot.active !== active) return fail('superseded', 'The active note changed.');
    if (!saved.ok) return saved;
    // Read-only comparison: do not replace the buffer or advance its base revision.
    this.publish({ ...this.snapshot, conflictRemote: saved.value }); return ok(undefined);
  }
  start(): Promise<void> {
    return this.starting ??= (async () => {
      const [scene, notes] = await Promise.all([this.persistence.loadScene(), this.service.listNotes()]);
      if (scene.ok && scene.value) this.scene = scene.value;
      this.publish({ ...this.snapshot, loading: false, notes: notes.ok ? notes.value : [], error: !scene.ok ? scene.error : !notes.ok ? notes.error : undefined });
      if (this.scene.recentNoteId && notes.ok && notes.value.some(note => note.id === this.scene.recentNoteId)) await this.application.navigate({ page: 'library', section: 'notes', noteId: this.scene.recentNoteId });
    })();
  }
  async prepare(to: Location): Promise<Result<PreparedNavigation>> {
    const targetId = to.page === 'library' && ['notes', 'recent', 'favorites', 'folder', 'uncategorized', 'daily'].includes(to.section) ? to.noteId : undefined;
    const current = this.snapshot.active;
    if (this.snapshot.recovery && targetId !== current?.document.id) return fail('busy', 'Choose whether to restore the recovery draft before leaving.');
    if (current && targetId !== current.document.id) {
      const flushed = await current.session.flush(); if (!flushed.ok) { this.report(flushed.error); return flushed; }
      this.scene = { ...this.scene, editors: { ...this.scene.editors, [current.document.id]: current.buffer.captureScene() } };
    }
    if (targetId === current?.document.id) return ok({ commit: () => {} });
    let next: ActiveNote | null = null, recovery: RecoveryDraft | undefined, conflictRemote: NoteDocument | undefined;
    if (targetId) {
      const [note, draft] = await Promise.all([this.service.getNote(targetId), this.persistence.readRecovery(targetId)]);
      if (!note.ok) { this.report(note.error); return note; }
      if (!draft.ok) { this.report(draft.error); return draft; }
      if (draft.value && (draft.value.markdown !== note.value.markdown || draft.value.title !== note.value.title || JSON.stringify(draft.value.blocks) !== JSON.stringify(note.value.blocks))) recovery = draft.value;
      else if (draft.value) await this.persistence.clearRecovery(targetId, draft.value.sessionId, draft.value.changeSeq);
      const conflict = recovery && recovery.baseRevision !== note.value.revision;
      const buffer = this.createBuffer(note.value, conflict ? recovery : undefined);
      const session = new NoteDocumentSession(note.value, buffer, this.service, this.persistence, () => { void this.refresh(); });
      if (conflict) { session.markConflict('A recovered draft is based on an older revision. The saved version was not overwritten.', note.value.revision, recovery!.baseRevision); conflictRemote = note.value; recovery = undefined; }
      if (this.scene.editors[targetId]) buffer.restoreScene(this.scene.editors[targetId]);
      next = { document: note.value, buffer, session };
    }
    if (current && current.buffer.getSnapshot().changeSeq > current.session.getSnapshot().savedChangeSeq) {
      const again = await current.session.flush(); if (!again.ok) { next?.session.dispose(); next?.buffer.dispose(); this.report(again.error); return again; }
      this.scene = { ...this.scene, editors: { ...this.scene.editors, [current.document.id]: current.buffer.captureScene() } };
    }
    const scene: WorkScene = { ...this.scene, recentNoteId: targetId ?? this.scene.recentNoteId };
    const saved = await this.saveScene(scene);
    if (!saved.ok) { next?.session.dispose(); next?.buffer.dispose(); this.report(saved.error); return saved; }
    return ok({ ready: () => !current || current.buffer.getSnapshot().changeSeq <= current.session.getSnapshot().savedChangeSeq, cancel: () => { next?.session.dispose(); next?.buffer.dispose(); }, commit: () => {
      current?.session.dispose(); current?.buffer.dispose(); this.scene = scene;
      this.publish({ ...this.snapshot, active: next, error: undefined, recovery, conflictRemote });
    } });
  }
  async createNote(copy = false, folderId?: string | null): Promise<Result<void>> {
    if (this.creating) return fail('busy', 'A note is being created.');
    this.creating = true;
    try {
      const current = this.snapshot.active;
      if (current && !copy) { const flush = await current.session.flush(); if (!flush.ok) { this.report(flush.error); return flush; } }
      if (copy && current) await current.session.checkpoint();
      const buffer = current?.buffer.getSnapshot();
      this.pendingCreate ??= { input: copy && buffer ? { title: `${buffer.title || 'Untitled'} (copy)`, markdown: buffer.markdown } : { title: 'Untitled', markdown: '', ...(folderId === undefined ? {} : { folderId }) }, commandId: uuidV7() };
      const result = await this.service.createNote(this.pendingCreate.input, { commandId: this.pendingCreate.commandId });
      if (!result.ok) { if (['validation', 'not-found'].includes(result.error.code)) this.pendingCreate = undefined; this.report(result.error); return result; }
      this.pendingCreate = undefined;
      await this.refresh();
      if (copy && current) { current.session.dispose(); current.buffer.dispose(); this.publish({ ...this.snapshot, active: null, recovery: undefined }); }
      return await this.application.navigate({ page: 'library', section: 'notes', noteId: result.value.id });
    } finally { this.creating = false; }
  }
  async restoreDraft() {
    const { active, recovery } = this.snapshot; if (!active || !recovery) return;
    active.session.dispose(); active.buffer.dispose();
    const buffer = this.createBuffer(active.document, recovery);
    const scene = this.scene.editors[active.document.id]; if (scene) buffer.restoreScene(scene);
    const session = new NoteDocumentSession(active.document, buffer, this.service, this.persistence, () => { void this.refresh(); });
    this.publish({ ...this.snapshot, active: { ...active, buffer, session }, recovery: undefined });
  }
  async useSavedVersion() {
    const draft = this.snapshot.recovery; if (!draft) return;
    const result = await this.persistence.clearRecovery(draft.noteId, draft.sessionId, draft.changeSeq);
    if (!result.ok) this.report(result.error); else this.publish({ ...this.snapshot, recovery: undefined });
  }
  async flushAndCapture(): Promise<Result<void>> {
    const current = this.snapshot.active;
    if (this.snapshot.recovery) return fail('busy', 'Resolve the recovery draft before closing.');
    if (current) {
      const flushed = await current.session.flush(); if (!flushed.ok) { this.report(flushed.error); return flushed; }
      this.scene = { ...this.scene, recentNoteId: current.document.id, editors: { ...this.scene.editors, [current.document.id]: current.buffer.captureScene() } };
    }
    const result = await this.saveScene(this.scene); if (!result.ok) this.report(result.error); return result;
  }
  async checkpoint() { const current = this.snapshot.active; if (current) { await current.session.checkpoint(); if (this.snapshot.active !== current) return; this.scene = { ...this.scene, recentNoteId: current.document.id, editors: { ...this.scene.editors, [current.document.id]: current.buffer.captureScene() } }; const saved = await this.saveScene(this.scene); if (!saved.ok) this.report(saved.error); } }
}
