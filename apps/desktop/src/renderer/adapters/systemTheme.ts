import type { Theme } from '@syna/contracts';

const media = window.matchMedia('(prefers-color-scheme: dark)');
export function readSystemTheme(): Theme { return media.matches ? 'dark' : 'light'; }
export function subscribeSystemTheme(listener: () => void) {
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}
