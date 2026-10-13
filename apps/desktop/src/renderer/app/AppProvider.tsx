import { createContext, useContext, useSyncExternalStore, useEffect } from 'react';
import type { PropsWithChildren } from 'react';
import type { ShellApplication, ShellEnvironment, Theme } from '@syna/contracts';
import { readSystemTheme, subscribeSystemTheme } from '../adapters/systemTheme';
import type { NotesWorkspace, LibraryExplorer } from '@syna/core';
const Context = createContext<{ application: ShellApplication; environment: ShellEnvironment; systemTheme: Theme; notesWorkspace: NotesWorkspace | null; libraryExplorer: LibraryExplorer | null } | null>(null);
export function AppProvider({ application, environment, notesWorkspace, libraryExplorer, children }: PropsWithChildren<{ application: ShellApplication; environment: ShellEnvironment; notesWorkspace: NotesWorkspace | null; libraryExplorer: LibraryExplorer | null }>) {
  const systemTheme = useSyncExternalStore(subscribeSystemTheme, readSystemTheme);
  useEffect(() => { void notesWorkspace?.start(); }, [notesWorkspace]);
  useEffect(() => { if (!libraryExplorer || !notesWorkspace) return; void libraryExplorer.refresh(); let lastNotes = notesWorkspace.getSnapshot().notes; return notesWorkspace.subscribe(() => { const next = notesWorkspace.getSnapshot().notes; if (next !== lastNotes) { lastNotes = next; void libraryExplorer.refresh(); } }); }, [libraryExplorer, notesWorkspace]);
  return <Context.Provider value={{ application, environment, systemTheme, notesWorkspace, libraryExplorer }}>{children}</Context.Provider>;
}
export function useNotesWorkspace() {
  const { notesWorkspace } = useShell();
  if (!notesWorkspace) throw new Error('The note workspace is unavailable in fixture scenes.');
  const snapshot = useSyncExternalStore(notesWorkspace.subscribe, notesWorkspace.getSnapshot);
  return { workspace: notesWorkspace, ...snapshot };
}
export function useShell() {
  const context = useContext(Context);
  if (!context) throw new Error('AppProvider is required');
  const snapshot = useSyncExternalStore(context.application.subscribe, context.application.getSnapshot);
  const resolvedTheme = snapshot.layout.preferences.theme === 'system' ? context.systemTheme : snapshot.layout.preferences.theme;
  return { ...context, ...snapshot, resolvedTheme };
}

export function useLibraryExplorer() {
  const { libraryExplorer } = useShell();
  if (!libraryExplorer) throw new Error('The Library Explorer is unavailable in fixture scenes.');
  const snapshot = useSyncExternalStore(libraryExplorer.subscribe, libraryExplorer.getSnapshot);
  return { explorer: libraryExplorer, ...snapshot };
}
