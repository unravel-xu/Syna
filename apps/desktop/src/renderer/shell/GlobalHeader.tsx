import { ChevronLeft, ChevronRight, Search, Plus, PanelLeft, PanelRight, Maximize2, Minimize2 } from 'lucide-react';
import { deriveLayout, supportsSidebar } from '@syna/core';
import { useShell } from '../app/AppProvider';
import { librarySections, notes, pageLabels, projects } from '../fixtures/demo';
import { IconButton } from './primitives';
export type TemporaryPanel = 'search' | 'create' | 'settings' | null;
export function GlobalHeader({ onOpen }: { onOpen(panel: TemporaryPanel): void }) {
  const { application, environment, navigation, layout } = useShell();
  const { location } = navigation;
  const effective = deriveLayout(location, layout);
  const detail = location.page === 'workspaces' ? projects.find(p => p.id === location.projectId)?.name : location.page === 'library' ? librarySections.find(s => s.id === location.section)?.name : undefined;
  const note = location.page === 'library' ? notes.find(n => n.id === location.noteId) : undefined;
  const focusLabel = layout.focus ? 'Exit focus mode' : 'Enter focus mode';
  const focusShortcut = environment.platform === 'darwin' ? '⌘⇧F' : 'Ctrl+Shift+F';
  return <header className={`global-header ${environment.platform === 'darwin' ? 'mac' : ''}`}>
    <div className="traffic-safe" aria-hidden="true">{environment.mode === 'browser' && <span className="preview-window-dots"><i /><i /><i /></span>}</div>
    <div className="header-leading">
      <IconButton label="Go back" disabled={navigation.index === 0} onClick={() => application.back()}><ChevronLeft size={17} /></IconButton>
      <IconButton label="Go forward" disabled={navigation.index === navigation.history.length - 1} onClick={() => application.forward()}><ChevronRight size={17} /></IconButton>
      {supportsSidebar(location) && <IconButton label="Toggle context sidebar" disabled={!!layout.focus} aria-controls="context-sidebar" aria-pressed={effective.sidebarVisible} title={effective.temporarilyCollapsed ? 'Open context sidebar temporarily' : 'Toggle context sidebar'} onClick={() => application.toggleSidebar()}><PanelLeft size={17} /></IconButton>}
      <div className="breadcrumbs"><span>{pageLabels[location.page]}</span>{detail && <><ChevronRight size={12} /><span>{detail}</span></>}{note && <><ChevronRight size={12} /><span className="breadcrumb-note">{note.title}</span></>}</div>
    </div>
    <button className="global-search" aria-label="Open global search" onClick={() => onOpen('search')}><Search size={14} /><span>Search anything</span><kbd>{environment.platform === 'darwin' ? '⌘' : 'Ctrl'} K</kbd></button>
    <div className="header-actions">
      {location.page !== 'library' && <><button className="context-create" aria-label="Create · Development preview" title="Development preview · Creation is not connected" onClick={() => onOpen('create')}><Plus size={16} /><span>{location.page === 'workspaces' ? 'New project' : location.page === 'inbox' ? 'Capture' : 'Create'}</span></button><span className="header-divider" /></>}
      <IconButton label={focusLabel} title={`${focusLabel} · ${focusShortcut}${layout.focus ? ' / Esc' : ''}`} aria-keyshortcuts="Meta+Shift+F Control+Shift+F" aria-pressed={!!layout.focus} onClick={() => application.setFocus(layout.focus ? null : 'main')}>{layout.focus ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</IconButton>
      <IconButton label="Toggle Assistant Demo" disabled={!!layout.focus} aria-pressed={layout.preferences.auxiliaryVisible} onClick={() => application.setAuxiliary(!layout.preferences.auxiliaryVisible)}><PanelRight size={17} /></IconButton>
    </div>
  </header>;
}
