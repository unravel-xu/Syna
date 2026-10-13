import type { NoteSummary, Result, WriteMeta } from './notes';
export type SortMode = 'manual' | 'name-asc' | 'name-desc' | 'created-desc' | 'created-asc' | 'modified-desc' | 'modified-asc';
export interface LibraryTarget { readonly kind: 'note' | 'folder'; readonly id: string }
export interface Folder { readonly id: string; readonly name: string; readonly parentId: string | null; readonly createdAt: string; readonly updatedAt: string }
export interface Placement extends LibraryTarget { readonly parentFolderId: string | null; readonly orderKey: number; readonly trashedBy: string | null }
export interface ProjectNoteLink { readonly id: string; readonly projectId: string; readonly noteId: string }
export interface NoteFlags { readonly favorite: boolean; readonly lastVisitedAt?: string }
export interface TrashBatch { readonly id: string; readonly target: LibraryTarget; readonly title: string; readonly deletedAt: string; readonly items: readonly LibraryTarget[]; readonly relocated?: readonly { readonly noteId: string; readonly parentFolderId: string | null; readonly orderKey: number; readonly detachedOrderKey: number }[] }
export interface LibraryState {
  readonly revision: number; readonly folders: readonly Folder[]; readonly placements: readonly Placement[];
  readonly preferences: Readonly<Record<string, SortMode>>; readonly viewOrders: Readonly<Record<string, readonly string[]>>;
  readonly flags: Readonly<Record<string, NoteFlags>>; readonly trash: readonly TrashBatch[]; readonly links: readonly ProjectNoteLink[];
}
export interface LibrarySnapshot extends LibraryState { readonly notes: readonly NoteSummary[] }
export interface DeletePlan {
  readonly id: string; readonly fingerprint: string; readonly target: LibraryTarget; readonly title: string;
  readonly libraryRevision: number; readonly noteRevisions: Readonly<Record<string, number>>;
  readonly items: readonly LibraryTarget[]; readonly itemTitles: Readonly<Record<string, string>>; readonly preservedNotes: readonly string[]; readonly affectedLinks: number;
  readonly expiresAt: string;
}
export type LibraryCommand =
  | { readonly type: 'create-folder'; readonly name: string; readonly parentFolderId: string | null }
  | { readonly type: 'rename-folder'; readonly id: string; readonly name: string }
  | { readonly type: 'move'; readonly target: LibraryTarget; readonly parentFolderId: string | null; readonly beforeId?: string; readonly scope?: string }
  | { readonly type: 'reorder-view'; readonly key: string; readonly noteId: string; readonly beforeId?: string }
  | { readonly type: 'favorite'; readonly noteId: string; readonly value: boolean }
  | { readonly type: 'sort'; readonly key: string; readonly mode: SortMode }
  | { readonly type: 'visit'; readonly noteId: string }
  | { readonly type: 'trash'; readonly planId: string; readonly fingerprint: string }
  | { readonly type: 'restore'; readonly batchId: string };
export interface LibraryWrite { readonly expectedRevision: number; readonly command: LibraryCommand }
export interface LibraryService {
  getLibrary(): Promise<Result<LibrarySnapshot>>;
  writeLibrary(input: LibraryWrite, meta: WriteMeta): Promise<Result<LibrarySnapshot>>;
  previewTrash(target: LibraryTarget): Promise<Result<DeletePlan>>;
}
