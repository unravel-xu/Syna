import { EditorSelection, Transaction } from '@codemirror/state';
import { isolateHistory } from '@codemirror/commands';
import type { EditorView } from '@codemirror/view';
export type TextFormat = 'bold' | 'italic' | 'code' | 'strike' | 'link';
export function formatSelection(view: EditorView, action: TextFormat, href = '') {
  const { from, to } = view.state.selection.main;
  if (from === to || view.state.readOnly || view.composing) return false;
  const selected = view.state.sliceDoc(from, to);
  const marker = action === 'bold' ? '**' : action === 'italic' ? '_' : action === 'code' ? '`' : '~~';
  const before = action === 'link' ? '[' : marker, after = action === 'link' ? `](${href.replaceAll('(', '%28').replaceAll(')', '%29')})` : marker;
  const surrounding = action !== 'link' && from >= before.length && view.state.sliceDoc(from - before.length, from) === before && view.state.sliceDoc(to, to + after.length) === after;
  view.dispatch(surrounding ? {
    changes: [{ from: from - before.length, to: from, insert: '' }, { from: to, to: to + after.length, insert: '' }], selection: EditorSelection.range(from - before.length, to - before.length),
    annotations: [Transaction.userEvent.of('input.format'), isolateHistory.of('full')]
  } : { changes: { from, to, insert: before + selected + after }, selection: EditorSelection.range(from + before.length, to + before.length), annotations: [Transaction.userEvent.of('input.format'), isolateHistory.of('full')] });
  view.focus(); return true;
}
