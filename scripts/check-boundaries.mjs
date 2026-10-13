import { readdir, readFile } from 'node:fs/promises';
async function files(root) { return (await Promise.all((await readdir(root, { withFileTypes: true })).map(entry => entry.isDirectory() ? files(`${root}/${entry.name}`) : `${root}/${entry.name}`))).flat(); }
const violations = [];
for (const file of await files('apps/desktop/src/renderer')) {
  if (!/\.[tj]sx?$/.test(file)) continue;
  const source = await readFile(file, 'utf8');
  if (/(?:from\s*|import\s*\()['"](?:node:|electron|better-sqlite3|sqlite|fs|path|child_process|@syna\/storage)/.test(source)) violations.push(`${file}: renderer imports infrastructure`);
  if (!file.includes('/adapters/') && /window\s*\.\s*synaShell/.test(source)) violations.push(`${file}: bridge access outside adapter`);
  if (/(?:from\s*|import\s*\()['"][^'"]*(?:\/main\/|\/preload\/)/.test(source)) violations.push(`${file}: imports a privileged process`);
}
for (const file of [...await files('packages/core/src'), ...await files('packages/contracts/src')]) {
  const source = await readFile(file, 'utf8');
  if (/(?:from\s*|import\s*\()['"](?:react|electron|node:|@codemirror\/|@syna\/desktop|@syna\/storage)/.test(source) || /(?<![\w.])(?:window|document|localStorage)\s*\./.test(source)) violations.push(`${file}: core/contracts depend on runtime or UI`);
}
if (violations.length) { console.error(violations.join('\n')); process.exitCode = 1; }
else console.log('Dependency boundaries passed (renderer, bridge, core, contracts).');
