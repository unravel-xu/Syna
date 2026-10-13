import { fail, ok, libraryWriteSchema, libraryTargetSchema, metaSchema } from '@syna/contracts';
import type { DeletePlan, LibraryCommand, LibraryService, LibrarySnapshot, LibraryState, LibraryTarget, LibraryWrite, NoteSummary, Placement, Result, SortMode, WriteMeta } from '@syna/contracts';
import { uuidV7 } from '../notes/identity';
export type LibraryRepositoryPort = LibraryService;
export function createLibraryService(repository: LibraryRepositoryPort): LibraryService {
  async function safe<T>(call: () => Promise<Result<T>>): Promise<Result<T>> { try { return await call(); } catch { return fail('storage-error', 'Library changes could not be saved. The previous arrangement was restored.', true); } }
  return { getLibrary: () => safe(() => repository.getLibrary()), previewTrash: target => { const parsed = libraryTargetSchema.safeParse(target); return parsed.success ? safe(() => repository.previewTrash(parsed.data)) : Promise.resolve(fail('validation', 'Invalid Library target.')); }, writeLibrary: (input, meta) => {
    const parsed = libraryWriteSchema.safeParse(input), write = metaSchema.safeParse(meta);
    return parsed.success && write.success ? safe(() => repository.writeLibrary(parsed.data, write.data)) : Promise.resolve(fail('validation', 'Invalid Library command.'));
  } };
}
export const emptyLibrary = (): LibraryState => ({ revision: 0, folders: [], placements: [], preferences: {}, viewOrders: {}, flags: {}, trash: [], links: [] });
export const placementOf = (state: LibraryState, target: LibraryTarget) => state.placements.find(item => item.kind === target.kind && item.id === target.id);
export const isAvailable = (state: LibraryState, target: LibraryTarget) => !!placementOf(state, target) && !placementOf(state, target)!.trashedBy;
export const folderScope = (id: string | null) => `folder:${id ?? 'root'}`;
export const sortMode = (state: LibraryState, key: string): SortMode => state.preferences[key] ?? (key === 'tree' || key.startsWith('folder:') ? 'manual' : 'modified-desc');
const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });
export interface SortableItem { readonly id: string; readonly title: string; readonly createdAt: string; readonly updatedAt: string; readonly orderKey: number }
export function sortItems<T extends SortableItem>(items: readonly T[], mode: SortMode): T[] {
  return [...items].sort((a, b) => {
    const comparison = mode === 'manual' ? a.orderKey - b.orderKey : mode.startsWith('name') ? collator.compare(a.title, b.title) : mode.startsWith('created') ? a.createdAt.localeCompare(b.createdAt) : a.updatedAt.localeCompare(b.updatedAt);
    return (mode.endsWith('desc') ? -comparison : comparison) || a.id.localeCompare(b.id);
  });
}
export function folderPath(state: LibraryState, id: string | null): string {
  const names: string[] = [], visited = new Set<string>();
  while (id && !visited.has(id)) { visited.add(id); const folder = state.folders.find(item => item.id === id); if (!folder) break; names.unshift(folder.name); id = folder.parentId; }
  return names.join(' / ') || 'Uncategorized';
}
export function createDeletePlan(state: LibrarySnapshot, target: LibraryTarget): Result<DeletePlan> {
  if (!isAvailable(state, target)) return fail('not-found', 'This item is no longer available.');
  const ids = new Set([target.id]);
  if (target.kind === 'folder') {
    let changed = true;
    while (changed) { changed = false; for (const item of state.placements) if (!item.trashedBy && item.parentFolderId && ids.has(item.parentFolderId) && !ids.has(item.id)) { ids.add(item.id); changed = true; } }
  }
  const candidates = state.placements.filter(item => ids.has(item.id) && !item.trashedBy);
  const preservedNotes = target.kind === 'folder' ? candidates.filter(item => item.kind === 'note' && state.links.some(link => link.noteId === item.id)).map(item => item.id) : [];
  const items = candidates.filter(item => !preservedNotes.includes(item.id)).map(({ kind, id }) => ({ kind, id }));
  const noteRevisions = Object.fromEntries(state.notes.filter(note => ids.has(note.id)).map(note => [note.id, note.revision]));
  const title = target.kind === 'folder' ? state.folders.find(folder => folder.id === target.id)!.name : state.notes.find(note => note.id === target.id)!.title;
  return ok({ id: uuidV7(), fingerprint: uuidV7(), target, title, libraryRevision: state.revision, noteRevisions, items, itemTitles: Object.fromEntries(candidates.map(item => [item.id, item.kind === 'folder' ? folderPath(state,item.id) : state.notes.find(note=>note.id===item.id)!.title])), preservedNotes, affectedLinks: state.links.filter(link => ids.has(link.noteId)).length, expiresAt: new Date(Date.now() + 300_000).toISOString() });
}
function siblingOrder(state: LibraryState, parentId: string | null, excluding?: string) { return state.placements.filter(item => !item.trashedBy && item.parentFolderId === parentId && item.id !== excluding).sort((a, b) => a.orderKey - b.orderKey || a.id.localeCompare(b.id)); }
export function placeNewNote(state: LibraryState, noteId: string, parentId: string | null): Result<LibraryState> {
  if (parentId && !isAvailable(state, { kind: 'folder', id: parentId })) return fail('not-found', 'The destination folder is unavailable.');
  return ok({ ...state, revision: state.revision + 1, viewOrders: state.viewOrders.notes ? { ...state.viewOrders, notes: [...state.viewOrders.notes, noteId] } : state.viewOrders, placements: [...state.placements, { kind: 'note', id: noteId, parentFolderId: parentId, orderKey: (siblingOrder(state, parentId).at(-1)?.orderKey ?? -1) + 1, trashedBy: null }] });
}
/** Pure metadata operation shared by SQLite, Browser Mock and optimistic presentation. */
export function applyLibraryCommand(state: LibrarySnapshot, input: LibraryWrite, plan?: DeletePlan): Result<LibrarySnapshot> {
  if (state.revision !== input.expectedRevision) return fail('conflict', 'Library changed elsewhere. Refresh and try again.', true, state.revision);
  const command = input.command, now = new Date().toISOString();
  let next = structuredClone(state);
  const availableNote = (id: string) => isAvailable(state, { kind: 'note', id });
  const validParent = (id: string | null) => !id || isAvailable(state, { kind: 'folder', id });
  const duplicateName = (name: string, parentId: string | null, except?: string) => state.folders.some(folder => folder.id !== except && folder.parentId === parentId && collator.compare(folder.name, name) === 0 && isAvailable(state, { kind: 'folder', id: folder.id }));
  switch (command.type) {
    case 'create-folder': {
      if (!validParent(command.parentFolderId)) return fail('not-found', 'The destination folder is unavailable.');
      if (duplicateName(command.name, command.parentFolderId)) return fail('validation', 'A folder with this name already exists here.');
      const id = uuidV7();
      next = { ...next, folders: [...next.folders, { id, name: command.name, parentId: command.parentFolderId, createdAt: now, updatedAt: now }], placements: [...next.placements, { kind: 'folder', id, parentFolderId: command.parentFolderId, orderKey: (siblingOrder(state, command.parentFolderId).at(-1)?.orderKey ?? -1) + 1, trashedBy: null }] }; break;
    }
    case 'rename-folder': {
      const folder = state.folders.find(item => item.id === command.id);
      if (!folder || !isAvailable(state, { kind: 'folder', id: command.id })) return fail('not-found', 'Folder not found.');
      if (duplicateName(command.name, folder.parentId, command.id)) return fail('validation', 'A folder with this name already exists here.');
      next = { ...next, folders: next.folders.map(item => item.id === command.id ? { ...item, name: command.name, updatedAt: now } : item) }; break;
    }
    case 'move': {
      const moving = placementOf(state, command.target);
      if (!moving || moving.trashedBy || !validParent(command.parentFolderId)) return fail('not-found', 'The item or destination is unavailable.');
      if (moving.parentFolderId === command.parentFolderId && command.beforeId === undefined && command.scope === undefined) return ok(state);
      if (command.beforeId !== undefined || command.scope !== undefined) {
        if (sortMode(state, command.scope ?? folderScope(command.parentFolderId)) !== 'manual') return fail('validation', 'Switch to Manual sorting before reordering.');
        if (command.scope && command.scope !== 'tree' && command.scope !== folderScope(command.parentFolderId)) return fail('validation', 'Invalid ordering scope.');
      }
      if (moving.kind === 'folder') {
        let parent = command.parentFolderId;
        const visited = new Set<string>();
        while (parent) { if (parent === moving.id || visited.has(parent)) return fail('validation', 'A folder cannot be moved into itself or its descendants.'); visited.add(parent); parent = state.folders.find(folder => folder.id === parent)?.parentId ?? null; }
        const folder = state.folders.find(item => item.id === moving.id)!;
        if (duplicateName(folder.name, command.parentFolderId, folder.id)) return fail('validation', 'A folder with this name already exists at the destination.');
        next = { ...next, folders: next.folders.map(item => item.id === moving.id ? { ...item, parentId: command.parentFolderId, updatedAt: now } : item) };
      }
      const siblings = siblingOrder(state, command.parentFolderId, moving.id);
      const index = command.beforeId ? siblings.findIndex(item => item.id === command.beforeId) : siblings.length;
      if (index < 0) return fail('validation', 'The insertion target is no longer a sibling.');
      siblings.splice(index, 0, { ...moving, parentFolderId: command.parentFolderId });
      const order = new Map(siblings.map((item, index) => [item.id, index]));
      next = { ...next, placements: next.placements.map(item => order.has(item.id) ? { ...item, parentFolderId: command.parentFolderId, orderKey: order.get(item.id)! } : item) }; break;
    }
    case 'reorder-view': {
      if (sortMode(state, command.key) !== 'manual') return fail('validation', 'Switch to Manual sorting before reordering.');
      if (!availableNote(command.noteId)) return fail('not-found', 'Note not found.');
      const visible = state.notes.filter(note => availableNote(note.id) && (command.key !== 'favorites' || state.flags[note.id]?.favorite)).map(note => note.id);
      const prior = state.viewOrders[command.key] ?? [];
      const known = state.notes.map(note => note.id);
      const order = [...prior.filter(id => known.includes(id)), ...visible.filter(id => !prior.includes(id))].filter(id => id !== command.noteId);
      const index = command.beforeId ? order.indexOf(command.beforeId) : order.length;
      if (index < 0 || (command.beforeId && !visible.includes(command.beforeId)) || !visible.includes(command.noteId)) return fail('validation', 'Invalid view reorder target.');
      order.splice(index, 0, command.noteId); next = { ...next, viewOrders: { ...next.viewOrders, [command.key]: order } }; break;
    }
    case 'sort': {
      if (command.key.startsWith('folder:') && command.key !== 'folder:root' && !validParent(command.key.slice(7))) return fail('not-found', 'Folder not found.');
      const initial = state.notes.filter(note => availableNote(note.id) && (command.key !== 'favorites' || state.flags[note.id]?.favorite)).sort((a,b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)).map(note => note.id);
      next = { ...next, preferences: { ...next.preferences, [command.key]: command.mode }, viewOrders: command.mode === 'manual' && ['notes','favorites','daily'].includes(command.key) && !next.viewOrders[command.key] ? { ...next.viewOrders, [command.key]: initial } : next.viewOrders }; break;
    }
    case 'favorite': case 'visit': {
      if (!availableNote(command.noteId)) return fail('not-found', 'Note not found.');
      const previous = next.flags[command.noteId] ?? { favorite: false };
      next = { ...next, flags: { ...next.flags, [command.noteId]: command.type === 'favorite' ? { ...previous, favorite: command.value } : { ...previous, lastVisitedAt: now } } }; break;
    }
    case 'trash': {
      if (!plan || plan.fingerprint !== command.fingerprint || plan.id !== command.planId) return fail('validation', 'The deletion plan is unavailable. Preview again.');
      if (Date.parse(plan.expiresAt) < Date.now() || plan.libraryRevision !== state.revision || Object.entries(plan.noteRevisions).some(([id, revision]) => state.notes.find(note => note.id === id)?.revision !== revision)) return fail('conflict', 'The deletion preview is out of date. Preview the impact again.');
      const batchId = uuidV7(), ids = new Set(plan.items.map(item => item.id));
      next = { ...next, placements: next.placements.map(item => ids.has(item.id) ? { ...item, trashedBy: batchId } : plan.preservedNotes.includes(item.id) ? { ...item, parentFolderId: null, orderKey: (siblingOrder(state, null).at(-1)?.orderKey ?? -1) + 1 + plan.preservedNotes.indexOf(item.id) } : item), trash: [...next.trash, { id: batchId, target: plan.target, title: plan.title, deletedAt: now, items: plan.items, relocated: plan.preservedNotes.map((noteId,index) => { const item = placementOf(state,{kind:'note',id:noteId})!; return { noteId, parentFolderId: item.parentFolderId, orderKey: item.orderKey, detachedOrderKey: (siblingOrder(state,null).at(-1)?.orderKey ?? -1) + 1 + index }; }) }] }; break;
    }
    case 'restore': {
      const batch = state.trash.find(item => item.id === command.batchId);
      if (!batch) return fail('not-found', 'This trash entry is no longer available.');
      next = { ...next, placements: next.placements.map(item => item.trashedBy === batch.id ? { ...item, trashedBy: null } : item), trash: next.trash.filter(item => item.id !== batch.id) };
      next = { ...next, placements: next.placements.map(item => batch.items.some(target => target.id === item.id) && item.parentFolderId && !isAvailable(next, { kind: 'folder', id: item.parentFolderId }) ? { ...item, parentFolderId: null } : item) };
      const folders = [...next.folders];
      for (const target of batch.items.filter(item => item.kind === 'folder')) {
        const index = folders.findIndex(item => item.id === target.id), folder = folders[index], parentId = placementOf(next, target)!.parentFolderId;
        let name = folder.name, suffix = 1;
        while (folders.some(other => other.id !== folder.id && placementOf(next, { kind: 'folder', id: other.id })?.parentFolderId === parentId && isAvailable(next, { kind: 'folder', id: other.id }) && collator.compare(other.name, name) === 0)) name = `${folder.name} (restored ${suffix++})`;
        folders[index] = { ...folder, name, parentId };
      }
      next = { ...next, folders, placements: next.placements.map(item => { const original = batch.relocated?.find(link => link.noteId === item.id); return original && !item.trashedBy && item.parentFolderId === null && item.orderKey === original.detachedOrderKey && (!original.parentFolderId || isAvailable(next,{kind:'folder',id:original.parentFolderId})) ? { ...item, parentFolderId: original.parentFolderId, orderKey: original.orderKey } : item; }) }; break;
    }
  }
  return ok({ ...next, revision: state.revision + 1 });
}
export function projectLibrary(state: LibraryState, notes: readonly NoteSummary[]): LibrarySnapshot { return { ...structuredClone(state), notes: [...notes] }; }
export function stateOnly(state: LibrarySnapshot): LibraryState { return { revision: state.revision, folders: state.folders, placements: state.placements, preferences: state.preferences, viewOrders: state.viewOrders, flags: state.flags, trash: state.trash, links: state.links }; }
export function activeNotes(state: LibraryState, notes: readonly NoteSummary[]) { return notes.filter(note => isAvailable(state, { kind: 'note', id: note.id })); }
export type LibraryMutation = LibraryCommand;
export type LibraryCommandMeta = WriteMeta;
export type LibraryPlacement = Placement;
