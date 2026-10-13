import { Prec, StateEffect, StateField } from '@codemirror/state';
import type { EditorState } from '@codemirror/state';
import { EditorView, keymap, showTooltip } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { filterCommands, insertCommand } from './registry';
export interface SlashState { from: number; to: number; query: string; index: number }
export const closeSlash = StateEffect.define<void>();
const selectSlash = StateEffect.define<number>(), composition = StateEffect.define<boolean>();
const composing = StateField.define({ create: () => false, update: (value, transaction) => transaction.effects.find(effect => effect.is(composition))?.value ?? value });
const dismissed = StateField.define({ create: () => false, update: (value, transaction) => transaction.effects.some(effect => effect.is(closeSlash)) ? true : transaction.docChanged ? false : value });
function candidate(state: EditorState): SlashState | null {
  if (!state.selection.main.empty || state.readOnly || state.field(composing) || state.field(dismissed)) return null;
  const head = state.selection.main.head, line = state.doc.lineAt(head);
  const match = /^(\s*(?:(?:#{1,6}|>|[-+*]|\d+\.)\s+(?:\[[ xX]\]\s+)?)?)\/([\p{L}\d -]*)$/u.exec(state.sliceDoc(line.from, head));
  if (!match) return null;
  for (let node = syntaxTree(state).resolveInner(head, -1); node; node = node.parent!) if (/^(FencedCode|CodeBlock|InlineCode|Link|Autolink)$/.test(node.name)) return null;
  if (!filterCommands(match[2]).length) return null;
  return { from: line.from + match[1].length, to: head, query: match[2], index: 0 };
}
export const slashState = StateField.define<SlashState | null>({
  create: () => null,
  update: (value, transaction) => {
    if (transaction.effects.some(effect => effect.is(closeSlash) || effect.is(composition) && effect.value)) return null;
    const selected = transaction.effects.find(effect => effect.is(selectSlash));
    if (selected && value) return { ...value, index: selected.value };
    if (!transaction.docChanged && !transaction.selection) return value;
    const next = candidate(transaction.state); return next && value?.query === next.query && value.from === next.from ? { ...next, index: value.index } : next;
  }
});
export function slashExtension() {
  return [composing, dismissed, slashState, showTooltip.compute([slashState], state => {
    const value = state.field(slashState); if (!value) return null;
    return { pos: value.to, above: false, create: (view: EditorView) => {
      const dom = document.createElement('div'); dom.className = 'editor-menu slash-menu'; dom.setAttribute('role', 'listbox'); dom.setAttribute('aria-label', 'Insert block'); dom.id = 'slash-commands';
      const render = () => {
        const current = view.state.field(slashState); if (!current) return;
        dom.replaceChildren();
        const search = document.createElement('div'); search.className = 'slash-search'; search.textContent = current.query ? `/ ${current.query}` : 'Search commands…'; dom.append(search);
        const caption = document.createElement('div'); caption.className = 'menu-caption'; caption.textContent = 'BASIC'; dom.append(caption);
        filterCommands(current.query).forEach((command, index) => {
          const button = document.createElement('button'); button.type = 'button'; button.setAttribute('role', 'option'); button.setAttribute('aria-selected', String(index === current.index)); button.id = `slash-option-${index}`;
          const symbol = document.createElement('span'); symbol.className = 'command-symbol'; symbol.textContent = command.symbol;
          const label = document.createElement('span'); label.textContent = command.label; button.append(symbol, label);
          button.addEventListener('mousedown', event => event.preventDefault());
          button.addEventListener('click', () => { const current = view.state.field(slashState); if (current) { view.dispatch({ effects: closeSlash.of(undefined) }); insertCommand(view, command, current); } });
          dom.append(button);
        });
        dom.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
      };
      const outside = (event: PointerEvent) => { if (!dom.contains(event.target as Node)) view.dispatch({ effects: closeSlash.of(undefined) }); };
      render(); document.addEventListener('pointerdown', outside);
      return { dom, offset: { x: 0, y: 8 }, update: render, destroy: () => document.removeEventListener('pointerdown', outside) };
    } };
  }), EditorView.contentAttributes.compute([slashState], (state): Record<string, string> => {
    const current = state.field(slashState); return current ? { 'aria-expanded': 'true', 'aria-controls': 'slash-commands', 'aria-activedescendant': `slash-option-${current.index}` } : { 'aria-expanded': 'false' };
  }), Prec.highest(keymap.of([
    ...(['ArrowDown', 'ArrowUp'] as const).map(key => ({ key, run: (view: EditorView) => { const current = view.state.field(slashState); if (!current || view.composing) return false; const length = filterCommands(current.query).length; view.dispatch({ effects: selectSlash.of((current.index + (key === 'ArrowDown' ? 1 : -1) + length) % length) }); return true; } })),
    { key: 'Enter', run: view => { const current = view.state.field(slashState); if (!current || view.composing) return false; const command = filterCommands(current.query)[current.index]; view.dispatch({ effects: closeSlash.of(undefined) }); return insertCommand(view, command, current); } },
    { key: 'Escape', run: view => { if (!view.state.field(slashState)) return false; view.dispatch({ effects: closeSlash.of(undefined) }); return true; } }
  ])), EditorView.domEventHandlers({
    compositionstart: (_event, view) => { view.dispatch({ effects: composition.of(true) }); },
    compositionend: (_event, view) => { view.dispatch({ effects: composition.of(false) }); },
    blur: (_event, view) => { if (view.state.field(slashState)) view.dispatch({ effects: closeSlash.of(undefined) }); }
  })];
}
