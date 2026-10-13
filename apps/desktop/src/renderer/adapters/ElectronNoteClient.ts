import type { NoteBridge, LibraryService, Result } from '@syna/contracts';
import { fail } from '@syna/contracts';
export function electronNoteClient(): NoteBridge {
  const bridge = window.synaShell;
  if (bridge?.protocolVersion !== 2 || !bridge.notes) throw new Error('The notes bridge is unavailable.');
  const notes = bridge.notes;
  async function call<T>(operation: () => Promise<Result<T>>): Promise<Result<T>> { try { return await operation(); } catch { return fail('unavailable', 'The storage connection was interrupted. Your draft is retained; retry the operation.', true); } }
  return {
    listNotes: () => call(() => notes.listNotes()), getNote: id => call(() => notes.getNote(id)), createNote: (input, meta) => call(() => notes.createNote(input, meta)), saveNote: (input, meta) => call(() => notes.saveNote(input, meta)),
    loadScene: () => call(() => notes.loadScene()), saveScene: scene => call(() => notes.saveScene(scene)), readRecovery: id => call(() => notes.readRecovery(id)), putRecovery: draft => call(() => notes.putRecovery(draft)), clearRecovery: (id, session, seq) => call(() => notes.clearRecovery(id, session, seq)),
    onPrepareClose: listener => notes.onPrepareClose(listener)
  };
}

export function electronLibraryClient(): LibraryService {
  const library = window.synaShell?.library;
  if (!library) throw new Error('The Library bridge is unavailable.');
  async function call<T>(operation: () => Promise<Result<T>>): Promise<Result<T>> { try { return await operation(); } catch { return fail('unavailable', 'Library connection was interrupted. Refresh and try again.', true); } }
  return { getLibrary: () => call(() => library.getLibrary()), writeLibrary: (input, meta) => call(() => library.writeLibrary(input, meta)), previewTrash: target => call(() => library.previewTrash(target)) };
}
