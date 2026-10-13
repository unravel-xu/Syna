import { EditorState, EditorSelection, StateField, StateEffect, Compartment } from '@codemirror/state';
import { EditorView, keymap, drawSelection, lineNumbers, highlightActiveLine, gutter, gutters } from '@codemirror/view';
import type { ViewUpdate } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab, invertedEffects } from '@codemirror/commands';
import { markdown, markdownKeymap } from '@codemirror/lang-markdown';
import { bracketMatching, syntaxHighlighting, HighlightStyle, foldGutter, foldKeymap, syntaxTree } from '@codemirror/language';
import { searchKeymap } from '@codemirror/search';
import { tags } from '@lezer/highlight';
import { reconcileBlocks } from '@syna/core';
import { ok, fail } from '@syna/contracts';
import type { BlockIdentity, DocumentBufferPort, DocumentBufferSnapshot, EditorScene, EditorViewMode, DocumentWidth, NoteDocument, RecoveryDraft, Result } from '@syna/contracts';
import { livePreview } from './LivePreview/livePreview';
import { slashExtension, closeSlash } from './SlashCommands/slashExtension';
import { selectionExtension } from './SelectionToolbar/selectionExtension';

const colors = HighlightStyle.define([
  { tag: tags.heading, color: 'var(--accent)', fontWeight: '600' }, { tag: tags.strong, fontWeight: '600' }, { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: [tags.link, tags.url], color: 'var(--accent)' }, { tag: [tags.monospace, tags.string], color: 'var(--editor-code)' },
  { tag: [tags.processingInstruction, tags.meta], color: 'var(--text-muted)' }, { tag: tags.quote, color: 'var(--text-secondary)' }
]);
export class CodeMirrorBufferAdapter implements DocumentBufferPort {
  private state: EditorState;
  private blockField: StateField<readonly BlockIdentity[]>;
  private snapshot: DocumentBufferSnapshot;
  private view: EditorView | null = null;
  private scene: EditorScene = { anchor: 0, head: 0, scrollTop: 0, scrollLeft: 0 };
  private listeners = new Set<() => void>();
  private sceneListener: (() => void) | null = null;
  private sceneTimer?: ReturnType<typeof setTimeout>;
  private composition = false;
  private restoringScene = false;
  private presentation = new Compartment();
  private ui = { mode: 'live' as EditorViewMode, pageWidth: 'centered' as DocumentWidth };
  private uiListeners = new Set<() => void>();
  private viewListeners = new Set<(update: ViewUpdate) => void>();
  private pendingReveal?: number;
  private readingViewport: HTMLElement | null = null;
  constructor(note: NoteDocument, draft?: RecoveryDraft) {
    const document = draft ?? note;
    this.snapshot = { title: document.title, markdown: document.markdown, blocks: document.blocks, changeSeq: draft ? 1 : 0 };
    const restoreBlocks = StateEffect.define<readonly BlockIdentity[]>();
    this.blockField = StateField.define({ create: () => document.blocks, update: (blocks, transaction) => {
      for (const effect of transaction.effects) if (effect.is(restoreBlocks)) return effect.value;
      if (!transaction.docChanged) return blocks;
      const edits: Array<{ from: number; to: number; insert: string }> = [];
      transaction.changes.iterChanges((from, to, _fromB, _toB, insert) => edits.push({ from, to, insert: insert.toString() }));
      return reconcileBlocks(transaction.state.doc.toString(), blocks, edits);
    } });
    this.state = EditorState.create({ doc: document.markdown, extensions: [this.blockField, invertedEffects.of(transaction => transaction.docChanged ? [restoreBlocks.of(transaction.startState.field(this.blockField))] : []), history(), markdown(), bracketMatching(), drawSelection(), gutters({ fixed: false }), this.presentation.of(this.modeExtensions('live')), slashExtension(), selectionExtension(), syntaxHighlighting(colors), EditorView.lineWrapping,
      keymap.of([...markdownKeymap, ...defaultKeymap, ...historyKeymap, ...searchKeymap, ...foldKeymap, indentWithTab]),
      EditorView.contentAttributes.of({ role: 'textbox', 'aria-label': 'Markdown editor', 'aria-multiline': 'true', spellcheck: 'false' }),
      EditorView.updateListener.of(update => this.updated(update)),
      EditorView.domEventHandlers({ compositionstart: () => { this.composition = true; }, compositionend: () => { this.composition = false; }, scroll: () => this.sceneChanged() })
    ] });
  }
  getSnapshot = () => this.snapshot;
  getPresentation = () => this.ui;
  subscribePresentation = (listener: () => void) => { this.uiListeners.add(listener); return () => { this.uiListeners.delete(listener); }; };
  private modeExtensions(mode: EditorViewMode) { return [EditorView.editable.of(mode !== 'reading'), EditorState.readOnly.of(mode === 'reading'), ...(mode === 'live' ? [gutter({ class: 'cm-document-rail' }), ...livePreview(this.view?.hasFocus ?? false)] : mode === 'source' ? [lineNumbers(), foldGutter(), highlightActiveLine()] : [])]; }
  setPageWidth(pageWidth: DocumentWidth) {
    if (this.ui.pageWidth === pageWidth) return;
    this.scene = { ...this.captureScene(), pageWidth };
    this.ui = { ...this.ui, pageWidth };
    for (const listener of this.uiListeners) listener();
    this.sceneChanged();
  }
  requestMeasure() { this.view?.requestMeasure(); }
  subscribeView = (listener: (update: ViewUpdate) => void) => { this.viewListeners.add(listener); return () => { this.viewListeners.delete(listener); }; };
  setViewMode(mode: EditorViewMode) {
    if (mode === this.ui.mode) return true;
    if (this.isComposing()) return false;
    const scene = this.captureScene();
    this.ui = { ...this.ui, mode }; this.scene = { ...scene, viewMode: mode };
    const transaction = { effects: [closeSlash.of(undefined), this.presentation.reconfigure(this.modeExtensions(mode))] };
    if (this.view) this.view.dispatch(transaction); else this.state = this.state.update(transaction).state;
    for (const listener of this.uiListeners) listener();
    this.sceneChanged();
    if (mode !== 'reading' && this.view) { this.restoreScene(this.scene); this.focusEditor(this.view); }
    return true;
  }
  getReadingScroll() { return this.scene.readingScrollTop ?? 0; }
  attachReadingViewport(element: HTMLElement) { this.readingViewport = element; return () => { if (this.readingViewport === element) this.readingViewport = null; }; }
  setReadingScroll(top: number) { this.scene = { ...this.scene, readingScrollTop: top }; this.sceneChanged(); }
  getView() { return this.view; }
  private focusEditor(view: EditorView) {
    if (view.dom.getClientRects().length) view.focus();
    else requestAnimationFrame(() => { if (this.view === view && this.ui.mode !== 'reading' && view.dom.getClientRects().length) view.focus(); });
  }
  getOutline() {
    const headings: Array<{ from: number; level: number; text: string }> = [];
    syntaxTree(this.state).iterate({ enter: node => { if (/^ATXHeading[1-6]$/.test(node.name)) headings.push({ from: node.from, level: Number(node.name.at(-1)), text: this.state.sliceDoc(node.from, node.to).replace(/^#+\s*/, '').replace(/\s+#+$/, '') }); } });
    return headings;
  }
  reveal(from: number) {
    if (this.ui.mode === 'reading') this.setViewMode('live');
    const position = Math.min(from, this.state.doc.length), view = this.view;
    if (view) { view.dispatch({ selection: { anchor: position }, scrollIntoView: true }); this.focusEditor(view); }
    else { this.pendingReveal = position; this.scene = { ...this.scene, anchor: position, head: position }; this.state = this.state.update({ selection: { anchor: position } }).state; }
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish() { for (const listener of this.listeners) listener(); }
  private updated(update: ViewUpdate) {
    this.state = update.state;
    if (update.docChanged) {
      const markdown = update.state.doc.toString();
      this.snapshot = { ...this.snapshot, markdown, changeSeq: this.snapshot.changeSeq + 1, blocks: update.state.field(this.blockField) };
      this.publish();
    }
    if (update.selectionSet || update.docChanged) this.sceneChanged();
    for (const listener of this.viewListeners) listener(update);
  }
  private sceneChanged() { if (this.restoringScene && this.ui.mode !== 'reading') return; clearTimeout(this.sceneTimer); this.sceneTimer = setTimeout(() => this.sceneListener?.(), 200); }
  setTitle(title: string) { if (title === this.snapshot.title) return; this.snapshot = { ...this.snapshot, title, changeSeq: this.snapshot.changeSeq + 1 }; this.publish(); }
  setComposition(active: boolean) { this.composition = active; }
  isComposing() { return this.composition || !!this.view?.composing; }
  async finishPendingInput(): Promise<Result<void>> {
    if (this.view?.composing) this.view.contentDOM.blur();
    const deadline = Date.now() + 2500;
    while (this.isComposing() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
    return this.isComposing() ? fail('busy', 'Finish the current input composition before switching notes.', true) : ok(undefined);
  }
  acknowledgeSave() { /* Confirmation never replaces EditorState, text, selection, or undo history. */ }
  attach(host: HTMLElement, onScene: () => void) {
    this.sceneListener = onScene;
    this.view = new EditorView({ state: this.state, parent: host });
    this.restoreScene(this.scene);
    this.view.focus();
    return () => { if (!this.restoringScene) this.scene = this.captureScene(); this.state = this.view?.state ?? this.state; this.view?.destroy(); this.view = null; this.sceneListener = null; clearTimeout(this.sceneTimer); };
  }
  captureScene(): EditorScene {
    if (this.ui.mode === 'reading') return { ...this.scene, viewMode: 'reading', pageWidth: this.ui.pageWidth, readingScrollTop: this.readingViewport?.scrollTop ?? this.scene.readingScrollTop ?? 0 };
    if (!this.view || this.restoringScene) return this.scene;
    const selection = this.view.state.selection.main;
    return { ...this.scene, anchor: selection.anchor, head: selection.head, scrollTop: this.view.scrollDOM.scrollTop, scrollLeft: this.view.scrollDOM.scrollLeft, viewMode: this.ui.mode, pageWidth: this.ui.pageWidth };
  }
  restoreScene(scene: EditorScene) {
    this.scene = scene;
    const mode = scene.viewMode ?? 'live';
    const modeChanged = this.ui.mode !== mode, pageWidth = scene.pageWidth ?? 'centered';
    if (modeChanged || this.ui.pageWidth !== pageWidth) {
      this.ui = { mode, pageWidth };
      if (modeChanged) {
      const transaction = { effects: this.presentation.reconfigure(this.modeExtensions(mode)) };
      if (this.view) this.view.dispatch(transaction); else this.state = this.state.update(transaction).state;
      }
      for (const listener of this.uiListeners) listener();
    }
    const view = this.view; if (!view) return;
    this.restoringScene = true;
    view.dispatch({ selection: EditorSelection.single(Math.min(scene.anchor, view.state.doc.length), Math.min(scene.head, view.state.doc.length)) });
    view.requestMeasure({ read: () => scene, write: value => {
      if (this.view !== view) return;
      view.scrollDOM.scrollTop = value.scrollTop; view.scrollDOM.scrollLeft = value.scrollLeft; this.restoringScene = false;
      if (this.pendingReveal !== undefined) requestAnimationFrame(() => { if (this.view !== view || this.pendingReveal === undefined) return; const anchor = this.pendingReveal; this.pendingReveal = undefined; view.dispatch({ selection: { anchor }, scrollIntoView: true }); view.focus(); });
    } });
  }
  dispose() { clearTimeout(this.sceneTimer); this.view?.destroy(); this.view = null; this.readingViewport = null; this.listeners.clear(); this.uiListeners.clear(); this.viewListeners.clear(); this.sceneListener = null; }
}
