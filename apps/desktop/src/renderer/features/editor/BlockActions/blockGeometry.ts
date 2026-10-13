import type { EditorView } from '@codemirror/view';
import type { BlockIdentity } from '@syna/contracts';
export interface BlockGeometry { id: string; x: number; y: number }

// Read in EditorView.requestMeasure. Glyph rectangles include the real font,
// heading padding, wrapping and decorations; no heading-level offsets are used.
export function measureBlockGeometry(view: EditorView, block: BlockIdentity): BlockGeometry | null {
  const viewport = view.scrollDOM.getBoundingClientRect();
  if (!viewport.width || !viewport.height) return null;
  const style = getComputedStyle(view.contentDOM);
  const rail = parseFloat(style.getPropertyValue('--document-rail'));
  const handle = parseFloat(style.getPropertyValue('--document-handle-size'));
  let glyph = null;
  const first = view.state.doc.lineAt(block.from).number, last = view.state.doc.lineAt(block.to).number;
  for (let number = first; number <= Math.min(last, first + 32) && !glyph; number++) {
    const line = view.state.doc.line(number);
    // Hidden fence/header markers have no character rect. Find actual rendered text.
    for (let position = Math.max(block.from, line.from); position < Math.min(line.to, block.to, line.from + 128); position++) {
      glyph = view.coordsForChar(position); if (glyph) break;
    }
  }
  if (!glyph || glyph.top < viewport.top || glyph.bottom > viewport.bottom) return null;
  const textLeft = view.contentDOM.getBoundingClientRect().left;
  return { id: block.id, x: textLeft - rail / 2 - handle / 2, y: (glyph.top + glyph.bottom - handle) / 2 };
}
