import { parentPort, workerData } from 'node:worker_threads';
import { SQLiteWorkspace } from '@syna/storage';
import { fail } from '@syna/contracts';
const workspace = new SQLiteWorkspace(workerData.path, workerData.testMode);
let queue = Promise.resolve();
const methods = ['list', 'read', 'insert', 'compareAndSwap', 'loadScene', 'saveScene', 'readRecovery', 'putRecovery', 'clearRecovery', 'getLibrary', 'writeLibrary', 'previewTrash'] as const;
parentPort!.on('message', (request: { id: number; method: typeof methods[number]; args: unknown[] }) => {
  queue = queue.then(async () => {
    try {
      if (!methods.includes(request.method)) throw new Error('Unknown storage method');
      const method = workspace[request.method] as (...args: unknown[]) => Promise<unknown>;
      parentPort!.postMessage({ id: request.id, result: await method.apply(workspace, request.args) });
    } catch { parentPort!.postMessage({ id: request.id, result: fail('storage-error', 'Storage operation failed. Keep your draft open.', true) }); }
  });
});
