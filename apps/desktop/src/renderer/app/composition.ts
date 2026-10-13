import type { LayoutPreferences, Location } from '@syna/contracts';
import { createShellApplication, createNoteService, InMemoryWorkspace, NotesWorkspace, createLibraryService, LibraryExplorer } from '@syna/core';
import { ok } from '@syna/contracts';
import { browserPreferences } from '../adapters/preferences';
import { getEnvironment } from '../adapters/environment';
import { electronNoteClient, electronLibraryClient } from '../adapters/ElectronNoteClient';
import { CodeMirrorBufferAdapter } from '../features/editor/CodeMirrorBufferAdapter';

// Explicit development-only scenes use a nonpersistent preference port.
const locations: Record<string, Location> = {
  dashboard: { page: 'dashboard' }, inbox: { page: 'inbox' },
  workspaces: { page: 'workspaces', projectId: 'demo-agentic' },
  library: { page: 'library', section: 'notes', noteId: 'demo-connected' },
  focus: { page: 'library', section: 'notes', noteId: 'demo-connected' },
  compact: { page: 'library', section: 'notes', noteId: 'demo-connected' },
  narrow: { page: 'library', section: 'notes', noteId: 'demo-connected' },
  search: { page: 'search' }
};
export function composeShell() {
  const query = new URLSearchParams(window.location.search);
  const scene = query.get('scene');
  const sceneEnabled = !!scene && scene in locations;
  const overrides: Partial<LayoutPreferences> = sceneEnabled ? {
    theme: query.get('theme') === 'light' ? 'light' : 'dark', auxiliaryVisible: query.get('assistant') === '1',
    ...(scene === 'compact' ? { sidebarByContext: { 'library:notes': false } } : {})
  } : {};
  const environment = getEnvironment();
  const mock = new InMemoryWorkspace();
  if (query.get('fault') === 'save' && environment.mode === 'browser') mock.failNextSave = true;
  const client = environment.mode === 'electron' ? electronNoteClient() : null;
  let notesWorkspace: NotesWorkspace | null = null;
  let libraryExplorer: LibraryExplorer | null = null;
  const application = createShellApplication(sceneEnabled ? { load: () => undefined, save: () => {} } : browserPreferences(window.localStorage), sceneEnabled ? locations[scene] : undefined, overrides,
    sceneEnabled ? undefined : { prepare: async to => { const previousNoteId = notesWorkspace!.getSnapshot().active?.document.id; const result = await notesWorkspace!.prepare(to); if (!result.ok) return result; return ok({ ...result.value, commit: () => { result.value.commit(); if (to.page === 'library' && to.noteId && to.noteId !== previousNoteId && notesWorkspace!.getSnapshot().active?.document.id === to.noteId) libraryExplorer?.opened(to.noteId); } }); } });
  if (!sceneEnabled) notesWorkspace = new NotesWorkspace(application, client ?? createNoteService(mock), client ?? mock, (note, draft) => new CodeMirrorBufferAdapter(note, draft));
  if (notesWorkspace) libraryExplorer = new LibraryExplorer(client ? electronLibraryClient() : createLibraryService(mock), client ?? createNoteService(mock), notesWorkspace, application, title => (notesWorkspace!.getSnapshot().active?.buffer as CodeMirrorBufferAdapter | undefined)?.setTitle(title));
  if (query.get('fault') === 'library' && environment.mode === 'browser') mock.failNextLibrary = true;
  application.setViewport(window.innerWidth, window.innerHeight);
  if (scene === 'focus') application.setFocus('main');
  client?.onPrepareClose(async () => { await libraryExplorer?.settle(); return notesWorkspace?.flushAndCapture() ?? ok(undefined); });
  return { application, environment, notesWorkspace, libraryExplorer };
}
