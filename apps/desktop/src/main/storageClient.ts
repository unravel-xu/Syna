import { Worker } from 'node:worker_threads';
import { join } from 'node:path';
import type { NoteRepositoryPort } from '@syna/core';
import type { WorkspacePersistencePort, CreateNoteInput, SaveNoteInput, WriteMeta, WorkScene, RecoveryDraft, Result, NoteSummary, NoteDocument, SaveReceipt } from '@syna/contracts';
import type { LibrarySnapshot, LibraryWrite, LibraryTarget, DeletePlan } from '@syna/contracts';
import { fail } from '@syna/contracts';
export class StorageClient implements NoteRepositoryPort, WorkspacePersistencePort {
  private worker: Worker;
  private id = 0;
  private pending = new Map<number, (result: Result<unknown>) => void>();
  private unavailable = false;
  constructor(path: string, testMode: boolean) {
    this.worker = new Worker(join(__dirname, '../workers/storage.cjs'), { workerData: { path, testMode } });
    this.worker.on('message', ({ id, result }) => { this.pending.get(id)?.(result); this.pending.delete(id); });
    const unavailable = () => { this.unavailable = true; for (const reply of this.pending.values()) reply(fail('unavailable', 'Storage worker is unavailable. Keep this window open.', true)); this.pending.clear(); };
    this.worker.on('error', unavailable); this.worker.on('exit', unavailable);
  }
  private call<T>(method: string, ...args: unknown[]): Promise<Result<T>> {
    if (this.unavailable) return Promise.resolve(fail('unavailable', 'Storage is unavailable. Keep this window open.', true));
    return new Promise(resolve => { const id = ++this.id; this.pending.set(id, resolve as (value: Result<unknown>) => void); this.worker.postMessage({ id, method, args }); });
  }
  list = () => this.call<readonly NoteSummary[]>('list');
  read = (id: string) => this.call<NoteDocument>('read', id);
  insert = (input: CreateNoteInput, meta: WriteMeta) => this.call<NoteDocument>('insert', input, meta);
  compareAndSwap = (input: SaveNoteInput, meta: WriteMeta) => this.call<SaveReceipt>('compareAndSwap', input, meta);
  loadScene = () => this.call<WorkScene | null>('loadScene');
  saveScene = (scene: WorkScene) => this.call<void>('saveScene', scene);
  readRecovery = (id: string) => this.call<RecoveryDraft | null>('readRecovery', id);
  putRecovery = (draft: RecoveryDraft) => this.call<void>('putRecovery', draft);
  clearRecovery = (id: string, session: string, seq: number) => this.call<void>('clearRecovery', id, session, seq);
  getLibrary = () => this.call<LibrarySnapshot>('getLibrary');
  writeLibrary = (input: LibraryWrite, meta: WriteMeta) => this.call<LibrarySnapshot>('writeLibrary', input, meta);
  previewTrash = (target: LibraryTarget) => this.call<DeletePlan>('previewTrash', target);
  dispose() { void this.worker.terminate(); }
}
