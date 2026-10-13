import { useRef, useState } from 'react';
import { ArrowUp, Sparkles, X, Plus, FileText, LockKeyhole } from 'lucide-react';
import { deriveLayout } from '@syna/core';
import { useShell } from '../app/AppProvider';
import { DemoBadge, IconButton } from './primitives';
import { ResizeHandle } from './ResizeHandle';
import { useFocusTrap } from './Dialog';
export function AuxiliaryPanel({ modalOpen }: { modalOpen: boolean }) {
  const { application, navigation, layout } = useShell();
  const effective = deriveLayout(navigation.location, layout);
  // Hide, don't dispose: this draft survives close/reopen and navigation.
  const [draft, setDraft] = useState('');
  const ref = useRef<HTMLElement>(null);
  const overlay = effective.auxiliaryMode === 'overlay';
  const visible = effective.auxiliaryMode !== 'hidden';
  useFocusTrap(ref, overlay && !modalOpen);
  return <>
    {overlay && <div className="auxiliary-backdrop" aria-hidden="true" onClick={() => application.setAuxiliary(false)} />}
    <aside ref={ref} hidden={!visible} inert={modalOpen} className={`auxiliary-panel ${overlay ? 'overlay' : ''}`} style={{ width: effective.auxiliaryWidth }} aria-label="Assistant Demo" role={overlay ? 'dialog' : 'complementary'} aria-modal={overlay || undefined} tabIndex={-1}>
      <ResizeHandle panel="auxiliary" width={layout.preferences.auxiliaryWidth} />
      <div className="auxiliary-header"><Sparkles size={16} /><strong>Assistant</strong><DemoBadge>Demo</DemoBadge><IconButton label="Close Assistant Demo" onClick={() => application.setAuxiliary(false)}><X size={17} /></IconButton></div>
      <div className="assistant-scroll"><div className="assistant-symbol"><Sparkles size={27} strokeWidth={1.2} /></div><h2>A thinking partner,<br />in context.</h2><p>This is a preview of the Assistant surface. No model is connected and no messages are sent.</p><div className="assistant-context"><span className="settings-label">CURRENT SURFACE</span><span><FileText size={14} />{navigation.location.page === 'library' ? 'Notes workspace' : navigation.location.page.charAt(0).toUpperCase() + navigation.location.page.slice(1)}<DemoBadge>Layout only</DemoBadge></span></div><div className="assistant-ideas"><span>Eventually, a place to…</span><p>Ask a better question.</p><p>Connect a few loose threads.</p><p>Find a clearer way to say it.</p></div></div>
      <div className="assistant-composer"><label htmlFor="assistant-draft" className="sr-only">Assistant demo draft · Not sent</label><textarea id="assistant-draft" value={draft} onChange={event => setDraft(event.target.value)} placeholder="A thought to come back to…" rows={3} /><div><button disabled aria-label="Attach context · Not connected"><Plus size={16} /></button><span>Local demo draft</span><button disabled aria-label="Send · No AI model connected" title="No AI model connected"><ArrowUp size={17} /></button></div></div><p className="assistant-footnote"><LockKeyhole size={11} />No AI connection · Draft stays in this session</p>
    </aside>
  </>;
}
