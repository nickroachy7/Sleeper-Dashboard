import { useEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * Scroll behavior for SPA navigation:
 *  - New navigations (PUSH/REPLACE) start at the top of the page.
 *  - Back/forward (POP) keep the browser's restored scroll position, so hitting
 *    the browser back button returns you exactly where you were in a list.
 */
export function ScrollManager() {
  const { pathname } = useLocation();
  const navType = useNavigationType();

  useEffect(() => {
    if (navType !== 'POP') window.scrollTo(0, 0);
  }, [pathname, navType]);

  return null;
}
