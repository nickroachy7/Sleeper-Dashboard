import { useEffect, useState } from 'react';

// How many px the on-screen keyboard (or other browser UI) covers at the
// bottom of the layout viewport. Derived from the VisualViewport API: when the
// keyboard opens, the visual viewport shrinks, so the gap between it and the
// full window height is the inset. Lets a bottom-docked input sit right above
// the keyboard instead of behind it. Returns 0 where VisualViewport is absent
// (older browsers) or the keyboard is closed.
export function useKeyboardInset(enabled = true): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!enabled || !vv) return;
    const update = () => {
      // Bottom gap = window height − (visual viewport height + its top offset).
      const gap = window.innerHeight - (vv.height + vv.offsetTop);
      setInset(gap > 1 ? Math.round(gap) : 0);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      // Reset once we stop tracking (palette closed) so a stale inset doesn't
      // linger — deferred to a microtask so it isn't a synchronous effect write.
      queueMicrotask(() => setInset(0));
    };
  }, [enabled]);

  return inset;
}
