import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { FileText, AlertCircle, ListTree } from 'lucide-react';
import type { ActiveNote } from '@syna/core';
import { useNotesWorkspace, useShell } from '../../app/AppProvider';
import { CodeMirrorBufferAdapter } from './CodeMirrorBufferAdapter';
import { EditorViewMode } from './EditorViewMode';
import { EditorStatusBar } from './EditorStatusBar';
import { ReadingSurface } from './ReadingSurface';
import { BlockActions } from './BlockActions/BlockActions';
import { copyText } from '../../adapters/clipboard';
import { fail } from '@syna/contracts';
import { DocumentViewport } from './DocumentViewport';
import { DocumentWidthControl } from './DocumentWidthControl';
export function MarkdownSurface({ active }: { active: ActiveNote }) {
  const { workspace, recovery, error, conflictRemote } = useNotesWorkspace();
  const { application } = useShell();
  const host = useRef<HTMLDivElement>(null), conflict = useRef<HTMLDetailsElement>(null), outlineRoot = useRef<HTMLDivElement>(null);
  const [outline, setOutline] = useState(false), [feedback, setFeedback] = useState('');
  const buffer = active.buffer as CodeMirrorBufferAdapter;
  const session = useSyncExternalStore(active.session.subscribe, active.session.getSnapshot);
  const document = useSyncExternalStore(buffer.subscribe, buffer.getSnapshot);
  const { mode, pageWidth } = useSyncExternalStore(buffer.subscribePresentation, buffer.getPresentation);
  useLayoutEffect(() => buffer.attach(host.current!, () => { void workspace.checkpoint(); }), [buffer, workspace]);
  useEffect(() => {
    if (!outline) return;
    const dismiss = (event: PointerEvent) => { if (!outlineRoot.current?.contains(event.target as Node)) setOutline(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOutline(false); } };
    window.document.addEventListener('pointerdown', dismiss); window.document.addEventListener('keydown', escape, true);
    return () => { window.document.removeEventListener('pointerdown', dismiss); window.document.removeEventListener('keydown', escape, true); };
  }, [outline]);
  const openLink = async (href: string) => {
    try {
      const url = new URL(href);
      if (url.protocol === 'syna:' && url.hostname === 'note') {
        const result = await application.navigate({ page: 'library', section: 'notes', noteId: url.pathname.slice(1) });
        if (!result.ok) setFeedback(result.error.message);
        else {
          const target = workspace.getSnapshot().active?.buffer as CodeMirrorBufferAdapter | undefined;
          const blockId = decodeURIComponent(url.hash.slice(1)).replace(/^\^/, '');
          const block = target?.getSnapshot().blocks.find(block => block.id === blockId);
          if (block) target?.reveal(block.from);
          else if (url.hash) setFeedback('该引用段落已不存在，已打开原笔记。');
        }
      } else if (['https:', 'http:', 'mailto:'].includes(url.protocol)) window.open(url.href, '_blank', 'noopener,noreferrer');
    } catch { setFeedback('This link is not a supported address.'); }
  };
  const failed = session.state === 'error' || session.state === 'conflict';
  const message = session.lastError ?? error;
  return <section className="markdown-workspace real-markdown" aria-label="Markdown workspace" data-note-id={active.document.id} data-view-mode={mode} onKeyDown={event => {
    if (event.defaultPrevented) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void active.session.flush(); }
    if ((event.metaKey || event.ctrlKey) && event.altKey && /^Digit[123]$/.test(event.code) && !event.getModifierState('AltGraph')) {
      event.preventDefault(); const next = (['live', 'reading', 'source'] as const)[Number(event.code.at(-1)) - 1];
      setFeedback(buffer.setViewMode(next) ? '' : '请完成当前中文输入后再切换模式。'); setOutline(false);
    }
  }}>
    <div className="document-tabbar"><FileText size={15} /><input aria-label="Note title" value={document.title} placeholder="Untitled" onChange={event => buffer.setTitle(event.target.value)} onCompositionStart={() => buffer.setComposition(true)} onCompositionEnd={() => buffer.setComposition(false)} /></div>
    <div className="editor-toolbar document-controls">
      <div className="outline-control" ref={outlineRoot}><button aria-label="Document outline" aria-expanded={outline} onClick={() => setOutline(value => !value)}><ListTree size={14} /><span>Outline</span></button>
        {outline && <div className="editor-menu outline-menu" aria-label="Document outline"><div className="menu-caption">DOCUMENT OUTLINE</div>{buffer.getOutline().length ? buffer.getOutline().map(heading => <button key={heading.from} style={{ paddingLeft: 12 + (heading.level - 1) * 10 }} onClick={() => { buffer.reveal(heading.from); setOutline(false); }}>{heading.text || 'Untitled heading'}</button>) : <p>No headings yet</p>}</div>}
      </div><span className="toolbar-spacer" /><DocumentWidthControl width={pageWidth} onChange={width => { buffer.setPageWidth(width); setOutline(false); }} /><EditorViewMode mode={mode} onChange={next => { setFeedback(buffer.setViewMode(next) ? '' : '请完成当前中文输入后再切换模式。'); setOutline(false); }} />
    </div>
    {feedback && <div className="editor-notice" role="status"><span>{feedback}</span><button onClick={() => setFeedback('')}>Dismiss</button></div>}
    {recovery && <div className="editor-notice" role="alert"><AlertCircle size={16} /><span>An unsaved recovery draft is available.</span><button onClick={() => { void workspace.restoreDraft(); }}>Restore draft</button><button onClick={() => { void workspace.useSavedVersion(); }}>Use saved version</button></div>}
    {(failed || message) && <div className="editor-notice error" role="alert"><AlertCircle size={16} /><span>{message?.message ?? 'Saving did not finish. Your draft is retained.'}</span>{session.state !== 'conflict' && <button onClick={() => { void active.session.flush(); }}>Retry save</button>}<button onClick={() => { void workspace.createNote(true); }}>Save a copy</button></div>}
    {session.recoveryError && <div className="editor-notice error" role="alert"><AlertCircle size={16} /><span>{session.recoveryError.message}</span></div>}
    {session.state === 'conflict' && <details ref={conflict} className="conflict-comparison"><summary>{conflictRemote ? `Saved version · revision ${conflictRemote.revision}` : `版本冲突 · 本地基于 ${session.baseRevision}，已保存版本 ${session.lastError?.currentRevision}`}</summary><pre>{conflictRemote?.markdown ?? '本地草稿仍保留。点击右下角“查看详情”读取最新已保存版本，或另存副本。'}</pre></details>}
    <DocumentViewport width={pageWidth} buffer={buffer}><div ref={host} className="codemirror-host" hidden={mode === 'reading'} onClick={event => { if (event.metaKey || event.ctrlKey) { const href = (event.target as Element).closest('[data-link]')?.getAttribute('data-link'); if (href) { event.preventDefault(); void openLink(href); } } }} />
    {mode === 'reading' && <ReadingSurface markdown={document.markdown} buffer={buffer} onLink={href => { void openLink(href); }} />}
    </DocumentViewport>
    <BlockActions buffer={buffer} report={setFeedback} copyLink={async block => {
      const result = await active.session.flush(); if (!result.ok) return result;
      if (!buffer.getSnapshot().blocks.some(current => current.id === block.id)) return fail('not-found', '该段落已改变，无法复制链接。');
      return copyText(`syna://note/${active.document.id}#^${block.id}`);
    }} />
    <EditorStatusBar session={session} retry={() => { void active.session.flush(); }} details={() => { if (conflict.current) conflict.current.open = true; void workspace.inspectConflict().then(result => { if (!result.ok) setFeedback(result.error.message); }); }} />
  </section>;
}
