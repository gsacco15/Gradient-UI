// Two routes are all we need: the landing page at "/" and the studio at "/studio".
import { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
window.addEventListener('popstate', () => listeners.forEach((l) => l()));

export function navigate(to: string) {
  if (to === location.pathname + location.search + location.hash) return;
  history.pushState(null, '', to);
  listeners.forEach((l) => l());
  window.scrollTo(0, 0);
}

export function usePath(): string {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => location.pathname,
  );
}

/** Click handler for <a href> links so they route without a page reload. */
export function linkTo(to: string) {
  return {
    href: to,
    onClick: (e: React.MouseEvent) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      navigate(to);
    },
  };
}
