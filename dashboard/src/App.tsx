import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import LeagueSetup from './pages/LeagueSetup';
import Standings from './pages/Standings';
import Rosters from './pages/Rosters';
import Matchups from './pages/Matchups';
import Transactions from './pages/Transactions';
import Drafts from './pages/Drafts';
import { KTCValues } from './pages/KTCValues';
import { SyncStatus } from './pages/SyncStatus';
import { TradeEvaluator } from './pages/TradeEvaluator';
import { TradeFinder } from './pages/TradeFinder';
import { LeagueHub } from './pages/LeagueHub';
import { ToolsHub } from './pages/ToolsHub';
import { Minigames } from './pages/Minigames';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="setup" element={<LeagueSetup />} />
        <Route path="standings" element={<Standings />} />
        <Route path="rosters" element={<Rosters />} />
        <Route path="matchups" element={<Matchups />} />
        <Route path="transactions" element={<Transactions />} />
        <Route path="drafts" element={<Drafts />} />
        <Route path="ktc-values" element={<KTCValues />} />
        <Route path="trade-evaluator" element={<TradeEvaluator />} />
        <Route path="trade-finder" element={<TradeFinder />} />
        <Route path="sync-status" element={<SyncStatus />} />
        <Route path="league" element={<LeagueHub />} />
        <Route path="tools" element={<ToolsHub />} />
        <Route path="minigames" element={<Minigames />} />
      </Route>
    </Routes>
  );
}

export default App;
