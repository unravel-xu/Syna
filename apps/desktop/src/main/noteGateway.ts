import { ipcMain } from 'electron';
import { createNoteService, createLibraryService } from '@syna/core';
import { fail, noteRequestSchema, noteRequestSchemas, libraryRequestSchema, libraryRequestSchemas } from '@syna/contracts';
import { StorageClient } from './storageClient';
export function registerNoteGateway(storage: StorageClient) {
  const service = createNoteService(storage);
  const methods = { ...service, loadScene: storage.loadScene, saveScene: storage.saveScene, readRecovery: storage.readRecovery, putRecovery: storage.putRecovery, clearRecovery: storage.clearRecovery };
  const library = createLibraryService(storage);
  ipcMain.handle('syna:library', async (event, packet: unknown) => {
    const frame = event.senderFrame;
    if (!frame || frame !== event.sender.mainFrame || !frame.url.startsWith('syna://app/')) return fail('unavailable', 'Untrusted application origin.');
    const envelope = libraryRequestSchema.safeParse(packet); if (!envelope.success) return fail('validation', 'Invalid Library envelope.');
    const { method, args } = envelope.data;
    const parsed = libraryRequestSchemas[method].safeParse(args); if (!parsed.success) return fail('validation', 'Invalid Library arguments.');
    return (library[method] as (...args: unknown[]) => Promise<unknown>)(...parsed.data);
  });
  ipcMain.handle('syna:notes', async (event, packet: unknown) => {
    const frame = event.senderFrame;
    if (!frame || frame !== event.sender.mainFrame || !frame.url.startsWith('syna://app/')) return fail('unavailable', 'Untrusted application origin.');
    const envelope = noteRequestSchema.safeParse(packet); if (!envelope.success) return fail('validation', 'Invalid request envelope.');
    const { method, args } = envelope.data;
    const validated = noteRequestSchemas[method].safeParse(args); if (!validated.success) return fail('validation', 'Invalid request arguments.');
    try { return await (methods[method] as (...args: unknown[]) => Promise<unknown>)(...validated.data); }
    catch { return fail('storage-error', 'The operation could not finish. Your draft was retained.', true); }
  });
}
