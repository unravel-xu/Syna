import { useEffect, useRef, useState } from 'react';
import { AlignCenter, ArrowLeftRight, Check, ChevronDown } from 'lucide-react';
import type { DocumentWidth } from '@syna/contracts';
const choices = [{ id: 'centered', label: 'Centered', ratio: '80%', icon: AlignCenter }, { id: 'full', label: 'Full Width', ratio: '100%', icon: ArrowLeftRight }] as const;
export function DocumentWidthControl({ width, onChange }: { width: DocumentWidth; onChange: (width: DocumentWidth) => void }) {
  const [open, setOpen] = useState(false), root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape, true);
    root.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape, true); };
  }, [open]);
  const current = choices.find(choice => choice.id === width)!;
  return <div className="document-width-control" ref={root}>
    <button ref={trigger} aria-label={`Page width: ${current.label}`} title={`${current.label} · ${current.ratio} of the document area`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)}><current.icon size={14} /><span>{current.label}</span><ChevronDown size={12} /></button>
    {open && <div className="editor-menu document-width-menu" role="menu" aria-label="Page width" onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')]; items[(items.indexOf(document.activeElement as HTMLButtonElement) + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus(); } }}>
      {choices.map(choice => <button key={choice.id} role="menuitemradio" aria-checked={width === choice.id} onClick={() => { onChange(choice.id); setOpen(false); trigger.current?.focus(); }}><choice.icon size={14} /><span>{choice.label}</span><small>{choice.ratio}</small>{width === choice.id && <Check size={13} />}</button>)}
    </div>}
  </div>;
}
