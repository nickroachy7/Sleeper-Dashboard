import { useEffect, type ReactNode } from 'react';

/** Dark-only theme: stamps the `dark` class on <html>. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light');
    root.classList.add('dark');
  }, []);

  return <>{children}</>;
}
