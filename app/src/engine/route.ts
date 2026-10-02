import { useEffect, useLayoutEffect, useRef, useState } from 'react';

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
  /** Where the page the browser is going *back* to was left. Null on a forward
   * move, which always starts at the top. */
  const restoreTo = useRef<number | null>(null);
  /** The path the window is currently scrolled within. Navigating to the path
   * already shown — the gallery's `All worlds` pressed while on the gallery —
   * must not throw the reader back to the top of a list they were reading. */
  const shownPath = useRef(window.location.pathname);
  /**
   * Where each path was last left, for this session.
   *
   * The browser's own record covers the back button and nothing else, and in
   * this app the commonest way back is not the back button — it is the `All
   * worlds` link in the margin, which is an ordinary forward navigation to
   * `/gallery`. Without this, reading down to the fortieth world, opening it and
   * pressing that link put the reader back at the first world every time. A page
   * returned to by any route lands where it was left; a page never visited
   * lands at its top.
   */
  const leftAt = useRef(new Map<string, number>());

  /**
   * The browser's own scroll restoration is turned off, and this hook does it.
   *
   * Left on, it is the reason this was intermittent rather than simply broken.
   * The browser restores a position only for entries it believes it has seen
   * before, and it measures the page before this app has rendered into it — so
   * whether a route arrived at the top, in the middle, or at the very bottom
   * depended on how tall the *previous* page was and on whether the engine had
   * decided that entry was worth remembering. Doing it here means a new page
   * always starts at its top and a page returned to always starts where it was
   * left, which are the two rules a reader actually expects.
   */
  useEffect(() => {
    if (!('scrollRestoration' in window.history)) return;
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    return () => {
      window.history.scrollRestoration = previous;
    };
  }, []);

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      const saved = (event.state as { scrollY?: number } | null)?.scrollY;
      restoreTo.current = typeof saved === 'number' ? saved : 0;
      setRoute(parsePath(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  /**
   * Put the window where the new page belongs, after React has rendered it and
   * before the browser paints — so the page is never seen at the old scroll
   * position and then jumped.
   */
  useLayoutEffect(() => {
    if (window.location.pathname === shownPath.current) return;
    shownPath.current = window.location.pathname;
    const y = restoreTo.current;
    restoreTo.current = null;
    window.scrollTo(0, y ?? leftAt.current.get(window.location.pathname) ?? 0);
  }, [route]);

  const navigate = (next: Route, opts?: { replace?: boolean }) => {
    const path = pathFor(next);
    if (path !== window.location.pathname) {
      leftAt.current.set(window.location.pathname, window.scrollY);
      // Leave a note on the entry being left, so coming back to it lands where
      // the reader was rather than at the top of a four-screen ledger.
      window.history.replaceState(
        { ...(window.history.state as object | null), scrollY: window.scrollY },
        '',
        window.location.pathname,
      );
      if (opts?.replace) window.history.replaceState({ scrollY: 0 }, '', path);
      else window.history.pushState({ scrollY: 0 }, '', path);
    }
    setRoute(next);
  };

  return { route, navigate };
}
