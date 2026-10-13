import type { LibrarySnapshot, LibraryTarget } from '@syna/contracts';
import { isAvailable, sortItems, sortMode } from '@syna/core';
export interface ExplorerEntry extends LibraryTarget { title: string; createdAt: string; updatedAt: string; orderKey: number; parentFolderId: string | null }
export function folderEntries(data: LibrarySnapshot, parentId: string | null, scope: string): ExplorerEntry[] {
  return sortItems(data.placements.filter(item => !item.trashedBy && item.parentFolderId === parentId).map(item => {
    const entity = item.kind === 'folder' ? data.folders.find(folder => folder.id === item.id)! : data.notes.find(note => note.id === item.id)!;
    return { ...item, title: 'name' in entity ? entity.name : entity.title, createdAt: entity.createdAt, updatedAt: entity.updatedAt };
  }), sortMode(data, scope));
}
export function viewEntries(data: LibrarySnapshot, key: string): ExplorerEntry[] {
  const order = data.viewOrders[key] ?? [];
  const notes = [...data.notes].sort((a,b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)).filter(note => isAvailable(data, { kind: 'note', id: note.id }) && (key !== 'favorites' || data.flags[note.id]?.favorite) && (key !== 'recent' || data.flags[note.id]?.lastVisitedAt));
  const entries = notes.map((note, index) => ({ ...note, kind: 'note' as const, parentFolderId: data.placements.find(item => item.kind === 'note' && item.id === note.id)?.parentFolderId ?? null, orderKey: order.includes(note.id) ? order.indexOf(note.id) : order.length + index }));
  return key === 'recent' ? entries.sort((a, b) => data.flags[b.id]!.lastVisitedAt!.localeCompare(data.flags[a.id]!.lastVisitedAt!) || a.id.localeCompare(b.id)) : sortItems(entries, sortMode(data, key));
}
export const sortLabels = { manual: 'Manual', 'name-asc': 'Name A–Z', 'name-desc': 'Name Z–A', 'created-desc': 'Created: Newest First', 'created-asc': 'Created: Oldest First', 'modified-desc': 'Modified: Newest First', 'modified-asc': 'Modified: Oldest First' } as const;
