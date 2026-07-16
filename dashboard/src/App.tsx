import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import { ScrollManager } from './components/ScrollManager';
import Home from './pages/Home';
import League from './pages/League';
import Settings from './pages/Settings';
import { PlayersPage } from './pages/PlayersPage';
import ValueVote from './pages/ValueVote';
import TradeTools from './pages/TradeTools';
import PlayerDetail from './pages/PlayerDetail';
import TeamDetail from './pages/TeamDetail';
import TradeDetail from './pages/TradeDetail';
import Feedback from './pages/Feedback';
import Chat from './pages/Chat';

function App() {
  return (
    <>
    <ScrollManager />
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="league" element={<League />} />
        <Route path="trade" element={<TradeTools />} />
        <Route path="players" element={<PlayersPage />} />
        <Route path="value-vote" element={<ValueVote />} />
        <Route path="players/:playerId" element={<PlayerDetail />} />
        <Route path="teams/:rosterId" element={<TeamDetail />} />
        <Route path="trades/:transactionId" element={<TradeDetail />} />
        <Route path="settings" element={<Settings />} />
        <Route path="feedback" element={<Feedback />} />
        <Route path="chat" element={<Chat />} />

        {/* Redirects for old routes */}
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
