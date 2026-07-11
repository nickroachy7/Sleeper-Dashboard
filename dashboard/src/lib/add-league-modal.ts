// Cross-component channel for opening the Add League modal. The league switcher
// and the Settings page dispatch this; <AddLeagueModal> (mounted in Layout) listens.
export const OPEN_ADD_LEAGUE_EVENT = 'open-add-league';

export function openAddLeague() {
  window.dispatchEvent(new CustomEvent(OPEN_ADD_LEAGUE_EVENT));
}
