/**
 * One round of the experiment. See docs/The experiment.md for why each rule is
 * the shape it is; this file is that document as arithmetic, and
 * constants.ts holds every number it does not take from a slider.
 *
 * Everything is a draw from a seeded generator, so a run is a pure function of
 * (seed, parameters, round count).
 */

import { mulberry32 } from './rng';
import { LEDGER_LIMIT, LOG_LIMIT, REPLAY_S, S_MAX, STRENGTHEN_STEP } from './constants';
import type { MergedWorld } from './world';

export interface Params {
  /** Encounter mix. Weights, normalised at draw time; they need not sum to 1. */
  own: number;
  fof: number;
  cross: number;

  /** Formation pressure: the base rate at which a stranger becomes a tie. */
  p: number;
  /** Saturation reference degree. A character at degree d0 is half as
   * available as a character with no ties. This is what replaces a cap. */
  d0: number;
  /** Triadic bonus: how much a fully shared neighbourhood helps. */
  lambda: number;
  /** Preferential attachment exponent. 0 ignores degree entirely. */
  alpha: number;

  /** Strengthen rate for an existing tie. */
  ps: number;
  /** What an untouched tie loses per round. */
  decay: number;
  /** Strength a new tie is born at. */
  sInit: number;

  /** Run length in rounds. */
  days: number;
}

/**
 * A starting point that shows something within a two-hundred-day run, not a
 * claim about how the world works.
 *
 * Tuned against the six-world population after the first pass produced nothing:
 * formation pressure of 0.25 against a saturation reference of 12, with mean
 * degree already 19, left every character three-quarters unavailable, and
 * mutual consent then squared that.
 */
export const DEFAULT_PARAMS: Params = {
  own: 20,
  fof: 60,
  cross: 20,
  p: 0.35,
  d0: 25,
  lambda: 0.35,
  alpha: 0.5,
  ps: 0.15,
  decay: 1.5,
  sInit: 30,
  days: 200,
};

/**
 * One thing that happened to the followed character. WEAKEN is absent on
 * purpose: it fires on every untouched tie every round, so logging it would
 * bury the three entries that change the topology under a continuous drizzle.
 * Decay is visible in the tie list instead, as a bar getting shorter.
 */
export interface LogEvent {
  day: number;
  /**
   * FADE is a tie crossing below half strength on its way down.
   *
   * The only one of these that does not change the topology, and the only one
   * recorded for the sake of the reading rather than the simulation: a tie
   * going quiet is a thing that happens to somebody, and without it their story
   * is only meetings and endings. It fires once in a tie's life — the crossing,
   * not the state — so it costs about as much as a CUT.
   */
  action: 'FORM' | 'STRENGTHEN' | 'CUT' | 'FADE';
  other: number;
  s: number;
}

/**
 * Every FORM and CUT in the experiment, for everyone, as a ring buffer.
 *
 * The log used to belong to whoever was being watched, which meant their
 * history began the moment you looked at them: picking someone on day ninety
 * showed an empty panel, and switching to someone else threw the first one's
 * life away. Since the two events that change the topology are rare compared
 * with maintenance, the experiment can simply keep all of them and read any
 * character's history back out on demand.
 *
 * Four parallel typed arrays rather than objects: at two hundred thousand
 * entries that is the difference between three megabytes and a garbage
 * collector doing laps.
 */
export interface Ledger {
  day: Int32Array;
  u: Int32Array;
  v: Int32Array;
  /** 0 = FORM, 1 = CUT, 2 = FADE. */
  act: Uint8Array;
  /** Where the next entry goes. */
  at: number;
  /** How many of the slots are real, up to the cap. */
  count: number;
  /**
   * How many entries have ever been written, unwrapped.
   *
   * This is what makes reading a character's history cheap. Without it every
   * read had to walk the whole ring — two hundred thousand entries, ten times a
   * second, to find the handful belonging to one quiet character. With it a
   * reader remembers the sequence number it last read to and walks only what
   * has arrived since, which is a few hundred entries a round.
   */
  seq: number;
}

export interface SimState {
  round: number;
  /**
   * Adjacency and tie strength in one structure: `adj[u].get(v)` is the
   * strength of the tie, stored from both ends.
   *
   * A Map rather than a Set with a side table because every hot loop here wants
   * both membership and strength, and because degree is `adj[u].size`. Writes
   * always touch both directions.
   */
  adj: Map<number, number>[];
  /** Canonical keys of ties formed or strengthened this round. Everything else
   * decays. */
  touched: Set<number>;
  /** Realised rates, for the readout beside mean degree. */
  formed: number;
  cut: number;
  rng: () => number;
  /** Whose shoulder we are reading over, if anyone. */
  follow: number | null;
  /** Every FORM and CUT, for everyone. */
  ledger: Ledger;
  /**
   * Ties the followed character kept up, by day, newest first.
   *
   * Maintenance is counted rather than listed and is not worth three megabytes
   * of ring buffer, so unlike FORM and CUT it is only tallied while someone is
   * being watched. It restarts when the watch moves, which is honest: it is a
   * running count, not a record.
   */
  kept: { day: number; n: number }[];
}

/** Canonical undirected key. `n` stays below 10^4, so this fits an int. */
function key(n: number, u: number, v: number): number {
  return u < v ? u * n + v : v * n + u;
}

export function initState(world: MergedWorld, seed: number): SimState {
  const adj: Map<number, number>[] = new Array(world.n);
  for (let i = 0; i < world.n; i++) adj[i] = new Map();
  for (const [u, v, s] of world.edges) {
    adj[u].set(v, s);
    adj[v].set(u, s);
  }
  return {
    round: 0,
    adj,
    touched: new Set(),
    formed: 0,
    cut: 0,
    rng: mulberry32(seed),
    follow: null,
    ledger: {
      day: new Int32Array(LEDGER_LIMIT),
      u: new Int32Array(LEDGER_LIMIT),
      v: new Int32Array(LEDGER_LIMIT),
      act: new Uint8Array(LEDGER_LIMIT),
      at: 0,
      count: 0,
      seq: 0,
    },
    kept: [],
  };
}

/**
 * Record an event. Watching changes nothing about the run: the draw order is
 * untouched, so the same seed produces the same history whether anyone is
 * reading it or not — and now the history exists whether anyone is reading it
 * or not, too.
 */
/** Where a tie counts as having gone quiet. Half of full strength. */
const HALF_STRENGTH = S_MAX / 2;

function note(state: SimState, action: LogEvent['action'], u: number, v: number, _s: number) {
  if (action === 'STRENGTHEN') {
    // Counted, not kept, and only for whoever is being watched. See `kept`.
    if (state.follow === null) return;
    if (u !== state.follow && v !== state.follow) return;
    const head = state.kept[0];
    if (head && head.day === state.round) head.n++;
    else {
      state.kept.unshift({ day: state.round, n: 1 });
      if (state.kept.length > LOG_LIMIT) state.kept.length = LOG_LIMIT;
    }
    return;
  }
  const l = state.ledger;
  l.day[l.at] = state.round;
  l.u[l.at] = u;
  l.v[l.at] = v;
  l.act[l.at] = action === 'FORM' ? 0 : action === 'CUT' ? 1 : 2;
  l.at = (l.at + 1) % LEDGER_LIMIT;
  l.seq++;
  if (l.count < LEDGER_LIMIT) l.count++;
}

/**
 * What has happened to one character since sequence number `since`, newest
 * first, with the sequence number to pass in next time.
 *
 * Reading a whole life used to mean walking the whole ring on every render: two
 * hundred thousand entries, ten times a second, almost all of them somebody
 * else's. A reader that remembers where it got to walks only the few hundred
 * entries a round actually writes, and keeps what it already had. Pass
 * `since = 0` for a character you have not read before.
 *
 * Entries older than the ring's horizon are gone; `since` is clamped to it, so
 * a reader that has been away comes back with whatever survives rather than
 * with a gap it cannot see.
 */
export function historySince(
  state: SimState,
  i: number,
  since: number,
  limit = LOG_LIMIT,
): { events: LogEvent[]; seq: number } {
  const l = state.ledger;
  const out: LogEvent[] = [];
  const horizon = Math.max(since, l.seq - l.count);
  for (let k = 1; k <= l.seq - horizon && out.length < limit; k++) {
    const at = (l.at - k + LEDGER_LIMIT) % LEDGER_LIMIT;
    const u = l.u[at];
    const v = l.v[at];
    if (u !== i && v !== i) continue;
    const act = l.act[at];
    out.push({
      day: l.day[at],
      action: act === 0 ? 'FORM' : act === 1 ? 'CUT' : 'FADE',
      other: u === i ? v : u,
      s: 0,
    });
  }
  return { events: out, seq: l.seq };
}

/**
 * The graph as it stood on a given day, rebuilt from the ledger.
 *
 * The initial condition is known exactly and every event that has changed it
 * since is on record, so replaying forward to `day` reproduces the topology of
 * that day without anything having been stored for the purpose. Strengths are
 * not replayed — see `REPLAY_S`.
 *
 * Returns null when the day is older than the ledger still reaches: the ring
 * drops its oldest entries, and a replay missing its first events would be a
 * confident drawing of a graph that never existed.
 */
export function replayAt(
  world: MergedWorld,
  state: SimState,
  day: number,
): { adj: Map<number, number>[] } | null {
  const l = state.ledger;
  if (l.seq > l.count) {
    // Wrapped: the oldest surviving entry is as far back as this can go.
    const oldest = (l.at - l.count + LEDGER_LIMIT) % LEDGER_LIMIT;
    if (l.day[oldest] > 0) return null;
  }

  const adj: Map<number, number>[] = new Array(world.n);
  for (let i = 0; i < world.n; i++) adj[i] = new Map();
  for (const [u, v] of world.edges) {
    adj[u].set(v, REPLAY_S);
    adj[v].set(u, REPLAY_S);
  }

  // Oldest first, stopping as soon as the events belong to a later day.
  for (let k = 0; k < l.count; k++) {
    const i = (l.at - l.count + k + LEDGER_LIMIT) % LEDGER_LIMIT;
    if (l.day[i] > day) break;
    const u = l.u[i];
    const v = l.v[i];
    // FADE leaves the graph exactly as it was; it is a note about a strength,
    // and strengths are not replayed.
    if (l.act[i] === 2) continue;
    if (l.act[i] === 0) {
      adj[u].set(v, REPLAY_S);
      adj[v].set(u, REPLAY_S);
    } else {
      adj[u].delete(v);
      adj[v].delete(u);
    }
  }
  return { adj };
}

/** The k-th neighbour of u. Maps are not indexable, and degree is small enough
 * that walking is cheaper than keeping a parallel array in sync through every
 * FORM and CUT. */
function nthNeighbour(adj: Map<number, number>, k: number): number {
  let i = 0;
  for (const v of adj.keys()) {
    if (i === k) return v;
    i++;
  }
  return -1;
}

function randomNeighbour(state: SimState, u: number): number {
  const d = state.adj[u].size;
  if (d === 0) return -1;
  return nthNeighbour(state.adj[u], Math.floor(state.rng() * d));
}

/**
 * Shared neighbours as a *share*, not a count: |N(u) ∩ N(v)| / min(d(u), d(v)),
 * in [0, 1].
 *
 * The count is the obvious quantity and it is wrong. Used raw, the triadic term
 * 1 + λ·shared is unbounded, and it appears in both formation and maintenance —
 * so as the graph densifies, shared counts rise, strengthening outruns decay,
 * nothing is ever cut, and the run becomes a hairball with no equilibrium. The
 * prototype did exactly that: mean degree 18.9 → 47.5 in ninety days with one
 * tie cut per round.
 *
 * The share is bounded by construction, which caps the triadic term at 1 + λ
 * however dense the graph gets. It is also the better question — what fraction
 * of my people do we have in common, rather than how many.
 */
function overlap(state: SimState, u: number, v: number): number {
  const a = state.adj[u];
  const b = state.adj[v];
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  if (small.size === 0) return 0;
  let count = 0;
  for (const x of small.keys()) if (large.has(x)) count++;
  return count / small.size;
}

/**
 * Who u runs into this round.
 *
 * Three channels, exhaustive and disjoint. "Random over everyone" is not among
 * them because it is not a channel — a uniform draw over the whole population
 * is already mostly cross-world, so it is a particular setting of own against
 * cross rather than a thing of its own.
 */
function drawEncounter(state: SimState, world: MergedWorld, params: Params): (u: number) => number {
  const total = params.own + params.fof + params.cross;

  return (u: number): number => {
    if (total <= 0) return -1;
    const r = state.rng() * total;
    const w = world.world[u];

    if (r < params.own) {
      return world.worldStart[w] + Math.floor(state.rng() * world.worldSize[w]);
    }

    if (r < params.own + params.fof) {
      // A neighbour of a neighbour, drawn in two steps rather than by building
      // the two-hop set: same distribution in spirit, O(degree) instead of
      // O(degree²), and the set would have to be rebuilt every round anyway.
      const mid = randomNeighbour(state, u);
      if (mid < 0) return -1;
      return randomNeighbour(state, mid);
    }

    // Anyone outside my own world. Rejection sampling: even the largest world
    // is a ninth of the full population, so this is one draw in all but the
    // six-world case and under two there.
    for (let tries = 0; tries < 12; tries++) {
      const v = Math.floor(state.rng() * world.n);
      if (world.world[v] !== w) return v;
    }
    return -1;
  };
}

/** P(u says FORM about v). */
/**
 * P(FORM) without its triadic term — everything that costs only two degrees.
 *
 * Split out because the triadic term is the expensive one: it walks a
 * neighbourhood. Since τ is bounded above by 1 + λ, this factor alone gives an
 * upper bound on the whole probability, and a draw that fails against the bound
 * can be rejected without ever looking at anyone's neighbours. See `step`.
 */
function formProbability(
  state: SimState,
  params: Params,
  meanDegree: number,
  u: number,
  v: number,
): number {
  const du = state.adj[u].size;
  const dv = state.adj[v].size;
  const saturation = 1 / (1 + du / Math.max(1e-6, params.d0));
  const attachment =
    params.alpha === 0 ? 1 : Math.pow(Math.max(dv, 1) / Math.max(meanDegree, 1), params.alpha);
  return params.p * saturation * attachment;
}

export interface RoundReport {
  formed: number;
  cut: number;
}

export function step(state: SimState, world: MergedWorld, params: Params): RoundReport {
  const n = world.n;
  state.touched.clear();
  state.formed = 0;
  state.cut = 0;

  let edgeCount = 0;
  for (let i = 0; i < n; i++) edgeCount += state.adj[i].size;
  const meanDegree = edgeCount / n;

  // 1 — every character draws one encounter. No sampling of actors.
  //
  // A tie forms only if both sides say FORM. Not a toggle: with structural
  // decision rules the two sides genuinely differ — each is weighed by its own
  // degree, its own remaining availability, and how the other looks from where
  // it stands — so consent is a mechanism rather than a rescale of p.
  const encounter = drawEncounter(state, world, params);
  // τ is bounded above by this, whatever the two neighbourhoods turn out to
  // hold. Everything below uses it to throw a draw out before paying for them.
  const triadMax = 1 + params.lambda;
  for (let u = 0; u < n; u++) {
    const v = encounter(u);
    if (v < 0 || v === u || state.adj[u].has(v)) continue;

    const baseU = formProbability(state, params, meanDegree, u, v);
    const rU = state.rng();
    if (rU >= Math.min(1, baseU * triadMax)) continue;
    // Only now is it worth walking a neighbourhood. `overlap` is symmetric, so
    // the two sides share one computation as well as skipping it together.
    const ov = overlap(state, u, v);
    const triad = 1 + params.lambda * ov;
    if (rU >= Math.min(1, baseU * triad)) continue;
    const baseV = formProbability(state, params, meanDegree, v, u);
    if (state.rng() >= Math.min(1, baseV * triad)) continue;
    state.adj[u].set(v, params.sInit);
    state.adj[v].set(u, params.sInit);
    state.touched.add(key(n, u, v));
    note(state, 'FORM', u, v, params.sInit);
    state.formed++;
  }

  // 2 — every existing tie is reviewed once, by its lower-id endpoint, and
  // decays if the review did not strengthen it.
  //
  // Deleting from `adj[v]` for some v > u that this loop has not reached yet is
  // safe: when it does reach v it only considers partners above v, and u is
  // below it.
  for (let u = 0; u < n; u++) {
    const row = state.adj[u];
    for (const [v, s] of row) {
      if (v < u) continue;
      const k = key(n, u, v);
      if (state.touched.has(k)) continue;

      /*
       * One draw per tie, as before — and now usually only one draw.
       *
       * This is the whole simulation's hot loop: every surviving tie, every
       * round. Computing the triadic share here meant walking a neighbourhood
       * sixty-three thousand times a round, ten rounds a second — around nine
       * million map lookups a second, and seventy per cent of the main thread.
       *
       * Since τ ≤ 1 + λ, the probability is bounded above by `headroom`, and a
       * draw at or above that bound cannot strengthen the tie however many
       * friends the two have in common. Rejecting on the bound first is not an
       * approximation: the same draw decides the same way, and the random
       * stream is consumed in the same order, so a seed still reproduces its
       * run exactly. At the default rate and bonus it skips the neighbourhood
       * walk about four times in five, and skips more of them the stronger the
       * tie, because a saturated tie has little room to be strengthened.
       */
      const room = 1 - s / S_MAX;
      const headroom = params.ps * triadMax * room;
      const r = state.rng();
      if (r < headroom && r < params.ps * (1 + params.lambda * overlap(state, u, v)) * room) {
        const next = Math.min(S_MAX, s + STRENGTHEN_STEP);
        row.set(v, next);
        state.adj[v].set(u, next);
        state.touched.add(k);
        note(state, 'STRENGTHEN', u, v, next);
        continue;
      }

      const next = s - params.decay;
      if (next <= 0) {
        row.delete(v);
        state.adj[v].delete(u);
        note(state, 'CUT', u, v, 0);
        state.cut++;
      } else {
        row.set(v, next);
        state.adj[v].set(u, next);
        // The crossing, not the state: a tie passes this mark once on its way
        // down, so the note is as rare as a cut rather than as common as decay.
        if (s >= HALF_STRENGTH && next < HALF_STRENGTH) note(state, 'FADE', u, v, next);
      }
    }
  }

  state.round++;
  return { formed: state.formed, cut: state.cut };
}
