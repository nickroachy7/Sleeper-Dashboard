import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * Scroll behavior for SPA navigation:
 *  - New navigations (PUSH) start at the top of the page.
 *  - Back/forward (POP) restore the exact scroll position you left at.
 *  - In-place updates (REPLACE, e.g. changing a filter or typing in search)
 *    leave the scroll position untouched — no jump to top on each keystroke.
 *
 * We can't rely on the browser's native scroll restoration: our lists load
 * asynchronously (react-query), so on a back navigation the page is short for a
 * few frames and the browser gives up before the saved position exists. Instead
 * we remember scroll per history entry (keyed by `location.key`) and retry the
 * restore across frames until the content has grown tall enough to reach it.
 *
 * Two CSS behaviors that would corrupt this are disabled globally in index.css:
 * `scroll-behavior: smooth` (animates the navigation clamp into stray scroll
 * events) and `overflow-anchor` (chases reordered rows on filter/sort changes).
 */

const positions = new Map<string, number>();

export function ScrollManager() {
  const { key } = useLocation();
  const navType = useNavigationType();
  // The history entry whose scroll position the listener should attribute
  // scrolls to. Updated in the layout effect below — which runs after React
  // commits the new DOM but before the browser dispatches the clamp scroll
  // event — so a short incoming page can't overwrite the outgoing entry.
  const currentKey = useRef(key);

  // Own scroll restoration so the browser doesn't fight us.
  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);

  // Record the live scroll position against the settled entry.
  useEffect(() => {
    const onScroll = () => positions.set(currentKey.current, window.scrollY);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useLayoutEffect(() => {
    currentKey.current = key;

    // In-place update (filter/sort/search/tab change) — keep the user put.
    // REPLACE mints a fresh location.key, so carry the current scroll over to
    // it; otherwise a filter tweak followed by a click-through would lose the
    // return position.
    if (navType === 'REPLACE') {
      positions.set(key, window.scrollY);
      return;
    }

    if (navType === 'POP') {
      const target = positions.get(key) ?? 0;
      // Retry across frames: async content may not be tall enough yet to reach
      // the saved offset. Stop once we land there, run out of frames (~2s), or
      // the user starts scrolling themselves.
      let frame = 0;
      let raf = 0;
      let done = false;
      const stopOnUserScroll = () => { if (!done) finish(); };
      window.addEventListener('wheel', stopOnUserScroll, { passive: true });
      window.addEventListener('touchmove', stopOnUserScroll, { passive: true });

      const tryRestore = () => {
        // `behavior: instant` guards against any future smooth-scroll styling.
        window.scrollTo({ top: target, behavior: 'instant' });
        const reached = Math.abs(window.scrollY - target) < 2;
        if (reached || frame > 120) return finish();
        frame += 1;
        raf = requestAnimationFrame(tryRestore);
      };

      const finish = () => {
        done = true;
        cancelAnimationFrame(raf);
        window.removeEventListener('wheel', stopOnUserScroll);
        window.removeEventListener('touchmove', stopOnUserScroll);
      };

      raf = requestAnimationFrame(tryRestore);
      return finish;
    }

    // New navigation (PUSH) → start at the top and seed this entry's position.
    window.scrollTo({ top: 0, behavior: 'instant' });
    positions.set(key, 0);
  }, [key, navType]);

  return null;
}
