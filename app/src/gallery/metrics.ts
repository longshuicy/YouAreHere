/**
 * Every figure the gallery draws, computed in the browser from the shipped
 * graphs. Nothing here is fetched, cached or baked.
 *
 * The reason is in docs/The topology lab.md: metrics split into *intrinsic*
 * — properties of one graph, which never move when another book is added — and
 * *relative*, which are defined against the corpus and change with every
 * addition. Everything in this file is intrinsic. That is what makes it safe to
 * compute once per world and keep: a world's card is a fact about that world,
 * so it may only change when the world does.
 *
 * The same rule governs the scales the card draws against, which are fixed
 * constants below rather than the catalogue's own minimum and maximum. Quantiles
 * over the loaded corpus would be better balanced today and wrong tomorrow —
 * every world added would silently redraw every card that was already correct.
 * `ChooseWorld`'s size bands make the same argument at more length.
 */

import type { Universe } from '../types';

/** Degree bands for the distribution panel. Fixed, roughly doubling, and wide
 * enough at the top that a novel's hubs do not need a band each. */
export const DEGREE_BANDS: readonly [number, number][] = [
  [1, 2],
  [3, 4],
  [5, 8],
  [9, 16],
  [17, 32],
  [33, Infinity],
];

/** The horizon strip's axis, log-scaled. A gain of 1 is someone who already
 * sees their whole world; the ceiling is well above any single-world maximum so
 * the axis never needs to grow. */
export const GAIN_AXIS = { min: 1, max: 100 } as const;

export interface CharacterMetrics {
  i: number;
  name: string;
  degree: number;
  /** Everyone within two hops, not counting themselves. */
  reach: number;
  /** How much the second ring multiplies the first. 1.0 means the second ring
   * adds nobody — you already see everyone you are ever going to. */
  gain: number;
  /** Rank of weighted degree, 0 to 1. Matches `difficulty._prominence`. */
  prominence: number;
  clustering: number;
  /** Which camp the partition put them in. */
  community: number;
  /** Cumulative reach at hop 0, 1, 2, 3 — the step curve on the detail panel. */
  horizonCurve: number[];
  /** How much of their own world is within two hops, 0 to 1. Reach itself is a
   * count and so is mostly a statement about cast size; as a share it is the
   * same question asked in a way a play and a saga can both answer. */
  reachShare: number;
  /** How much of the cast is in their camp, 0 to 1. */
  campShare: number;
  /**
   * Rank inside their own world of weight per tie, 0 to 1.
   *
   * The gallery doc calls this the plain-against-weighted gap and asks for it as
   * a number: who meets many people once, against who is actually present
   * throughout. High is a character who keeps turning up with the same few;
   * low is one who is introduced to everybody and then leaves.
   */
  depth: number;
}

export interface WorldMetrics {
  id: string;
  title: string;
  nodes: number;
  edges: number;
  density: number;
  /** Gini of weighted degree: how unequally the story's presence is shared. */
  concentration: number;
  /** Newman modularity of a deterministic label-propagation partition. */
  modularity: number;
  communities: number;
  /** Mean local clustering over characters with at least two ties. */
  clustering: number;
  /** Degree assortativity: do the well-connected attach to each other? */
  assortativity: number;
  /** Highest gain ÷ median gain: how far the furthest character stands from a
   * typical one. The card's horizon number. */
  horizonSpread: number;
  /**
   * Freeman degree centralization: how much of the world's connection runs
   * through its single most connected character, against the star of the same
   * size where it all would.
   *
   * Not a second `concentration`. The Gini above answers the same question in
   * spirit and is unusable for comparing worlds, because it tracks cast size at
   * rho 0.79 across the catalogue — rank the corpus by it and you have ranked it
   * by length. This is normalised by construction against the most centralised
   * graph on the same number of nodes, and comes out at rho -0.03. See the
   * cast-size note, which is the argument.
   */
  centralization: number;
  /** Mean distance between two characters, in handshakes. */
  meanDistance: number;
  /** Longest of those distances. */
  diameter: number;
  /**
   * Mean distance ÷ ln(cast): how far apart people are, once the fact that a
   * bigger world needs more hops is divided out. Low is one room; high is a
   * chain of places that touch at the edges.
   */
  distanceSpread: number;
  degreeHistogram: number[];
  characters: CharacterMetrics[];
}

interface Adjacency {
  ids: number[];
  neighbours: Map<number, number[]>;
  weighted: Map<number, number>;
  totalWeight: number;
}

function adjacencyOf(universe: Universe): Adjacency {
  const neighbours = new Map<number, number[]>();
  const weighted = new Map<number, number>();
  const seen = new Map<number, Set<number>>();
  const ids: number[] = [];

  for (const node of universe.nodes) {
    ids.push(node.i);
    neighbours.set(node.i, []);
    weighted.set(node.i, 0);
    seen.set(node.i, new Set());
  }

  let totalWeight = 0;
  for (const [source, target, weight] of universe.edges) {
    if (source === target) continue;
    const a = seen.get(source);
    const b = seen.get(target);
    // A graph that lists a tie twice would otherwise double a degree and skew
    // every figure downstream of it.
    if (!a || !b || a.has(target)) continue;
    a.add(target);
    b.add(source);
    neighbours.get(source)!.push(target);
    neighbours.get(target)!.push(source);
    weighted.set(source, weighted.get(source)! + weight);
    weighted.set(target, weighted.get(target)! + weight);
    totalWeight += weight;
  }

  return { ids, neighbours, weighted, totalWeight };
}

/** The same ties as `adjacencyOf`, packed into contiguous indices for Louvain. */
function weightedGraphOf(universe: Universe, ids: number[]): WeightedGraph {
  const slot = new Map(ids.map((id, i) => [id, i]));
  const size = ids.length;
  const links: { to: number; w: number }[][] = Array.from({ length: size }, () => []);
  const seen = new Set<string>();
  let totalWeight = 0;

  for (const [source, target, weight] of universe.edges) {
    if (source === target) continue;
    const a = slot.get(source);
    const b = slot.get(target);
    if (a === undefined || b === undefined) continue;
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links[a].push({ to: b, w: weight });
    links[b].push({ to: a, w: weight });
    totalWeight += weight;
  }

  const strength = links.map((row) => row.reduce((sum, l) => sum + l.w, 0));
  return { size, links, selfLoop: new Array(size).fill(0), strength, totalWeight };
}

/**
 * Weighted degree as a rank from 0 to 1, matching the pipeline's `_prominence`.
 *
 * Ranked rather than raw because edge weights are not comparable between
 * datasets — a shared verse and a shared scene are different units. Ties are
 * broken by name so the ordering is stable between visits.
 */
function prominenceOf(adj: Adjacency, nameOf: Map<number, string>): Map<number, number> {
  const ordered = [...adj.ids].sort((a, b) => {
    const diff = adj.weighted.get(a)! - adj.weighted.get(b)!;
    if (diff !== 0) return diff;
    return (nameOf.get(a) ?? '').localeCompare(nameOf.get(b) ?? '');
  });
  const span = ordered.length - 1;
  const out = new Map<number, number>();
  ordered.forEach((id, rank) => out.set(id, span > 0 ? rank / span : 1));
  return out;
}

/**
 * Gini of weighted degree.
 *
 * Preferred to a top-decile share because the catalogue's worlds differ in size
 * by two orders of magnitude, and "the top 10%" is one and a bit characters in a
 * twelve-hander — a quantity that jumps rather than varies. Gini is defined at
 * every size and reads the same way at all of them.
 */
function giniOf(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const total = sorted.reduce((sum, v) => sum + v, 0);
  if (total <= 0) return 0;
  let weighted = 0;
  for (let i = 0; i < sorted.length; i++) weighted += (i + 1) * sorted[i];
  return (2 * weighted) / (sorted.length * total) - (sorted.length + 1) / sorted.length;
}

interface WeightedGraph {
  size: number;
  /** Ties out of each node, excluding self-loops. */
  links: { to: number; w: number }[][];
  /** Weight folded into a node by aggregation, counted once. */
  selfLoop: number[];
  strength: number[];
  totalWeight: number;
}

/**
 * Communities by weighted Louvain, with every source of randomness removed.
 *
 * Label propagation was tried first and is not usable here. On the small plays —
 * most of the catalogue — a co-appearance graph is dense enough that propagation
 * collapses the whole cast into one label, and it reported *Romeo and Juliet* as
 * a single undivided community. A play with two feuding households is the one
 * case the metric exists to catch, so the failure was total rather than
 * marginal. Louvain optimises modularity directly and will not merge two camps
 * when merging lowers the score.
 *
 * Weighted, because the collapse is caused by weak incidental ties: in a small
 * play nearly everyone shares a scene with nearly everyone, and only the weight
 * distinguishes a household from a crowd scene.
 *
 * Determinism, which the build's idempotence promise requires: nodes are visited
 * in index order rather than shuffled, and a tie between two equally good moves
 * goes to the lower community number.
 */
function louvain(graph: WeightedGraph): number[] {
  let current = graph;
  let mapping = Array.from({ length: graph.size }, (_, i) => i);

  for (let level = 0; level < 10; level++) {
    const community = localMoving(current);
    const distinct = new Set(community);
    if (distinct.size === current.size) break;

    mapping = mapping.map((c) => community[c]);
    const renumbered = renumber(community);
    mapping = mapping.map((c) => renumbered.get(c)!);
    current = aggregate(current, community, renumbered);
    if (current.size <= 1) break;
  }
  return mapping;
}

function renumber(community: number[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const c of [...new Set(community)].sort((a, b) => a - b)) out.set(c, out.size);
  return out;
}

function localMoving(graph: WeightedGraph): number[] {
  const community = Array.from({ length: graph.size }, (_, i) => i);
  const total = [...graph.strength];
  const twoM = 2 * graph.totalWeight;
  if (twoM <= 0) return community;

  for (let pass = 0; pass < 20; pass++) {
    let moved = false;
    for (let node = 0; node < graph.size; node++) {
      const own = community[node];
      const k = graph.strength[node];
      total[own] -= k;

      const toCommunity = new Map<number, number>();
      toCommunity.set(own, 0);
      for (const { to, w } of graph.links[node]) {
        const c = community[to];
        toCommunity.set(c, (toCommunity.get(c) ?? 0) + w);
      }

      let best = own;
      let bestGain = (toCommunity.get(own) ?? 0) - (total[own] * k) / twoM;
      for (const [c, weight] of [...toCommunity.entries()].sort((a, b) => a[0] - b[0])) {
        const gain = weight - (total[c] * k) / twoM;
        if (gain > bestGain) {
          bestGain = gain;
          best = c;
        }
      }

      total[best] += k;
      if (best !== own) {
        community[node] = best;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return community;
}

function aggregate(
  graph: WeightedGraph,
  community: number[],
  renumbered: Map<number, number>,
): WeightedGraph {
  const size = renumbered.size;
  const between = new Map<string, number>();
  const selfLoop = new Array(size).fill(0);

  for (let node = 0; node < graph.size; node++) {
    const a = renumbered.get(community[node])!;
    selfLoop[a] += graph.selfLoop[node];
    for (const { to, w } of graph.links[node]) {
      const b = renumbered.get(community[to])!;
      if (a === b) {
        // Each internal tie is walked from both ends; halve as it folds in.
        selfLoop[a] += w / 2;
      } else if (a < b) {
        const key = `${a}-${b}`;
        between.set(key, (between.get(key) ?? 0) + w);
      }
    }
  }

  const links: { to: number; w: number }[][] = Array.from({ length: size }, () => []);
  for (const [key, w] of between.entries()) {
    const [a, b] = key.split('-').map(Number);
    links[a].push({ to: b, w });
    links[b].push({ to: a, w });
  }

  const strength = new Array(size).fill(0);
  let totalWeight = 0;
  for (let i = 0; i < size; i++) {
    strength[i] = links[i].reduce((sum, l) => sum + l.w, 0) + 2 * selfLoop[i];
    totalWeight += links[i].reduce((sum, l) => sum + l.w, 0) / 2 + selfLoop[i];
  }
  return { size, links, selfLoop, strength, totalWeight };
}

/**
 * Newman modularity on the original graph: how much more of the story stays
 * inside a camp than chance alone would put there.
 */
function modularityOf(graph: WeightedGraph, community: number[]): number {
  const twoM = 2 * graph.totalWeight;
  if (twoM <= 0) return 0;

  const internal = new Map<number, number>();
  const incident = new Map<number, number>();

  for (let node = 0; node < graph.size; node++) {
    const c = community[node];
    incident.set(c, (incident.get(c) ?? 0) + graph.strength[node]);
    internal.set(c, (internal.get(c) ?? 0) + 2 * graph.selfLoop[node]);
    for (const { to, w } of graph.links[node]) {
      if (community[to] === c) internal.set(c, (internal.get(c) ?? 0) + w);
    }
  }

  let q = 0;
  for (const [c, incidentWeight] of incident.entries()) {
    q += (internal.get(c) ?? 0) / twoM - Math.pow(incidentWeight / twoM, 2);
  }
  return q;
}

function clusteringOf(adj: Adjacency): Map<number, number> {
  const out = new Map<number, number>();
  const sets = new Map<number, Set<number>>();
  for (const id of adj.ids) sets.set(id, new Set(adj.neighbours.get(id)!));

  for (const id of adj.ids) {
    const nbrs = adj.neighbours.get(id)!;
    if (nbrs.length < 2) {
      out.set(id, 0);
      continue;
    }
    let links = 0;
    for (let a = 0; a < nbrs.length; a++) {
      for (let b = a + 1; b < nbrs.length; b++) {
        if (sets.get(nbrs[a])!.has(nbrs[b])) links++;
      }
    }
    out.set(id, (2 * links) / (nbrs.length * (nbrs.length - 1)));
  }
  return out;
}

/** Pearson correlation of the degrees at each end of a tie. */
function assortativityOf(adj: Adjacency, universe: Universe): number {
  const deg = (id: number) => adj.neighbours.get(id)?.length ?? 0;
  const pairs: [number, number][] = [];
  for (const [source, target] of universe.edges) {
    if (source === target) continue;
    pairs.push([deg(source), deg(target)]);
  }
  if (pairs.length === 0) return 0;

  const m = pairs.length;
  let sumProduct = 0;
  let sumHalf = 0;
  let sumSquares = 0;
  for (const [a, b] of pairs) {
    sumProduct += a * b;
    sumHalf += (a + b) / 2;
    sumSquares += (a * a + b * b) / 2;
  }
  const meanHalf = sumHalf / m;
  const numerator = sumProduct / m - meanHalf * meanHalf;
  const denominator = sumSquares / m - meanHalf * meanHalf;
  return denominator === 0 ? 0 : numerator / denominator;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * p;
  const low = Math.floor(pos);
  const high = Math.ceil(pos);
  if (low === high) return sorted[low];
  return sorted[low] + (sorted[high] - sorted[low]) * (pos - low);
}

interface Walk {
  /** Cumulative reach at hop 0, 1, … `curveHops`. */
  curve: number[];
  /** Everyone reachable at any distance, not counting themselves. */
  reached: number;
  /** Summed distance to all of them. */
  distanceSum: number;
  /** The furthest of them. */
  eccentricity: number;
}

/**
 * One breadth-first walk out from a character, to the end of their component.
 *
 * It used to stop at `maxHop`, because the horizon curve is the only thing the
 * cards draw and three hops is all of it. Running to the end costs almost
 * nothing — most worlds here have a diameter of three to five, so the extra
 * hops are usually empty — and it is what the distance figures are made of, so
 * they ride along on a walk that was already being paid for rather than
 * doubling the work with a second pass.
 */
function walkFrom(adj: Adjacency, start: number, curveHops: number): Walk {
  const curve = [0];
  const seen = new Set<number>([start]);
  let frontier = [start];
  let distanceSum = 0;
  let eccentricity = 0;
  for (let hop = 1; frontier.length > 0 || hop <= curveHops; hop++) {
    const next: number[] = [];
    for (const id of frontier) {
      for (const n of adj.neighbours.get(id)!) {
        if (seen.has(n)) continue;
        seen.add(n);
        next.push(n);
      }
    }
    if (next.length > 0) {
      distanceSum += hop * next.length;
      eccentricity = hop;
    }
    if (hop <= curveHops) curve.push(seen.size - 1);
    frontier = next;
    // The curve is filled and the component is exhausted: nothing above this
    // hop can change either figure.
    if (next.length === 0 && hop >= curveHops) break;
  }
  return { curve, reached: seen.size - 1, distanceSum, eccentricity };
}

/**
 * Measurements already taken, keyed on the universe they were taken from.
 *
 * A world's graph never changes once it is fetched, and everything in
 * `WorldMetrics` is intrinsic — so a second measurement of the same object can
 * only ever produce the same answer, and the first one is worth keeping. Weak,
 * so a world dropped from memory takes its measurements with it.
 *
 * This is the floor under the gallery's cost rather than the fix for any one
 * caller: with it, re-measuring the catalogue is free however often a component
 * is handed a new array, and loading a book costs one world's work instead of
 * the whole shelf's. Callers should still hold their list steady — see
 * `universeList` in App.tsx — because a stable list also keeps everything
 * derived *from* the measurements from being rebuilt.
 */
const measured = new WeakMap<Universe, WorldMetrics>();

export function measureWorld(universe: Universe): WorldMetrics {
  const already = measured.get(universe);
  if (already) return already;
  const metrics = measureWorldOnce(universe);
  measured.set(universe, metrics);
  return metrics;
}

function measureWorldOnce(universe: Universe): WorldMetrics {
  const adj = adjacencyOf(universe);
  const nameOf = new Map(universe.nodes.map((n) => [n.i, n.n]));
  const prominence = prominenceOf(adj, nameOf);
  const clustering = clusteringOf(adj);
  const weightedGraph = weightedGraphOf(universe, adj.ids);
  const community = louvain(weightedGraph);

  const characters: CharacterMetrics[] = [];
  const degreeHistogram = new Array(DEGREE_BANDS.length).fill(0);
  const slot = new Map(adj.ids.map((id, i) => [id, i]));
  /** Every walk's distances, summed as the walks happen. Both are over ordered
   * pairs — each tie is counted from both ends — which is what the mean of them
   * wants anyway, and it means a disconnected graph contributes only the pairs
   * that actually have a distance rather than an infinity. */
  let pairDistance = 0;
  let pairs = 0;
  let diameter = 0;

  /** Weight per tie, ranked within the world — the raw figure is in whatever
   * units the source counted in, which differ between a script and a novel, so
   * only its order means anything across the catalogue. */
  const perTie = new Map<number, number>();
  for (const id of adj.ids) {
    const degree = adj.neighbours.get(id)!.length;
    perTie.set(id, degree > 0 ? adj.weighted.get(id)! / degree : 0);
  }
  const perTieRank = new Map<number, number>();
  {
    const order = [...adj.ids].sort((a, b) => perTie.get(a)! - perTie.get(b)!);
    const last = Math.max(1, order.length - 1);
    order.forEach((id, i) => perTieRank.set(id, i / last));
  }
  const campSize = new Map<number, number>();
  for (const id of adj.ids) {
    const camp = community[slot.get(id)!] ?? 0;
    campSize.set(camp, (campSize.get(camp) ?? 0) + 1);
  }

  for (const id of adj.ids) {
    const nbrs = adj.neighbours.get(id)!;
    const degree = nbrs.length;

    const band = DEGREE_BANDS.findIndex(([low, high]) => degree >= low && degree <= high);
    if (band >= 0) degreeHistogram[band]++;

    const walk = walkFrom(adj, id, 3);
    const curve = walk.curve;
    const reach = curve[2] ?? 0;
    pairDistance += walk.distanceSum;
    pairs += walk.reached;
    if (walk.eccentricity > diameter) diameter = walk.eccentricity;

    characters.push({
      i: id,
      name: nameOf.get(id) ?? '',
      degree,
      reach,
      // Degree 0 has no first ring to multiply. It is reported as 1 — "your
      // world does not open" — rather than as a division by zero.
      gain: degree > 0 ? reach / degree : 1,
      prominence: prominence.get(id) ?? 0,
      clustering: clustering.get(id) ?? 0,
      community: community[slot.get(id)!] ?? 0,
      horizonCurve: curve,
      reachShare: adj.ids.length > 1 ? reach / (adj.ids.length - 1) : 0,
      campShare:
        adj.ids.length > 0
          ? (campSize.get(community[slot.get(id)!] ?? 0) ?? 0) / adj.ids.length
          : 0,
      depth: perTieRank.get(id) ?? 0,
    });
  }

  /**
   * How far the furthest character stands from a typical one.
   *
   * Chosen against the alternatives by measuring them, not by taste. The first
   * version used the 90th percentile over the 10th, which fails the case the
   * metric exists for: *Romeo and Juliet* scored 2.05 and *The Taming of the
   * Shrew* 1.91, when the whole difference between those two plays is that one
   * has an Apothecary — two ties, and nineteen people behind them — and the
   * other has nobody outside the story at all. Percentiles discard exactly the
   * outlier that is the finding.
   *
   * Raw maximum was worse in the other direction, correlating 0.95 with the log
   * of cast size: in a large enough world someone always stands far out, so it
   * measured how many characters there are. Against the median it separates the
   * two plays 5.0 to 1.4 and still ranks *King Lear* (eighteen characters) above
   * *A Song of Ice and Fire* (five hundred), which raw maximum cannot do.
   *
   * It remains an outlier statistic, and a single character decides it. That is
   * the stated blind spot rather than a defect: the outlier is the subject.
   */
  const connected = characters.filter((c) => c.degree > 0);
  const gains = connected.map((c) => c.gain).sort((a, b) => a - b);
  const median = percentile(gains, 0.5);
  const highest = gains.length > 0 ? gains[gains.length - 1] : 1;

  const withTwoTies = characters.filter((c) => c.degree >= 2);
  const n = adj.ids.length;

  /**
   * Freeman degree centralization: the summed shortfall of every character
   * against the best-connected one, over the largest that sum could be.
   *
   * The denominator is the star on n nodes — one character tied to everyone,
   * nobody else tied to anyone — where the shortfall is (n-1) - 1 for each of
   * the n-1 others. That is what makes it comparable between a twelve-hander
   * and a cast of nine hundred: both are measured against their own ceiling.
   */
  const degrees = adj.ids.map((id) => adj.neighbours.get(id)!.length);
  const topDegree = degrees.reduce((most, d) => Math.max(most, d), 0);
  const centralization =
    n > 2 ? degrees.reduce((sum, d) => sum + (topDegree - d), 0) / ((n - 1) * (n - 2)) : 0;

  const meanDistance = pairs > 0 ? pairDistance / pairs : 0;

  return {
    id: universe.id,
    title: universe.title,
    nodes: n,
    edges: universe.edges.length,
    density: n > 1 ? (2 * universe.edges.length) / (n * (n - 1)) : 0,
    concentration: giniOf(adj.ids.map((id) => adj.weighted.get(id)!)),
    modularity: modularityOf(weightedGraph, community),
    communities: new Set(community).size,
    clustering:
      withTwoTies.length > 0
        ? withTwoTies.reduce((sum, c) => sum + c.clustering, 0) / withTwoTies.length
        : 0,
    assortativity: assortativityOf(adj, universe),
    horizonSpread: median > 0 ? highest / median : 1,
    centralization,
    meanDistance,
    diameter,
    // ln(1) is zero and ln(2) is small enough to be noise. A world that short
    // has no distances worth normalising, so it reports none.
    distanceSpread: n > 2 ? meanDistance / Math.log(n) : 0,
    degreeHistogram,
    characters,
  };
}
