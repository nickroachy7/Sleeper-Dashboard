import { Gamepad2 } from 'lucide-react';

export function Minigames() {
  return (
    <div className="p-4 lg:p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
          Minigames
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mb-8">
          Fun games to play with your league
        </p>

        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-20 h-20 rounded-2xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center mb-6">
            <Gamepad2 className="h-10 w-10 text-slate-400 dark:text-slate-500" />
          </div>
          <h2 className="text-xl font-semibold text-slate-700 dark:text-slate-300 mb-2">
            Coming Soon
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-center max-w-sm">
            We're working on some fun minigames for you and your league. Stay tuned!
          </p>
        </div>
      </div>
    </div>
  );
}
