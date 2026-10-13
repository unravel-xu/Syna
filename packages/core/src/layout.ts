import type { EffectiveLayout, LayoutPreferences, LayoutState, Location } from '@syna/contracts';
export const SIZES = { rail: 56, header: 48, sidebar: { min: 200, default: 248, max: 320 }, auxiliary: { min: 320, default: 400, max: 440 }, mainMin: 560, compactAt: 1100 } as const;
export const defaultPreferences: LayoutPreferences = {
  sidebarWidth: SIZES.sidebar.default, auxiliaryWidth: SIZES.auxiliary.default,
  sidebarByContext: {}, auxiliaryVisible: false, theme: 'dark'
};
export function contextKey(location: Location): string {
  if (location.page !== 'library') return location.page;
  return `library:${location.section === 'references' ? 'references' : 'notes'}`;
}
export function supportsSidebar(location: Location): boolean {
  return location.page === 'workspaces' || location.page === 'library';
}
export function requestedSidebar(location: Location, preferences: LayoutPreferences): boolean {
  if (!supportsSidebar(location)) return false;
  const key = contextKey(location);
  return preferences.sidebarByContext[key] ?? (location.page === 'workspaces' || (location.page === 'library' && location.section !== 'references'));
}
export function clampWidth(panel: 'sidebar' | 'auxiliary', width: number): number {
  const bounds = panel === 'sidebar' ? SIZES.sidebar : SIZES.auxiliary;
  return Math.round(Math.min(bounds.max, Math.max(bounds.min, Number.isFinite(width) ? width : bounds.default)));
}
export function deriveLayout(location: Location, state: LayoutState): EffectiveLayout {
  const { preferences: p, viewport, focus } = state;
  const sidebarWidth = clampWidth('sidebar', p.sidebarWidth);
  const auxiliaryWidth = clampWidth('auxiliary', p.auxiliaryWidth);
  const requested = requestedSidebar(location, p);
  const railVisible = focus === null;
  const inlineSidebar = focus === null && requested && viewport.width >= SIZES.compactAt;
  const sidebarMode = inlineSidebar ? 'inline' : !focus && supportsSidebar(location) && state.transientPanel === 'context-sidebar' ? 'overlay' : 'hidden';
  const available = viewport.width - (railVisible ? SIZES.rail : 0) - (inlineSidebar ? sidebarWidth : 0);
  const auxiliaryMode = focus || sidebarMode === 'overlay' || !p.auxiliaryVisible ? 'hidden' : available - auxiliaryWidth >= SIZES.mainMin ? 'inline' : 'overlay';
  return {
    mode: focus ? 'focus' : inlineSidebar ? 'expanded' : 'compact', railVisible, sidebarVisible: sidebarMode !== 'hidden', sidebarMode,
    sidebarWidth, auxiliaryWidth: Math.min(auxiliaryWidth, viewport.width - 24), auxiliaryMode,
    mainWidth: available - (auxiliaryMode === 'inline' ? auxiliaryWidth : 0),
    temporarilyCollapsed: focus === null && requested && sidebarMode === 'hidden'
  };
}
