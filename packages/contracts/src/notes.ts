export interface AppError { readonly code: 'not-found' | 'conflict' | 'validation' | 'storage-error' | 'busy' | 'superseded' | 'unavailable'; readonly message: string; readonly retryable: boolean; readonly currentRevision?: number }
export type Result<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: AppError };
export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const fail = (code: AppError['code'], message: string, retryable = false, currentRevision?: number): Result<never> => ({ ok: false, error: { code, message, retryable, ...(currentRevision === undefined ? {} : { currentRevision }) } });
export interface SnapshotStore<T> { getSnapshot(): T; subscribe(listener: () => void): () => void }
export interface BlockIdentity { readonly id: string; readonly kind: string; readonly from: number; readonly to: number }
export interface NoteSummary { readonly id: string; readonly title: string; readonly revision: number; readonly updatedAt: string; readonly createdAt: string }
export interface NoteDocument extends NoteSummary { readonly markdown: string; readonly blocks: readonly BlockIdentity[]; readonly extensions: readonly unknown[] }
export interface CreateNoteInput { readonly title: string; readonly markdown: string; readonly folderId?: string | null }
export interface WriteMeta { readonly commandId: string }
export interface SaveNoteInput extends Pick<CreateNoteInput, 'title' | 'markdown'> { readonly noteId: string; readonly expectedRevision: number; readonly changeSeq: number; readonly blocks: readonly BlockIdentity[] }
export interface SaveReceipt { readonly noteId: string; readonly revision: number; readonly acknowledgedChangeSeq: number; readonly updatedAt: string }
export interface NoteService {
  listNotes(): Promise<Result<readonly NoteSummary[]>>;
  getNote(id: string): Promise<Result<NoteDocument>>;
  createNote(input: CreateNoteInput, meta: WriteMeta): Promise<Result<NoteDocument>>;
  saveNote(input: SaveNoteInput, meta: WriteMeta): Promise<Result<SaveReceipt>>;
}
export type EditorViewMode = 'live' | 'reading' | 'source';
export type DocumentWidth = 'centered' | 'full';
export interface EditorScene { readonly anchor: number; readonly head: number; readonly scrollTop: number; readonly scrollLeft: number; readonly viewMode?: EditorViewMode; readonly readingScrollTop?: number; readonly pageWidth?: DocumentWidth }
export interface WorkScene { readonly schemaVersion: 1; readonly recentNoteId: string | null; readonly editors: Readonly<Record<string, EditorScene>> }
export interface RecoveryDraft extends Pick<CreateNoteInput, 'title' | 'markdown'> { readonly noteId: string; readonly sessionId: string; readonly baseRevision: number; readonly changeSeq: number; readonly blocks: readonly BlockIdentity[]; readonly updatedAt: string }
export interface WorkspacePersistencePort {
  loadScene(): Promise<Result<WorkScene | null>>;
  saveScene(scene: WorkScene): Promise<Result<void>>;
  readRecovery(noteId: string): Promise<Result<RecoveryDraft | null>>;
  putRecovery(draft: RecoveryDraft): Promise<Result<void>>;
  clearRecovery(noteId: string, sessionId: string, throughSeq: number): Promise<Result<void>>;
}
export interface DocumentBufferSnapshot extends Pick<CreateNoteInput, 'title' | 'markdown'> { readonly changeSeq: number; readonly blocks: readonly BlockIdentity[] }
export interface DocumentBufferPort extends SnapshotStore<DocumentBufferSnapshot> {
  isComposing(): boolean;
  finishPendingInput(): Promise<Result<void>>;
  acknowledgeSave(receipt: SaveReceipt): void;
  captureScene(): EditorScene;
  restoreScene(scene: EditorScene): void;
  dispose(): void;
}
export interface DocumentSessionSnapshot { readonly noteId: string; readonly baseRevision: number; readonly changeSeq: number; readonly savedChangeSeq: number; readonly savedAt: string; readonly state: 'clean' | 'dirty' | 'saving' | 'error' | 'conflict'; readonly lastError?: AppError; readonly recoveryError?: AppError }
export interface DocumentSession extends SnapshotStore<DocumentSessionSnapshot> { flush(): Promise<Result<SaveReceipt>>; checkpoint(): Promise<Result<void>>; dispose(): void }
export interface NoteBridge extends NoteService, WorkspacePersistencePort { onPrepareClose(listener: () => Promise<Result<void>>): () => void }
