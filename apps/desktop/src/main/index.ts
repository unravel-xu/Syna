import { app, BrowserWindow, Menu, net, protocol, ipcMain, shell, clipboard } from 'electron';
import { resolve, join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { StorageClient } from './storageClient';
import { registerNoteGateway } from './noteGateway';
import { uuidV7 } from '@syna/core';

const development = process.env.SYNA_DEV === '1';
const origin = 'syna://app';
protocol.registerSchemesAsPrivileged([{ scheme: 'syna', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
app.setName('Syna');
app.setPath('userData', resolve(process.env.SYNA_USER_DATA ?? join(app.getPath('appData'), 'Syna Shell Preview')));
let window: BrowserWindow | null = null;
let storage: StorageClient;
let allowClose = false;
let closeToken: string | null = null;
let quitting = false;

async function createWindow() {
  allowClose = false; closeToken = null;
  window = new BrowserWindow({ width: 1440, height: 900, minWidth: 720, minHeight: 540,
    backgroundColor: '#171a19', title: 'Syna', show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hidden' : 'default',
    trafficLightPosition: { x: 16, y: 17 },
    webPreferences: { preload: join(__dirname, '../preload/index.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true, spellcheck: false }
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    // Only explicit Markdown links may open a browser/mail client. Never spawn renderer windows.
    try { if (['https:', 'http:', 'mailto:'].includes(new URL(url).protocol)) void shell.openExternal(url); } catch { /* Invalid links stay inside the app. */ }
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => { const target = new URL(url); if (target.protocol !== 'syna:' || target.hostname !== 'app') event.preventDefault(); });
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  window.webContents.session.setPermissionCheckHandler(() => false);
  window.webContents.session.on('will-download', event => event.preventDefault());
  window.on('closed', () => { window = null; });
  window.on('close', event => {
    if (allowClose) return;
    event.preventDefault();
    if (!closeToken) { closeToken = uuidV7(); window?.webContents.send('syna:prepare-close', closeToken); setTimeout(() => { closeToken = null; }, 15_000).unref(); }
  });
  await window.loadURL(`${origin}/${process.env.SYNA_SCENE ? `?scene=${encodeURIComponent(process.env.SYNA_SCENE)}` : ''}`);
  window.show();
}

void app.whenReady().then(async () => {
  const workspace = resolve(process.env.SYNA_WORKSPACE ?? join(app.getPath('userData'), 'p2-development-workspace'));
  storage = new StorageClient(join(workspace, '.syna', 'state.sqlite'), process.env.SYNA_TEST_MODE === '1');
  registerNoteGateway(storage);
  ipcMain.handle('syna:copy-text', (event, text: unknown) => {
    const frame = event.senderFrame;
    if (event.sender !== window?.webContents || !frame || frame !== event.sender.mainFrame || !frame.url.startsWith(`${origin}/`) || typeof text !== 'string' || text.length > 2_000_000) return { ok: false, error: { code: 'validation', message: 'Clipboard request rejected.', retryable: false } };
    clipboard.writeText(text); return { ok: true, value: undefined };
  });
  ipcMain.on('syna:close-result', (event, reply) => {
    if (event.sender !== window?.webContents || !reply || reply.token !== closeToken) return;
    closeToken = null;
    if (reply.result?.ok === true) { allowClose = true; if (quitting) app.quit(); else window.close(); }
    else quitting = false;
  });
  protocol.handle('syna', request => {
    const url = new URL(request.url);
    if (url.hostname !== 'app' || request.method !== 'GET') return new Response('Forbidden', { status: 403 });
    if (development) return net.fetch(`http://127.0.0.1:5173${url.pathname}${url.search}`);
    const root = resolve(__dirname, '../renderer');
    let path: string;
    try { path = resolve(root, `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`); }
    catch { return new Response('Invalid path', { status: 400 }); }
    if (!path.startsWith(root + sep)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(path).href);
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
    { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' }
  ]));
  await createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) void createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { quitting = true; });
app.on('will-quit', () => { storage?.dispose(); });
