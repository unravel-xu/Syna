import type { LayoutPreferences, Location, PreferencesPort, ShellApplication, ShellSnapshot } from '@syna/contracts';
import { clampWidth, contextKey, defaultPreferences, requestedSidebar, SIZES, supportsSidebar } from './layout';
import { initialNavigation, moveHistory, navigate } from './navigation';
import { fail, ok } from '@syna/contracts';
import type { Result } from '@syna/contracts';
import type { PreparedNavigation } from './workspace/NotesWorkspace';
export * from './layout';
export * from './navigation';
export * from './notes/NoteService';
export * from './notes/identity';
export * from './notes/blocks';
export * from './testing/InMemoryWorkspace';
export * from './workspace/DocumentSession';
export * from './workspace/NotesWorkspace';

export function createShellApplication(port: PreferencesPort, location: Location = { page: 'dashboard' }, overrides: Partial<LayoutPreferences> = {}, lifecycle?: { prepare(to: Location): Promise<Result<PreparedNavigation>> }): ShellApplication {
  let snapshot: ShellSnapshot = {
    navigation: initialNavigation(location),
    layout: { preferences: { ...defaultPreferences, ...port.load(), ...overrides }, viewport: { width: 1440, height: 900 }, focus: null, transientPanel: null }
  };
  const listeners = new Set<() => void>();
  let epoch = 0;
  let navigationQueue: Promise<Result<void>> = Promise.resolve(ok(undefined));
  function publish(next: ShellSnapshot) { snapshot = next; for (const listener of listeners) listener(); }
  function preferences(next: LayoutPreferences) {
    port.save(next);
    publish({ ...snapshot, layout: { ...snapshot.layout, preferences: next } });
  }
  function requestNavigation(to: Location, commit: () => void): Promise<Result<void>> {
    const intent = ++epoch;
    if (!lifecycle) { commit(); return Promise.resolve(ok(undefined)); }
    navigationQueue = navigationQueue.then(async () => {
      if (intent !== epoch) return fail('superseded', 'A newer navigation request replaced this one.');
      let prepared = await lifecycle.prepare(to);
      while (prepared.ok && prepared.value.ready && !prepared.value.ready() && intent === epoch) { prepared.value.cancel?.(); prepared = await lifecycle.prepare(to); }
      if (!prepared.ok) return prepared;
      if (intent !== epoch) { prepared.value.cancel?.(); return fail('superseded', 'A newer navigation request replaced this one.'); }
      prepared.value.commit(); commit(); return ok(undefined);
    }).catch(() => fail('storage-error', 'Navigation could not finish. Your current note was retained.', true));
    return navigationQueue;
  }
  function goTo(location: Location, revealContext = false) {
    return requestNavigation(location, () => {
      const { layout } = snapshot;
      const transientPanel = revealContext && !layout.focus && layout.viewport.width < SIZES.compactAt && requestedSidebar(location, layout.preferences) ? 'context-sidebar' : null;
      publish({ ...snapshot, navigation: navigate(snapshot.navigation, location), layout: { ...layout, transientPanel } });
    });
  }
  function toggleSidebar() {
    const { location } = snapshot.navigation;
    if (!supportsSidebar(location) || snapshot.layout.focus) return;
    if (snapshot.layout.viewport.width < SIZES.compactAt) {
      publish({ ...snapshot, layout: { ...snapshot.layout, transientPanel: snapshot.layout.transientPanel ? null : 'context-sidebar' } });
      return;
    }
    const p = snapshot.layout.preferences;
    preferences({ ...p, sidebarByContext: { ...p.sidebarByContext, [contextKey(location)]: !requestedSidebar(location, p) } });
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    navigate: goTo,
    activatePage(initialLocation) {
      if (snapshot.navigation.location.page === initialLocation.page) { toggleSidebar(); return Promise.resolve(ok(undefined)); }
      return goTo(snapshot.navigation.locationsByPage[initialLocation.page] ?? initialLocation, true);
    },
    back() { const next = moveHistory(snapshot.navigation, -1); return requestNavigation(next.location, () => publish({ ...snapshot, navigation: next, layout: { ...snapshot.layout, transientPanel: null } })); },
    forward() { const next = moveHistory(snapshot.navigation, 1); return requestNavigation(next.location, () => publish({ ...snapshot, navigation: next, layout: { ...snapshot.layout, transientPanel: null } })); },
    toggleSidebar,
    setAuxiliary(auxiliaryVisible) { preferences({ ...snapshot.layout.preferences, auxiliaryVisible }); },
    resizePanel(panel, width) { preferences({ ...snapshot.layout.preferences, [panel === 'sidebar' ? 'sidebarWidth' : 'auxiliaryWidth']: clampWidth(panel, width) }); },
    setViewport(width, height) { publish({ ...snapshot, layout: { ...snapshot.layout, viewport: { width, height }, transientPanel: width >= SIZES.compactAt ? null : snapshot.layout.transientPanel } }); },
    setFocus(focus) { publish({ ...snapshot, layout: { ...snapshot.layout, focus, transientPanel: null } }); },
    setTheme(theme) { preferences({ ...snapshot.layout.preferences, theme }); }
  };
}

export * from './library/library';
export * from './library/LibraryExplorer';
