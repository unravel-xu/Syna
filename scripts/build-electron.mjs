import { build } from 'esbuild';
export async function buildElectron() {
  await build({ entryPoints: { 'main/index': 'apps/desktop/src/main/index.ts', 'preload/index': 'apps/desktop/src/preload/index.ts', 'workers/storage': 'apps/desktop/src/workers/storage.ts' },
    outdir: 'apps/desktop/dist', outExtension: { '.js': '.cjs' }, bundle: true, platform: 'node', target: 'node24', format: 'cjs', external: ['electron'], sourcemap: true });
}
if (process.argv[1]?.endsWith('build-electron.mjs')) await buildElectron();
