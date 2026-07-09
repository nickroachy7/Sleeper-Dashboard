import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * URL-query-backed view state. Filters, sort, active tab, and pagination live
 * in the URL so browser back/forward restores them exactly — navigate to a
 * detail page and back and everything is as you left it (and the view is
 * shareable/bookmarkable).
 *
 * Writes use `replace` so tweaking a filter updates the current history entry
 * in place instead of stacking a new entry per keystroke/click. Values equal to
 * a param's default are dropped from the URL to keep it clean.
 */
export function useUrlState() {
  const [params, setParams] = useSearchParams();

  const get = useCallback(
    (key: string, defaultValue = '') => params.get(key) ?? defaultValue,
    [params]
  );

  /** Apply several param updates in one navigation. `null`/`''` deletes the key. */
  const setMany = useCallback(
    (updates: Record<string, string | null | undefined>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(updates)) {
            if (value == null || value === '') next.delete(key);
            else next.set(key, value);
          }
          return next;
        },
        { replace: true }
      );
    },
    [setParams]
  );

  const set = useCallback(
    (key: string, value: string | null | undefined) => setMany({ [key]: value }),
    [setMany]
  );

  return { params, get, set, setMany };
}
