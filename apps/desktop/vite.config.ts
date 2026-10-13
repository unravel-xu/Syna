import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
export default defineConfig(({ command }) => ({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  plugins: [react(), { name: 'shell-csp', transformIndexHtml: () => [{
    tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content:
      `default-src 'self'; script-src 'self'${command === 'serve' ? " 'nonce-syna-dev'" : ''}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'${command === 'serve' ? ' ws://127.0.0.1:5173 http://127.0.0.1:5173' : ''}; object-src 'none'; base-uri 'self'; form-action 'none'`
    }, injectTo: 'head-prepend'
  }] }],
  html: command === 'serve' ? { cspNonce: 'syna-dev' } : undefined,
  server: { port: 5173, strictPort: true, hmr: { host: '127.0.0.1', port: 5173, protocol: 'ws' } },
  build: { outDir: 'dist/renderer', emptyOutDir: true }
}));
