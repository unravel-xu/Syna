import type { ShellEnvironment, NoteBridge, LibraryService, Result } from '@syna/contracts';
declare global { interface Window { synaShell?: { protocolVersion: number; mode: 'electron'; platform: string; notes: NoteBridge; library: LibraryService; copyText(text: string): Promise<Result<void>> } } }
export function getEnvironment(): ShellEnvironment {
  const bridge = window.synaShell;
  if (bridge?.protocolVersion === 2 && bridge.mode === 'electron') return { mode: bridge.mode, platform: bridge.platform };
  return { mode: 'browser', platform: navigator.platform.toLowerCase().includes('mac') ? 'darwin' : 'browser' };
}
