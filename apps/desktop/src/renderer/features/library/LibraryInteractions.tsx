import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { createPortal } from 'react-dom';
import { Check, X, Folder, FileText } from 'lucide-react';
import type { DeletePlan, LibraryTarget, SortMode } from '@syna/contracts';
import { folderPath, isAvailable, placementOf, sortMode } from '@syna/core';
import { useLibraryExplorer, useShell } from '../../app/AppProvider';
import { copyText } from '../../adapters/clipboard';
import { useFocusTrap } from '../../shell/Dialog';
import { folderEntries, sortLabels, viewEntries } from './selectors';
type Anchor = { x: number; y: number };
interface Item { label: string; run(): void | Promise<unknown>; checked?: boolean; disabled?: boolean; danger?: boolean }
type Overlay = { kind: 'menu'; label: string; anchor: Anchor; items: Item[] } | { kind: 'name'; label: string; value: string; submit(value: string): Promise<unknown> } | { kind: 'move'; target: LibraryTarget } | { kind: 'trash'; plan: DeletePlan };
interface Interactions {
  showCreate(anchor: Anchor, parentId?: string | null): void;
  showMore(target: LibraryTarget, anchor: Anchor, scope: string): void;
  showSort(anchor: Anchor, scope: string): void;
  openNote(id: string): void;
  dragged: LibraryTarget | null; setDragged(target: LibraryTarget | null): void;
  drop(target: LibraryTarget, parentId: string | null, beforeId: string | undefined, scope: string, inside: boolean): void;
  canDrop(target: LibraryTarget, parentId: string | null): boolean;
}
const Context = createContext<Interactions | null>(null);
export const anchorAt = (element: HTMLElement): Anchor => { const rect = element.getBoundingClientRect(); return { x: rect.right - 220, y: rect.bottom + 5 }; };
export function useLibraryUI() { const value = useContext(Context); if (!value) throw new Error('Library interactions are unavailable.'); return value; }
export function LibraryInteractions({ children }: PropsWithChildren) {
  const { explorer, data, busy, message, error } = useLibraryExplorer();
  const { application, navigation: { location } } = useShell();
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [dragged, setDragged] = useState<LibraryTarget | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const open = (next: Overlay) => { returnFocus.current = document.activeElement as HTMLElement; setOverlay(next); };
  const close = (restore = true) => { setOverlay(null); if (restore && returnFocus.current?.isConnected && !returnFocus.current.closest('[inert]')) returnFocus.current.focus({ preventScroll: true }); };
  function openNote(id: string) { const section = location.page === 'library' && ['folder', 'uncategorized', 'favorites', 'recent', 'notes'].includes(location.section) ? location.section : 'notes'; void application.navigate({ page: 'library', section, ...(location.page === 'library' && location.folderId ? { folderId: location.folderId } : {}), noteId: id }); }
  function canDrop(target: LibraryTarget, parentId: string | null) {
    if (!isAvailable(data, target)) return false;
    const visited = new Set<string>();
    while (parentId) { if (parentId === target.id || visited.has(parentId)) return false; visited.add(parentId); const parent = data.folders.find(folder => folder.id === parentId); if (!parent || !isAvailable(data, { kind: 'folder', id: parentId })) return false; parentId = parent.parentId; }
    return true;
  }
  function drop(target: LibraryTarget, parentId: string | null, beforeId: string | undefined, scope: string, inside: boolean) {
    setDragged(null);
    if (!canDrop(target, parentId)) return;
    if (!inside && sortMode(data, scope) !== 'manual') { explorer.report({ code: 'validation', message: 'Switch to Manual sorting before reordering.', retryable: false }); return; }
    if (!inside && ['notes', 'favorites'].includes(scope)) void explorer.command({ type: 'reorder-view', key: scope, noteId: target.id, ...(beforeId ? { beforeId } : {}) }, true);
    else void explorer.command({ type: 'move', target, parentFolderId: parentId, ...(inside ? {} : { beforeId: beforeId ?? undefined, scope }) }, true);
  }
  const createFolder = (parentId: string | null) => open({ kind: 'name', label: 'New Folder', value: '', submit: value => explorer.command({ type: 'create-folder', name: value, parentFolderId: parentId }) });
  function showCreate(anchor: Anchor, parentId: string | null = null) { open({ kind: 'menu', label: 'Create in Library', anchor, items: [ { label: 'New Note', run: () => explorer.createNote(parentId) }, { label: 'New Folder', run: () => createFolder(parentId) } ] }); }
  function showSort(anchor: Anchor, scope: string) { open({ kind: 'menu', label: scope === 'tree' ? 'Tree sort' : 'Sort files', anchor, items: Object.entries(sortLabels).map(([mode, label]) => ({ label, checked: sortMode(data, scope) === mode, run: () => explorer.command({ type: 'sort', key: scope, mode: mode as SortMode }) })) }); }
  async function preview(target: LibraryTarget) { const plan = await explorer.previewTrash(target); if (plan.ok) open({ kind: 'trash', plan: plan.value }); }
  function showMore(entry: LibraryTarget, anchor: Anchor, scope: string) {
    const target: LibraryTarget = { kind: entry.kind, id: entry.id };
    const item = placementOf(data, target); if (!item || item.trashedBy) return;
    const title = target.kind === 'folder' ? data.folders.find(folder => folder.id === target.id)!.name : data.notes.find(note => note.id === target.id)!.title;
    let siblings = ['notes', 'favorites'].includes(scope) ? viewEntries(data, scope) : folderEntries(data, item.parentFolderId, scope);
    if (scope === 'tree' && !item.parentFolderId) siblings = siblings.filter(entry => entry.kind === target.kind);
    const index = siblings.findIndex(entry => entry.id === target.id), manual = scope !== 'recent' && sortMode(data, scope) === 'manual';
    const move = (direction: -1 | 1) => { const beforeId = direction < 0 ? siblings[index - 1]?.id : siblings[index + 2]?.id; drop(target, item.parentFolderId, beforeId, scope, false); };
    const items: Item[] = target.kind === 'folder' ? [
      { label: 'New Note', run: () => explorer.createNote(target.id) }, { label: 'New Subfolder', run: () => createFolder(target.id) },
      { label: 'Rename', run: () => open({ kind: 'name', label: 'Rename Folder', value: title, submit: value => explorer.command({ type: 'rename-folder', id: target.id, name: value }) }) }
    ] : [
      { label: 'Open', run: () => openNote(target.id) },
      { label: 'Rename', run: () => open({ kind: 'name', label: 'Rename Note', value: title, submit: value => explorer.renameNote(target.id, value) }) },
      { label: data.flags[target.id]?.favorite ? 'Remove from Favorites' : 'Add to Favorites', run: () => explorer.command({ type: 'favorite', noteId: target.id, value: !data.flags[target.id]?.favorite }) },
      { label: 'Copy Note Link', run: async () => { const copied = await copyText(`syna://note/${target.id}`); if (!copied.ok) explorer.report(copied.error); } }
    ];
    items.push({ label: 'Move to Folder…', run: () => open({ kind: 'move', target }) }, { label: 'Move Up', disabled: !manual || index <= 0, run: () => move(-1) }, { label: 'Move Down', disabled: !manual || index < 0 || index >= siblings.length - 1, run: () => move(1) }, { label: 'Move to Trash…', danger: true, run: () => preview(target) });
    open({ kind: 'menu', label: `${title || 'Untitled'} actions`, anchor, items });
  }
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (overlay || event.defaultPrevented || event.isComposing || document.querySelector('.modal[aria-modal="true"]') || !(event.metaKey || event.ctrlKey) || !event.shiftKey || event.key.toLowerCase() !== 'n') return;
      event.preventDefault(); const current = application.getSnapshot().navigation.location;
      void explorer.createNote(current.page === 'library' && current.section === 'folder' ? current.folderId ?? null : null);
    };
    window.addEventListener('keydown', keyboard); return () => window.removeEventListener('keydown', keyboard);
  }, [application, explorer, overlay]);
  return <Context.Provider value={{ showCreate, showMore, showSort, openNote, dragged, setDragged, drop, canDrop }}>{children}
    <div className="library-announcement" role={error ? 'alert' : 'status'} aria-live="polite">{message}</div>
    {error && <div className="library-feedback" role="alert">{error.message}</div>}
    {overlay && createPortal(<LibraryOverlay key={overlay.kind === 'name' ? overlay.label + overlay.value : overlay.kind} overlay={overlay} close={close} busy={busy} canDrop={canDrop} moveTo={async (parentId) => { if (overlay.kind !== 'move') return; const result = await explorer.command({ type: 'move', target: overlay.target, parentFolderId: parentId }, true); if (result.ok) close(); }} onTrash={async () => { if (overlay.kind !== 'trash') return; const result = await explorer.executeTrash(overlay.plan); if (result.ok) close(); }} error={error?.message} />, document.body)}
  </Context.Provider>;
}
function LibraryOverlay({ overlay, close, busy, canDrop, moveTo, onTrash, error }: { overlay: Overlay; close(restore?: boolean): void; busy: boolean; canDrop(target: LibraryTarget, parentId: string | null): boolean; moveTo(parentId: string | null): Promise<void>; onTrash(): Promise<void>; error?: string }) {
  const { data } = useLibraryExplorer();
  const ref = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState(overlay.kind === 'name' ? overlay.value : '');
  const [localError, setLocalError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const pending = busy || submitting;
  async function submit(action: () => Promise<unknown>) { if (submitting) return; setSubmitting(true); try { await action(); } finally { setSubmitting(false); } }
  const isMenu = overlay.kind === 'menu';
  useFocusTrap(ref, !isMenu);
  useEffect(() => { if (overlay.kind === 'name') { const input = ref.current?.querySelector('input'); input?.focus(); input?.select(); } }, [overlay]);
  useLayoutEffect(() => {
    if (!isMenu || !ref.current || overlay.kind !== 'menu') return;
    const node = ref.current, rect = node.getBoundingClientRect();
    node.style.left = `${Math.max(8, Math.min(overlay.anchor.x, window.innerWidth - rect.width - 8))}px`;
    node.style.top = `${Math.max(8, Math.min(overlay.anchor.y, window.innerHeight - rect.height - 8))}px`;
    node.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
  }, [overlay, isMenu]);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
      if (isMenu && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) && ref.current) {
        event.preventDefault(); event.stopPropagation(); const buttons = [...ref.current.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')], current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
      }
      if (isMenu && event.key === 'Tab') close(false);
    };
    const outside = (event: PointerEvent) => { if (isMenu && !ref.current?.contains(event.target as Node)) close(false); };
    const moved = (event: Event) => { if (isMenu && !ref.current?.contains(event.target as Node)) close(false); };
    window.addEventListener('keydown', keyboard, true); window.addEventListener('pointerdown', outside, true); window.addEventListener('resize', moved); window.addEventListener('scroll', moved, true);
    return () => { window.removeEventListener('keydown', keyboard, true); window.removeEventListener('pointerdown', outside, true); window.removeEventListener('resize', moved); window.removeEventListener('scroll', moved, true); };
  }, [close, isMenu]);
  if (overlay.kind === 'menu') return <div ref={ref} className="library-menu" role="menu" aria-label={overlay.label}>{overlay.items.map(item => <button role={item.checked === undefined ? 'menuitem' : 'menuitemradio'} aria-checked={item.checked} key={item.label} disabled={busy || item.disabled} className={item.danger ? 'danger' : ''} onClick={() => { close(); void item.run(); }}>{item.checked !== undefined && <Check size={14} style={{ visibility: item.checked ? 'visible' : 'hidden' }} />}<span>{item.label}</span></button>)}</div>;
  const title = overlay.kind === 'name' ? overlay.label : overlay.kind === 'move' ? 'Move to Folder' : 'Move to Trash';
  return <div className="library-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !pending) close(); }}><div ref={ref} className="library-dialog" role="dialog" aria-modal="true" aria-label={title} aria-busy={pending}>
    <div className="library-dialog-title"><h2>{title}</h2><button className="icon-button" aria-label="Close Library dialog" onClick={() => close()}><X size={16} /></button></div>
    {overlay.kind === 'name' ? <form onSubmit={async event => { event.preventDefault(); if (submitting) return; setSubmitting(true); setLocalError(''); const result = await overlay.submit(value.trim()) as { ok: boolean; error?: { message: string } }; if (result.ok) close(); else setLocalError(result.error?.message ?? 'The change could not be saved.'); setSubmitting(false); }}><label>Name<input aria-label={overlay.label} value={value} autoFocus onFocus={event => event.target.select()} maxLength={overlay.label === 'Rename Note' ? 500 : 200} onChange={event => setValue(event.target.value)} /></label><button type="submit" className="button primary" disabled={!value.trim() || pending}>Save</button></form> : overlay.kind === 'move' ? <div className="move-destinations"><button disabled={pending || !canDrop(overlay.target, null)} onClick={() => void submit(() => moveTo(null))}>Uncategorized / Root</button>{data.folders.filter(folder => isAvailable(data, { kind: 'folder', id: folder.id })).map(folder => <button key={folder.id} disabled={pending || !canDrop(overlay.target, folder.id)} onClick={() => void submit(() => moveTo(folder.id))}>{folderPath(data, folder.id)}</button>)}</div> : <><p>Move <strong>{overlay.plan.title || 'Untitled'}</strong> to Trash?</p><p>{overlay.plan.items.filter(item => item.kind === 'folder').length} folders · {overlay.plan.items.filter(item => item.kind === 'note').length} notes</p><ul className="trash-impact-list">{overlay.plan.items.filter(item => item.id !== overlay.plan.target.id).map(item => <li key={item.id}>{item.kind === 'folder' ? <Folder size={13} /> : <FileText size={13} />}<span>{overlay.plan.itemTitles[item.id] || 'Untitled'}</span></li>)}</ul>{overlay.plan.preservedNotes.length > 0 && <p>{overlay.plan.preservedNotes.length} shared notes will remain in Uncategorized.</p>}<p>{overlay.plan.affectedLinks} project links retained. Content and history can be restored.</p><div className="library-dialog-footer"><button className="button secondary" onClick={() => close()}>Cancel</button><button className="button primary" disabled={pending} onClick={() => void submit(onTrash)}>Move to Trash</button></div></>}
    {(localError || error) && <p className="library-error" role="alert">{localError || error}</p>}
  </div></div>;
}
