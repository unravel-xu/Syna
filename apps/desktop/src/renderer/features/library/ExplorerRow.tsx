import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, FileText, Folder, GripVertical, MoreHorizontal, Plus, Star } from 'lucide-react';
import { sortMode } from '@syna/core';
import { useLibraryExplorer } from '../../app/AppProvider';
import type { ExplorerEntry } from './selectors';
import { anchorAt, useLibraryUI } from './LibraryInteractions';
export function ExplorerRow({ entry, scope, selected, onOpen, expanded, onExpand, depth = 0, nextId, detail, modified }: { entry: ExplorerEntry; scope: string; selected?: boolean; onOpen(): void; expanded?: boolean; onExpand?(): void; depth?: number; nextId?: string; detail?: string; modified?: string }) {
  const ui = useLibraryUI(), { data, busy } = useLibraryExplorer();
  const [dropEdge, setDropEdge] = useState<'before' | 'after' | 'inside' | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const label = entry.title || 'Untitled', folder = entry.kind === 'folder';
  useEffect(() => () => clearTimeout(timer.current), []);
  const clearDrop = () => { setDropEdge(null); clearTimeout(timer.current); timer.current = undefined; };
  return <div className={`explorer-row ${selected ? 'selected' : ''} ${ui.dragged?.id === entry.id ? 'dragging' : ''} ${detail !== undefined ? 'file-list-row' : ''}`} style={{ '--tree-depth': Math.min(depth, 6) } as React.CSSProperties} data-item-id={entry.id} data-kind={entry.kind} data-drop={dropEdge ?? undefined}
    onContextMenu={event => { event.preventDefault(); ui.showMore(entry, { x: event.clientX, y: event.clientY }, scope); }}
    onKeyDown={event => { if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) { event.preventDefault(); ui.showMore(entry, anchorAt(event.currentTarget), scope); } }}
    onDragStart={event => { ui.setDragged({ kind: entry.kind, id: entry.id }); event.dataTransfer.setData('application/x-syna-library', entry.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setDragImage(event.currentTarget, 30, 16); }}
    onDragEnd={() => { clearDrop(); ui.setDragged(null); }}
    onDragOver={event => {
      if (!ui.dragged || busy || ui.dragged.id === entry.id || (['notes', 'favorites'].includes(scope) && ui.dragged.kind !== 'note')) return;
      const rect = event.currentTarget.getBoundingClientRect(), fraction = (event.clientY - rect.top) / rect.height;
      const edge = folder && fraction > .25 && fraction < .75 ? 'inside' : fraction < .5 ? 'before' : 'after';
      const parentId = edge === 'inside' ? entry.id : entry.parentFolderId;
      if (!ui.canDrop(ui.dragged, parentId) || (edge !== 'inside' && (scope === 'recent' || sortMode(data, scope) !== 'manual'))) { clearDrop(); event.dataTransfer.dropEffect = 'none'; return; }
      event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropEdge(edge);
      if (edge === 'inside' && onExpand && !expanded && !timer.current) timer.current = setTimeout(() => { onExpand(); timer.current = undefined; }, 650);
      if (edge !== 'inside') { clearTimeout(timer.current); timer.current = undefined; }
      const scroll = event.currentTarget.closest('.sidebar-scroll,.notes-library');
      if (scroll) { const bounds = scroll.getBoundingClientRect(); if (event.clientY < bounds.top + 32) scroll.scrollTop -= 12; else if (event.clientY > bounds.bottom - 32) scroll.scrollTop += 12; }
    }}
    onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) clearDrop(); }}
    onDrop={event => { event.preventDefault(); event.stopPropagation(); if (ui.dragged && dropEdge) ui.drop(ui.dragged, dropEdge === 'inside' ? entry.id : entry.parentFolderId, dropEdge === 'before' ? entry.id : nextId, scope, dropEdge === 'inside'); clearDrop(); }}>
    <button className="drag-handle" draggable={!busy} aria-label={`Drag ${label}`} title={sortMode(data, scope) === 'manual' ? 'Drag to reorder or move' : 'Drag to a folder · Manual sorting required to reorder'} tabIndex={-1}><GripVertical size={13} /></button>
    {folder && onExpand && <button className="tree-expander" aria-label={`${expanded ? 'Collapse' : 'Expand'} ${label}`} aria-expanded={expanded} onClick={onExpand}>{expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</button>}
    <button className="explorer-open" aria-current={selected ? 'page' : undefined} title={label} onClick={onOpen}>{folder ? <Folder size={15} /> : <FileText size={15} />}<span className="explorer-title">{label}</span>{data.flags[entry.id]?.favorite && <Star className="favorite-indicator" size={12} />}</button>
    {detail !== undefined && <><span className="file-folder" title={detail}>{detail}</span><time className="file-modified" dateTime={entry.updatedAt}>{modified}</time></>}
    <div className="explorer-actions">{folder && <button aria-label={`Create in ${label}`} title="New note or folder" onClick={event => ui.showCreate(anchorAt(event.currentTarget), entry.id)}><Plus size={14} /></button>}<button aria-label={`More actions for ${label}`} title="More actions · Shift+F10" aria-haspopup="menu" onClick={event => ui.showMore(entry, anchorAt(event.currentTarget), scope)}><MoreHorizontal size={15} /></button></div>
  </div>;
}
