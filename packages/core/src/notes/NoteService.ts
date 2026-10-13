import { createSchema, saveSchema, metaSchema, fail } from '@syna/contracts';
import type { NoteService, NoteDocument, NoteSummary, CreateNoteInput, SaveNoteInput, WriteMeta, SaveReceipt, Result } from '@syna/contracts';
export interface NoteRepositoryPort {
  list(): Promise<Result<readonly NoteSummary[]>>;
  read(id: string): Promise<Result<NoteDocument>>;
  insert(input: CreateNoteInput, meta: WriteMeta): Promise<Result<NoteDocument>>;
  compareAndSwap(input: SaveNoteInput, meta: WriteMeta): Promise<Result<SaveReceipt>>;
}
export function createNoteService(repository: NoteRepositoryPort): NoteService {
  async function safe<T>(operation: () => Promise<Result<T>>): Promise<Result<T>> {
    try { return await operation(); } catch { return fail('storage-error', 'Storage is unavailable. Your draft has been retained.', true); }
  }
  return {
    listNotes: () => safe(() => repository.list()), getNote: id => safe(() => repository.read(id)),
    createNote: (input, meta) => { const parsed = createSchema.safeParse(input), write = metaSchema.safeParse(meta); return !parsed.success || !write.success ? Promise.resolve(fail('validation', 'Invalid note.')) : safe(() => repository.insert(parsed.data, write.data)); },
    saveNote: (input, meta) => {
      const parsed = saveSchema.safeParse(input), write = metaSchema.safeParse(meta);
      if (!parsed.success || !write.success) return Promise.resolve(fail('validation', 'Invalid save request.'));
      const ids = new Set(input.blocks.map(block => block.id));
      if (ids.size !== input.blocks.length || input.blocks.some(block => block.from > block.to || block.to > input.markdown.length)) return Promise.resolve(fail('validation', 'Invalid document or block coordinates.'));
      return safe(() => repository.compareAndSwap(parsed.data, write.data));
    }
  };
}
