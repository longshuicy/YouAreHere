import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { fetchIndex, fetchMeta, fetchUniverse, findByName, pickPuzzle, pickWorld } from './data/loader';
import type { IndexFile, PuzzleRecord, Universe, UniverseMeta } from './types';
import { initSession, makeReducer, worldIsKnown } from './engine/session';
import type { Session } from './engine/session';
import {
  absorbStart,
  absorbUnfinished,
  emptyResidence,
  isComplete,
  loadActiveWorld,
  loadResidences,
  nameLastNode,
  pickNextStart,
  progressOf,
  saveActiveWorld,
  saveResidences,
  unnamedCount,
  wakeInResidence,
  type Residence,
  type WorldProgress,
} from './engine/residence';
import type { StartLinks } from './render/MarginLinks';
import { cardinal, project, standingOf, withHorizon } from './graph/project';
import { suggestNames } from './engine/names';
import { useRadialLayout } from './graph/layout';
import { blurbFor, familiarityFor, unscoredWorlds } from './data/worlds';
import { KeyOverlay } from './render/KeyOverlay';
import { useRoute } from './engine/route';
import { Gallery } from './gallery/Gallery';
import { ColdOpen } from './screens/ColdOpen';
import { ChooseWorld } from './screens/ChooseWorld';
import { Explore } from './screens/Explore';
import { Guess } from './screens/Guess';
import { Reveal } from './screens/Reveal';

type Boot =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; index: IndexFile; universe: Universe; puzzle: PuzzleRecord };

/** The opening guess at whether this player reads the Chinese classics.
 *
 * A guess, and a cheap one: it only tilts which world comes up first, so being
 * wrong costs a re-roll. A stored answer always wins, because the player saying
 * so outranks what their browser is configured in.
 */
function readsChineseByDefault(): boolean {
  try {
    const stored = localStorage.getItem('reads-chinese-classics');
    if (stored !== null) return stored === 'true';
  } catch {
    // Private windows and blocked site data: fall through to the language list.
  }
  const languages = typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language]);
  return languages.some((tag) => typeof tag === 'string' && tag.toLowerCase().startsWith('zh'));
}

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
  /** Every world's map, paused or live. Persisted so a map survives a refresh
   * and a visit to another world; the current start does not. */
  const [residences, setResidences] = useState<Map<string, Residence>>(loadResidences);
  /** The map the player is living in right now. Null outside a residence. */
  const [residence, setResidence] = useState<Residence | null>(null);
  /** Residence finished: every node named, former selves marked. */
  const [residenceClosed, setResidenceClosed] = useState(false);
  /** The gallery is a companion piece, not a mode. It is offered from the cold
   * open and from the reveal, and never as a way to avoid playing — see
   * docs/The topology gallery.md, which argued for keeping it strictly behind a
   * finished run and has been relaxed: the case for the gate was that reading
   * anonymous worlds first teaches you to read them as data, but a companion
   * piece nobody can find is not a companion to anything.
   *
   * Routed rather than a plain flag: the gallery, a world's card and a
   * character's page are each a real address now, so a link into one from
   * outside — or the back button leaving one — behaves the way any other page
   * on the web does. A running puzzle never appears here; see `Route`. */
  const { route, navigate } = useRoute();
  const showGallery = route.screen !== 'game';
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
  /** Whether to treat the Chinese classics as books this player can name.
   *
   * The familiarity bands are written for an English-speaking player, which puts
   * 三國演義 and 水滸傳 down with Cymbeline — right for a stranger, wrong for
   * half the people likely to open this. Defaulted from the browser's languages
   * and meant to be overridable; the setting is the player's claim about
   * themselves, not a guess the app gets to keep making.
   */
  const [readsChineseClassics, setReadsChineseClassics] = useState(readsChineseByDefault);
  /** What `pickWorld` weighs a world's nameability by. */
  const familiarityOf = (world: { id: string }) => familiarityFor(world.id, readsChineseClassics);
  /** The last few starts served, so the same setting does not keep producing the
   * same stranger. A ref rather than state: it is read at the moment a waking is
   * drawn and never rendered, so it must not go stale in a closure and must not
   * cause a re-render when it changes. */
  const recentPuzzles = useRef<string[]>([]);
  const remember = (puzzleId: string) => {
    recentPuzzles.current = [puzzleId, ...recentPuzzles.current.filter((id) => id !== puzzleId)].slice(0, 12);
  };

  /** Put a world's map on the shelf, replacing whatever it held for that world. */
  const shelve = (next: Residence) => {
    const all = new Map(residences).set(next.universe, next);
    setResidences(all);
    saveResidences(all);
  };

  /** Live in this map: a refresh comes back to it. */
  const enterResidence = (next: Residence) => {
    setResidence(next);
    saveActiveWorld(next.universe);
  };

  /** Stop living in the current map. The map itself stays on the shelf. */
  const leaveResidence = () => {
    setResidence(null);
    setResidenceClosed(false);
    saveActiveWorld(null);
  };

  useEffect(() => {
    (async () => {
      try {
        const index = await fetchIndex();
        const unscored = unscoredWorlds(index.universes.map((u) => u.id));
        if (unscored.length > 0) {
          console.warn(`No familiarity band for: ${unscored.join(', ')} — see data/worlds.ts`);
        }

        // Land back in the world the player was living in before the refresh.
        const activeId = loadActiveWorld();
        const saved = activeId ? loadResidences().get(activeId) : undefined;
        const activeEntry = saved ? index.universes.find((u) => u.id === saved.universe) : undefined;
        if (saved && activeEntry) {
          const universe = await fetchUniverse(activeEntry.file);
          const puzzle = isComplete(universe, saved) ? null : pickNextStart(universe, saved);
          if (puzzle) {
            remember(puzzle.id);
            setBoot({ status: 'ready', index, universe, puzzle });
            setResidence(saved);
            setSession(wakeInResidence(universe, puzzle, saved));
            setLoaded(new Map([[universe.id, universe]]));
            for (const other of index.universes) {
              if (other.id === universe.id) continue;
              fetchUniverse(other.file)
                .then((u) => setLoaded((prev) => new Map(prev).set(u.id, u)))
                .catch(() => {});
            }
            return;
          }
        }
        saveActiveWorld(null);

        const opening = readsChineseByDefault();
        const entry = pickWorld(index.universes, 1, index.easeBuckets, (world) =>
          familiarityFor(world.id, opening),
        );
        if (!entry) throw new Error('No universes in index.json');
        const universe = await fetchUniverse(entry.file);
        const puzzle = pickPuzzle(universe, 1, recentPuzzles.current);
        if (!puzzle) throw new Error(`${universe.id} has no playable starts`);
        remember(puzzle.id);
        setBoot({ status: 'ready', index, universe, puzzle });
        setSession(initSession(universe, puzzle));
        setLoaded(new Map([[universe.id, universe]]));

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
    const visible = project(universe, session.known, session.you);
    if (session.phase !== 'cold') return visible;
    // The cold open is the opening frame and nothing else. A residence's
    // carried map waits for Begin; on this screen it is only a crowd of names.
    const opening = {
      ...visible,
      nodes: visible.nodes.filter((n) => !n.faded),
      edges: visible.edges.filter((e) => !e.faded),
    };
    return withHorizon(universe, session.you, opening);
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
    // One waking, one registry: the world and the puzzle together, so a re-roll
    // in the same world starts from a clean sheet too.
    session ? `${session.universe}:${session.puzzleId}` : 'none',
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
    const above = standingOf(universe, session.you) - 1;
    if (above === 0) return 'No one is in more of this world than you.';
    return `Only ${cardinal(above)} ${above === 1 ? 'person' : 'people'} here are in more of this world than you.`;
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

  /** Each mapped world's progress, sized against its cast from the index so it
   * is available before that world's own file has loaded. */
  const progress = useMemo(() => {
    const out = new Map<string, WorldProgress>();
    if (boot.status !== 'ready') return out;
    for (const entry of boot.index.universes) {
      const r = residences.get(entry.id);
      if (r) out.set(entry.id, progressOf(r, entry.nodes));
    }
    return out;
  }, [boot, residences]);

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

  /**
   * This world's map with the current round folded in, or null when the round
   * has nothing the map may keep.
   *
   * A round that reached its reveal adds the person found. A round left
   * unfinished keeps what it bought — but only once the world is known, because
   * putting an unnamed world on the shelf would show its title, and progress,
   * in the chooser.
   */
  const worldKnownHere = residence !== null || session.phase === 'reveal' || worldIsKnown(session);

  const roundAsMap = (): Residence | null => {
    const base = residence ?? residences.get(universe.id) ?? null;
    if (residenceClosed) return base;
    if (session.phase === 'reveal') {
      return absorbStart(base ?? emptyResidence(universe), session, nameOf(session.you));
    }
    if (residence || worldIsKnown(session)) {
      return absorbUnfinished(base ?? emptyResidence(universe), session);
    }
    return null;
  };

  /** A shuffle: a new stranger, and now genuinely a new world when more than
   * one is loaded. Nothing carries into the new round; the world being left
   * keeps what this round earned on its map. A new world opens on the cold
   * open, where the scale and the chooser live. */
  const wakeElsewhere = () => {
    if (boot.status !== 'ready') return;
    const kept = roundAsMap();
    if (kept) shelve(kept);
    leaveResidence();
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
      (world) => familiarityOf(world.universe),
    )!.universe;
    const puzzle = pickPuzzle(next, targetEase, recentPuzzles.current);
    if (!puzzle) return;
    remember(puzzle.id);
    setBoot({ ...boot, universe: next, puzzle });
    setSession(initSession(next, puzzle));
  };

  /**
   * Somebody else, in this world, straight into play.
   *
   * Available from every screen. Whatever the current round earned goes onto
   * this world's map first. While the world is still unnamed there is no map to
   * keep — it would give the world away — so this only draws another stranger
   * in the same unnamed world.
   */
  const startInThisWorld = () => {
    if (boot.status !== 'ready') return;
    setChoosing(false);

    if (!worldKnownHere) {
      const puzzle = pickPuzzle(universe, targetEase, [session.puzzleId, ...recentPuzzles.current]);
      if (!puzzle) return;
      remember(puzzle.id);
      setBoot({ ...boot, puzzle });
      setSession({ ...initSession(universe, puzzle), phase: 'explore' });
      return;
    }

    const base = residence ?? residences.get(universe.id) ?? emptyResidence(universe);
    const alreadyFinished = isComplete(universe, base);
    let next = roundAsMap() ?? base;

    // A finished world has nothing left to find, so starting in it again is an
    // ordinary round with the world already settled.
    if (alreadyFinished) {
      leaveResidence();
      const puzzle = pickPuzzle(universe, targetEase, recentPuzzles.current);
      if (!puzzle) return;
      remember(puzzle.id);
      setBoot({ ...boot, puzzle });
      setSession({ ...initSession(universe, puzzle, { worldChosen: true }), phase: 'explore' });
      return;
    }

    // This round named the last of them: the closing screen, now.
    if (isComplete(universe, next)) {
      shelve(next);
      setResidence(next);
      saveActiveWorld(null);
      setResidenceClosed(true);
      setSession({ ...session, phase: 'reveal' });
      return;
    }

    const puzzle = pickNextStart(universe, next);
    if (!puzzle) return;

    // One stranger left, and the player is provably them: the guess is free.
    if (unnamedCount(universe, next.named) === 1) {
      next = nameLastNode(universe, next);
      shelve(next);
      setResidence(next);
      saveActiveWorld(null);
      setResidenceClosed(true);
      setBoot({ ...boot, puzzle });
      setSession({ ...wakeInResidence(universe, puzzle, next), phase: 'reveal' });
      return;
    }

    remember(puzzle.id);
    shelve(next);
    enterResidence(next);
    setResidenceClosed(false);
    setBoot({ ...boot, puzzle });
    setSession({ ...wakeInResidence(universe, puzzle, next), phase: 'explore' });
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
  const redraw = async (ease: number, reads: boolean) => {
    if (boot.status !== 'ready') return;
    // A chosen world stays chosen: the slider only redraws the stranger
    // inside it. Familiarity is a tilt on *which book* is drawn, so it
    // must not run once the player has named one. Residence owns the
    // stranger once it has begun — the slider is not offered there.
    if (residence) return;
    const locked = session.worldChosen ? universe : null;
    try {
      let nextUniverse = locked;
      if (!nextUniverse) {
        const entry = pickWorld(boot.index.universes, ease, boot.index.easeBuckets, (world) =>
          familiarityFor(world.id, reads),
        );
        if (!entry) return;
        nextUniverse = loaded.get(entry.id) ?? (await fetchUniverse(entry.file));
      }
      const puzzle = pickPuzzle(nextUniverse, ease, recentPuzzles.current);
      if (!puzzle) return;
      remember(puzzle.id);
      setLoaded((prev) => (prev.has(nextUniverse.id) ? prev : new Map(prev).set(nextUniverse.id, nextUniverse)));
      setBoot({ ...boot, universe: nextUniverse, puzzle });
      setSession(initSession(nextUniverse, puzzle, { worldChosen: Boolean(locked) }));
    } catch {
      // Keep the waking already on screen rather than emptying the stage.
    }
  };

  const chooseEase = async (next: number) => {
    setTargetEase(next);
    await redraw(next, readsChineseClassics);
  };

  /** Said once and remembered, because it is a fact about the player and not a
   * setting for this waking — and because the browser's language list is a guess
   * that should stop being made as soon as they have answered it themselves.
   *
   * Redraws for the same reason the scale does: the stranger on the stage has
   * already been drawn, so a change that only took effect on the *next* waking
   * would look like it did nothing. */
  const chooseReadsChineseClassics = async (next: boolean) => {
    setReadsChineseClassics(next);
    try {
      localStorage.setItem('reads-chinese-classics', String(next));
    } catch {
      // Blocked site data: the answer holds for this session and is asked again.
    }
    if (session.worldChosen) return;
    await redraw(targetEase, next);
  };

  const chooseWorld = async (entry: { id: string; file: string }) => {
    if (boot.status !== 'ready' || pendingWorld) return;
    setPendingWorld(entry.id);
    try {
      const next = loaded.get(entry.id) ?? (await fetchUniverse(entry.file));
      setLoaded((prev) => (prev.has(next.id) ? prev : new Map(prev).set(next.id, next)));

      // A world with a paused map resumes it rather than starting cold.
      const paused = residences.get(next.id);
      if (paused && !isComplete(next, paused)) {
        const resumed = pickNextStart(next, paused);
        if (resumed) {
          remember(resumed.id);
          enterResidence(paused);
          setResidenceClosed(false);
          setBoot({ ...boot, universe: next, puzzle: resumed });
          setSession(wakeInResidence(next, resumed, paused));
          setChoosing(false);
          return;
        }
      }

      const puzzle = pickPuzzle(next, targetEase, recentPuzzles.current);
      if (!puzzle) return;
      remember(puzzle.id);
      leaveResidence();
      setBoot({ ...boot, universe: next, puzzle });
      // Stay on the cold open: the story is settled, the stranger is not.
      // Begin is still the commit; the scale can still redraw who you wake as.
      setSession(initSession(next, puzzle, { worldChosen: true }));
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
   * not require finishing — or giving up on — the puzzle first. Pauses the
   * current world's map. */
  const startAgain = () => {
    setChoosing(false);
    wakeElsewhere();
  };

  const startLinks: StartLinks = {
    onStartAgain: startAgain,
    onStartHere: startInThisWorld,
    hereTitle: worldKnownHere ? universe.title : null,
  };

  const lastNode =
    Boolean(residence) &&
    universe != null &&
    residence != null &&
    unnamedCount(universe, residence.named) === 1 &&
    !residence.named.has(session.you);

  const beginFromCold = () => {
    if (!session) return;
    // The last unnamed node: the player is provably that person. Free guess.
    if (lastNode && residence) {
      const named = new Map(session.known.named);
      const name = universe.nodes.find((n) => n.i === session.you)?.n ?? '';
      named.set(session.you, name);
      const recognised = new Set(session.known.recognised);
      recognised.add(session.you);
      let next = absorbStart(residence, {
        ...session,
        known: { ...session.known, named, recognised },
        ledger: session.ledger,
      });
      // The free last start costs nothing.
      if (next.starts.length > 0 && next.selves[next.selves.length - 1] === session.you) {
        next = { ...next, starts: [...next.starts.slice(0, -1), 0] };
      }
      next = nameLastNode(universe, next);
      shelve(next);
      setResidence(next);
      saveActiveWorld(null);
      setResidenceClosed(true);
      setSession({
        ...session,
        phase: 'reveal',
        known: { ...session.known, named: next.named, recognised },
      });
      return;
    }
    setSession({ ...session, phase: 'explore' });
  };

  let screen: ReactNode;
  switch (session.phase) {
    case 'cold':
      screen = choosing ? (
        <ChooseWorld
          universes={boot.index.universes}
          progress={progress}
          pending={pendingWorld}
          onChoose={chooseWorld}
          onCancel={() => setChoosing(false)}
          onOpenKey={openKey}
        />
      ) : (
        <ColdOpen
          graph={graph}
          positions={positions}
          session={session}
          worldTitle={session.worldChosen || residence ? universe.title : null}
          again={Boolean(residence)}
          lastNode={lastNode}
          onBegin={beginFromCold}
          onChooseWorld={() => setChoosing(true)}
          targetEase={targetEase}
          onChooseEase={chooseEase}
          readsChineseClassics={readsChineseClassics}
          onReadsChineseClassics={chooseReadsChineseClassics}
          onOpenGallery={() => navigate({ screen: 'gallery' })}
        />
      );
      break;
    case 'explore':
      screen = (
        <Explore
          graph={graph}
          positions={positions}
          session={session}
          residence={residence}
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
          startLinks={startLinks}
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
          startLinks={startLinks}
        />
      );
      break;
    case 'reveal': {
      screen = (
        <Reveal
          session={session}
          universe={universe}
          meta={meta}
          residence={residence ?? residences.get(universe.id) ?? null}
          living={residence !== null}
          closed={residenceClosed}
          startLinks={startLinks}
          onOpenGallery={() => navigate({ screen: 'gallery' })}
          onOpenCharacter={(i) => navigate({ screen: 'gallery-character', worldId: universe.id, i })}
          onOpenWorld={() => navigate({ screen: 'gallery-world', worldId: universe.id })}
          onOpenTwin={(worldId, name) => {
            const target = loaded.get(worldId);
            const i = target ? findByName(target, name) : null;
            if (i != null) navigate({ screen: 'gallery-character', worldId, i });
          }}
        />
      );
      break;
    }
    default:
      screen = null;
  }

  if (showGallery) {
    return (
      <Gallery
        universes={[...loaded.values()]}
        progress={progress}
        route={route}
        navigate={navigate}
        startLinks={{
          ...startLinks,
          onStartAgain: () => {
            navigate({ screen: 'game' });
            startAgain();
          },
          onStartHere: () => {
            navigate({ screen: 'game' });
            startInThisWorld();
          },
        }}
      />
    );
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
