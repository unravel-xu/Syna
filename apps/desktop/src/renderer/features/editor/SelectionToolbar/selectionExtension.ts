import { EditorState, Prec, StateEffect, StateField } from '@codemirror/state';
import { EditorView, keymap, showTooltip } from '@codemirror/view';
import { slashState } from '../SlashCommands/slashExtension';
import { syntaxTree } from '@codemirror/language';
import { formatSelection } from './formatSelection';
import { slashCommands, insertCommand } from '../SlashCommands/registry';
import { copyText } from '../../../adapters/clipboard';
export const dismissSelection = StateEffect.define<void>();
const composingEffect = StateEffect.define<boolean>();
const composing = StateField.define({ create: () => false, update: (value, transaction) => transaction.effects.find(effect => effect.is(composingEffect))?.value ?? value });
const dismissed = StateField.define({ create: () => false, update: (value, transaction) => transaction.effects.some(effect => effect.is(dismissSelection)) ? true : transaction.selection || transaction.docChanged ? false : value });
export function selectionExtension() {
  return [composing, dismissed, showTooltip.compute([composing, dismissed, slashState, 'selection', EditorState.readOnly], state => {
    const { from, to } = state.selection.main;
    if (from === to || state.readOnly || state.field(composing) || state.field(dismissed) || state.field(slashState)) return null;
    for (const position of [from, to]) for (let node = syntaxTree(state).resolveInner(position, -1); node; node = node.parent!) if (/^(FencedCode|CodeBlock)$/.test(node.name)) return null;
    return { pos: from, end: to, above: true, create: (view: EditorView) => {
      const dom = document.createElement('div'); dom.className = 'editor-menu selection-toolbar'; dom.setAttribute('role', 'toolbar'); dom.setAttribute('aria-label', 'Selection formatting');
      const row = document.createElement('div'); row.className = 'selection-actions'; dom.append(row);
      let panel: HTMLElement | null = null;
      const clearPanel = () => { panel?.remove(); panel = null; };
      const dismiss = () => { view.dispatch({ effects: dismissSelection.of(undefined) }); view.focus(); };
      dom.addEventListener('mousedown', event => { if (!(event.target instanceof HTMLInputElement)) event.preventDefault(); });
      dom.addEventListener('focusout', event => {
        if (event.relatedTarget instanceof Node && !dom.contains(event.relatedTarget) && event.relatedTarget !== view.contentDOM) queueMicrotask(() => {
          if (view.dom.isConnected && !dom.contains(document.activeElement) && document.activeElement !== view.contentDOM) view.dispatch({ effects: dismissSelection.of(undefined) });
        });
      });
      dom.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (panel) { clearPanel(); row.querySelector('button')?.focus(); } else dismiss(); } });
      const button = (label: string, text: string, action: () => void, target: HTMLElement = row) => {
        const element = document.createElement('button'); element.type = 'button'; element.title = label; element.setAttribute('aria-label', label); element.textContent = text; element.addEventListener('click', action); target.append(element); return element;
      };
      const openPanel = () => { clearPanel(); panel = document.createElement('div'); panel.className = 'selection-submenu'; dom.append(panel); return panel; };
      button('Text style', 'Text ▾', () => {
        const menu = openPanel(); menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', 'Text style');
        for (const command of slashCommands.slice(0, 8)) button(command.label, command.label, () => { insertCommand(view, command); clearPanel(); }, menu).setAttribute('role', 'menuitem');
      });
      button('Bold', 'B', () => { clearPanel(); formatSelection(view, 'bold'); }).className = 'format-bold';
      button('Italic', 'I', () => { clearPanel(); formatSelection(view, 'italic'); }).className = 'format-italic';
      button('Link', '↗', () => {
        const menu = openPanel(); menu.classList.add('link-editor');
        const input = document.createElement('input'); input.type = 'url'; input.placeholder = 'https://…'; input.setAttribute('aria-label', 'Link address'); menu.append(input);
        const apply = () => {
          if (!/^(https?:\/\/|mailto:|syna:\/\/note\/|#)/i.test(input.value) || /[\s<>]/.test(input.value)) { input.setAttribute('aria-invalid', 'true'); input.title = 'Enter a valid web, email or note link.'; return; }
          formatSelection(view, 'link', input.value); clearPanel();
        };
        button('Apply link', 'Add link', apply, menu); input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); apply(); } }); input.focus();
      });
      button('More formatting', '···', () => {
        const menu = openPanel(); menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', 'More formatting');
        button('Inline code', 'Inline code', () => { formatSelection(view, 'code'); clearPanel(); }, menu);
        button('Strikethrough', 'Strikethrough', () => { formatSelection(view, 'strike'); clearPanel(); }, menu);
        button('Copy selected Markdown', 'Copy Markdown', () => { void copyText(view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)).then(result => { if (result.ok) { clearPanel(); dismiss(); } else { menu.textContent = result.error.message; } }); }, menu);
      });
      const outside = (event: PointerEvent) => { if (!dom.contains(event.target as Node) && !view.contentDOM.contains(event.target as Node)) view.dispatch({ effects: dismissSelection.of(undefined) }); };
      document.addEventListener('pointerdown', outside);
      return { dom, offset: { x: 0, y: 8 }, destroy: () => document.removeEventListener('pointerdown', outside) };
    } };
  }), Prec.highest(keymap.of([
    { key: 'Mod-Shift-Space', run: view => { const toolbar = view.dom.querySelector<HTMLButtonElement>('.selection-toolbar button'); if (!toolbar) return false; toolbar.focus(); return true; } },
    { key: 'Escape', run: view => { if (!view.dom.querySelector('.selection-toolbar')) return false; view.dispatch({ effects: dismissSelection.of(undefined) }); return true; } }
  ])), EditorView.domEventHandlers({
    compositionstart: (_event, view) => { view.dispatch({ effects: composingEffect.of(true) }); },
    compositionend: (_event, view) => { view.dispatch({ effects: composingEffect.of(false) }); },
    blur: (event, view) => { if (event.relatedTarget instanceof Node && view.dom.querySelector('.selection-toolbar')?.contains(event.relatedTarget)) return; view.dispatch({ effects: dismissSelection.of(undefined) }); }
  })];
}
