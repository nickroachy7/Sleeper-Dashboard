import { useLocation } from 'react-router-dom';
import { TrendingUp, Users, Swords } from 'lucide-react';
import { SectionTabs } from './SectionTabs';

/**
 * The Players section's sub-nav: all value & research in one place. Rankings and
 * Team Strength are two views of the /players page (via ?tab); "Rank 'Em" is the
 * pairwise vote at /value-vote that feeds those values.
 */
export function PlayersTabs() {
  const { pathname, search } = useLocation();
  const tab = new URLSearchParams(search).get('tab');
  const onPlayers = pathname === '/players';

  return (
    <SectionTabs
      tabs={[
        { label: 'Rankings', to: '/players', icon: TrendingUp, active: onPlayers && tab !== 'teams' },
        { label: 'Team Strength', to: '/players?tab=teams', icon: Users, active: onPlayers && tab === 'teams' },
        { label: "Rank 'Em", to: '/value-vote', icon: Swords, active: pathname === '/value-vote' },
      ]}
    />
  );
}
