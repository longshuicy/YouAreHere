/**
 * The experiment: fifty-two worlds with no ties between them, and one rule.
 *
 * This file is only the wiring. The rules are in sim.ts, every constant they
 * stand on is in constants.ts with the argument for its value, the drawing is
 * in Field.tsx, the live figures in metrics.ts and the expensive ones in
 * report.ts. docs/The experiment.md is what all of it is for.
 *
 * Three things run at once and on different clocks: the simulation, on a fixed
 * ten rounds a second; the force layout, in a worker, posting positions back
 * whenever it has them; and the drawing, once per animation frame from whatever
 * arrived last. Nothing waits for anything else.
 *
 * The chrome floats. The field is full-bleed and everything else sits over it
 * in four places, in strict order of how often a visitor needs it:
 *
 *   the rail      play, step, the year — touched constantly, never scrolls away
 *   top right     one number, its history, and whether the run is growing
 *   bottom left   who you woke as, and what is happening to them
 *   the stacks    one drawer at a time: the population, the rule, the worlds
 *
 * Everything else — the fifty-two world names, the eleven sliders, the
 * leaderboard, the end-of-run report — is a drawer. The screen is therefore
 * never more than one tier of detail deep, which is the thing it was before.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { fetchIndex, fetchUniverse } from '../data/loader';
import { mergeWorlds, worldHomes, type MergedWorld } from './world';
import {
  ALPHA_KICK,
  YEARS_PER_SECOND,
  LAYOUT_SYNC_ROUNDS,
  LOG_LIMIT,
  MAX_STEPS_PER_FRAME,
} from './constants';
import {
  DEFAULT_PARAMS,
  historySince,
  initState,
  earliestReplayYear,
  replayAt,
  step,
  type LogEvent,
  type Params,
  type SimState,
} from './sim';
import { measure, type LiveMetrics } from './metrics';
import { Field, type Positions, type TieView } from './Field';
import { capture, earliestYear, emptySnapshots, positionsAt, type Snapshots } from './snapshots';
import type { FromWorker, ToWorker } from './layout.worker';
import type { Universe } from '../types';

function randomSeed(): number {
  return 1 + Math.floor(Math.random() * 99998);
}

/** How far back the plots reconstruct. The thread shows `LOG_LIMIT` years; the
 * lines want the whole life the ledger still holds. */
const LIFE_LIMIT = 20_000;

/** How many marks the timeline will carry, and how many lines the story gets.
 * A thousand ticks on one bar is a texture, not a set of marks. */
const MARK_LIMIT = 24;
const STORY_LIMIT = 40;
/** How many of the story's lines a fading may take. */
const FADE_LINES = 3;

export type PresetId = 'close' | 'balanced' | 'far';

/**
 * Three places to start, named for what they do rather than for their numbers.
 *
 * Eleven dials is not a starting point, it is a destination. These set the four
 * that decide the character of a run — how far people reach, how hard they look
 * and how fast the unused fades — and leave saturation, the triadic bonus and
 * preferential attachment at their defaults, which is where fine-tuning finds
 * them.
 */
export const PRESETS: {
  id: PresetId;
  label: string;
  own: number;
  cross: number;
  p: number;
  decay: number;
  blurb: string;
}[] = [
  {
    id: 'close',
    label: 'Stay close',
    own: 50,
    cross: 5,
    p: 0.25,
    decay: 1.0,
    blurb: 'New ties grow mostly inside each person’s own camp. Worlds stay largely apart.',
  },
  {
    id: 'balanced',
    label: 'Balanced',
    own: 20,
    cross: 20,
    p: 0.35,
    decay: 1.5,
    blurb: 'Most new ties come through friends of friends; one in five jumps to another world.',
  },
  {
    id: 'far',
    label: 'Wander far',
    own: 10,
    cross: 50,
    p: 0.45,
    decay: 2.0,
    blurb: 'Half of all new ties cross between worlds, and old ones fade quickly.',
  },
];

/** How fast the years go by, as multiples of the base rate. */
const SPEEDS = [1, 4, 16];

/**
 * The dials behind the presets, each named for what it does to people.
 *
 * The symbol is kept beside the name rather than instead of it: λ means nothing
 * to a visitor and everything to the doc that explains the rule, and both of
 * them are reading this panel.
 */
const KNOBS: {
  key: 'p' | 'd0' | 'lambda' | 'alpha' | 'decay';
  label: string;
  sym: string;
  min: number;
  max: number;
  step: number;
  digits: number;
}[] = [
  { key: 'p', label: 'How hard people look for ties', sym: 'Formation pressure · p', min: 0, max: 1, step: 0.05, digits: 2 },
  { key: 'd0', label: 'When a life feels full', sym: 'Saturation · d₀', min: 5, max: 100, step: 1, digits: 0 },
  { key: 'lambda', label: 'Bonus for shared friends', sym: 'Triadic bonus · λ', min: 0, max: 1.5, step: 0.05, digits: 2 },
  { key: 'alpha', label: 'Pull of the well connected', sym: 'Preferential attachment · α', min: 0, max: 2, step: 0.05, digits: 2 },
  { key: 'decay', label: 'How fast unused ties fade', sym: 'Decay per year', min: 0, max: 3, step: 0.1, digits: 1 },
];

/** One round, as the figures read it. Kept so a replayed year can be given the
 * two rates it had, which are properties of a round rather than of a graph. */
interface Sample {
  loyalty: number;
  formed: number;
  cut: number;
}

export function Experiment() {
  /**
   * Every shipped world, fetched once.
   *
   * All fifty-two universe files together are about four megabytes — the bulk
   * of `data/` is the reveal-only sidecars, which nothing here reads. Fetching
   * the lot up front means changing the selection is a merge rather than a
   * round trip, which is what makes the picker usable as a thing to fiddle with
   * rather than a thing to commit to.
   */
  const [catalogue, setCatalogue] = useState<Universe[] | null>(null);
  /** Which worlds are in. Every one of them, until someone says otherwise. */
  const [chosen, setChosen] = useState<Set<string> | null>(null);
  /**
   * What the picker currently shows, which is not yet what is running.
   *
   * Every toggle used to commit immediately: re-merging 8,727 characters,
   * tearing down the layout worker and rebuilding the run, once per click. A
   * visitor dropping six worlds paid for six full rebuilds and watched the
   * drawing lurch six times, and each rebuild was a chance for the figures and
   * the population to disagree. Selecting is now free and only the commit
   * costs anything.
   */
  const [draft, setDraft] = useState<Set<string> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const [seed, setSeed] = useState(48291);
  const [runId, setRunId] = useState(0);
  const [running, setRunning] = useState(false);
  const [tieView, setTieView] = useState<TieView>('all');
  const [refit, setRefit] = useState(0);

  /** Once the walls are down, the setting-up column becomes the reading. */
  const [started, setStarted] = useState(false);
  /**
   * Which of the three setting-up columns is showing.
   *
   * The steps are the column, and two of them have more to say than a line:
   * the worlds take a list and the conditions take a panel of dials. They
   * replace the column rather than opening over it, with a way back, so the
   * map is never covered by the thing that decides what is on it.
   */
  const [panel, setPanel] = useState<'steps' | 'worlds' | 'conditions'>('steps');
  const [preset, setPreset] = useState<PresetId>('balanced');
  /** How fast the years go by. It changes how fast you watch, never what
   * happens — see `YEARS_PER_SECOND`. */
  const [speed, setSpeed] = useState(4);
  /** The figures behind the three on the shelf. */
  const [figuresOpen, setFiguresOpen] = useState(false);
  /** Five people is a reading; forty is a directory. */
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [worldQuery, setWorldQuery] = useState('');
  /** The world a loyalty row is pointing at. */
  const [lit, setLit] = useState<number | null>(null);
  /**
   * The year being replayed, or null for the live present.
   *
   * Scrubbing is strictly a way of looking: the simulation is not rewound and
   * nothing is discarded. Pressing play puts the view back on the head and
   * carries on from there.
   */
  const [scrub, setScrub] = useState<number | null>(null);
  /**
   * The figures for the year being replayed.
   *
   * Measured from the replayed graph rather than carried forward from the live
   * one: a panel that reads "year 3" beside today's tie count is worse than no
   * panel. Only the two realised rates come from the stored series, because a
   * rate is a thing that happened during a round rather than a property of the
   * graph the round left behind.
   */
  const [replayReading, setReplayReading] = useState<LiveMetrics | null>(null);

  /**
   * The live figures, carrying the world they were measured from.
   *
   * They used to be stored on their own, and a render landing between a
   * population change and the effect that rebuilds the run would hand a
   * fifty-two-entry `loyaltyByWorld` to a fifty-one-title world: the legend
   * sorted on `worldTitles[51]`, which was undefined, and the screen went
   * white. Keeping the two together means a stale reading is visibly stale
   * rather than silently mismatched, and the column simply waits a frame.
   */
  const [reading, setReading] = useState<{ of: MergedWorld; m: LiveMetrics } | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [follow, setFollow] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  /** Bumped every round so the readout and the thread redraw. */
  const [tick, setTick] = useState(0);

  const stateRef = useRef<SimState | null>(null);
  const posRef = useRef<Positions | null>(null);
  /**
   * What the drawing reads, which is the live state until it is a past one.
   *
   * Two refs rather than swapping which ref the field is handed: the draw loop
   * closes over the ref objects it was built with, so the thing that has to
   * change is what they point at, never which they are.
   */
  const viewStateRef = useRef<{ adj: Map<number, number>[] } | null>(null);
  const viewPosRef = useRef<Positions | null>(null);
  const scrubbingRef = useRef(false);
  const snapsRef = useRef<Snapshots>(emptySnapshots());
  const trackRef = useRef<HTMLSpanElement | null>(null);
  /** Where the pointer is over the map, so the hover card can sit beside the
   * person it names rather than in a corner of the frame. */
  const pointerRef = useRef({ x: 0, y: 0 });
  const workerRef = useRef<Worker | null>(null);
  const paramsRef = useRef(params);
  const runningRef = useRef(running);
  const speedRef = useRef(speed);
  paramsRef.current = params;
  runningRef.current = running;
  speedRef.current = speed;
  scrubbingRef.current = scrub !== null;

  /**
   * World loyalty, every round of this run.
   *
   * A falling number says nothing about how fast it is falling, and the rate is
   * the entire question. Kept in a ref because it is written ten times a second
   * and read once per render, and it is already the `tick` that redraws.
   */
  const historyRef = useRef<Sample[]>([]);
  /** Each world's own loyalty, every round, for the key's sparklines. */
  const worldHistoryRef = useRef<number[][]>([]);
  /**
   * What has already been read out of the ledger for the person being watched.
   *
   * See `historySince`: holding the sequence number turns a per-render walk of
   * the whole ring into a walk of the handful of entries written since the last
   * render. `state` is held too, so a reset — which builds a new ledger with
   * the sequence back at zero — invalidates it rather than appearing as "no new
   * events".
   */
  const lifeCacheRef = useRef<{
    who: number | null;
    state: SimState | null;
    seq: number;
    events: LogEvent[];
  }>({ who: null, state: null, seq: 0, events: [] });

  // ── Loading ───────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const index = await fetchIndex();
        const universes = await Promise.all(index.universes.map((e) => fetchUniverse(e.file)));
        if (!cancelled) {
          setCatalogue(universes);
          setChosen(new Set(universes.map((u) => u.id)));
          setDraft(new Set(universes.map((u) => u.id)));
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const world = useMemo(() => {
    if (!catalogue || !chosen) return null;
    const picked = catalogue.filter((u) => chosen.has(u.id));
    if (picked.length === 0) return null;
    return mergeWorlds(picked);
  }, [catalogue, chosen]);

  // ── The layout worker ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!world) return;
    const worker = new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<FromWorker>) => {
      if (event.data.type === 'pos') {
        posRef.current = { x: event.data.x, y: event.data.y };
        if (!scrubbingRef.current) viewPosRef.current = posRef.current;
      }
    };
    const homes = worldHomes(world);
    const init: ToWorker = {
      type: 'init',
      x: world.x0,
      y: world.y0,
      world: world.world,
      homeX: homes.x,
      homeY: homes.y,
    };
    // Copies, not transfers: `world` keeps its own starting coordinates so a
    // reset can put every character back where the story left them.
    worker.postMessage(init);
    posRef.current = { x: Float32Array.from(world.x0), y: Float32Array.from(world.y0) };
    viewPosRef.current = posRef.current;
    return () => {
      worker.postMessage({ type: 'stop' } satisfies ToWorker);
      worker.terminate();
      workerRef.current = null;
    };
  }, [world]);

  /**
   * Hand the layout the current graph.
   *
   * `force` is for the moments when it has to be right now — a run being built,
   * a population changing. Everything else goes on `LAYOUT_SYNC_ROUNDS`.
   */
  function sendLinks(force = false) {
    const state = stateRef.current;
    const worker = workerRef.current;
    if (!state || !worker) return;
    if (!force && state.round % LAYOUT_SYNC_ROUNDS !== 0) return;
    // The kick belongs here rather than on every round. The layout is only told
    // what changed on this cadence, so reheating it in between was asking it to
    // churn over news it did not have — and holding alpha permanently high, so
    // it never settled between syncs and the picture never stopped boiling.
    let count = 0;
    for (const row of state.adj) count += row.size;
    const triples = new Float32Array((count / 2) * 3);
    let k = 0;
    for (let u = 0; u < state.adj.length; u++) {
      for (const [v, s] of state.adj[u]) {
        if (v <= u) continue;
        triples[k++] = u;
        triples[k++] = v;
        triples[k++] = s;
      }
    }
    worker.postMessage({ type: 'links', triples } satisfies ToWorker, [triples.buffer]);
    worker.postMessage({ type: 'kick', alpha: ALPHA_KICK } satisfies ToWorker);
  }

  /** Set the live figures and keep the histories the plots are drawn from. */
  function readOff(state: SimState, w: MergedWorld) {
    const m = measure(state, w);
    setReading({ of: w, m });
    historyRef.current.push({ loyalty: m.worldLoyalty, formed: m.formed, cut: m.cut });
    const wh = worldHistoryRef.current;
    for (let i = 0; i < m.loyaltyByWorld.length; i++) {
      (wh[i] ??= []).push(m.loyaltyByWorld[i]);
    }
    setTick((t) => t + 1);
  }

  // ── Building a run ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!world) return;
    const state = initState(world, seed);
    // Nobody is followed until somebody is chosen. Waking a visitor up as a
    // stranger is the game's move; here, who you follow is the second of four
    // decisions and the column is built to ask for it.
    state.follow = null;
    stateRef.current = state;
    viewStateRef.current = state;
    snapsRef.current = emptySnapshots();
    setScrub(null);
    historyRef.current = [];
    worldHistoryRef.current = world.worldIds.map(() => []);
    setFollow(null);
    sendLinks(true);
    if (posRef.current) capture(snapsRef.current, 0, posRef.current);
    readOff(state, world);
    setRunning(false);
    setRefit((r) => r + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world, seed, runId]);

  // Watching changes nothing about the run — same seed, same history — so it is
  // pushed into the live state rather than rebuilding anything. The kept-up
  // tally belongs to the watch and so restarts with it; the history itself is
  // in the ledger and does not.
  useEffect(() => {
    const state = stateRef.current;
    if (!state) return;
    state.follow = follow;
    state.kept = [];
    setTick((t) => t + 1);
  }, [follow]);

  /** One year, by hand. */
  function advance() {
    const state = stateRef.current;
    if (!state || !world) return;
    if (scrub !== null) goToYear(null);
    setRunning(false);
    step(state, world, paramsRef.current);
    if (posRef.current) capture(snapsRef.current, state.round, posRef.current);
    sendLinks(true);
    readOff(state, world);
  }

  function finish() {
    setRunning(false);
  }

  // ── The clock ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!world) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const frame = (now: number) => {
      const state = stateRef.current;
      const dt = Math.min(now - last, 250);
      last = now;
      if (state && runningRef.current) {
        acc += dt;
        // Speed multiplies the rate and nothing else: the same seed gives the
        // same run at any of them, because it changes how fast you watch and
        // never what happens.
        const interval = 1000 / (YEARS_PER_SECOND * speedRef.current);
        let steps = 0;
        let done = false;
        // The cap is what stops a backgrounded tab coming back and running four
        // hundred rounds in one frame; it has to rise with the rate or sixteen
        // times would be four.
        const cap = Math.max(MAX_STEPS_PER_FRAME, speedRef.current);
        while (acc >= interval && steps < cap) {
          acc -= interval;
          steps++;
          step(state, world, paramsRef.current);
          // Per round, not per frame. A frame can carry several rounds, and
          // taking the picture once at the end of the batch left holes in the
          // scrubber at exactly the moments the machine was busiest. Rounds
          // inside one frame share the positions the layout had at the time,
          // which is not an approximation — the layout genuinely had not moved.
          if (posRef.current) capture(snapsRef.current, state.round, posRef.current);
          if (state.round >= paramsRef.current.years) {
            done = true;
            break;
          }
        }
        if (steps > 0) {
          sendLinks();
          readOff(state, world);
        }
        if (done) finish();
      } else {
        acc = 0;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world]);

  const matches = useMemo(() => {
    if (!world || query.trim().length < 2) return [];
    const q = query.trim().toLowerCase();
    const out: number[] = [];
    for (let i = 0; i < world.n && out.length < 8; i++) {
      if (world.name[i].toLowerCase().includes(q)) out.push(i);
    }
    return out;
  }, [world, query]);

  // A reading taken from a different population is not a reading of this one,
  // and while a past year is on screen the live one is not a reading of it
  // either.
  const live = reading && reading.of === world ? reading.m : null;
  const metrics = scrub !== null ? replayReading : live;

  const state = stateRef.current;
  // Belt as well as braces: a render can land between the world changing and
  // the effect above choosing a new character.
  const you = follow !== null && state && follow < state.adj.length ? follow : null;
  /**
   * The graph the person's panel is read from.
   *
   * The same one the drawing uses, so scrubbing back shows who they knew that
   * year rather than who they know now beside a heading that says otherwise.
   */
  const youAdj = viewStateRef.current?.adj ?? state?.adj;
  const yourTies =
    you !== null && youAdj ? [...youAdj[you].entries()].sort((a, b) => b[1] - a[1]) : [];
  const yourOutside =
    you !== null && world ? yourTies.filter(([v]) => world.world[v] !== world.world[you]).length : 0;

  /**
   * Everything the ledger has on you, read once.
   *
   * Both the thread and the two plots are built from it, and the scan is a
   * walk over a couple of hundred thousand contiguous ints — cheap, but not
   * cheap enough to do twice a render at ten renders a second.
   */
  const yourEventsAll = useMemo(() => {
    const st = stateRef.current;
    if (you === null || !st) return [];
    const cache = lifeCacheRef.current;
    // A different person, or a different run, is a different life: start over.
    if (cache.who !== you || cache.state !== st) {
      const fresh = historySince(st, you, 0, LIFE_LIMIT);
      lifeCacheRef.current = { who: you, state: st, seq: fresh.seq, events: fresh.events };
      return fresh.events;
    }
    const since = historySince(st, you, cache.seq, LIFE_LIMIT);
    if (since.events.length === 0) {
      cache.seq = since.seq;
      return cache.events;
    }
    const events = since.events.concat(cache.events).slice(0, LIFE_LIMIT);
    lifeCacheRef.current = { who: you, state: st, seq: since.seq, events };
    return events;
    // `tick` is the dependency that matters: the ledger is mutated in place, so
    // nothing about it changes identity when a round goes by.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [you, tick]);

  /**
   * Their life up to the year on screen.
   *
   * Replaying one person costs nothing that was not already here: their whole
   * history is a list of dated events, so a past year is that list with the
   * later dates dropped. Every entry is newest-first, so the cut is a prefix.
   */
  const yourEvents = useMemo(
    () => (scrub === null ? yourEventsAll : yourEventsAll.filter((e) => e.year <= scrub)),
    [yourEventsAll, scrub],
  );

  /**
   * Your ties and how many of them are from elsewhere, every year, rebuilt
   * backwards.
   *
   * Nothing records this as it happens, and nothing needs to: FORM and CUT are
   * the only two events that change either number, so walking the ledger back
   * from what is true now reconstructs the whole series exactly — including the
   * part that happened before you were being watched. A series kept forward
   * instead would start empty every time the watch moved, which is the thing
   * that made the old panel useless.
   */
  const yourLife = useMemo(() => {
    if (you === null || !state || !world) return { ties: [] as number[], home: [] as number[] };
    // Walked backwards from what is true now, so this is the live graph even
    // while a past year is on screen; the slice at the end is what makes it that
    // year's.
    const today = state.round;
    let degree = state.adj[you].size;
    let outside = 0;
    for (const v of state.adj[you].keys()) if (world.world[v] !== world.world[you]) outside++;

    const ties = new Array<number>(today + 1).fill(0);
    const home = new Array<number>(today + 1).fill(1);
    let year = today;
    for (const e of yourEventsAll) {
      // Everything from this event's year up to the last one we filled held the
      // values we are carrying.
      for (; year >= e.year; year--) {
        ties[year] = degree;
        home[year] = degree > 0 ? (degree - outside) / degree : 1;
      }
      const cross = world.world[e.other] !== world.world[you];
      // FADE is a strength crossing a mark, not a tie appearing or vanishing —
      // it must move neither count. Lumped in with CUT by an `else`, it was
      // undoing a cut that never happened, and a character with eighteen ties
      // and a few hundred quiet ones was reported as having started with a
      // hundred and ten.
      if (e.action === 'FORM') {
        degree--;
        if (cross) outside--;
      } else if (e.action === 'CUT') {
        degree++;
        if (cross) outside++;
      }
    }
    for (; year >= 0; year--) {
      ties[year] = degree;
      home[year] = degree > 0 ? (degree - outside) / degree : 1;
    }
    // Their two lines stop where the view does, for the same reason the
    // headline's does: the drawing and the trace should be telling the same
    // story about the same year.
    if (scrub !== null) {
      const to = Math.min(scrub, ties.length - 1) + 1;
      return { ties: ties.slice(0, to), home: home.slice(0, to) };
    }
    return { ties, home };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [you, tick, world, scrub]);

  /**
   * Your life so far, by year.
   *
   * Maintenance is counted rather than listed: a character with sixty ties
   * strengthens about ten of them a round, and flat, that buries the two
   * entries that change anything.
   */
  const yourDays: { year: number; events: LogEvent[]; kept: number }[] = [];
  if (you !== null && state) {
    const byDay = new Map<number, { year: number; events: LogEvent[]; kept: number }>();
    const order: number[] = [];
    for (const e of yourEvents.slice(0, LOG_LIMIT)) {
      let d = byDay.get(e.year);
      if (!d) {
        d = { year: e.year, events: [], kept: 0 };
        byDay.set(e.year, d);
        order.push(e.year);
      }
      d.events.push(e);
    }
    for (const k of state.kept) {
      const d = byDay.get(k.year);
      if (d) d.kept = k.n;
      else {
        byDay.set(k.year, { year: k.year, events: [], kept: k.n });
        order.push(k.year);
      }
    }
    order.sort((a, b) => b - a);
    for (const year of order) yourDays.push(byDay.get(year)!);
  }

  const liveYear = live ? live.round : 0;
  /** The headline's line stops where the view is, so the drawing and the trace
   * are telling the same story. */
  /**
   * One mark per year something happened to the person being followed.
   *
   * Their life, drawn along the run's own timeline — which is the thing a
   * progress bar is otherwise silent about. Taken from the ledger, so it costs
   * a pass over a list that is already in hand, and capped because a thousand
   * ticks on one bar is a texture rather than a set of marks.
   */
  const marks = useMemo(() => {
    if (!world || you === null) return [];
    const say = (e: LogEvent) => {
      const name = world.name[e.other];
      return e.action === 'FORM'
        ? `met ${name}`
        : e.action === 'CUT'
          ? `lost touch with ${name}`
          : `${name} fell below half strength`;
    };
    // Crossings first. At a lively setting one character can have a few hundred
    // events over two hundred years, and all of them ticked at once is a solid
    // red bar — a texture, which says less than three marks would. The ones
    // that are actually about this experiment are the ties that cross a wall,
    // so those get the room and the rest fill whatever is left.
    const crossing: LogEvent[] = [];
    const rest: LogEvent[] = [];
    for (const e of yourEventsAll) {
      (world.world[e.other] !== world.world[you] ? crossing : rest).push(e);
    }
    const seen = new Set<number>();
    const lit: { year: number; label: string }[] = [];
    const rest2: { year: number; label: string }[] = [];
    for (const e of crossing) {
      if (seen.has(e.year)) continue;
      seen.add(e.year);
      lit.push({ year: e.year, label: say(e) });
    }
    for (const e of rest) {
      if (seen.has(e.year)) continue;
      seen.add(e.year);
      rest2.push({ year: e.year, label: say(e) });
    }
    // Thinned by spreading, not by taking the newest.
    //
    // Taking the first two dozen off a newest-first list put every mark inside
    // the last stretch of the rail and left the rest of the life blank, which
    // is a picture of when the list was sorted rather than of when anything
    // happened. Crossings keep their places and the remainder is sampled at an
    // even stride across the whole of it.
    const room = Math.max(0, MARK_LIMIT - lit.length);
    const stride = rest2.length > room ? Math.ceil(rest2.length / Math.max(room, 1)) : 1;
    const thinned = room === 0 ? [] : rest2.filter((_, i) => i % stride === 0).slice(0, room);
    return [...lit, ...thinned].sort((a, b) => a.year - b.year);
  }, [yourEventsAll, world, you]);

  /**
   * Their story so far, in plain words.
   *
   * The same events the marks are made of, written out, newest first. A tie
   * forming across a wall is the thing the experiment is about, so it is the
   * one that names the world it came from.
   */
  const story = useMemo(() => {
    if (!world || you === null) return [];
    // A tie that went quiet and was then cut is a cut; the fading is not a
    // second piece of news about it, and at the end of a long run there are
    // enough of them to bury every meeting. So a fading is listed only while
    // the tie it belongs to is still there — which is the case where it is
    // genuinely the latest thing to have happened between two people.
    const alive = youAdj && you !== null ? youAdj[you] : null;
    // And only the latest one per person. A tie strengthened back above the
    // mark and allowed to fade again crosses it twice, and the same sentence
    // about the same friendship twice in a list is not two pieces of news.
    const faded = new Set<number>();
    let fades = 0;
    return yourEvents
      .filter((e) => {
        if (e.action !== 'FADE') return true;
        if (!alive?.has(e.other) || faded.has(e.other)) return false;
        faded.add(e.other);
        // A handful at most. Somebody with seventy ties has seventy of these
        // waiting, and a story that is nothing but friendships going quiet is
        // not the story of a wall coming down. The meetings and the partings
        // are what happened; a fading is a note in the margin.
        return ++fades <= FADE_LINES;
      })
      .slice(0, STORY_LIMIT)
      .map((e) => {
        const name = world.name[e.other];
        const away = world.world[e.other] !== world.world[you];
        const from = away ? `, from ${world.worldTitles[world.world[e.other]]}` : '';
        // Split around the name rather than written as one string, so the
        // person can carry the line and the rest of the sentence can be the
        // frame around them.
        return {
          year: e.year,
          name,
          before: e.action === 'FORM' ? 'Met ' : e.action === 'CUT' ? 'Lost touch with ' : '',
          after: e.action === 'FADE' ? ' fell below half strength.' : `${from}.`,
        };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yourEvents, world, you, tick]);

  const shownYear = scrub ?? liveYear;
  /** How far back the scrubber reaches: the oldest year still held in pictures. */
  /**
   * How far back the scrubber reaches.
   *
   * Two horizons, and the nearer one wins: the oldest year still held in
   * pictures, and the oldest the ledger can still replay the ties for. A
   * scrubber that offered a year neither could describe would simply refuse to
   * move when it got there.
   */
  const replayFloor = started
    ? Math.max(earliestYear(snapsRef.current), stateRef.current ? earliestReplayYear(stateRef.current) : 0)
    : 0;
  const span = Math.max(params.years, 1);
  const progress = Math.min(1, shownYear / span);


  /** Drag anywhere along the track to go to that year. */
  function beginScrub(event: React.PointerEvent) {
    const track = trackRef.current;
    const st = stateRef.current;
    if (!track || !st || st.round === 0) return;
    event.preventDefault();
    const toYear = (clientX: number) => {
      const rect = track.getBoundingClientRect();
      const t = (clientX - rect.left) / Math.max(rect.width, 1);
      const year = Math.round(t * Math.max(paramsRef.current.years, 1));
      return Math.max(earliestYear(snapsRef.current), Math.min(st.round, year));
    };
    goToYear(toYear(event.clientX));
    const move = (e: PointerEvent) => goToYear(toYear(e.clientX));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  /**
   * Put the view on a past year, or back on the present.
   *
   * Replaying is a view, not a rewind: the live state is untouched, so coming
   * back is free and nothing about the run depends on whether anyone looked.
   */
  function goToYear(year: number | null) {
    const st = stateRef.current;
    if (!st || !world) return;
    if (year === null || year >= st.round) {
      setScrub(null);
      setReplayReading(null);
      viewStateRef.current = st;
      viewPosRef.current = posRef.current;
      return;
    }
    const past = replayAt(world, st, year);
    const where = positionsAt(snapsRef.current, year);
    // Either half missing would be a confident drawing of something that never
    // happened, so the scrubber simply will not go there.
    if (!past || !where) return;
    setRunning(false);
    setScrub(year);
    viewStateRef.current = past;
    viewPosRef.current = where;

    const sample = historyRef.current[Math.min(year, historyRef.current.length - 1)];
    const m = measure({ ...st, adj: past.adj, round: year }, world);
    setReplayReading({ ...m, formed: sample?.formed ?? 0, cut: sample?.cut ?? 0 });
  }

  /** Somebody else with ties. A character sitting alone has no history to
   * read, and decay produces more of them than you would guess. */
  function wakeElsewhere() {
    const st = stateRef.current;
    if (!st || !world) return;
    const candidates: number[] = [];
    for (let i = 0; i < world.n; i++) if (st.adj[i].size > 0) candidates.push(i);
    if (candidates.length) setFollow(candidates[Math.floor(Math.random() * candidates.length)]);
  }

  /** Put the presets' four numbers into the rule, leaving the other three. */
  function applyPreset(id: PresetId) {
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return;
    setPreset(id);
    setParams((prev) => ({
      ...prev,
      own: p.own,
      cross: p.cross,
      fof: 100 - p.own - p.cross,
      p: p.p,
      decay: p.decay,
    }));
  }

  // After every hook, not before: an early return above the two life memos
  // changed the hook order on the one render where loading had failed, which
  // React answers by throwing out the whole tree.
  if (error) return <p className="xp-note">{error}</p>;

  const current = PRESETS.find((p) => p.id === preset) ?? PRESETS[1];
  /** The run has reached its last year; play offers another rather than more. */
  const ended = started && liveYear >= params.years;
  const youWorld = you !== null && world ? world.worldTitles[world.world[you]] : null;

  return (
    <div className="xp">
      {/* ── The shelf: three figures, and the rest behind a disclosure ───── */}
      <div className="xp-shelf">
        <Headline
          label="World loyalty"
          shown={metrics ? `${(metrics.worldLoyalty * 100).toFixed(1)}%` : '—'}
          note={started ? 'from 100.0' : undefined}
        />
        <Headline
          label="Cross-world ties"
          shown={metrics ? `${(metrics.crossShare * 100).toFixed(1)}%` : '—'}
        />
        {/* Components, said as what they are: at year zero every world is its
            own island, and the number falling is the walls coming down. */}
        <Headline
          label="Worlds apart"
          shown={metrics ? String(metrics.components) : '—'}
          note={world ? `of ${world.worldIds.length}` : undefined}
        />
        <button
          type="button"
          className="xp-allfigures"
          aria-expanded={figuresOpen}
          onClick={() => setFiguresOpen((o) => !o)}
        >
          <span className="xp-allfigures-label">All figures</span>
          <Caret open={figuresOpen} />
        </button>
      </div>

      {figuresOpen && metrics && (
        <div className="xp-figures-panel">
          <div className="xp-figures-grid">
            <Figure label="Ties" value={metrics.ties.toLocaleString()} />
            <Figure label="Components" value={String(metrics.components)} />
            <Figure label="Mean degree" value={metrics.meanDegree.toFixed(2)} />
            <Figure label="Max degree" value={String(metrics.maxDegree)} />
          </div>
          {started && world && (
            <>
              <div className="xp-figures-head">
                <span className="mono xp-label strong">Loyalty by world</span>
                <span className="mono xp-label">Most mixed first</span>
              </div>
              {/* Hovering a row lights that world on the map; the colour of the
                  dot is the only thing joining a name to a blob. */}
              <div className="xp-loyalty">
                {metrics.loyaltyByWorld
                  .map((value, w) => ({ value, w }))
                  .sort((x, y) => x.value - y.value)
                  .map(({ value, w }) => (
                    <div
                      key={w}
                      className={`xp-loyalty-row${lit === w ? ' lit' : ''}`}
                      onPointerEnter={() => setLit(w)}
                      onPointerLeave={() => setLit((l) => (l === w ? null : l))}
                    >
                      <i className="xp-dot" style={{ background: world.worldAccents[w] }} />
                      <span className="xp-world-name">{world.worldTitles[w]}</span>
                      <span className="xp-bar">
                        <span className="xp-bar-fill" style={{ width: `${value * 100}%` }} />
                      </span>
                      <span className="mono xp-value">{(value * 100).toFixed(0)}%</span>
                    </div>
                  ))}
              </div>
            </>
          )}
          <p className="xp-note quiet">Or hover any world on the map.</p>
        </div>
      )}

      {/* ── The map ──────────────────────────────────────────────────────── */}
      <div
        className="xp-stage"
        onPointerMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          pointerRef.current = { x: e.clientX - box.left, y: e.clientY - box.top };
        }}
      >
        {world ? (
          <Field
            world={world}
            stateRef={viewStateRef}
            positionsRef={viewPosRef}
            follow={you}
            highlight={lit}
            tieView={tieView}
            refit={refit}
            onHover={setHover}
            onPick={setFollow}
          />
        ) : (
          <div className="xp-field" />
        )}

        <div className="xp-draw-controls" role="group" aria-label="What is drawn">
          <span className="mono xp-label">Ties</span>
          {(['all', 'cross', 'none'] as TieView[]).map((v) => (
            <button
              key={v}
              type="button"
              className={`mono xp-chip${tieView === v ? ' on' : ''}`}
              aria-pressed={tieView === v}
              onClick={() => setTieView(v)}
            >
              {v}
            </button>
          ))}
          <span className="xp-chip-rule" />
          <button
            type="button"
            className="mono xp-chip xp-chip-icon"
            onClick={() => setRefit((r) => r + 1)}
            aria-label="Refit the view"
          >
            Refit
            <RefitGlyph />
          </button>
        </div>

        {/* Beside whoever is under the pointer, which is where the board puts
            it: a card in the corner names somebody without saying which one. */}
        {hover !== null && hover !== you && world && youAdj && hover < youAdj.length && (
          <div
            className="xp-hover"
            style={{ left: pointerRef.current.x + 16, top: pointerRef.current.y + 14 }}
          >
            <div className="xp-hover-name">{world.name[hover]}</div>
            <div className="mono xp-label">{world.worldTitles[world.world[hover]]}</div>
            <div className="mono xp-hover-do">
              {started ? `${youAdj[hover].size} ties` : 'Click to follow'}
            </div>
          </div>
        )}
      </div>

      {/* ── Under the map: a caption before the run, the transport after ── */}
      {started ? (
        <div className="xp-transport-bar">
          <div className="xp-transport-row">
            <button
              type="button"
              className="xp-round on"
              aria-label={
                ended
                  ? 'Run again with the same settings'
                  : running
                    ? 'Pause'
                    : scrub !== null
                      ? 'Back to now and play'
                      : 'Play'
              }
              onClick={() => {
                if (ended) {
                  setRunId((r) => r + 1);
                  setRunning(true);
                  return;
                }
                if (scrub !== null) {
                  goToYear(null);
                  setRunning(true);
                  return;
                }
                setRunning((r) => !r);
              }}
            >
              {ended ? <AgainGlyph /> : running ? <PauseGlyph /> : <PlayGlyph />}
            </button>
            {ended && <span className="mono xp-label">Run again</span>}
            {!ended && (
              <button
                type="button"
                className="xp-round"
                aria-label="Step forward one year"
                onClick={advance}
              >
                <StepGlyph />
              </button>
            )}
            <div className="xp-dayread mono">
              Year <span className="xp-dayread-n">{shownYear}</span> / {params.years}
            </div>
            <span
              className="xp-track"
              ref={trackRef}
              role="slider"
              tabIndex={0}
              aria-label="Year"
              aria-valuemin={replayFloor}
              aria-valuemax={liveYear}
              aria-valuenow={shownYear}
              onPointerDown={beginScrub}
              onKeyDown={(e) => {
                const d = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
                if (d === 0) return;
                e.preventDefault();
                goToYear(Math.max(replayFloor, Math.min(liveYear, shownYear + d)));
              }}
            >
              <span className="xp-track-done" style={{ width: `${progress * 100}%` }} />
              {/* One mark for each year something happened to the person being
                  followed: their life, drawn along the run's own timeline. */}
              {/*
                * Marks, not buttons.
                *
                * They were buttons that swallowed the pointer so a click could
                * jump to that year — and two dozen twelve-pixel hit targets
                * strung along a track is a fence: most of the rail could not be
                * grabbed at all, which is why dragging back did nothing. The
                * years they mark are all reachable by dragging to them, and the
                * story lines below jump to them by name.
                */}
              {marks.map((m) => (
                <span
                  key={`${m.year}-${m.label}`}
                  className="xp-mark"
                  style={{ left: `${(m.year / Math.max(params.years, 1)) * 100}%` }}
                  title={`Year ${m.year} · ${m.label}`}
                />
              ))}
              <span className="xp-track-knob" style={{ left: `${progress * 100}%` }} />
            </span>
            {!ended && (
            <div className="xp-speeds" role="group" aria-label="Speed">
              {SPEEDS.map((x) => (
                <button
                  key={x}
                  type="button"
                  className={`mono xp-speed${speed === x ? ' on' : ''}`}
                  aria-pressed={speed === x}
                  onClick={() => setSpeed(x)}
                >
                  {x}×
                </button>
              ))}
            </div>
            )}
            {ended && (
              <button
                type="button"
                className="mono xp-link"
                onClick={() => {
                  setStarted(false);
                  setPanel('steps');
                  setRunId((r) => r + 1);
                }}
              >
                Change settings
              </button>
            )}
          </div>
          <div className="xp-transport-note">
            {ended ? (
              <span className="mono xp-label strong">Run complete · same settings, new run</span>
            ) : (
              metrics && (
                <span className="mono xp-label">
                  This year +{metrics.formed} formed · −{metrics.cut} cut
                </span>
              )
            )}
            <span className="mono xp-label">
              <i className="xp-mark-key" /> Something happened to {you !== null && world ? world.name[you] : 'them'}
            </span>
          </div>
        </div>
      ) : (
        <div className="xp-caption mono xp-label">
          {you === null
            ? 'Each cluster is one world · hover to name it · click anyone to follow them'
            : `Nothing moves until you take the walls down · year 0 of ${params.years}`}
        </div>
      )}

      {/* ── The right column ─────────────────────────────────────────────── */}
      <div className="xp-side">
        {started ? (
          <Reading
            world={world}
            you={you}
            youWorld={youWorld}
            ties={yourTies}
            outside={yourOutside}
            startTies={yourLife.ties[0] ?? 0}
            startOutside={Math.round((1 - (yourLife.home[0] ?? 1)) * (yourLife.ties[0] ?? 0))}
            story={story}
            peopleOpen={peopleOpen}
            onPeople={() => setPeopleOpen((o) => !o)}
            onSomeoneElse={() => {
              setStarted(false);
              setPanel('steps');
              setRunning(false);
            }}
            onGoToYear={goToYear}
          />
        ) : panel === 'worlds' ? (
          <WorldPicker
            catalogue={catalogue}
            draft={draft}
            query={worldQuery}
            onQuery={setWorldQuery}
            onToggle={(id) => {
              if (!draft) return;
              const next = new Set(draft);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              setDraft(next);
            }}
            onAll={() => catalogue && setDraft(new Set(catalogue.map((u) => u.id)))}
            onNone={() => setDraft(new Set())}
            onBack={() => {
              if (chosen) setDraft(new Set(chosen));
              setPanel('steps');
            }}
            onKeep={() => {
              if (draft) setChosen(new Set(draft));
              setPanel('steps');
            }}
          />
        ) : panel === 'conditions' ? (
          <Conditions
            params={params}
            preset={current}
            seed={seed}
            onParams={setParams}
            onSeed={setSeed}
            onReset={() => applyPreset('balanced')}
            onBack={() => setPanel('steps')}
          />
        ) : (
          <Steps
            world={world}
            catalogue={catalogue}
            you={you}
            youWorld={youWorld}
            tieCount={yourTies.length}
            preset={preset}
            params={params}
            seed={seed}
            query={query}
            matches={matches}
            onQuery={setQuery}
            onPickMatch={(i) => {
              setFollow(i);
              setQuery('');
            }}
            onWorlds={() => setPanel('worlds')}
            onConditions={() => setPanel('conditions')}
            onPreset={applyPreset}
            onRandom={wakeElsewhere}
            onUnfollow={() => setFollow(null)}
            onBegin={() => {
              setStarted(true);
              setRunning(true);
            }}
          />
        )}
      </div>
    </div>
  );
}

/** A label and a figure on one line, ruled under. */
function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="xp-figure">
      <span className="mono xp-label">{label}</span>
      <span className="mono xp-figure-value">{value}</span>
    </div>
  );
}

/** One of the three figures on the shelf. */
function Headline(props: { label: string; shown: string; note?: string }) {
  return (
    <div className="xp-head-figure">
      <span className="mono xp-label">{props.label}</span>
      <span className="xp-head-line">
        <span className="mono xp-head-value">{props.shown}</span>
        {props.note && <span className="mono xp-label">{props.note}</span>}
      </span>
    </div>
  );
}

function Caret({ open }: { open: boolean }) {
  return (
    <svg
      width="9"
      height="9"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.3}
      aria-hidden
      style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 140ms ease' }}
    >
      <path d="M2 3.5l3 3 3-3" />
    </svg>
  );
}

function PlayGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
      <path d="M3 1l8 5-8 5z" fill="currentColor" />
    </svg>
  );
}

function PauseGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
      <rect x="2" y="1" width="3" height="10" fill="currentColor" />
      <rect x="7" y="1" width="3" height="10" fill="currentColor" />
    </svg>
  );
}

function StepGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
      <path d="M2 1l6 5-6 5z" fill="currentColor" />
      <rect x="9" y="1" width="1.6" height="10" fill="currentColor" />
    </svg>
  );
}

/** A numbered step in the setting-up column. */
function Step(props: {
  n: number;
  label: string;
  done?: boolean;
  now?: boolean;
  action?: ReactNode;
  children?: ReactNode;
}) {
  const { n, label, done, now, action, children } = props;
  return (
    <li className={`xp-step${now ? ' now' : ''}${done || now ? '' : ' waiting'}`}>
      <div className="xp-step-head">
        <span className={`xp-step-n${now ? ' now' : ''}`}>{n}</span>
        <span className="mono xp-step-label">{label}</span>
        {action && <span className="xp-step-action">{action}</span>}
      </div>
      {children && <div className="xp-step-body">{children}</div>}
    </li>
  );
}

/**
 * Setting up, as four steps.
 *
 * The order is the argument: which worlds take part decides who there is to
 * follow, following somebody decides whose story the run tells, and the
 * conditions decide what happens to them. Each step states what it has settled
 * on, so the column is a summary of the run about to happen rather than a form.
 */
function Steps(props: {
  world: MergedWorld | null;
  catalogue: Universe[] | null;
  you: number | null;
  youWorld: string | null;
  tieCount: number;
  preset: PresetId;
  params: Params;
  seed: number;
  query: string;
  matches: number[];
  onQuery: (q: string) => void;
  onPickMatch: (i: number) => void;
  onWorlds: () => void;
  onConditions: () => void;
  onPreset: (id: PresetId) => void;
  onRandom: () => void;
  onUnfollow: () => void;
  onBegin: () => void;
}) {
  const { world, you, youWorld, params } = props;
  const chosenPreset = PRESETS.find((p) => p.id === props.preset) ?? PRESETS[1];
  const ready = you !== null;

  return (
    <div className="xp-steps-wrap">
      {!ready && (
        <div className="xp-intro">
          <span className="mono xp-label">The experiment</span>
          <h2 className="xp-intro-title">What happens with no walls?</h2>
          <p className="xp-intro-deck">
            Every character starts inside their own story. Choose the worlds, pick someone in
            them, take the walls down, and watch who they end up knowing.
          </p>
        </div>
      )}

      <ol className="xp-steps">
        <Step
          n={1}
          label="Worlds"
          done
          action={
            <button type="button" className="mono xp-link" onClick={props.onWorlds}>
              Change
            </button>
          }
        >
          <div className="xp-step-value">
            {world
              ? world.worldIds.length === (props.catalogue?.length ?? 0)
                ? `All ${world.worldIds.length} worlds`
                : `${world.worldIds.length} of ${props.catalogue?.length ?? 52} worlds`
              : 'Loading…'}
          </div>
          <div className="mono xp-label">
            {world
              ? `${world.n.toLocaleString()} characters to choose from`
              : 'Fetching every world'}
          </div>
        </Step>

        {ready ? (
          <Step
            n={2}
            label="Following"
            done
            action={
              /* Back to the three ways in, not straight to a different
                 stranger: `change` is a reopening of the question, and a button
                 that answers it again for you is not a change, it is a reroll. */
              <button type="button" className="mono xp-link quiet" onClick={props.onUnfollow}>
                Change
              </button>
            }
          >
            <div className="xp-step-name">{world ? world.name[you] : ''}</div>
            <div className="mono xp-label">
              {youWorld} · {props.tieCount} ties
            </div>
          </Step>
        ) : (
          <Step n={2} label="Follow someone" now>
            <button type="button" className="xp-block" onClick={props.onRandom}>
              Anyone at random
              <ShuffleGlyph />
            </button>
            <label className="xp-named">
              <span className="mono xp-label">Or find by name</span>
              <input
                type="search"
                className="xp-name-field"
                placeholder="Arya Stark, 曹操…"
                value={props.query}
                onChange={(e) => props.onQuery(e.target.value)}
              />
            </label>
            {props.matches.length > 0 && world && (
              <div className="xp-matches">
                {props.matches.map((i) => (
                  <button
                    key={i}
                    type="button"
                    className="xp-match"
                    onClick={() => props.onPickMatch(i)}
                  >
                    <span className="xp-match-name">{world.name[i]}</span>
                    <span className="mono xp-match-world">{world.worldTitles[world.world[i]]}</span>
                  </button>
                ))}
              </div>
            )}
            <p className="xp-aside">…or click anyone on the map. Only worlds you kept are there.</p>
          </Step>
        )}

        <Step n={3} label="Set the conditions" now={ready} done={ready}>
          {ready && (
            <>
              <div className="xp-presets" role="radiogroup" aria-label="Starting point">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={p.id === props.preset}
                    className={`mono xp-preset${p.id === props.preset ? ' on' : ''}`}
                    onClick={() => props.onPreset(p.id)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <p className="xp-blurb">{chosenPreset.blurb}</p>
              <button type="button" className="xp-finetune" onClick={props.onConditions}>
                <span className="mono xp-label">
                  {params.years} years · seed {props.seed}
                </span>
                <span className="mono xp-link xp-with-glyph">
                  Fine-tune
                  <ChevronGlyph />
                </span>
              </button>
            </>
          )}
        </Step>

        <Step n={4} label="Take the walls down" now={ready} done={ready}>
          {ready && (
            <button type="button" className="xp-begin" onClick={props.onBegin}>
              <PlayGlyph />
              Take the walls down
            </button>
          )}
        </Step>
      </ol>
    </div>
  );
}

/**
 * Which worlds take part.
 *
 * It comes first because everything after it depends on it: you pick somebody
 * to follow out of the worlds you kept, and only these lose their walls.
 * Nothing is committed until the button at the foot, so fifty-two toggles cost
 * one rebuild rather than fifty-two.
 */
function WorldPicker(props: {
  catalogue: Universe[] | null;
  draft: Set<string> | null;
  query: string;
  onQuery: (q: string) => void;
  onToggle: (id: string) => void;
  onAll: () => void;
  onNone: () => void;
  onBack: () => void;
  onKeep: () => void;
}) {
  const { catalogue, draft } = props;
  const q = props.query.trim().toLowerCase();
  const shown = (catalogue ?? []).filter((u) => !q || u.title.toLowerCase().includes(q));
  const kept = draft?.size ?? 0;

  return (
    <div className="xp-panel-col">
      <button type="button" className="mono xp-back" onClick={props.onBack}>
        <ChevronGlyph back />
        Back
      </button>
      <h2 className="xp-panel-title">Which worlds take part?</h2>
      <p className="xp-panel-deck">
        This comes first. You’ll pick someone to follow from the worlds you keep, and only
        these lose their walls.
      </p>

      <label className="xp-named">
        <span className="mono xp-label">Filter</span>
        <input
          type="search"
          className="xp-name-field"
          placeholder="Shakespeare, Harry Potter…"
          value={props.query}
          onChange={(e) => props.onQuery(e.target.value)}
        />
      </label>

      <div className="xp-picker-head">
        <button type="button" className="mono xp-link" onClick={props.onAll}>
          All
        </button>
        <button type="button" className="mono xp-link" onClick={props.onNone}>
          None
        </button>
        <span className="mono xp-label">{kept} of {catalogue?.length ?? 52} kept</span>
      </div>

      <div className="xp-picker-list">
        {shown.map((u) => {
          const on = draft?.has(u.id) ?? false;
          return (
            <label key={u.id} className={`xp-pick${on ? '' : ' out'}`}>
              <input type="checkbox" checked={on} onChange={() => props.onToggle(u.id)} />
              <i className="xp-dot" style={{ background: on ? u.accent : 'transparent' }} />
              <span className="xp-world-name">{u.title}</span>
              <span className="mono xp-value">{u.nodes.length}</span>
            </label>
          );
        })}
        {shown.length === 0 && <p className="xp-note quiet">No world by that name.</p>}
      </div>

      <button type="button" className="xp-commit" onClick={props.onKeep} disabled={kept === 0}>
        Keep {kept} worlds
      </button>
    </div>
  );
}

/** The dials behind the presets. Nothing changes until the run begins. */
function Conditions(props: {
  params: Params;
  preset: (typeof PRESETS)[number];
  seed: number;
  onParams: (p: Params) => void;
  onSeed: (s: number) => void;
  onReset: () => void;
  onBack: () => void;
}) {
  const { params } = props;
  const total = params.own + params.fof + params.cross || 1;
  const pct = (v: number) => Math.round((v / total) * 100);
  /** Own and across are set; friend-of-a-friend is whatever is left, which is
   * the only arrangement of three shares that two sliders can state honestly. */
  const setShare = (which: 'own' | 'cross', v: number) => {
    const own = which === 'own' ? v : pct(params.own);
    const cross = which === 'cross' ? v : pct(params.cross);
    const lo = Math.min(own, 100);
    const hi = Math.min(cross, 100 - lo);
    props.onParams({ ...params, own: lo, cross: hi, fof: 100 - lo - hi });
  };

  return (
    <div className="xp-panel-col">
      <div className="xp-panel-top">
        <button type="button" className="mono xp-back" onClick={props.onBack}>
          ‹ Back
        </button>
        <button type="button" className="mono xp-link" onClick={props.onReset}>
          Reset to balanced
        </button>
      </div>
      <h2 className="xp-panel-title">Fine-tune the conditions</h2>
      <p className="xp-panel-deck">
        Starting from <span className="xp-ink">{props.preset.label}</span>. Nothing changes
        until you begin.
      </p>

      <div className="xp-dials">
        <section className="xp-dial-group">
          <h3 className="mono xp-group">How far anyone reaches</h3>
          <p className="xp-note">Where each new tie comes from.</p>
          <div className="xp-mix-bar" aria-hidden>
            <span className="own" style={{ width: `${pct(params.own)}%` }} />
            <span className="fof" style={{ width: `${pct(params.fof)}%` }} />
            <span className="cross" style={{ width: `${pct(params.cross)}%` }} />
          </div>
          <div className="xp-mix-key">
            <span className="mono xp-label">
              <i className="own" /> Own camp <b>{pct(params.own)}%</b>
            </span>
            <span className="mono xp-label">
              <i className="fof" /> Friend of a friend <b>{pct(params.fof)}%</b>
            </span>
            <span className="mono xp-label">
              <i className="cross" /> Across worlds <b>{pct(params.cross)}%</b>
            </span>
          </div>
          <Dial
            label="Own camp"
            shown={`${pct(params.own)}%`}
            value={pct(params.own)}
            min={0}
            max={90}
            step={5}
            onChange={(v) => setShare('own', v)}
          />
          <Dial
            label="Across worlds"
            shown={`${pct(params.cross)}%`}
            value={pct(params.cross)}
            min={0}
            max={90}
            step={5}
            onChange={(v) => setShare('cross', v)}
          />
          <span className="mono xp-sym">Friend of a friend takes the rest</span>
        </section>

        <section className="xp-dial-group">
          <h3 className="mono xp-group">How ties form and fade</h3>
          {KNOBS.map((k) => (
            <Dial
              key={k.key}
              label={k.label}
              sym={k.sym}
              shown={params[k.key].toFixed(k.digits)}
              value={params[k.key]}
              min={k.min}
              max={k.max}
              step={k.step}
              onChange={(v) => props.onParams({ ...params, [k.key]: v })}
            />
          ))}
        </section>

        <section className="xp-dial-group">
          <h3 className="mono xp-group">The run</h3>
          <Dial
            label="Length"
            shown={`${params.years} years`}
            value={params.years}
            min={50}
            max={1000}
            step={10}
            onChange={(v) => props.onParams({ ...params, years: v })}
          />
          <div className="xp-seed-row">
            <label className="xp-named grow">
              <span className="mono xp-label">Seed</span>
              <input
                type="text"
                inputMode="numeric"
                className="xp-name-field mono"
                value={props.seed}
                onChange={(e) => props.onSeed(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
              />
            </label>
            <button
              type="button"
              className="mono xp-outline"
              onClick={() => props.onSeed(randomSeed())}
            >
              New seed
            </button>
          </div>
          <p className="xp-note">The same seed replays the same history, tie for tie.</p>
        </section>
      </div>

      <button type="button" className="xp-commit" onClick={props.onBack}>
        Use these conditions
      </button>
    </div>
  );
}

/** One dial: the plain name, the figure, the rail, and the symbol under it. */
function Dial(props: {
  label: string;
  sym?: string;
  shown: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="xp-dial">
      <span className="xp-dial-head">
        <span className="xp-dial-label">{props.label}</span>
        <span className="mono xp-value">{props.shown}</span>
      </span>
      <input
        className="xp-range"
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
      {props.sym && <span className="mono xp-sym">{props.sym}</span>}
    </label>
  );
}

/**
 * Who you are following, once the run is going.
 *
 * Two figures with their year-zero values beside them, because the whole point
 * is the difference; then who they know, with the ones from elsewhere marked;
 * then what has happened to them, dated, newest first. Pressing a dated line
 * takes the view to that year.
 */
function Reading(props: {
  world: MergedWorld | null;
  you: number | null;
  youWorld: string | null;
  ties: [number, number][];
  outside: number;
  startTies: number;
  startOutside: number;
  story: { year: number; name: string; before: string; after: string }[];
  peopleOpen: boolean;
  onPeople: () => void;
  onSomeoneElse: () => void;
  onGoToYear: (year: number) => void;
}) {
  const { world, you } = props;
  if (!world || you === null) return null;
  return (
    <div className="xp-reading">
      <div className="xp-reading-head">
        <span className="mono xp-label">Following</span>
        <button type="button" className="mono xp-link quiet" onClick={props.onSomeoneElse}>
          Someone else
        </button>
      </div>
      <div className="xp-reading-name">{world.name[you]}</div>
      <div className="mono xp-label">From {props.youWorld}</div>

      <div className="xp-reading-figures">
        <div>
          <div className="mono xp-reading-n">{props.ties.length}</div>
          <div className="mono xp-label nowrap">Ties · was {props.startTies}</div>
        </div>
        <div>
          <div className="mono xp-reading-n accent">{props.outside}</div>
          <div className="mono xp-label nowrap">Outside home · was {props.startOutside}</div>
        </div>
      </div>

      <h3 className="mono xp-group">Who they know</h3>
      <div className="xp-people">
        {props.ties.slice(0, props.peopleOpen ? 40 : 5).map(([v, s]) => {
          const away = world.world[v] !== world.world[you];
          return (
            <div key={v} className="xp-person">
              <span className="xp-person-name">
                {world.name[v]}
                {away && (
                  <span className="mono xp-person-world">{world.worldTitles[world.world[v]]}</span>
                )}
              </span>
              <span className="xp-bar">
                <span
                  className={`xp-bar-fill${away ? ' away' : ''}`}
                  style={{ width: `${Math.max(2, s)}%` }}
                />
              </span>
            </div>
          );
        })}
        {props.ties.length === 0 && <p className="xp-note quiet">Nobody left.</p>}
        {props.ties.length > 5 && (
          <button type="button" className="mono xp-link quiet xp-more" onClick={props.onPeople}>
            {props.peopleOpen ? 'Show fewer' : `All ${props.ties.length}`}
          </button>
        )}
      </div>

      <h3 className="mono xp-group">Their story so far</h3>
      <div className="xp-story">
        {props.story.length === 0 && (
          <p className="xp-note quiet">
            Nothing yet. Weakening is continuous and is not listed — watch the bars shrink.
          </p>
        )}
        {props.story.map((e, i) => (
          <button
            key={`${e.year}-${i}`}
            type="button"
            className="xp-story-row"
            onClick={() => props.onGoToYear(e.year)}
          >
            <span className="mono xp-story-year">Year {e.year}</span>
            <span className="xp-story-text">
              {e.before}
              <b>{e.name}</b>
              {e.after}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function AgainGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
      <path d="M13 8a5 5 0 1 1-1.6-3.7" />
      <path d="M12 1.5v3.3H8.7" />
    </svg>
  );
}

/* The boards' own marks. Drawn rather than typed, because a chevron set in the
   mono face sits on the wrong baseline beside a 9-point tracked label and reads
   as a punctuation mistake. */

function ShuffleGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.3} aria-hidden>
      <path d="M1 4h3c3 0 5 8 8 8h3M12 10l3 2-3 2M1 12h3c1.2 0 2.2-1.2 3-2.7M9 5.7C9.8 4.6 10.8 4 12 4h3M12 2l3 2-3 2" />
    </svg>
  );
}

function RefitGlyph() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.2} aria-hidden>
      <path d="M1 4V1h3M8 1h3v3M11 8v3H8M4 11H1V8" />
    </svg>
  );
}

function ChevronGlyph({ back }: { back?: boolean }) {
  return (
    <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={1.3} aria-hidden>
      <path d={back ? 'M6.5 2l-3 3 3 3' : 'M3.5 2l3 3-3 3'} />
    </svg>
  );
}

