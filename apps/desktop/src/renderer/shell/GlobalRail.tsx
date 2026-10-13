import { Inbox, Layers3, Library, Search, Settings2, Moon, Sun } from 'lucide-react';
import { useShell } from '../app/AppProvider';
import { pageLabels, pageLocations } from '../fixtures/demo';
import { Brand } from './primitives';
import { deriveLayout, supportsSidebar } from '@syna/core';
const items = [{ id: 'dashboard', icon: Brand }, { id: 'inbox', icon: Inbox }, { id: 'workspaces', icon: Layers3 }, { id: 'library', icon: Library }, { id: 'search', icon: Search }] as const;
export function GlobalRail({ onSettings }: { onSettings(): void }) {
  const { application, navigation, layout, resolvedTheme, notesWorkspace } = useShell();
  const effective = deriveLayout(navigation.location, layout);
  const nextTheme = resolvedTheme === 'dark' ? 'light' : 'dark';
  const ThemeIcon = resolvedTheme === 'dark' ? Sun : Moon;
  const themeLabel = `Switch to ${nextTheme} theme`;
  return <nav className="global-rail" aria-label="Global navigation">
    <div className="rail-links">{items.map(({ id, icon: Icon }) => <button key={id} aria-label={pageLabels[id]} aria-current={navigation.location.page === id ? 'page' : undefined} aria-controls={supportsSidebar(pageLocations[id]) ? 'context-sidebar' : undefined} aria-expanded={supportsSidebar(pageLocations[id]) ? navigation.location.page === id && effective.sidebarVisible : undefined} data-tooltip={pageLabels[id]} className={`rail-button tip ${navigation.location.page === id ? 'active' : ''}`} onClick={() => application.activatePage(id === 'library' && notesWorkspace ? { page: 'library', section: 'notes' } : pageLocations[id])}><Icon size={20} strokeWidth={1.65} aria-hidden="true" /></button>)}</div>
    <div className="rail-utilities">
      <button className="rail-button theme-toggle tip" data-tooltip={themeLabel} title={themeLabel} aria-label={themeLabel} onClick={() => application.setTheme(nextTheme)}><ThemeIcon size={20} strokeWidth={1.65} aria-hidden="true" /></button>
      <button className="rail-button rail-settings tip" data-tooltip="Settings" aria-label="Settings" onClick={onSettings}><Settings2 size={20} strokeWidth={1.65} aria-hidden="true" /></button>
    </div>
  </nav>;
}
