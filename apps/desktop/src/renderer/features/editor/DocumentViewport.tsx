import { useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { DocumentWidth } from '@syna/contracts';
import type { CodeMirrorBufferAdapter } from './CodeMirrorBufferAdapter';

// The container is the actual surface, after Shell panels have taken their space.
// Both renderers inherit the same CSS ratio, padding and rail from its body.
export function DocumentViewport({ width, buffer, children }: { width: DocumentWidth; buffer: CodeMirrorBufferAdapter; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const observer = new ResizeObserver(() => buffer.requestMeasure());
    observer.observe(root.current!);
    return () => observer.disconnect();
  }, [buffer]);
  useLayoutEffect(() => buffer.requestMeasure(), [buffer, width]);
  return <div ref={root} className="document-viewport" data-width={width}><div className="document-viewport-body">{children}</div></div>;
}
