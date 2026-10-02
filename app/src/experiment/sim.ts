/**
 * One round of the experiment. See docs/The experiment.md for why each rule is
 * the shape it is; this file is that document as arithmetic.
 *
 * Everything is a draw from a seeded generator, so a run is a pure function of
 * (seed, parameters, round count).
 */

import { mulberry32 } from './rng';
import { S_MAX } from './world';
import type { MergedWorld } from './world';

export interface Params {
  /** Encounter mix. Weights, normalised at draw time; they need not sum to 1. */
  own: number;
  fof: number;
  cross: number;
  /** Ramp the cross-world weight from 0 to its slider value across the run,
   * instead of holding it constant. The walls thin rather than fall. */
  ramp: boolean;

  /** Formation pressure: the base rate at which a stranger becomes a tie. */
  p: number;
  /** Saturation reference degree. A character at degree d0 is half as
   * available as a character with no ties. This is what replaces a cap. */
  d0: number;
  /** Triadic bonus: how much a fully shared neighbourhood helps. */
  lambda: number;
  /** Preferential attachment exponent. 0 ignores degree entirely. */
  alpha: number;
  /** Require both sides to say FORM. */
  mutual: boolean;

  /** Strengthen rate for an existing tie. */
  ps: number;
  /** What an untouched tie loses per round. */
  decay: number;
  /** Strength a new tie is born at. */
  sInit: number;

  /** Run length in rounds, which the ramp is measured against. */
  days: number;
}

/**
 * A starting point that shows something within a two-hundred-day run, not a
 * claim about how the world works.
 *
 * Tuned against the prototype population after the first pass produced nothing
 * at all: formation pressure of 0.25 against a saturation reference of 12, with
 * mean degree already 19, left every character three-quarters unavailable, and
 * mutual consent then squared that. Decay of 3 a round against a strength floor
 * of 10 killed every below-median tie in four days, which fragmented the
 * population into three hundred components while the cores quietly densified.
 * Both are legitimate regimes. Neither is a good first thing to look at.
 */
export const DEFAULT_PARAMS: Params = {
  own: 20,
  fof: 60,
  cross: 20,
  ramp: true,
  p: 0.35,
  d0: 25,
  lambda: 0.35,
  alpha: 0.5,
  mutual: true,
  ps: 0.15,
  decay: 1.5,
  sInit: 30,
  days: 200,
};

/** What a successful STRENGTHEN adds. Fixed: the two rates that matter are
 * formation pressure and decay, and a third knob here would only re-express
 * the decay slider in different units. */
const STRENGTHEN_STEP = 10;

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
}

/** Canonical undirected key. `n` stays below 10^4 here, so this fits an int. */
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
  return { round: 0, adj, touched: new Set(), formed: 0, cut: 0, rng: mulberry32(seed) };
}

/** The k-th neighbour of u. Maps are not indexable, and degree is small enough
 * (mean 19 in the prototype population) that walking is cheaper than keeping a
 * parallel array in sync through every FORM and CUT. */
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
  const ramp = params.ramp ? Math.min(1, state.round / Math.max(1, params.days)) : 1;
  const cross = params.cross * ramp;
  const total = params.own + params.fof + cross;

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

    // Anyone outside my own world. Rejection sampling: the largest world is
    // about half the prototype population, so this is under two draws.
    for (let tries = 0; tries < 12; tries++) {
      const v = Math.floor(state.rng() * world.n);
      if (world.world[v] !== w) return v;
    }
    return -1;
  };
}

/** P(u says FORM about v). */
function formProbability(state: SimState, params: Params, meanDegree: number, u: number, v: number): number {
  const du = state.adj[u].size;
  const dv = state.adj[v].size;
  const saturation = 1 / (1 + du / Math.max(1e-6, params.d0));
  const triadic = 1 + params.lambda * overlap(state, u, v);
  const attachment = params.alpha === 0 ? 1 : Math.pow(Math.max(dv, 1) / Math.max(meanDegree, 1), params.alpha);
  return Math.min(1, params.p * saturation * triadic * attachment);
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
  const encounter = drawEncounter(state, world, params);
  for (let u = 0; u < n; u++) {
    const v = encounter(u);
    if (v < 0 || v === u || state.adj[u].has(v)) continue;
    if (state.rng() >= formProbability(state, params, meanDegree, u, v)) continue;
    if (params.mutual && state.rng() >= formProbability(state, params, meanDegree, v, u)) continue;
    state.adj[u].set(v, params.sInit);
    state.adj[v].set(u, params.sInit);
    state.touched.add(key(n, u, v));
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

      const strengthen = params.ps * (1 + params.lambda * overlap(state, u, v)) * (1 - s / S_MAX);
      if (state.rng() < strengthen) {
        const next = Math.min(S_MAX, s + STRENGTHEN_STEP);
        row.set(v, next);
        state.adj[v].set(u, next);
        state.touched.add(k);
        continue;
      }

      const next = s - params.decay;
      if (next <= 0) {
        row.delete(v);
        state.adj[v].delete(u);
        state.cut++;
      } else {
        row.set(v, next);
        state.adj[v].set(u, next);
      }
    }
  }

  state.round++;
  return { formed: state.formed, cut: state.cut };
}
