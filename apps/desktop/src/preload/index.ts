import { contextBridge, ipcRenderer } from 'electron';
import { uuidV7 } from '../../../../packages/core/src/notes/identity';
import type { NoteBridge, LibraryService, Result } from '@syna/contracts';
const call = (method: string, ...args: unknown[]) => ipcRenderer.invoke('syna:notes', { protocolVersion: 2, requestId: uuidV7(), method, args });
const notes: NoteBridge = {
  listNotes: () => call('listNotes'), getNote: id => call('getNote', id), createNote: (input, meta) => call('createNote', input, meta), saveNote: (input, meta) => call('saveNote', input, meta),
  loadScene: () => call('loadScene'), saveScene: scene => call('saveScene', scene), readRecovery: id => call('readRecovery', id), putRecovery: draft => call('putRecovery', draft), clearRecovery: (id, session, seq) => call('clearRecovery', id, session, seq),
  onPrepareClose(listener) {
    const handler = async (_event: unknown, token: string) => { let result: Result<void>; try { result = await listener(); } catch { result = { ok: false, error: { code: 'storage-error', message: 'Saving failed.', retryable: true } }; } ipcRenderer.send('syna:close-result', { token, result }); };
    ipcRenderer.on('syna:prepare-close', handler); return () => { ipcRenderer.removeListener('syna:prepare-close', handler); };
  }
};
const libraryCall = (method: string, ...args: unknown[]) => ipcRenderer.invoke('syna:library', { protocolVersion: 1, requestId: uuidV7(), method, args });
const library: LibraryService = { getLibrary: () => libraryCall('getLibrary'), writeLibrary: (input, meta) => libraryCall('writeLibrary', input, meta), previewTrash: target => libraryCall('previewTrash', target) };
contextBridge.exposeInMainWorld('synaShell', Object.freeze({ protocolVersion: 2, mode: 'electron', platform: process.platform, notes: Object.freeze(notes), library: Object.freeze(library), copyText: (text: string) => ipcRenderer.invoke('syna:copy-text', text) }));
