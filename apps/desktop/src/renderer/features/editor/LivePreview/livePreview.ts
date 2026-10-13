import { StateEffect, StateField } from '@codemirror/state';
import type { EditorState, Range } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';

const activity = StateEffect.define<{ focused: boolean; composing: boolean }>();
const activityField = StateField.define({
  create: () => ({ focused: false, composing: false }),
  update: (value, transaction) => transaction.effects.find(effect => effect.is(activity))?.value ?? value
});
class Bullet extends WidgetType {
  toDOM() { const span = document.createElement('span'); span.className = 'live-bullet'; span.textContent = '•'; return span; }
}
function decorations(state: EditorState): DecorationSet {
  const ranges: Range<Decoration>[] = [], selection = state.selection.main;
  const { focused } = state.field(activityField);
  const active = (from: number, to: number) => focused && selection.from <= to && selection.to >= from;
  const hide = (from: number, to: number) => { if (to > from) ranges.push(Decoration.replace({}).range(from, to)); };
  const lineClass = (from: number, to: number, name: string) => {
    for (let line = state.doc.lineAt(from); line.from <= to; line = state.doc.line(line.number + 1)) {
      ranges.push(Decoration.line({ class: name }).range(line.from));
      if (line.number === state.doc.lines || line.to >= to) break;
    }
  };
  syntaxTree(state).iterate({ enter(node) {
    const { name, from, to } = node;
    if (/^ATXHeading[1-6]$/.test(name)) {
      lineClass(from, to, `live-heading live-h${name.at(-1)}`);
      if (!active(from, to)) { const mark = node.node.firstChild; if (mark?.name === 'HeaderMark') hide(mark.from, Math.min(mark.to + 1, to)); }
    } else if (name === 'StrongEmphasis' || name === 'Emphasis' || name === 'InlineCode') {
      ranges.push(Decoration.mark({ class: name === 'StrongEmphasis' ? 'live-strong' : name === 'Emphasis' ? 'live-emphasis' : 'live-code' }).range(from, to));
      if (!active(from, to)) for (let child = node.node.firstChild; child; child = child.nextSibling) if (child.name === 'EmphasisMark' || child.name === 'CodeMark') hide(child.from, child.to);
    } else if (name === 'Link') {
      const url = node.node.getChild('URL');
      ranges.push(Decoration.mark({ class: 'live-link', attributes: url ? { 'data-link': state.sliceDoc(url.from, url.to), title: '⌘/Ctrl + click to open link' } : {} }).range(from, to));
      if (!active(from, to)) {
        for (let child = node.node.firstChild; child; child = child.nextSibling) if (child.name === 'LinkMark' || child.name === 'URL' || child.name === 'LinkTitle') hide(child.from, child.to);
      }
    } else if (name === 'ListMark') {
      const line = state.doc.lineAt(from);
      if (!active(line.from, line.to) && /^[-+*]$/.test(state.sliceDoc(from, to))) ranges.push(Decoration.replace({ widget: new Bullet() }).range(from, to));
    } else if (name === 'Blockquote') {
      lineClass(from, to, 'live-quote');
    } else if (name === 'QuoteMark') {
      const line = state.doc.lineAt(from); if (!active(line.from, line.to)) hide(from, Math.min(to + 1, line.to));
    } else if (name === 'FencedCode') {
      lineClass(from, to, 'live-fenced-code');
      if (!active(from, to)) for (let child = node.node.firstChild; child; child = child.nextSibling) if (child.name === 'CodeMark' || child.name === 'CodeInfo') hide(child.from, child.to);
      return false; // Do not decorate Markdown-like text inside code fences.
    } else if (name === 'HorizontalRule') lineClass(from, to, 'live-divider');
  } });
  return Decoration.set(ranges, true);
}
export function livePreview(focused = false) {
  const field = StateField.define<DecorationSet>({
    create: decorations,
    update: (value, transaction) => {
      // The active range already exposes its markers. While IME owns the DOM, only map
      // existing ranges; do not rebuild decorations or change paragraph geometry.
      if (transaction.state.field(activityField).composing) return transaction.docChanged ? value.map(transaction.changes) : value;
      return transaction.docChanged || transaction.selection || transaction.effects.some(effect => effect.is(activity)) ? decorations(transaction.state) : value;
    },
    provide: field => EditorView.decorations.from(field)
  });
  return [activityField.init(() => ({ focused, composing: false })), field, EditorView.domEventHandlers({
    focus: (_event, view) => { view.dispatch({ effects: activity.of({ focused: true, composing: view.composing }) }); },
    blur: (_event, view) => { view.dispatch({ effects: activity.of({ focused: false, composing: view.composing }) }); },
    compositionstart: (_event, view) => { view.dispatch({ effects: activity.of({ focused: true, composing: true }) }); },
    compositionend: (_event, view) => { requestAnimationFrame(() => { if (view.dom.isConnected) view.dispatch({ effects: activity.of({ focused: view.hasFocus, composing: false }) }); }); }
  })];
}
