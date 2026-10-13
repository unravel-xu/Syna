import { useEffect, useRef, useState } from 'react';
import { ArrowDownUp, FileText, Filter, Folder, RotateCcw, Trash2 } from 'lucide-react';
import type { Location } from '@syna/contracts';
import { folderPath, folderScope, isAvailable, sortMode } from '@syna/core';
import { useLibraryExplorer, useNotesWorkspace, useShell } from '../app/AppProvider';
import { librarySections } from '../fixtures/demo';
import { MarkdownSurface } from './editor/MarkdownSurface';
import { ExplorerRow } from './library/ExplorerRow';
import { anchorAt, useLibraryUI } from './library/LibraryInteractions';
import { folderEntries, sortLabels, viewEntries } from './library/selectors';
export function NotesLibrary({ location }: { location: Extract<Location, { page: 'library' }> }) {
  const { active, loading } = useNotesWorkspace();
  const { explorer, data, error, focusTitleNoteId } = useLibraryExplorer();
  const { application } = useShell();
  const ui = useLibraryUI();
  const ref = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState('');
  const [filterVisible, setFilterVisible] = useState(false);
  useEffect(() => { if (active && focusTitleNoteId === active.document.id) { const title = ref.current?.querySelector<HTMLInputElement>('input[aria-label="Note title"]'); if (title) { title.focus(); title.select(); explorer.clearTitleFocus(); } } }, [active, explorer, focusTitleNoteId]);
  if (active && active.document.id === location.noteId) return <div ref={ref} className="note-editor-host"><MarkdownSurface key={active.session.sessionId} active={active} /></div>;
  const folderId = location.section === 'folder' ? location.folderId ?? null : null;
  const folderView = ['folder', 'uncategorized'].includes(location.section);
  const scope = folderView ? folderScope(folderId) : location.section;
  const supported = folderView || ['notes', 'recent', 'favorites'].includes(location.section);
  const title = folderView ? folderPath(data, folderId) : librarySections.find(section => section.id === location.section)?.name;
  const entries = (folderView ? folderEntries(data, folderId, scope).filter(entry => location.section !== 'uncategorized' || entry.kind === 'note') : viewEntries(data, scope)).filter(entry => entry.title.toLocaleLowerCase().includes(filter.toLocaleLowerCase()));
  const date = (value: string) => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  return <div className="page-container notes-library"><div className="page-title-row"><div><span className="eyebrow">LIBRARY</span><h1>{title}</h1></div>{supported && <div className="file-list-controls"><button className="button ghost" aria-label="Filter files" aria-expanded={filterVisible} onClick={() => setFilterVisible(value => !value)}><Filter size={14} /><span>Filter</span></button>{location.section === 'recent' ? <span className="subtle-label">Recently opened</span> : <button className="button ghost" aria-label="Sort files" aria-haspopup="menu" onClick={event => ui.showSort(anchorAt(event.currentTarget), scope)}><ArrowDownUp size={14} /><span>{sortLabels[sortMode(data, scope)]}</span></button>}</div>}</div>
    {error && <p className="library-error" role="alert">{error.message}<button onClick={() => void explorer.refresh()}>Refresh</button></p>}
    {supported && filterVisible && <input className="library-filter" aria-label="Filter by name" placeholder="Filter by name…" value={filter} onChange={event => setFilter(event.target.value)} autoFocus />}
    {loading ? <p className="page-description">Opening the note workspace…</p> : location.section === 'trash' ? <div className="trash-list">{data.trash.length ? data.trash.map(batch => <div key={batch.id} className="trash-row"><Trash2 size={16} /><span><strong>{batch.title || 'Untitled'}</strong><small>{batch.items.length} items · {date(batch.deletedAt)}</small></span><button className="button ghost" aria-label={`Restore ${batch.title || 'Untitled'}`} onClick={() => void explorer.command({ type: 'restore', batchId: batch.id })}><RotateCcw size={14} />Restore</button></div>) : <div className="empty-state"><Trash2 size={28} /><h2>Trash is empty.</h2><p>Items moved here can be restored with their original identity.</p></div>}</div> : !supported ? <div className="empty-state"><FileText size={28} /><h2>This view is not connected yet.</h2><p>Notes and folders are available in All Notes and Folders.</p></div> : entries.length ? <div className="file-list" role="group" aria-label={`${title} files`}><div className="file-list-heading"><span>Name</span><span>Location</span><span>{location.section === 'recent' ? 'Last opened' : 'Modified'}</span><span /></div>{entries.map((entry, index) => <ExplorerRow key={entry.id} entry={entry} scope={scope} nextId={entries[index + 1]?.id} detail={entry.kind === 'folder' ? 'Folder' : folderPath(data, entry.parentFolderId)} modified={date(location.section === 'recent' ? data.flags[entry.id]?.lastVisitedAt ?? entry.updatedAt : entry.updatedAt)} onOpen={() => { if (entry.kind === 'note') ui.openNote(entry.id); else void application.navigate({ page: 'library', section: 'folder', folderId: entry.id }); }} />)}</div> : <div className="empty-state">{folderView ? <Folder size={28} /> : <FileText size={28} />}<h2>{filter ? 'No matching items.' : location.section === 'favorites' ? 'Your favorites will appear here.' : location.section === 'recent' ? 'Recently opened notes will appear here.' : 'A place for your ideas.'}</h2><p>{filter ? 'Try another name.' : 'Use + in Library or ⌘⇧N to create a note.'}</p></div>}
    {folderView && folderId && !isAvailable(data, { kind: 'folder', id: folderId }) && <p className="library-error">This folder is no longer available.</p>}
  </div>;
}
