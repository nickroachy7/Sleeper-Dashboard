import PlayerComparisonWidget from './PlayerComparisonWidget';
import PlayerRankingsWidget from './PlayerRankingsWidget';

// ── Chat widget registry ──────────────────────────────────────────
// The chat edge function returns widgets [{ id, type, props }] chosen by the
// model. Map each type to a component here. Adding a widget = one entry +
// one component (+ the matching UI tool in supabase/functions/chat).

export interface ChatWidget {
  id: string;
  type: string;
  props: Record<string, unknown>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const REGISTRY: Record<string, (props: any) => React.ReactNode> = {
  show_player_comparison: PlayerComparisonWidget,
  show_player_rankings: PlayerRankingsWidget,
};

export function ChatWidgets({ widgets }: { widgets?: ChatWidget[] }) {
  if (!widgets?.length) return null;
  return (
    <div className="space-y-2 mt-2">
      {widgets.map((w) => {
        const Component = REGISTRY[w.type];
        if (!Component) return null;
        return <div key={w.id}>{Component(w.props)}</div>;
      })}
    </div>
  );
}
