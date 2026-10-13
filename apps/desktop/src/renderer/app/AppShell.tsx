import { useCallback, useEffect, useRef, useState } from 'react';
import { deriveLayout } from '@syna/core';
import { useShell } from './AppProvider';
import { GlobalHeader } from '../shell/GlobalHeader';
import type { TemporaryPanel } from '../shell/GlobalHeader';
import { GlobalRail } from '../shell/GlobalRail';
import { ContextSidebar } from '../shell/ContextSidebar';
import { AuxiliaryPanel } from '../shell/AuxiliaryPanel';
import { TemporaryDialog } from '../shell/Dialog';
import { Dashboard } from '../features/Dashboard';
import { Inbox } from '../features/Inbox';
import { Workspaces } from '../features/Workspaces';
import { Library } from '../features/Library';
import { SearchView } from '../features/SearchView';
import { DEMO_LABEL } from '../fixtures/demo';
import { NotesLibrary } from '../features/NotesLibrary';
import type { Location } from '@syna/contracts';

export function AppShell() {
  const { application, navigation, layout, environment, resolvedTheme } = useShell();
  const [temporary, setTemporary] = useState<TemporaryPanel>(null);
  const effective = deriveLayout(navigation.location, layout);
  const mainRef = useRef<HTMLElement>(null);
  const focusReturn = useRef<HTMLElement | null>(null);
  const temporaryReturn = useRef<HTMLElement | null>(null);
  const openTemporary = useCallback((panel: TemporaryPanel) => {
    if (panel) temporaryReturn.current = document.activeElement as HTMLElement;
    setTemporary(panel);
  }, []);
  const closeTemporary = useCallback(() => {
    setTemporary(null);
    requestAnimationFrame(() => {
      if (application.getSnapshot().layout.focus) mainRef.current?.focus();
      else if (temporaryReturn.current?.isConnected) temporaryReturn.current.focus();
      temporaryReturn.current = null;
    });
  }, [application]);
  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);
  useEffect(() => {
    function resize() { application.setViewport(window.innerWidth, window.innerHeight); }
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [application]);
  useEffect(() => {
    if (layout.focus) { focusReturn.current = document.activeElement as HTMLElement; mainRef.current?.focus(); }
    else if (focusReturn.current) { focusReturn.current.focus(); focusReturn.current = null; }
  }, [layout.focus]);
  useEffect(() => {
    function keyboard(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      const modifier = event.metaKey || event.ctrlKey;
      if (modifier && event.key.toLowerCase() === 'k') { event.preventDefault(); if (temporary === 'search') closeTemporary(); else openTemporary('search'); }
      if (modifier && event.shiftKey && event.key.toLowerCase() === 'f') { event.preventDefault(); application.setFocus(layout.focus ? null : 'main'); }
      if (modifier && event.key === '\\') { event.preventDefault(); application.toggleSidebar(); }
      if (event.key === 'Escape') {
        if (temporary) closeTemporary();
        else if (layout.transientPanel) application.toggleSidebar();
        else if (effective.auxiliaryMode === 'overlay') application.setAuxiliary(false);
        else if (layout.focus) application.setFocus(null);
      }
    }
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, [application, temporary, layout.focus, layout.transientPanel, effective.auxiliaryMode, openTemporary, closeTemporary]);
  const blocked = !!temporary || effective.auxiliaryMode === 'overlay';
  const contextOverlay = effective.sidebarMode === 'overlay';
  return <div className="app-shell" data-layout={effective.mode} data-runtime={environment.mode}>
    <a href="#main-workspace" className="skip-link">Skip to workspace</a>
    <div inert={blocked}><GlobalHeader onOpen={openTemporary} /></div>
    <div className="shell-body">
      <div className="navigation-surfaces" inert={blocked}>{effective.railVisible && <div className="rail-host"><GlobalRail onSettings={() => openTemporary('settings')} /></div>}<ContextSidebar /></div>
      <div className="main-column" inert={blocked || contextOverlay}>
        <main id="main-workspace" ref={mainRef} className="main-workspace" aria-label="Main workspace" tabIndex={-1}>
          {Object.values(navigation.locationsByPage).map(location => <PageSurface key={location.page} location={location} active={navigation.location.page === location.page} />)}
        </main>
        {navigation.location.page !== 'library' && <footer className="shell-status"><span><span className="status-dot" />{DEMO_LABEL}</span><span>{effective.temporarilyCollapsed ? 'Sidebar adapted to window' : 'Syna'}</span></footer>}
      </div>
      <AuxiliaryPanel modalOpen={!!temporary} />
    </div>
    <TemporaryDialog panel={temporary} close={closeTemporary} />
  </div>;
}

// Visited work surfaces remain mounted; Navigation chooses the task, Layout only arranges it.
function PageSurface({ location, active }: { location: Location; active: boolean }) {
  const { notesWorkspace } = useShell();
  return <div className={`page-surface ${location.page === 'library' ? 'library-workspace' : ''}`} data-page={location.page} hidden={!active}>
    {location.page === 'dashboard' && <Dashboard />}
    {location.page === 'inbox' && <Inbox />}
    {location.page === 'workspaces' && <Workspaces location={location} />}
    {location.page === 'library' && (notesWorkspace ? <NotesLibrary location={location} /> : <Library location={location} />)}
    {location.page === 'search' && <SearchView key={location.query ?? 'search'} initialQuery={location.query} />}
  </div>;
}
