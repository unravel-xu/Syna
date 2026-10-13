import { useRef } from 'react';
import type { PointerEvent } from 'react';
import { SIZES } from '@syna/core';
import { useShell } from '../app/AppProvider';
export function ResizeHandle({ panel, width }: { panel: 'sidebar' | 'auxiliary'; width: number }) {
  const { application } = useShell();
  const drag = useRef<{ x: number; width: number } | null>(null);
  const bounds = panel === 'sidebar' ? SIZES.sidebar : SIZES.auxiliary;
  function start(event: PointerEvent<HTMLDivElement>) { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, width }; }
  return <div className={`resize-handle ${panel}`} role="separator" aria-label={`Resize ${panel === 'sidebar' ? 'context sidebar' : 'assistant'}`} aria-orientation="vertical" aria-valuemin={bounds.min} aria-valuemax={bounds.max} aria-valuenow={width} tabIndex={0}
    onPointerDown={start} onPointerMove={event => { if (drag.current) application.resizePanel(panel, drag.current.width + (event.clientX - drag.current.x) * (panel === 'sidebar' ? 1 : -1)); }}
    onPointerUp={event => { drag.current = null; event.currentTarget.releasePointerCapture(event.pointerId); }} onLostPointerCapture={() => { drag.current = null; }}
    onKeyDown={event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? bounds.min : event.key === 'End' ? bounds.max : width + (event.key === 'ArrowRight' ? 8 : -8) * (panel === 'sidebar' ? 1 : -1); application.resizePanel(panel, next); } }} />;
}
