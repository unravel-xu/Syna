import type { LayoutPreferences, PreferencesPort } from '@syna/contracts';
import { clampWidth } from '@syna/core';
const KEY = 'syna.shell.preferences.v1';
export function browserPreferences(storage: Storage): PreferencesPort {
  return {
    load() {
      try {
        const value = JSON.parse(storage.getItem(KEY) ?? 'null');
        if (!value || value.version !== 1 || !value.preferences) return;
        const p = value.preferences;
        if (!['light', 'dark', 'system'].includes(p.theme) || typeof p.auxiliaryVisible !== 'boolean' || typeof p.sidebarByContext !== 'object' || p.sidebarByContext === null || Array.isArray(p.sidebarByContext)) return;
        return { theme: p.theme, auxiliaryVisible: p.auxiliaryVisible,
          sidebarWidth: clampWidth('sidebar', p.sidebarWidth), auxiliaryWidth: clampWidth('auxiliary', p.auxiliaryWidth),
          sidebarByContext: Object.fromEntries(Object.entries(p.sidebarByContext).filter(([key, value]) => ['dashboard', 'inbox', 'workspaces', 'search', 'library:notes', 'library:references'].includes(key) && typeof value === 'boolean'))
        } as LayoutPreferences;
      } catch { return; }
    },
    save(preferences) {
      try { storage.setItem(KEY, JSON.stringify({ version: 1, preferences })); }
      catch { console.warn('Shell preferences are temporary: browser storage is unavailable.'); }
    }
  };
}
