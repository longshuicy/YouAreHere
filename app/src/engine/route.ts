import { useEffect, useState } from 'react';

/**
 * The address bar's whole vocabulary.
 *
 * Deliberately small: the gallery is the only part of this app that is safe to
 * bookmark or hand to someone else, because it is the part with no answer
 * hiding in it. A running puzzle is not addressed — the world you woke in and
 * the stranger you are is exactly what a URL would spoil, and back-mid-puzzle
 * would let the browser's own history button do what "start again" is for.
 * `game` therefore covers the cold open, exploring, guessing and the reveal
 * alike; those phases live in session state, not here.
 */
export type Route =
  | { screen: 'game' }
  | { screen: 'gallery' }
  | { screen: 'gallery-world'; worldId: string }
  | { screen: 'gallery-character'; worldId: string; i: number };

/** Vite serves this build under this prefix — `/` locally, `/<repo>/` on
 * GitHub Pages — so a path built here has to carry it, and a path read back
 * has to strip it before it means anything. */
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

function parsePath(pathname: string): Route {
  const path = pathname.startsWith(BASE) ? pathname.slice(BASE.length) : pathname;
  const parts = path.split('/').filter(Boolean);
  if (parts[0] !== 'gallery') return { screen: 'game' };
  const worldId = parts[1];
  if (!worldId) return { screen: 'gallery' };
  const iRaw = parts[2];
  if (iRaw !== undefined) {
    const i = Number(iRaw);
    if (Number.isInteger(i)) return { screen: 'gallery-character', worldId, i };
  }
  return { screen: 'gallery-world', worldId };
}

function pathFor(route: Route): string {
  switch (route.screen) {
    case 'gallery':
      return `${BASE}/gallery`;
    case 'gallery-world':
      return `${BASE}/gallery/${encodeURIComponent(route.worldId)}`;
    case 'gallery-character':
      return `${BASE}/gallery/${encodeURIComponent(route.worldId)}/${route.i}`;
    default:
      return `${BASE}/`;
  }
}

/**
 * The whole router: read the path once, write it on navigation, and listen for
 * the back and forward buttons. No library, because there are four shapes of
 * URL and a library's worth of route matching would be answering a question
 * this app does not ask.
 */
export function useRoute(): { route: Route; navigate: (next: Route, opts?: { replace?: boolean }) => void } {
  const [route, setRoute] = useState<Route>(() => parsePath(window.location.pathname));

  useEffect(() => {
    const onPopState = () => setRoute(parsePath(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = (next: Route, opts?: { replace?: boolean }) => {
    const path = pathFor(next);
    if (path !== window.location.pathname) {
      if (opts?.replace) window.history.replaceState(null, '', path);
      else window.history.pushState(null, '', path);
    }
    setRoute(next);
  };

  return { route, navigate };
}
