import { useLocation } from 'react-router-dom';
import { ListOrdered, Swords, ArrowLeftRight, Layers, History } from 'lucide-react';
import { SectionTabs } from './SectionTabs';

/**
 * The League section's sub-nav: everything about what has happened in the
 * league, across the /league, /transactions, and /drafts routes. Standings /
 * Scoreboard / History live on /league (via ?tab); Transactions and Drafts are
 * their own routes but present here as siblings so the section reads as one.
 */
export function LeagueTabs() {
  const { pathname, search } = useLocation();
  const tab = new URLSearchParams(search).get('tab');
  const onLeague = pathname === '/league';

  return (
    <SectionTabs
      tabs={[
        { label: 'Standings', to: '/league', icon: ListOrdered, active: onLeague && tab !== 'scoreboard' && tab !== 'history' },
        { label: 'Scoreboard', to: '/league?tab=scoreboard', icon: Swords, active: onLeague && tab === 'scoreboard' },
        { label: 'Transactions', to: '/transactions', icon: ArrowLeftRight, active: pathname === '/transactions' },
        { label: 'Drafts', to: '/drafts', icon: Layers, active: pathname === '/drafts' },
        { label: 'History', to: '/league?tab=history', icon: History, active: onLeague && tab === 'history' },
      ]}
    />
  );
}
