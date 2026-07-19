import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import { ScrollManager } from './components/ScrollManager';
import Home from './pages/Home';
import League from './pages/League';
import Settings from './pages/Settings';
import { PlayersPage } from './pages/PlayersPage';
import TradeTools from './pages/TradeTools';
import PlayerDetail from './pages/PlayerDetail';
import TeamDetail from './pages/TeamDetail';
import TradeDetail from './pages/TradeDetail';
import Feedback from './pages/Feedback';
import Welcome from './pages/Welcome';
import Profile from './pages/Profile';
import { AuthModal } from './components/AuthModal';

function App() {
  return (
    <>
    <ScrollManager />
    {/* Mounted above the routes so openAuth() works everywhere, including
        the chrome-less /welcome page. */}
    <AuthModal />
    <Routes>
      {/* Full-page onboarding — outside the Layout shell so there's no app
          chrome competing with the wizard. */}
      <Route path="/welcome" element={<Welcome />} />
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="league" element={<League />} />
        <Route path="trade" element={<TradeTools />} />
        <Route path="players" element={<PlayersPage />} />
        <Route path="players/:playerId" element={<PlayerDetail />} />
        <Route path="teams/:rosterId" element={<TeamDetail />} />
        <Route path="trades/:transactionId" element={<TradeDetail />} />
        <Route path="settings" element={<Settings />} />
        <Route path="feedback" element={<Feedback />} />
        {/* Public share target — friends land here from a link, so it keeps
            the app chrome (nav = the funnel into the rest of the product). */}
        <Route path="u/:username" element={<Profile />} />

        {/* Redirects for old routes */}
        {/* Rank 'Em moved into Tools as a tab — keep the old links working. */}
        <Route path="value-vote" element={<Navigate to="/trade?tab=rank" replace />} />
        {/* Chat folded into the search palette; the tab is gone, so send old
            /chat bookmarks home (the search button reaches the assistant). */}
        <Route path="chat" element={<Navigate to="/" replace />} />
        <Route path="ktc-values" element={<Navigate to="/players" replace />} />
        <Route path="trade-evaluator" element={<Navigate to="/trade" replace />} />
        <Route path="trade-finder" element={<Navigate to="/trade" replace />} />
        <Route path="trade-history" element={<Navigate to="/league?tab=transactions" replace />} />
        <Route path="transactions" element={<Navigate to="/league?tab=transactions" replace />} />
        <Route path="drafts" element={<Navigate to="/league?tab=drafts" replace />} />
        <Route path="setup" element={<Navigate to="/settings" replace />} />
        <Route path="sync-status" element={<Navigate to="/settings" replace />} />
        <Route path="standings" element={<Navigate to="/league" replace />} />
        <Route path="rosters" element={<Navigate to="/" replace />} />
        <Route path="matchups" element={<Navigate to="/league?tab=scoreboard" replace />} />
        <Route path="tools" element={<Navigate to="/trade" replace />} />
        <Route path="minigames" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
    </>
  );
}

export default App;
