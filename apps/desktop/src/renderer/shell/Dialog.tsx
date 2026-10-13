import { useEffect, useRef } from 'react';
import type { PropsWithChildren, RefObject } from 'react';
import { X, Plus, FileText, Layers3, Link2, Moon, Sun, Monitor, Check } from 'lucide-react';
import { useShell } from '../app/AppProvider';
import { SearchView } from '../features/SearchView';
import { DemoBadge, IconButton } from './primitives';
import type { TemporaryPanel } from './GlobalHeader';

export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean, trapFocus = true) {
  useEffect(() => {
    if (!active || !ref.current) return;
    const root = ref.current;
    const current = document.activeElement as HTMLElement | null;
    const fallbackLabel = root.getAttribute('aria-label') === 'Context sidebar' ? 'Toggle context sidebar' : root.getAttribute('aria-label') === 'Assistant Demo' ? 'Toggle Assistant Demo' : '';
    const previous = current && current !== document.body && !current.closest('[inert]') ? current : document.querySelector<HTMLElement>(`button[aria-label="${fallbackLabel}"]`);
    const elements = () => [...root.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex="0"]')].filter(node => node.getClientRects().length > 0);
    (elements()[0] ?? root).focus({ preventScroll: true });
    const trap = (event: KeyboardEvent) => {
      if (!trapFocus || event.key !== 'Tab') return;
      const nodes = elements();
      if (nodes.length === 0) { event.preventDefault(); root.focus(); return; }
      if (event.shiftKey && (document.activeElement === nodes[0] || document.activeElement === root)) { event.preventDefault(); nodes.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0].focus(); }
    };
    root.addEventListener('keydown', trap);
    return () => { root.removeEventListener('keydown', trap); requestAnimationFrame(() => {
      // A nonmodal sidebar must not steal focus from a Rail/Header action used to close it.
      const next = document.activeElement;
      if (!trapFocus && next && next !== document.body && !root.contains(next)) return;
      if (previous?.isConnected && !previous.closest('[inert]') && (!root.isConnected || root.getAttribute('aria-modal') !== 'true')) previous.focus({ preventScroll: true });
    }); };
  }, [ref, active, trapFocus]);
}

function Modal({ label, close, children, className = '' }: PropsWithChildren<{ label: string; close(): void; className?: string }>) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true);
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}><div ref={ref} className={`modal ${className}`} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>{children}</div></div>;
}
export function TemporaryDialog({ panel, close }: { panel: TemporaryPanel; close(): void }) {
  const { application, layout } = useShell();
  if (!panel) return null;
  if (panel === 'search') return <Modal label="Global search" close={close} className="search-modal"><SearchView compact onNavigate={close} /></Modal>;
  const title = panel === 'create' ? 'A new beginning.' : 'Appearance';
  return <Modal label={panel === 'settings' ? 'Settings' : 'Create preview'} close={close}><div className="modal-title"><h2>{title}</h2><IconButton label="Close dialog" onClick={close}><X size={18} /></IconButton></div>
    {panel === 'create' ? <><div className="modal-description"><DemoBadge>Development preview</DemoBadge><p>Creation is not connected yet. Nothing will be created or saved.</p></div><div className="create-options">{[{ icon: FileText, title: 'New note', text: 'A fresh space to think' }, { icon: Layers3, title: 'New project', text: 'Give your work a direction' }, { icon: Link2, title: 'Capture an input', text: 'Keep something interesting' }].map(({ icon: Icon, title, text }) => <button disabled key={title}><Icon size={19} /><span><strong>{title}</strong><small>{text}</small></span><span className="subtle-label">Not connected</span><Plus size={14} /></button>)}</div></> : <>
      <div className="settings-label">THEME</div>
      <div className="theme-options" role="group" aria-label="Appearance theme">{(['system', 'light', 'dark'] as const).map(theme => {
        const Icon = theme === 'system' ? Monitor : theme === 'light' ? Sun : Moon;
        const selected = layout.preferences.theme === theme;
        return <button key={theme} aria-pressed={selected} onClick={() => application.setTheme(theme)} className={selected ? 'selected' : ''}><Icon size={18} aria-hidden="true" /><span>{theme.charAt(0).toUpperCase() + theme.slice(1)}</span>{selected && <Check size={14} className="theme-check" aria-hidden="true" />}</button>;
      })}</div>
    </>}
  </Modal>;
}
