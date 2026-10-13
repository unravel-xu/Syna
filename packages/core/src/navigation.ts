import type { Location, NavigationState } from '@syna/contracts';
export function initialNavigation(location: Location): NavigationState { return { location, locationsByPage: { [location.page]: location }, history: [location], index: 0 }; }
export function navigate(state: NavigationState, location: Location): NavigationState {
  if (JSON.stringify(state.location) === JSON.stringify(location)) return state;
  const history = [...state.history.slice(0, state.index + 1), location];
  return { location, locationsByPage: { ...state.locationsByPage, [location.page]: location }, history, index: history.length - 1 };
}
export function moveHistory(state: NavigationState, direction: -1 | 1): NavigationState {
  const index = Math.min(state.history.length - 1, Math.max(0, state.index + direction));
  if (index === state.index) return state;
  const location = state.history[index];
  return { ...state, index, location, locationsByPage: { ...state.locationsByPage, [location.page]: location } };
}
