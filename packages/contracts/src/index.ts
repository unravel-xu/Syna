export type PageId = 'dashboard' | 'inbox' | 'workspaces' | 'library' | 'search';
export type LibrarySection = 'notes' | 'recent' | 'favorites' | 'daily' | 'references' | 'assets' | 'collections' | 'trash' | 'folder' | 'uncategorized';
export type Location =
  | { readonly page: 'dashboard' | 'inbox' }
  | { readonly page: 'workspaces'; readonly projectId?: string; readonly pipelineId?: string }
  | { readonly page: 'library'; readonly section: LibrarySection; readonly noteId?: string; readonly folderId?: string }
  | { readonly page: 'search'; readonly query?: string };
export interface NavigationState {
  readonly location: Location;
  readonly locationsByPage: Readonly<Partial<Record<PageId, Location>>>;
  readonly history: readonly Location[];
  readonly index: number;
}
export type Theme = 'dark' | 'light';
export type ThemePreference = Theme | 'system';
export interface LayoutPreferences {
  readonly sidebarWidth: number;
  readonly auxiliaryWidth: number;
  readonly sidebarByContext: Readonly<Record<string, boolean>>;
  readonly auxiliaryVisible: boolean;
  readonly theme: ThemePreference;
}
export interface LayoutState {
  readonly preferences: LayoutPreferences;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly focus: 'main' | null;
  readonly transientPanel: 'context-sidebar' | null;
}
export interface EffectiveLayout {
  readonly mode: 'expanded' | 'compact' | 'focus';
  readonly railVisible: boolean;
  readonly sidebarVisible: boolean;
  readonly sidebarMode: 'hidden' | 'inline' | 'overlay';
  readonly sidebarWidth: number;
  readonly auxiliaryWidth: number;
  readonly auxiliaryMode: 'hidden' | 'inline' | 'overlay';
  readonly mainWidth: number;
  readonly temporarilyCollapsed: boolean;
}
export interface PreferencesPort {
  load(): LayoutPreferences | undefined;
  save(preferences: LayoutPreferences): void;
}
export interface ShellSnapshot { readonly navigation: NavigationState; readonly layout: LayoutState }
export interface ShellApplication {
  getSnapshot(): ShellSnapshot;
  subscribe(listener: () => void): () => void;
  navigate(location: Location): Promise<import('./notes').Result<void>>;
  activatePage(initialLocation: Location): Promise<import('./notes').Result<void>>;
  back(): Promise<import('./notes').Result<void>>;
  forward(): Promise<import('./notes').Result<void>>;
  toggleSidebar(): void;
  setAuxiliary(visible: boolean): void;
  resizePanel(panel: 'sidebar' | 'auxiliary', width: number): void;
  setViewport(width: number, height: number): void;
  setFocus(focus: 'main' | null): void;
  setTheme(theme: ThemePreference): void;
}
export interface ShellEnvironment { readonly mode: 'browser' | 'electron'; readonly platform: string }
export * from './notes';
export * from './noteSchemas';

export * from './library';
export * from './librarySchemas';
