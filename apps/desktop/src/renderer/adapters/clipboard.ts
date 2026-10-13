import { fail, ok } from '@syna/contracts';
import type { Result } from '@syna/contracts';
export async function copyText(text: string): Promise<Result<void>> {
  try { if (window.synaShell) return await window.synaShell.copyText(text); await navigator.clipboard.writeText(text); return ok(undefined); }
  catch { return fail('unavailable', 'Clipboard access failed. Your document has not changed.', true); }
}
