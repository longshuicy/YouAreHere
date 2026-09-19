import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { fetchIndex, fetchMeta, fetchUniverse, pickPuzzle, pickWorld } from './data/loader';
import type { IndexFile, PuzzleRecord, Universe, UniverseMeta } from './types';
import { initSession, makeReducer } from './engine/session';
import type { Session } from './engine/session';
import { ordinal, project, standingOf } from './graph/project';
import { suggestNames } from './engine/names';
import { useRadialLayout } from './graph/layout';
import { blurbFor } from './data/worlds';
import { KeyOverlay } from './render/KeyOverlay';
import { ColdOpen } from './screens/ColdOpen';
import { ChooseWorld } from './screens/ChooseWorld';
import { Explore } from './screens/Explore';
import { Guess } from './screens/Guess';
import { Reveal } from './screens/Reveal';

type Boot =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; index: IndexFile; universe: Universe; puzzle: PuzzleRecord };

/** A loaded universe's own spread along the scale, for re-rolling mid-session
 * without going back to the index. */
function easeHistogram(universe: Universe, buckets: number): number[] {
  const histogram = new Array(buckets).fill(0);
  for (const puzzle of universe.puzzles) {
    const slot = Math.min(buckets - 1, Math.max(0, Math.floor((puzzle.ease ?? 0.5) * buckets)));
    histogram[slot] += 1;
  }
  return histogram;
}

export default function App() {
  const [boot, setBoot] = useState<Boot>({ status: 'loading' });
  const [session, setSession] = useState<Session | null>(null);
  /** Enrichment sidecars, keyed by universe id. A single `meta` slot used to
   * keep the wrong world's file after a re-roll: a fetch already in flight would
   * land after `setMeta(null)`, the new world's fetch would then skip because
   * meta was truthy, and a bought reading looked up against the wrong index. */
  const [metas, setMetas] = useState<Map<string, UniverseMeta>>(new Map());
  const [showKey, setShowKey] = useState(false);
  /** The world chooser, and which world it is currently fetching. `choosing`
   * is separate from the session phase because it replaces the cold open rather
   * than following it — there is no session for the chosen world yet. */
  const [choosing, setChoosing] = useState(false);
  const [pendingWorld, setPendingWorld] = useState<string | null>(null);
  /** Every universe fetched so far, including the one being played. The guess
   * screen draws its story list and its type-ahead from all of them. */
  const [loaded, setLoaded] = useState<Map<string, Universe>>(new Map());
  /** Where on the difficulty scale the player is asking to wake, 0 to 1.
   *
   * Not a difficulty setting in the sense the game design rules out: it changes
   * nothing about what an action costs or what is given away. It picks which
   * stranger you are offered, so difficulty stays a property of the start, which
   * is the thing that was actually scored. Starts findable.
   */
  const [targetEase, setTargetEase] = useState(1);
  /** The last few starts served, so the same setting does not keep producing the
   * same stranger. A ref rather than state: it is read at the moment a waking is
   * drawn and never rendered, so it must not go stale in a closure and must not
   * cause a re-render when it changes. */
  const recentPuzzles = useRef<string[]>([]);
  const remember = (puzzleId: string) => {
    recentPuzzles.current = [puzzleId, ...recentPuzzles.current.filter((id) => id !== puzzleId)].slice(0, 12);
  };

  useEffect(() => {
    (async () => {
      try {
        const index = await fetchIndex();
        const entry = pickWorld(index.universes, 1, index.easeBuckets);
        if (!entry) throw new Error('No universes in index.json');
        const universe = await fetchUniverse(entry.file);
        const puzzle = pickPuzzle(universe, 1, recentPuzzles.current);
        if (!puzzle) throw new Error(`${universe.id} has no playable starts`);
        remember(puzzle.id);
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
  const meta = universe ? (metas.get(universe.id) ?? null) : null;
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
    session?.known ?? {
      visible: new Set(),
      expanded: new Set(),
      facts: new Set(),
      named: new Map(),
      initials: new Map(),
      rejected: new Map(),
      recognised: new Set(),
      hop: new Map(),
      parent: new Map(),
    },
  );

  // Fetch this world's sidecar as soon as the world is known — not on the click
  // that buys a reading, and not gated on `explore`. One file, not the catalogue:
  // the cold open has the whole time until Begin for it to arrive, and a re-roll
  // keeps whatever has already landed so a later in-flight response cannot
  // overwrite a different world.
  const universeId = universe?.id;
  const haveMeta = useRef(new Set<string>());
  useEffect(() => {
    if (!universeId || haveMeta.current.has(universeId)) return;
    fetchMeta(universeId)
      .then((loaded) => {
        haveMeta.current.add(universeId);
        setMetas((prev) => new Map(prev).set(universeId, loaded));
      })
      .catch(() => {});
  }, [universeId]);

  /** Shared by the guess screen and the claim field, so a free move is not also
   * a spelling test. Scoped to every loaded story on purpose — a list scoped to
   * one book would report that book's cast size. */
  const suggest = useMemo(() => {
    const universes = [...loaded.values()];
    return (query: string) => suggestNames(universes, query);
  }, [loaded]);

  /** Whether the enrichment sidecar actually has a line for a node. In most of
   * the Shakespeare worlds it usually does not — four plays have none at all —
   * and Facts was charging 2 clues to say "nothing is recorded of them". */
  const hasFacts = useMemo(() => {
    return (i: number) => Boolean(meta?.nodes[String(i)]?.line);
  }, [meta]);

  const standing = useMemo(() => {
    if (!universe || !session) return '';
    return `You are the ${ordinal(standingOf(universe, session.you))} most connected person here.`;
  }, [universe, session]);

  const factLines = useMemo(() => {
    const out = new Map<number, string>();
    if (!session) return out;
    for (const i of session.known.facts) {
      out.set(
        i,
        meta?.nodes[String(i)]?.line ?? 'Nothing is recorded of them beyond the ties you can see.',
      );
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
  const revealStory = () => dispatch({ type: 'REVEAL_STORY' });

  /** A shuffle: a new stranger, and now genuinely a new world when more than
   * one is loaded. Nothing carries over — no names, no ledger. */
  const wakeElsewhere = () => {
    if (boot.status !== 'ready') return;
    const pool = [...loaded.values()];
    const others = pool.filter((u) => u.id !== universe.id);
    const buckets = boot.index.easeBuckets ?? 10;
    const next = pickWorld(
      (others.length > 0 ? others : pool).map((u) => ({
        universe: u,
        playable: { total: u.playable.length, histogram: easeHistogram(u, buckets) },
      })),
      targetEase,
      buckets,
    )!.universe;
    const puzzle = pickPuzzle(next, targetEase, recentPuzzles.current);
    if (!puzzle) return;
    remember(puzzle.id);
    setBoot({ ...boot, universe: next, puzzle });
    setSession(initSession(next, puzzle));
  };

  /** Wake in a named world. The story half of the question is settled before the
   * first frame, so the session is marked as such and the guess screen stops
   * asking it. The graph still opens on a stranger. */
  /** Re-draw the waking at a new point on the scale, from the cold open.
   *
   * The start has already been drawn by the time this screen is on the glass, so
   * moving the slider has to draw another one — otherwise it would only take
   * effect on the waking after the one the player is looking at.
   */
  const chooseEase = async (next: number) => {
    if (boot.status !== 'ready') return;
    setTargetEase(next);
    const entry = pickWorld(boot.index.universes, next, boot.index.easeBuckets);
    if (!entry) return;
    try {
      const universe = loaded.get(entry.id) ?? (await fetchUniverse(entry.file));
      const puzzle = pickPuzzle(universe, next, recentPuzzles.current);
      if (!puzzle) return;
      remember(puzzle.id);
      setLoaded((prev) => (prev.has(universe.id) ? prev : new Map(prev).set(universe.id, universe)));
      setBoot({ ...boot, universe, puzzle });
      setSession(initSession(universe, puzzle));
    } catch {
      // Keep the waking already on screen rather than emptying the stage.
    }
  };

  const chooseWorld = async (entry: { id: string; file: string }) => {
    if (boot.status !== 'ready' || pendingWorld) return;
    setPendingWorld(entry.id);
    try {
      const next = loaded.get(entry.id) ?? (await fetchUniverse(entry.file));
      const puzzle = pickPuzzle(next, targetEase, recentPuzzles.current);
      if (!puzzle) return;
      remember(puzzle.id);
      setLoaded((prev) => (prev.has(next.id) ? prev : new Map(prev).set(next.id, next)));
      setBoot({ ...boot, universe: next, puzzle });
      setSession({ ...initSession(next, puzzle, { worldChosen: true }), phase: 'explore' });
      setChoosing(false);
    } catch {
      // Leave the chooser open: the world simply did not load, and the player
      // can pick another or back out to a random waking.
    } finally {
      setPendingWorld(null);
    }
  };

  /** Leave this waking for another, from wherever the player happens to be. The
   * same act the reveal has always offered, hoisted into the margin so it does
   * not require finishing — or giving up on — the puzzle first. */
  const startAgain = () => {
    setChoosing(false);
    wakeElsewhere();
  };

  let screen: ReactNode;
  switch (session.phase) {
    case 'cold':
      screen = choosing ? (
        <ChooseWorld
          universes={boot.index.universes}
          pending={pendingWorld}
          onChoose={chooseWorld}
          onCancel={() => setChoosing(false)}
          onOpenKey={openKey}
          onStartAgain={startAgain}
        />
      ) : (
        <ColdOpen
          graph={graph}
          positions={positions}
          session={session}
          onBegin={() => setSession({ ...session, phase: 'explore' })}
          onChooseWorld={() => setChoosing(true)}
          targetEase={targetEase}
          onChooseEase={chooseEase}
          onOpenKey={openKey}
          onStartAgain={startAgain}
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
          onFacts={(i) => {
            if (!hasFacts(i)) return;
            dispatch({ type: 'FACTS', node: i });
          }}
          onName={(i) => dispatch({ type: 'NAME', node: i, name: nameOf(i) })}
          onClaim={(i, query) => dispatch({ type: 'CLAIM', node: i, query })}
          suggest={suggest}
          hasFacts={hasFacts}
          factLines={factLines}
          standing={standing}
          onOpenGuess={() => dispatch({ type: 'OPEN_GUESS' })}
          onOpenKey={openKey}
          onReveal={revealAnswer}
          onRevealStory={revealStory}
          onStartAgain={startAgain}
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
          onRevealStory={revealStory}
          onStartAgain={startAgain}
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
          onStartAgain={startAgain}
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
