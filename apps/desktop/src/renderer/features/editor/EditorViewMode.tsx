import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Code2, Eye, BookOpen } from 'lucide-react';
import type { EditorViewMode as Mode } from '@syna/contracts';
export const modes = [{ id: 'live', label: 'Live Preview', icon: Eye, description: 'Edit with inline formatting' }, { id: 'reading', label: 'Reading Mode', icon: BookOpen, description: 'Read without editing' }, { id: 'source', label: 'Source Mode', icon: Code2, description: 'Edit full Markdown syntax' }] as const;
export function EditorViewMode({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) {
  const [open, setOpen] = useState(false), root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape, true);
    root.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape, true); };
  }, [open]);
  const current = modes.find(item => item.id === mode)!;
  return <div className="view-mode-control" ref={root}>
    <button ref={trigger} aria-label={`View mode: ${current.label}`} title="View mode · ⌘/Ctrl+Alt+1 / 2 / 3" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)}><current.icon size={14} /><span>{current.label}</span><ChevronDown size={12} /></button>
    {open && <div className="editor-menu view-mode-menu" role="menu" aria-label="View mode" onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')]; const index = items.indexOf(document.activeElement as HTMLButtonElement); items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus(); } }}>
      {modes.map((item, index) => <button key={item.id} role="menuitemradio" title={`⌘/Ctrl+Alt+${index + 1}`} aria-checked={item.id === mode} onClick={() => { onChange(item.id); setOpen(false); }}><item.icon size={15} /><span>{item.label}<small>{item.description}</small></span>{item.id === mode && <Check size={13} />}</button>)}
    </div>}
  </div>;
}
