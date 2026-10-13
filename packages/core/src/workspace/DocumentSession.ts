import { ok, fail } from '@syna/contracts';
import type { DocumentBufferPort, DocumentSession, DocumentSessionSnapshot, NoteDocument, NoteService, Result, SaveReceipt, SaveNoteInput, WorkspacePersistencePort } from '@syna/contracts';
import { uuidV7 } from '../notes/identity';

export class NoteDocumentSession implements DocumentSession {
  private snapshot: DocumentSessionSnapshot;
  private listeners = new Set<() => void>();
  private timer?: ReturnType<typeof setTimeout>;
  private recoveryTimer?: ReturnType<typeof setTimeout>;
  private inFlight?: Promise<Result<SaveReceipt>>;
  private recoveryQueue: Promise<Result<void>> = Promise.resolve(ok(undefined));
  private pending?: { input: SaveNoteInput; commandId: string };
  private disposed = false;
  private unsubscribe: () => void;
  readonly sessionId = uuidV7();
  constructor(readonly note: NoteDocument, readonly buffer: DocumentBufferPort, private service: NoteService, private persistence: WorkspacePersistencePort, private onSaved: () => void = () => {}) {
    this.snapshot = { noteId: note.id, baseRevision: note.revision, changeSeq: buffer.getSnapshot().changeSeq, savedChangeSeq: 0, savedAt: note.updatedAt, state: buffer.getSnapshot().changeSeq ? 'dirty' : 'clean' };
    this.unsubscribe = buffer.subscribe(() => this.changed());
    if (this.snapshot.changeSeq) this.changed();
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(next: DocumentSessionSnapshot) { this.snapshot = next; for (const listener of this.listeners) listener(); }
  private changed() {
    const changeSeq = this.buffer.getSnapshot().changeSeq;
    this.publish({ ...this.snapshot, changeSeq, state: ['error', 'conflict', 'saving'].includes(this.snapshot.state) ? this.snapshot.state : changeSeq > this.snapshot.savedChangeSeq ? 'dirty' : 'clean' });
    clearTimeout(this.recoveryTimer); this.recoveryTimer = setTimeout(() => { void this.checkpoint(); }, 120);
    clearTimeout(this.timer);
    if (!['error', 'conflict'].includes(this.snapshot.state)) this.timer = setTimeout(() => { void this.autoSave(); }, 500);
  }
  private async autoSave() {
    if (this.disposed) return;
    if (this.buffer.isComposing()) { this.timer = setTimeout(() => { void this.autoSave(); }, 150); return; }
    await this.drain();
  }
  checkpoint(): Promise<Result<void>> {
    clearTimeout(this.recoveryTimer);
    const current = this.buffer.getSnapshot(), baseRevision = this.snapshot.baseRevision;
    if (current.changeSeq <= this.snapshot.savedChangeSeq) return this.recoveryQueue;
    const draft = { ...current, noteId: this.note.id, sessionId: this.sessionId, baseRevision, updatedAt: new Date().toISOString() };
    this.recoveryQueue = this.recoveryQueue.then(() => this.persistence.putRecovery(draft)).catch(() => fail('storage-error', 'Recovery checkpoint failed. Keep this window open.', true));
    return this.recoveryQueue.then(result => { if (!result.ok) this.publish({ ...this.snapshot, recoveryError: result.error }); return result; });
  }
  private drain(): Promise<Result<SaveReceipt>> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.runQueue().finally(() => { this.inFlight = undefined; });
    return this.inFlight;
  }
  private async runQueue(): Promise<Result<SaveReceipt>> {
    let receipt: SaveReceipt = { noteId: this.note.id, revision: this.snapshot.baseRevision, acknowledgedChangeSeq: this.snapshot.savedChangeSeq, updatedAt: this.snapshot.savedAt };
    while (!this.disposed && (this.pending || this.buffer.getSnapshot().changeSeq > this.snapshot.savedChangeSeq)) {
      if (this.buffer.isComposing()) return fail('busy', 'Finish typing before saving or switching notes.', true);
      if (!this.pending) this.pending = { input: { ...this.buffer.getSnapshot(), noteId: this.note.id, expectedRevision: this.snapshot.baseRevision }, commandId: uuidV7() };
      this.publish({ ...this.snapshot, state: 'saving', lastError: undefined });
      let result: Result<SaveReceipt>;
      try { result = await this.service.saveNote(this.pending.input, { commandId: this.pending.commandId }); }
      catch { result = fail('storage-error', 'Saving failed. Your draft is retained.', true); }
      if (!result.ok) {
        this.publish({ ...this.snapshot, state: result.error.code === 'conflict' ? 'conflict' : 'error', lastError: result.error });
        await this.checkpoint(); return result;
      }
      receipt = result.value; this.pending = undefined;
      this.buffer.acknowledgeSave(receipt);
      this.publish({ ...this.snapshot, baseRevision: receipt.revision, savedAt: receipt.updatedAt, savedChangeSeq: receipt.acknowledgedChangeSeq, changeSeq: this.buffer.getSnapshot().changeSeq, state: this.buffer.getSnapshot().changeSeq > receipt.acknowledgedChangeSeq ? 'dirty' : 'clean', lastError: undefined });
      // Serialize checkpoint writes and bounded deletion: an older receipt cannot erase a newer draft.
      this.recoveryQueue = this.recoveryQueue.then(() => this.persistence.clearRecovery(this.note.id, this.sessionId, receipt.acknowledgedChangeSeq));
      await this.recoveryQueue;
      if (this.buffer.getSnapshot().changeSeq > receipt.acknowledgedChangeSeq) await this.checkpoint();
      this.onSaved();
    }
    return ok(receipt);
  }
  async flush(): Promise<Result<SaveReceipt>> {
    clearTimeout(this.timer);
    if (this.snapshot.state === 'conflict') return { ok: false, error: this.snapshot.lastError! };
    const input = await this.buffer.finishPendingInput(); if (!input.ok) return input;
    // A flush also covers edits arriving while an earlier queue finishes.
    let result = await this.drain();
    while (result.ok && this.buffer.getSnapshot().changeSeq > this.snapshot.savedChangeSeq) result = await this.drain();
    return result;
  }
  markConflict(message: string, currentRevision: number, baseRevision = this.snapshot.baseRevision) {
    clearTimeout(this.timer);
    this.publish({ ...this.snapshot, baseRevision, state: 'conflict', lastError: { code: 'conflict', message, currentRevision, retryable: false } });
  }
  dispose() { this.disposed = true; clearTimeout(this.timer); clearTimeout(this.recoveryTimer); this.unsubscribe(); this.listeners.clear(); }
}
