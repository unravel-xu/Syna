import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createShellApplication, deriveLayout } from '@syna/core';
import type { LayoutPreferences, Location } from '@syna/contracts';

const library: Location = { page: 'library', section: 'notes', noteId: 'demo-connected' };
function runtime(location: Location = library) {
  const writes: LayoutPreferences[] = [];
  return { app: createShellApplication({ load: () => undefined, save: p => { writes.push(p); } }, location), writes };
}
function effective(app: ReturnType<typeof runtime>['app']) { const s = app.getSnapshot(); return deriveLayout(s.navigation.location, s.layout); }

test('first-visit layouts follow the task context', () => {
  const { app } = runtime({ page: 'dashboard' });
  assert.equal(effective(app).sidebarVisible, false);
  app.navigate({ page: 'inbox' }); assert.equal(effective(app).sidebarVisible, false);
  app.navigate({ page: 'workspaces' }); assert.equal(effective(app).sidebarVisible, true);
  app.navigate(library); assert.equal(effective(app).sidebarVisible, true);
  app.navigate({ page: 'library', section: 'references' }); assert.equal(effective(app).sidebarVisible, false);
  app.navigate({ page: 'search' }); assert.equal(effective(app).sidebarVisible, false);
});
test('viewport adaptation and focus never write requested preferences', () => {
  const { app, writes } = runtime();
  app.resizePanel('sidebar', 296); app.setAuxiliary(true);
  const requested = app.getSnapshot().layout.preferences;
  const count = writes.length;
  app.setViewport(1024, 768); assert.equal(effective(app).sidebarVisible, false);
  assert.equal(effective(app).temporarilyCollapsed, true);
  app.setFocus('main'); assert.equal(effective(app).mode, 'focus');
  assert.equal(effective(app).auxiliaryMode, 'hidden');
  app.setFocus(null); app.setViewport(1440, 900);
  assert.equal(effective(app).sidebarWidth, 296); assert.equal(effective(app).sidebarVisible, true);
  assert.equal(effective(app).auxiliaryMode, 'inline');
  assert.equal(app.getSnapshot().layout.preferences, requested); assert.equal(writes.length, count);
});
test('manual visibility is remembered by context while widths survive navigation', () => {
  const { app } = runtime(); app.toggleSidebar(); app.resizePanel('sidebar', 280); app.resizePanel('auxiliary', 360);
  app.navigate({ page: 'workspaces' }); assert.equal(effective(app).sidebarVisible, true); assert.equal(effective(app).sidebarWidth, 280);
  app.navigate({ page: 'dashboard' }); app.navigate(library); assert.equal(effective(app).sidebarVisible, false);
  assert.equal(effective(app).auxiliaryWidth, 360);
});
test('an assistant never squeezes the main surface below 560px at acceptance sizes', () => {
  const { app } = runtime(); app.setAuxiliary(true);
  for (const width of [1024, 1280, 1440, 1920]) {
    for (const sidebar of [200, 248, 320]) {
      for (const auxiliary of [320, 400, 440]) {
        app.resizePanel('sidebar', sidebar); app.resizePanel('auxiliary', auxiliary); app.setViewport(width, 800);
        assert.ok(effective(app).mainWidth >= 560, `Unusable width at ${width}/${sidebar}/${auxiliary}`);
      }
    }
  }
});
test('assistant falls back to overlay and recovers inline without changing intent', () => {
  const { app } = runtime(); app.setAuxiliary(true); app.resizePanel('sidebar', 320);
  app.setViewport(1280, 800); assert.equal(effective(app).auxiliaryMode, 'overlay');
  app.setViewport(1440, 900); assert.equal(effective(app).auxiliaryMode, 'inline');
  assert.equal(app.getSnapshot().layout.preferences.auxiliaryVisible, true);
});
test('invalid and out-of-range widths cannot corrupt layout', () => {
  const { app } = runtime(); app.resizePanel('sidebar', 999); assert.equal(effective(app).sidebarWidth, 320);
  app.resizePanel('sidebar', -1); assert.equal(effective(app).sidebarWidth, 200);
  app.resizePanel('auxiliary', Number.NaN); assert.equal(effective(app).auxiliaryWidth, 400);
});
test('focus exit restores a manually compact layout and hidden assistant', () => {
  const { app } = runtime(); app.toggleSidebar(); app.setFocus('main'); app.setFocus(null);
  assert.equal(effective(app).mode, 'compact'); assert.equal(effective(app).auxiliaryMode, 'hidden');
});
test('history can branch without retaining stale forward entries', () => {
  const { app } = runtime({ page: 'dashboard' }); app.navigate(library); app.navigate({ page: 'workspaces' });
  app.back(); assert.equal(app.getSnapshot().navigation.location.page, 'library');
  app.navigate({ page: 'inbox' }); app.forward();
  assert.equal(app.getSnapshot().navigation.location.page, 'inbox');
  assert.equal(app.getSnapshot().navigation.history.length, 3);
});
test('stable snapshots and unsubscribe support a single React subscription owner', () => {
  const { app } = runtime(); assert.equal(app.getSnapshot(), app.getSnapshot());
  let calls = 0; const stop = app.subscribe(() => { calls++; }); app.setTheme('light'); stop(); app.setTheme('dark'); assert.equal(calls, 1);
});
test('narrow sidebar is temporarily accessible without rewriting preferences', () => {
  const { app, writes } = runtime(); const requested = app.getSnapshot().layout.preferences;
  app.setViewport(1024, 768); app.toggleSidebar();
  assert.equal(effective(app).sidebarMode, 'overlay'); assert.equal(effective(app).mainWidth, 968);
  app.navigate({ page: 'library', section: 'assets' }); assert.equal(effective(app).sidebarMode, 'hidden');
  app.toggleSidebar(); app.setViewport(1440, 900); assert.equal(effective(app).sidebarMode, 'inline');
  assert.equal(app.getSnapshot().layout.preferences, requested); assert.equal(writes.length, 0);
});

test('reactivating an activity toggles layout without navigating or resetting the task', () => {
  const { app } = runtime({ page: 'dashboard' });
  app.activatePage({ page: 'workspaces' });
  app.navigate({ page: 'workspaces', projectId: 'demo-rsi' });
  app.resizePanel('sidebar', 296);
  const navigation = app.getSnapshot().navigation;
  app.activatePage({ page: 'workspaces' });
  assert.equal(effective(app).sidebarVisible, false);
  assert.equal(app.getSnapshot().navigation, navigation);
  app.activatePage({ page: 'workspaces' });
  assert.equal(effective(app).sidebarVisible, true);
  assert.equal(effective(app).sidebarWidth, 296);
  assert.equal(app.getSnapshot().navigation, navigation);
});

test('returning to an activity restores its location and explicit visibility preference', () => {
  const { app } = runtime();
  const note: Location = { page: 'library', section: 'favorites', noteId: 'demo-fragments' };
  app.navigate(note); app.toggleSidebar();
  app.activatePage({ page: 'workspaces' });
  app.navigate({ page: 'workspaces', projectId: 'demo-rsi' });
  app.activatePage(library);
  assert.deepEqual(app.getSnapshot().navigation.location, note);
  assert.equal(effective(app).sidebarVisible, false);
  app.back();
  assert.deepEqual(app.getSnapshot().navigation.locationsByPage.workspaces, { page: 'workspaces', projectId: 'demo-rsi' });
  app.back();
  assert.deepEqual(app.getSnapshot().navigation.locationsByPage.workspaces, { page: 'workspaces' });
  app.activatePage(library); app.activatePage({ page: 'workspaces', projectId: 'demo-agentic' });
  assert.deepEqual(app.getSnapshot().navigation.location, { page: 'workspaces' });
});

test('unsupported pages cannot open a sidebar, including legacy saved preferences', () => {
  const writes: LayoutPreferences[] = [];
  const app = createShellApplication({ load: () => ({ sidebarWidth: 296, auxiliaryWidth: 400, auxiliaryVisible: false, theme: 'dark', sidebarByContext: { dashboard: true, inbox: true, search: true } }), save: p => writes.push(p) });
  for (const width of [1440, 1024]) {
    app.setViewport(width, 768);
    for (const page of ['dashboard', 'inbox', 'search'] as const) {
      const location: Location = { page };
      app.navigate(location);
      app.toggleSidebar(); app.activatePage(location);
      assert.equal(effective(app).sidebarVisible, false);
      assert.equal(effective(app).temporarilyCollapsed, false);
      assert.equal(app.getSnapshot().layout.transientPanel, null);
    }
  }
  assert.equal(writes.length, 0);
});

test('narrow activity activation reveals context temporarily and preserves wide-screen intent', () => {
  const { app, writes } = runtime({ page: 'dashboard' });
  app.setViewport(1024, 768);
  app.activatePage({ page: 'workspaces' });
  const navigation = app.getSnapshot().navigation;
  assert.equal(effective(app).sidebarMode, 'overlay');
  app.activatePage({ page: 'workspaces' });
  assert.equal(effective(app).sidebarMode, 'hidden');
  app.toggleSidebar();
  assert.equal(effective(app).sidebarMode, 'overlay');
  assert.equal(app.getSnapshot().navigation, navigation);
  app.setViewport(1440, 900);
  assert.equal(effective(app).sidebarMode, 'inline');
  assert.equal(writes.length, 0);
});

test('focus ignores sidebar toggles and restores the prior requested layout on exit', () => {
  const { app, writes } = runtime();
  app.resizePanel('sidebar', 288);
  app.setAuxiliary(true);
  const preferences = app.getSnapshot().layout.preferences;
  const count = writes.length;
  app.setFocus('main'); app.toggleSidebar(); app.activatePage(library);
  assert.equal(effective(app).mode, 'focus');
  app.setViewport(1024, 768); app.toggleSidebar();
  app.setFocus(null); app.setViewport(1440, 900);
  assert.equal(effective(app).sidebarMode, 'inline');
  assert.equal(effective(app).sidebarWidth, 288);
  assert.equal(effective(app).auxiliaryMode, 'inline');
  assert.equal(app.getSnapshot().layout.preferences, preferences);
  assert.equal(writes.length, count);
});
