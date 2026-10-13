import { useEffect, useRef, useState } from 'react';
import { GripVertical, Copy, Link2, Trash2, Type } from 'lucide-react';
import type { BlockIdentity, Result } from '@syna/contracts';
import { Transaction } from '@codemirror/state';
import { isolateHistory } from '@codemirror/commands';
import type { CodeMirrorBufferAdapter } from '../CodeMirrorBufferAdapter';
import { slashCommands, insertCommand } from '../SlashCommands/registry';
import { copyText } from '../../../adapters/clipboard';
import { closeSlash } from '../SlashCommands/slashExtension';
import { dismissSelection } from '../SelectionToolbar/selectionExtension';
import { measureBlockGeometry } from './blockGeometry';
interface Target { id: string; x: number; y: number }
export function BlockActions({ buffer, copyLink, report }: { buffer: CodeMirrorBufferAdapter; copyLink: (block: BlockIdentity) => Promise<Result<void>>; report: (message: string) => void }) {
  const [target, setTarget] = useState<Target | null>(null), [open, setOpen] = useState(false), [converting, setConverting] = useState(false);
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const view = buffer.getView(); if (!view) return;
    let blockId: string | undefined, disposed = false, focusMenu = false;
    const measureKey = {};
    const clear = () => { blockId = undefined; setTarget(null); setOpen(false); setConverting(false); };
    const measure = () => {
      if (!blockId || disposed) return;
      view.requestMeasure({ key: measureKey, read: () => {
        const block = buffer.getSnapshot().blocks.find(block => block.id === blockId);
        return block && !view.composing && buffer.getPresentation().mode !== 'reading' ? measureBlockGeometry(view, block) : null;
      }, write: geometry => {
        if (disposed) return;
        setTarget(geometry);
        if (!geometry) { setOpen(false); return; }
        if (focusMenu) { focusMenu = false; requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()); }
      } });
    };
    const show = (position: number) => { blockId = buffer.getSnapshot().blocks.find(block => block.from <= position && block.to >= position)?.id; if (blockId) measure(); else clear(); };
    const hover = (event: MouseEvent) => {
      if (root.current?.getAttribute('data-open') === 'true') return;
      if (buffer.getPresentation().mode !== 'live') { clear(); return; }
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }); if (pos != null) show(pos);
    };
    const leave = (event: MouseEvent) => { if (!(event.relatedTarget instanceof Element && event.relatedTarget.closest('[data-block-controls]')) && root.current?.getAttribute('data-open') !== 'true') clear(); };
    const keyboard = (event: KeyboardEvent) => { if (event.key === 'ContextMenu' || event.key === 'F10' && event.shiftKey) {
      event.preventDefault(); event.stopPropagation(); view.dispatch({ effects: [closeSlash.of(undefined), dismissSelection.of(undefined)] });
      focusMenu = true; show(view.state.selection.main.head); setOpen(true);
    } };
    const unsubscribeView = buffer.subscribeView(update => { if (update.geometryChanged || update.docChanged || update.viewportChanged) measure(); });
    const unsubscribePresentation = buffer.subscribePresentation(() => { if (buffer.getPresentation().mode === 'reading') clear(); else measure(); });
    const observer = new ResizeObserver(measure); observer.observe(view.dom); observer.observe(view.contentDOM);
    view.dom.addEventListener('mousemove', hover); view.dom.addEventListener('mouseleave', leave); view.dom.addEventListener('keydown', keyboard); view.scrollDOM.addEventListener('scroll', clear);
    return () => { disposed = true; observer.disconnect(); unsubscribeView(); unsubscribePresentation(); view.dom.removeEventListener('mousemove', hover); view.dom.removeEventListener('mouseleave', leave); view.dom.removeEventListener('keydown', keyboard); view.scrollDOM.removeEventListener('scroll', clear); };
  }, [buffer]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) { setOpen(false); setConverting(false); } };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); setConverting(false); if (buffer.getPresentation().mode === 'live') trigger.current?.focus(); else buffer.getView()?.focus(); }
      if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && root.current?.contains(event.target as Node)) {
        event.preventDefault(); const buttons = [...root.current.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]; const index = buttons.indexOf(document.activeElement as HTMLButtonElement); buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
      }
    };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', keyboard, true);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', keyboard, true); };
  }, [open, buffer]);
  if (!target || buffer.getPresentation().mode === 'reading') return null;
  const current = () => buffer.getSnapshot().blocks.find(block => block.id === target.id);
  const finish = (result: Result<void>) => { if (result.ok) { setOpen(false); report(''); } else report(result.error.message); };
  return <div ref={root} data-block-controls data-block-id={target.id} data-open={open} className="block-actions" style={{ left: target.x, top: target.y }}>
    <button ref={trigger} className="block-trigger" aria-label="Block actions" title="Block actions · Shift+F10" aria-haspopup="menu" aria-expanded={open} onMouseDown={event => event.preventDefault()} onClick={() => { buffer.getView()?.dispatch({ effects: [closeSlash.of(undefined), dismissSelection.of(undefined)] }); setOpen(value => !value); setConverting(false); }}><GripVertical size={15} /></button>
    {open && <div className="editor-menu block-menu" role="menu" aria-label="Block actions" style={{ left: Math.min(0, window.innerWidth - target.x - 235), top: Math.min(30, window.innerHeight - target.y - (converting ? 320 : 180)) }}>
      {converting ? <>{slashCommands.slice(0, 8).map(command => <button key={command.id} role="menuitem" onMouseDown={event => event.preventDefault()} onClick={() => { const block = current(), view = buffer.getView(); if (block && view) { view.dispatch({ selection: { anchor: block.from, head: block.to } }); insertCommand(view, command); } setOpen(false); }}>{command.symbol}<span>{command.label}</span></button>)}</> : <>
        <button role="menuitem" onClick={() => { const block = current(); if (block) void copyLink(block).then(finish); }}><Link2 size={14} /><span>复制块链接</span></button>
        <button role="menuitem" onClick={() => { const block = current(); if (block) void copyText(buffer.getSnapshot().markdown.slice(block.from, block.to)).then(finish); }}><Copy size={14} /><span>复制 Markdown</span></button>
        <button role="menuitem" disabled={!/^(Paragraph|ATXHeading[1-6])$/.test(current()?.kind ?? '')} title={!/^(Paragraph|ATXHeading[1-6])$/.test(current()?.kind ?? '') ? '当前仅支持段落与标题转换' : undefined} onClick={() => setConverting(true)}><Type size={14} /><span>转换块类型</span></button>
        <div className="menu-separator" /><button role="menuitem" onClick={() => { const block = current(), view = buffer.getView(); if (block && view && !view.composing) { view.dispatch({ changes: { from: block.from, to: block.to, insert: '' }, selection: { anchor: block.from }, annotations: [Transaction.userEvent.of('delete.block'), isolateHistory.of('full')] }); view.focus(); } setOpen(false); }}><Trash2 size={14} /><span>删除当前块</span></button>
      </>}
    </div>}
  </div>;
}
