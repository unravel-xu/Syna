import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import electron from 'electron';
import { buildElectron } from './build-electron.mjs';
await buildElectron();
const server = await createServer({ configFile: 'apps/desktop/vite.config.ts', server: { host: '127.0.0.1' } });
await server.listen();
server.printUrls();
const env = { ...process.env, SYNA_DEV: '1', SYNA_USER_DATA: resolve('.artifacts/runtime/dev'), SYNA_WORKSPACE: resolve('.artifacts/workspaces/p2-dev') };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, ['apps/desktop'], { stdio: 'inherit', env });
let closing = false;
async function close() { if (closing) return; closing = true; child.kill(); await server.close(); }
process.on('SIGINT', close); process.on('SIGTERM', close);
child.on('exit', async code => { await close(); process.exitCode = code ?? 0; });
