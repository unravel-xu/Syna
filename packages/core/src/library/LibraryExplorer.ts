import { fail, ok } from '@syna/contracts';
import type { AppError, DeletePlan, LibraryCommand, LibraryService, LibrarySnapshot, LibraryTarget, NoteService, Result, ShellApplication } from '@syna/contracts';
import { applyLibraryCommand, emptyLibrary } from './library';
import type { NotesWorkspace } from '../workspace/NotesWorkspace';
import { uuidV7 } from '../notes/identity';
export interface ExplorerSnapshot { readonly data: LibrarySnapshot; readonly busy: boolean; readonly message: string; readonly error?: AppError; readonly focusTitleNoteId?: string }
/** Metadata coordination; document navigation and barriers remain owned by NotesWorkspace. */
export class LibraryExplorer {
  private snapshot: ExplorerSnapshot = { data: { ...emptyLibrary(), notes: [] }, busy: false, message: '' };
  private listeners = new Set<() => void>();
  private readEpoch = 0;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private service: LibraryService, private notes: NoteService, private workspace: NotesWorkspace, private application: ShellApplication, private setActiveTitle: (title: string) => void) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(patch: Partial<ExplorerSnapshot>) { this.snapshot = { ...this.snapshot, ...patch }; for (const listener of this.listeners) listener(); }
  report(error: AppError) { this.publish({ error, message: error.message }); }
  clearTitleFocus() { this.publish({ focusTitleNoteId: undefined }); }
  async refresh() { if (this.snapshot.busy) return ok(this.snapshot.data); const epoch = ++this.readEpoch; const result = await this.service.getLibrary(); if (epoch !== this.readEpoch || this.snapshot.busy) return result; if (result.ok) this.publish({ data: result.value }); else this.report(result.error); return result; }
  command(command: LibraryCommand, optimistic = false): Promise<Result<LibrarySnapshot>> {
    const operation = async () => {
      this.readEpoch++; this.publish({ busy: true, error: undefined });
      const previous = this.snapshot.data, input = { expectedRevision: previous.revision, command };
      if (optimistic) { const next = applyLibraryCommand(previous, input); if (!next.ok) { this.report(next.error); this.publish({ busy: false }); return next; } this.publish({ data: next.value }); }
      const result = await this.service.writeLibrary(input, { commandId: uuidV7() });
      if (result.ok) { this.publish({ data: result.value, message: command.type === 'visit' ? this.snapshot.message : 'Library updated.' }); await this.workspace.refresh(); }
      else { this.publish({ data: previous }); this.report(result.error); await this.refresh(); }
      this.publish({ busy: false }); await this.refresh(); return result;
    };
    const pending = this.queue.then(operation); this.queue = pending.catch(() => {}); return pending;
  }
  async createNote(folderId: string | null = null): Promise<Result<void>> {
    const result = await this.workspace.createNote(false, folderId);
    if (result.ok) { this.publish({ focusTitleNoteId: this.workspace.getSnapshot().active?.document.id, message: 'Note created. Give it a title.' }); await this.refresh(); }
    else this.report(result.error); return result;
  }
  async renameNote(id: string, title: string): Promise<Result<void>> {
    if (!title.trim() || title.length > 500) return fail('validation', 'Enter a title between 1 and 500 characters.');
    const active = this.workspace.getSnapshot().active;
    if (active?.document.id === id) { this.setActiveTitle(title.trim()); const saved = await active.session.flush(); if (!saved.ok) { this.report(saved.error); return saved; } }
    else {
      const note = await this.notes.getNote(id); if (!note.ok) return note;
      const saved = await this.notes.saveNote({ noteId: id, title: title.trim(), markdown: note.value.markdown, blocks: note.value.blocks, expectedRevision: note.value.revision, changeSeq: 1 }, { commandId: uuidV7() });
      if (!saved.ok) { this.report(saved.error); return saved; }
    }
    await this.workspace.refresh(); await this.refresh(); this.publish({ message: 'Note renamed.' }); return ok(undefined);
  }
  async previewTrash(target: LibraryTarget): Promise<Result<DeletePlan>> {
    const active = this.workspace.getSnapshot().active;
    if (active) { const saved = await active.session.flush(); if (!saved.ok) { this.report(saved.error); return saved; } }
    // Drain visit/ordering commands so the preview freezes the latest metadata revision.
    await this.queue;
    const result = await this.service.previewTrash(target); if (!result.ok) this.report(result.error); return result;
  }
  async executeTrash(plan: DeletePlan): Promise<Result<LibrarySnapshot>> {
    const active = this.workspace.getSnapshot().active;
    if (active && plan.items.some(item => item.kind === 'note' && item.id === active.document.id)) {
      const moved = await this.application.navigate({ page: 'library', section: 'notes' }); if (!moved.ok) return moved;
    }
    const location = this.application.getSnapshot().navigation.location;
    if (location.page === 'library' && location.folderId && plan.items.some(item => item.id === location.folderId)) { const moved = await this.application.navigate({ page: 'library', section: 'notes', ...(active && !plan.items.some(item => item.kind === 'note' && item.id === active.document.id) ? { noteId: active.document.id } : {}) }); if (!moved.ok) return moved; }
    return this.command({ type: 'trash', planId: plan.id, fingerprint: plan.fingerprint });
  }
  async settle() { await this.queue; }
  opened(id: string) { void this.command({ type: 'visit', noteId: id }); }
}
