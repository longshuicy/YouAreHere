import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { fetchIndex, fetchMeta, fetchUniverse, pickPuzzle } from './data/loader';
import type { IndexFile, PuzzleRecord, Universe, UniverseMeta } from './types';
import { initSession, makeReducer } from './engine/session';
import type { Session } from './engine/session';
import { project } from './graph/project';
import { useRadialLayout } from './graph/layout';
import { blurbFor } from './data/worlds';
import { KeyOverlay } from './render/KeyOverlay';
import { ColdOpen } from './screens/ColdOpen';
import { Explore } from './screens/Explore';
import { Guess } from './screens/Guess';
import { Reveal } from './screens/Reveal';

type Boot =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; index: IndexFile; universe: Universe; puzzle: PuzzleRecord };

export default function App() {
  const [boot, setBoot] = useState<Boot>({ status: 'loading' });
  const [session, setSession] = useState<Session | null>(null);
  const [meta, setMeta] = useState<UniverseMeta | null>(null);
  const [showKey, setShowKey] = useState(false);
  /** Every universe fetched so far, including the one being played. The guess
   * screen draws its story list and its type-ahead from all of them. */
  const [loaded, setLoaded] = useState<Map<string, Universe>>(new Map());

  useEffect(() => {
    (async () => {
      try {
        const index = await fetchIndex();
        const entry = index.universes[Math.floor(Math.random() * index.universes.length)];
        if (!entry) throw new Error('No universes in index.json');
        const universe = await fetchUniverse(entry.file);
        const puzzle = pickPuzzle(universe);
        setBoot({ status: 'ready', index, universe, puzzle });
        setSession(initSession(universe, puzzle));
        setLoaded(new Map([[universe.id, universe]]));

        // The rest load in the background: the type-ahead must draw from every
        // story so the list never reveals how large one book's cast is, but the
        // first frame should not wait on graphs the player cannot see yet.
        for (const other of index.universes) {
          if (other.id === universe.id) continue;
          fetchUniverse(other.file)
            .then((u) => setLoaded((prev) => new Map(prev).set(u.id, u)))
            .catch(() => {});
        }
      } catch (err) {
        setBoot({ status: 'error', message: err instanceof Error ? err.message : String(err) });
      }
    })();
  }, []);

  const universe = boot.status === 'ready' ? boot.universe : null;
  const reduce = useMemo(() => (universe ? makeReducer(universe) : null), [universe]);

  const dispatch = (action: Parameters<NonNullable<typeof reduce>>[1]) => {
    if (!reduce || !session) return;
    setSession(reduce(session, action));
  };

  const graph = useMemo(() => {
    if (!universe || !session) return null;
    return project(universe, session.known, session.you);
  }, [universe, session]);

  // Hooks must run unconditionally; guard inside instead of early-returning above.
  const positions = useRadialLayout(
    graph ?? { you: 0, nodes: [], edges: [] },
    session?.known ?? { visible: new Set(), expanded: new Set(), facts: new Set(), named: new Map(), hop: new Map(), parent: new Map() },
  );

  // The enrichment sidecar is fetched the first time it is actually needed —
  // when facts are bought mid-session, or when the reveal fires — and then kept.
  const needsMeta = session?.phase === 'reveal' || (session?.known.facts.size ?? 0) > 0;
  useEffect(() => {
    if (needsMeta && universe && !meta) {
      fetchMeta(universe.id).then(setMeta).catch(() => setMeta(null));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsMeta, universe]);

  const factLines = useMemo(() => {
    const out = new Map<number, string>();
    if (!session || !meta) return out;
    for (const i of session.known.facts) {
      const line = meta.nodes[String(i)]?.line;
      out.set(i, line ?? 'Nothing is recorded of them beyond the ties you can see.');
    }
    return out;
  }, [session, meta]);

  if (boot.status === 'loading') {
    return <div style={{ padding: 48 }}>Loading…</div>;
  }
  if (boot.status === 'error') {
    return <div style={{ padding: 48, color: 'var(--accent)' }}>Failed to load: {boot.message}</div>;
  }
  if (!session || !graph || !universe) {
    return <div style={{ padding: 48 }}>Loading…</div>;
  }

  const nameOf = (i: number) => universe.nodes.find((n) => n.i === i)?.n ?? '';

  const openKey = () => setShowKey(true);
  const revealAnswer = () => dispatch({ type: 'REVEAL' });

  /** A shuffle: a new stranger, and now genuinely a new world when more than
   * one is loaded. Nothing carries over — no names, no ledger. */
  const wakeElsewhere = () => {
    if (boot.status !== 'ready') return;
    const pool = [...loaded.values()];
    const others = pool.filter((u) => u.id !== universe.id);
    const next = (others.length > 0 ? others : pool)[
      Math.floor(Math.random() * (others.length > 0 ? others.length : pool.length))
    ];
    const puzzle = pickPuzzle(next);
    setMeta(null);
    setBoot({ ...boot, universe: next, puzzle });
    setSession(initSession(next, puzzle));
  };

  let screen: ReactNode;
  switch (session.phase) {
    case 'cold':
      screen = (
        <ColdOpen
          graph={graph}
          positions={positions}
          session={session}
          onBegin={() => setSession({ ...session, phase: 'explore' })}
          onOpenKey={openKey}
        />
      );
      break;
    case 'explore':
      screen = (
        <Explore
          graph={graph}
          positions={positions}
          session={session}
          onExpand={(i) => dispatch({ type: 'EXPAND', node: i })}
          onFacts={(i) => dispatch({ type: 'FACTS', node: i })}
          onName={(i) => dispatch({ type: 'NAME', node: i, name: nameOf(i) })}
          factLines={factLines}
          onOpenGuess={() => dispatch({ type: 'OPEN_GUESS' })}
          onOpenKey={openKey}
          onReveal={revealAnswer}
          universeTitle={universe.title}
          worldBlurb={blurbFor(universe)}
        />
      );
      break;
    case 'guess':
      screen = (
        <Guess
          graph={graph}
          positions={positions}
          session={session}
          loaded={loaded}
          onGuess={(universeId, query, idx) => dispatch({ type: 'GUESS', universe: universeId, characterQuery: query, characterIndex: idx })}
          onCancel={() => dispatch({ type: 'CLOSE_GUESS' })}
          onOpenKey={openKey}
          onReveal={revealAnswer}
        />
      );
      break;
    case 'reveal': {
      const puzzle = universe.puzzles.find((p) => p.id === session.puzzleId) ?? boot.puzzle;
      screen = (
        <Reveal
          session={session}
          universe={universe}
          puzzle={puzzle}
          meta={meta}
          onWakeElsewhere={wakeElsewhere}
          onOpenKey={openKey}
        />
      );
      break;
    }
    default:
      screen = null;
  }

  return (
    <>
      {screen}
      {showKey && (
        <KeyOverlay onClose={() => setShowKey(false)} />
      )}
    </>
  );
}
