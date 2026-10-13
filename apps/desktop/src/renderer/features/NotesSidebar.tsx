import { useState } from 'react';
import { ChevronDown, ChevronRight, FolderOpen, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import type { Location } from '@syna/contracts';
import { folderScope, isAvailable } from '@syna/core';
import { useLibraryExplorer, useShell } from '../app/AppProvider';
import { librarySections } from '../fixtures/demo';
import { FixtureIcon } from '../shell/primitives';
import { anchorAt, useLibraryUI } from './library/LibraryInteractions';
import { ExplorerRow } from './library/ExplorerRow';
import { folderEntries } from './library/selectors';
export function LibraryCreateButton() { const ui = useLibraryUI(); const { navigation: { location }, environment } = useShell(); return <button className="icon-button library-create" aria-label="Create in Library" aria-haspopup="menu" title={`New note or folder · ${environment.platform === 'darwin' ? '⌘⇧N' : 'Ctrl+Shift+N'}`} onClick={event => ui.showCreate(anchorAt(event.currentTarget), location.page === 'library' && location.section === 'folder' ? location.folderId ?? null : null)}><Plus size={16} /></button>; }
export function NotesSidebar({ location, active }: { location: Extract<Location, { page: 'library' }>; active: boolean }) {
  const { data } = useLibraryExplorer();
  const { application } = useShell();
  const ui = useLibraryUI();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [rootDrop, setRootDrop] = useState(false);
  const toggle = (id: string) => setExpanded(current => ({ ...current, [id]: !current[id] }));
  const rootEntries = folderEntries(data, null, 'tree'), rootNotes = rootEntries.filter(item => item.kind === 'note');
  const visibleNotes = data.notes.filter(note => isAvailable(data, { kind: 'note', id: note.id }));
  const renderTree = (parentId: string | null, depth: number): React.ReactNode => {
    const entries = folderEntries(data, parentId, 'tree').filter(entry => parentId !== null || entry.kind === 'folder');
    return entries.map((entry, index) => <div key={entry.id}><ExplorerRow entry={entry} scope="tree" depth={depth} nextId={entries[index + 1]?.id} selected={entry.kind === 'note' ? location.noteId === entry.id : location.section === 'folder' && location.folderId === entry.id && !location.noteId} expanded={!!expanded[entry.id]} onExpand={entry.kind === 'folder' ? () => toggle(entry.id) : undefined} onOpen={() => { if (entry.kind === 'note') ui.openNote(entry.id); else { setExpanded(current => ({ ...current, [entry.id]: true })); void application.navigate({ page: 'library', section: 'folder', folderId: entry.id }); } }} />{entry.kind === 'folder' && expanded[entry.id] && <div role="group" aria-label={`${entry.title} contents`}>{renderTree(entry.id, depth + 1)}</div>}</div>);
  };
  return <div className="library-sidebar-body" hidden={!active}>
    <div className="sidebar-scroll" data-context="library"><nav aria-label="Library views">{librarySections.filter(section => section.id !== 'trash').map(section => <button key={section.id} className={`sidebar-item ${location.section === section.id && !location.noteId ? 'selected' : ''}`} aria-current={location.section === section.id && !location.noteId ? 'page' : undefined} onClick={() => { void application.navigate({ page: 'library', section: section.id }); }}><FixtureIcon name={section.icon} /><span>{section.name}</span>{section.id === 'notes' && <span className="item-count">{visibleNotes.length}</span>}</button>)}</nav>
      <div className="sidebar-section-label folders-heading"><span>FOLDERS</span><button aria-label="Folder tree options" title="Tree sort" aria-haspopup="menu" onClick={event => ui.showSort(anchorAt(event.currentTarget), 'tree')}><MoreHorizontal size={15} /></button></div>
      <div role="group" aria-label="Folders">{renderTree(null, 0)}</div>
      <div className={`uncategorized-row ${rootDrop ? 'drop-inside' : ''}`} onDragOver={event => { if (ui.dragged && ui.canDrop(ui.dragged, null)) { event.preventDefault(); setRootDrop(true); } }} onDragLeave={() => setRootDrop(false)} onDrop={event => { event.preventDefault(); if (ui.dragged) ui.drop(ui.dragged, null, undefined, folderScope(null), true); setRootDrop(false); }}>
        <button className="tree-expander" aria-label={`${expanded.root ? 'Collapse' : 'Expand'} Uncategorized`} aria-expanded={!!expanded.root} onClick={() => toggle('root')}>{expanded.root ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</button><button className={`sidebar-item ${location.section === 'uncategorized' && !location.noteId ? 'selected' : ''}`} onClick={() => { void application.navigate({ page: 'library', section: 'uncategorized' }); }}><FolderOpen size={15} /><span>Uncategorized</span><span className="item-count">{rootNotes.length}</span></button>
      </div>
      {expanded.root && rootNotes.map((entry, index) => <ExplorerRow key={entry.id} entry={entry} scope="tree" depth={1} nextId={rootNotes[index + 1]?.id} selected={location.noteId === entry.id} onOpen={() => ui.openNote(entry.id)} />)}
    </div>
    <button className={`sidebar-item library-trash ${location.section === 'trash' ? 'selected' : ''}`} onClick={() => { void application.navigate({ page: 'library', section: 'trash' }); }}><Trash2 size={15} /><span>Trash</span><span className="item-count">{data.trash.length || ''}</span></button>
  </div>;
}
