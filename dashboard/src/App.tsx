import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Settings from './pages/Settings';
import Transactions from './pages/Transactions';
import Drafts from './pages/Drafts';
import { KTCValues } from './pages/KTCValues';
import TradeTools from './pages/TradeTools';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="trade" element={<TradeTools />} />
        <Route path="ktc-values" element={<KTCValues />} />
        <Route path="transactions" element={<Transactions />} />
        <Route path="drafts" element={<Drafts />} />
        <Route path="settings" element={<Settings />} />

        {/* Redirects for old routes */}
        <Route path="trade-evaluator" element={<Navigate to="/trade" replace />} />
        <Route path="trade-finder" element={<Navigate to="/trade" replace />} />
        <Route path="trade-history" element={<Navigate to="/transactions" replace />} />
        <Route path="setup" element={<Navigate to="/settings" replace />} />
        <Route path="sync-status" element={<Navigate to="/settings" replace />} />
        <Route path="standings" element={<Navigate to="/" replace />} />
        <Route path="rosters" element={<Navigate to="/" replace />} />
        <Route path="matchups" element={<Navigate to="/" replace />} />
        <Route path="league" element={<Navigate to="/" replace />} />
        <Route path="tools" element={<Navigate to="/trade" replace />} />
        <Route path="minigames" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
