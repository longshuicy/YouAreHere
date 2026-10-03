/**
 * The end-of-run report: everything too expensive to compute while a run is
 * moving.
 *
 * The split is by cost, not by interest. metrics.ts holds the O(V+E) figures
 * that update every round — world loyalty and cross-world share, the two that
 * tell the story. These are the structural ones, and they are measured once,
 * when the run stops.
 */

import { LOUVAIN_PASSES, MIN_COMMUNITY, PATH_SAMPLE_SOURCES } from './constants';
import type { SimState } from './sim';
import type { MergedWorld } from './world';

export interface Report {
  round: number;
  clustering: number;
  /** Groups of at least `MIN_COMMUNITY`. See the note there. */
  communities: number;
  /** Characters left in a group of their own. */
  singletons: number;
  modularity: number;
  /** Sampled, not exact. See `PATH_SAMPLE_SOURCES`. */
  meanPathLength: number;
  /** Share of sampled pairs with no path at all. */
  unreachable: number;
  /** Degree assortativity: do hubs attach to hubs? */
  assortativity: number;
  /** How far each world's shape has moved from the one the story made. */
  drift: { world: number; value: number }[];
}

function neighbours(state: SimState): number[][] {
  return state.adj.map((row) => [...row.keys()]);
}

/** Watts–Strogatz average local clustering. */
function clustering(adj: number[][]): number {
  let total = 0;
  let counted = 0;
  const mark = new Uint8Array(adj.length);
  for (let u = 0; u < adj.length; u++) {
    const nb = adj[u];
    if (nb.length < 2) continue;
    for (const v of nb) mark[v] = 1;
    let links = 0;
    for (const v of nb) for (const w of adj[v]) if (mark[w]) links++;
    for (const v of nb) mark[v] = 0;
    // `links` counted each triangle edge twice across the neighbourhood.
    total += links / (nb.length * (nb.length - 1));
    counted++;
  }
  return counted > 0 ? total / counted : 0;
}

/**
 * Louvain, first phase only, repeated.
 *
 * Enough for the question being asked — how many communities are there, and how
 * modular is the result — without the aggregation pass. At this size the extra
 * passes mostly move singletons between neighbouring communities.
 */
function louvain(adj: number[][], m2: number): { community: Int32Array; modularity: number } {
  const n = adj.length;
  const community = new Int32Array(n);
  for (let i = 0; i < n; i++) community[i] = i;
  const degree = new Float64Array(n);
  for (let i = 0; i < n; i++) degree[i] = adj[i].length;
  const totalDegree = new Float64Array(n);
  totalDegree.set(degree);

  for (let pass = 0; pass < LOUVAIN_PASSES; pass++) {
    let moved = false;
    for (let u = 0; u < n; u++) {
      if (degree[u] === 0) continue;
      const own = community[u];
      totalDegree[own] -= degree[u];

      const weights = new Map<number, number>();
      for (const v of adj[u]) weights.set(community[v], (weights.get(community[v]) ?? 0) + 1);

      let best = own;
      let bestGain = (weights.get(own) ?? 0) - (totalDegree[own] * degree[u]) / m2;
      for (const [c, w] of weights) {
        const gain = w - (totalDegree[c] * degree[u]) / m2;
        if (gain > bestGain) {
          bestGain = gain;
          best = c;
        }
      }
      totalDegree[best] += degree[u];
      if (best !== own) {
        community[u] = best;
        moved = true;
      }
    }
    if (!moved) break;
  }

  // Modularity of the partition that came out.
  const inside = new Map<number, number>();
  const tot = new Map<number, number>();
  let edges = 0;
  for (let u = 0; u < n; u++) {
    tot.set(community[u], (tot.get(community[u]) ?? 0) + degree[u]);
    for (const v of adj[u]) {
      if (v <= u) continue;
      edges++;
      if (community[u] === community[v]) {
        inside.set(community[u], (inside.get(community[u]) ?? 0) + 1);
      }
    }
  }
  let q = 0;
  if (edges > 0) {
    for (const [c, t] of tot) {
      q += (inside.get(c) ?? 0) / edges - Math.pow(t / (2 * edges), 2);
    }
  }
  return { community, modularity: q };
}

/** Breadth-first from a sample of sources. Exact is |V| searches and takes
 * seconds; this costs about a tenth of one. */
function sampledPaths(adj: number[][], sources: number): { mean: number; unreachable: number } {
  const n = adj.length;
  if (n === 0) return { mean: 0, unreachable: 0 };
  const dist = new Int32Array(n);
  const queue = new Int32Array(n);
  let sum = 0;
  let pairs = 0;
  let missed = 0;
  const stride = Math.max(1, Math.floor(n / sources));
  for (let s = 0; s < n; s += stride) {
    dist.fill(-1);
    dist[s] = 0;
    let head = 0;
    let tail = 0;
    queue[tail++] = s;
    let reached = 0;
    while (head < tail) {
      const u = queue[head++];
      for (const v of adj[u]) {
        if (dist[v] !== -1) continue;
        dist[v] = dist[u] + 1;
        sum += dist[v];
        reached++;
        queue[tail++] = v;
      }
    }
    pairs += reached;
    missed += n - 1 - reached;
  }
  return {
    mean: pairs > 0 ? sum / pairs : 0,
    unreachable: pairs + missed > 0 ? missed / (pairs + missed) : 0,
  };
}

/** Pearson correlation of the degrees at either end of a tie. */
function assortativity(adj: number[][]): number {
  let m = 0;
  let sum1 = 0;
  let sum2 = 0;
  let sumProd = 0;
  for (let u = 0; u < adj.length; u++) {
    for (const v of adj[u]) {
      if (v <= u) continue;
      const a = adj[u].length;
      const b = adj[v].length;
      m++;
      sum1 += a + b;
      sum2 += a * a + b * b;
      sumProd += a * b;
    }
  }
  if (m === 0) return 0;
  const half = sum1 / (2 * m);
  const num = sumProd / m - half * half;
  const den = sum2 / (2 * m) - half * half;
  return den === 0 ? 0 : num / den;
}

/**
 * Drift from the shape the story made.
 *
 * Each world's fingerprint is three intrinsic numbers — mean degree, mean local
 * clustering, and degree concentration (the share of ties held by the top tenth
 * of the cast) — measured over the characters who started in that world, using
 * only their ties to each other. So it compares like with like: this world's
 * internal shape then, against this world's internal shape now. Cross-world
 * ties are the subject of every other figure here; they are excluded from this
 * one on purpose, because the question is what happened to the story's own
 * structure, not how much of it leaked.
 */
function fingerprint(adj: number[][], members: number[], inWorld: (v: number) => boolean) {
  const degrees = members.map((u) => adj[u].filter(inWorld).length);
  const mean = degrees.reduce((a, b) => a + b, 0) / Math.max(1, degrees.length);
  const sorted = [...degrees].sort((a, b) => b - a);
  const top = sorted.slice(0, Math.max(1, Math.round(sorted.length * 0.1)));
  const total = sorted.reduce((a, b) => a + b, 0);
  const concentration = total > 0 ? top.reduce((a, b) => a + b, 0) / total : 0;

  const index = new Map(members.map((u, k) => [u, k]));
  const local = members.map((u) => {
    const nb = adj[u].filter((v) => inWorld(v) && index.has(v));
    if (nb.length < 2) return 0;
    const set = new Set(nb);
    let links = 0;
    for (const v of nb) for (const w of adj[v]) if (set.has(w)) links++;
    return links / (nb.length * (nb.length - 1));
  });
  const clust = local.reduce((a, b) => a + b, 0) / Math.max(1, local.length);
  return { mean, concentration, clust };
}

/** Communities worth the name, and the characters left over. */
function tally(community: Int32Array): { communities: number; singletons: number } {
  const size = new Map<number, number>();
  for (const c of community) size.set(c, (size.get(c) ?? 0) + 1);
  let communities = 0;
  let singletons = 0;
  for (const count of size.values()) {
    if (count >= MIN_COMMUNITY) communities++;
    else if (count === 1) singletons++;
  }
  return { communities, singletons };
}

export function buildReport(state: SimState, world: MergedWorld, start: SimState): Report {
  const adj = neighbours(state);
  let edges = 0;
  for (const row of adj) edges += row.length;
  const { community, modularity } = louvain(adj, Math.max(1, edges));
  const paths = sampledPaths(adj, PATH_SAMPLE_SOURCES);

  const startAdj = neighbours(start);
  const drift = world.worldIds.map((_, w) => {
    const members: number[] = [];
    for (let i = world.worldStart[w]; i < world.worldStart[w] + world.worldSize[w]; i++) {
      members.push(i);
    }
    const inWorld = (v: number) => world.world[v] === w;
    const then = fingerprint(startAdj, members, inWorld);
    const now = fingerprint(adj, members, inWorld);
    // Each term normalised by its own starting value, so a play and a saga
    // contribute on the same scale.
    const d = Math.sqrt(
      Math.pow((now.mean - then.mean) / Math.max(then.mean, 1e-6), 2) +
        Math.pow(now.clust - then.clust, 2) +
        Math.pow(now.concentration - then.concentration, 2),
    );
    return { world: w, value: d };
  });

  return {
    round: state.round,
    clustering: clustering(adj),
    ...tally(community),
    modularity,
    meanPathLength: paths.mean,
    unreachable: paths.unreachable,
    assortativity: assortativity(adj),
    drift: drift.sort((a, b) => b.value - a.value),
  };
}
