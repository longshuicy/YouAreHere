/**
 * The merged population: several shipped worlds laid side by side in one index
 * space, with no ties between them.
 *
 * That absence is the initial condition, not a gap to fill. Everything the
 * simulation does afterwards is measured against it.
 */

import type { Universe } from '../types';

/** The prototype's population. Small enough that SVG holds the drawing and
 * d3-force runs on the main thread; wide enough that dissolution has somewhere
 * to go. Deliberately spread across languages and centuries. */
export const PROTOTYPE_WORLDS = [
  'harry-potter',
  'hongloumeng',
  'shiji',
  'shakespeare-hamlet',
  'starwars',
  'odyssey',
] as const;

/** Strength floor and ceiling. A tie at 0 is cut, so nothing starts at 0 — and
 * the floor is well clear of it, because a tie that begins one decay step from
 * death is not a weak tie, it is a tie that was never in the experiment. */
export const S_MIN = 25;
export const S_MAX = 100;

export interface MergedWorld {
  n: number;
  /** Display name per node. */
  name: string[];
  /** Which world each node came from. */
  world: Int32Array;
  worldIds: string[];
  worldTitles: string[];
  worldAccents: string[];
  /** First node index of each world; worlds are contiguous, which makes an
   * own-world draw a single integer range. */
  worldStart: Int32Array;
  worldSize: Int32Array;
  /** Starting positions: each world's own shipped layout, normalised and
   * dropped onto a grid, so t = 0 looks like scattered islands. */
  x0: Float32Array;
  y0: Float32Array;
  /** Initial ties as [u, v, s]. */
  edges: [number, number, number][];
}

/**
 * Initial tie strength: log against the world's own median.
 *
 * The shipped weight is in incomparable units — Congress runs 50 → 81 → 1135,
 * Hamlet 1 → 1 → 9 — so a shared decay step would erase Hamlet and leave
 * Congress untouched. Measuring each tie against its own world's median makes
 * *how far above typical* mean the same thing everywhere, and unlike quantile
 * bins it does not flatten magnitude: a tie eight times typical stays eight
 * times typical.
 *
 * `k` is the clamp in doublings. Past 2^k above or below the median, everything
 * piles at the ceiling or the floor.
 */
export function initialStrength(w: number, median: number, k: number): number {
  const z = Math.log2(Math.max(w, 1e-9) / Math.max(median, 1e-9));
  const t = (Math.min(Math.max(z, -k), k) + k) / (2 * k);
  return S_MIN + t * (S_MAX - S_MIN);
}

function median(values: number[]): number {
  if (values.length === 0) return 1;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[(sorted.length - 1) >> 1];
}

/** Lay the worlds out on the squarest grid that holds them. */
function gridSlots(count: number): { cols: number; rows: number } {
  const cols = Math.ceil(Math.sqrt(count));
  return { cols, rows: Math.ceil(count / cols) };
}

export function mergeWorlds(universes: Universe[], clampK: number): MergedWorld {
  const n = universes.reduce((sum, u) => sum + u.nodes.length, 0);
  const name: string[] = new Array(n);
  const world = new Int32Array(n);
  const x0 = new Float32Array(n);
  const y0 = new Float32Array(n);
  const worldStart = new Int32Array(universes.length);
  const worldSize = new Int32Array(universes.length);
  const edges: [number, number, number][] = [];

  const { cols } = gridSlots(universes.length);
  /** Every world is normalised into a disc, but not into the *same* disc: a
   * thirty-character play given the same radius as a four-hundred-character
   * saga reads as a few specks in a lot of nothing. Radius goes as √n, so the
   * islands start at comparable density. */
  const maxN = Math.max(...universes.map((u) => u.nodes.length));
  /** How far apart the island centres sit, in the same units as the normalised
   * world radius (1.0). Loose enough that nothing overlaps at t = 0. */
  const PITCH = 2.6;

  let offset = 0;
  universes.forEach((u, w) => {
    worldStart[w] = offset;
    worldSize[w] = u.nodes.length;

    // Normalise this world's shipped layout into a unit disc, then drop it on
    // the grid. The shipped coordinates are per-world and in arbitrary units.
    let maxR = 1e-9;
    for (const node of u.nodes) maxR = Math.max(maxR, Math.hypot(node.x, node.y));
    const cx = (w % cols) * PITCH;
    const cy = Math.floor(w / cols) * PITCH;
    const radius = Math.max(0.3, Math.sqrt(u.nodes.length / maxN));

    u.nodes.forEach((node, i) => {
      const id = offset + i;
      name[id] = node.n;
      world[id] = w;
      x0[id] = cx + (node.x / maxR) * radius;
      y0[id] = cy + (node.y / maxR) * radius;
    });

    const med = median(u.edges.map((e) => e[2]));
    for (const [a, b, weight] of u.edges) {
      edges.push([offset + a, offset + b, initialStrength(weight, med, clampK)]);
    }

    offset += u.nodes.length;
  });

  // Centre the whole field on the origin so the first frame is not off-screen.
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    sx += x0[i];
    sy += y0[i];
  }
  const mx = sx / n;
  const my = sy / n;
  /** The force layout works in pixels; the grid above works in world radii. */
  const SCALE = 180;
  for (let i = 0; i < n; i++) {
    x0[i] = (x0[i] - mx) * SCALE;
    y0[i] = (y0[i] - my) * SCALE;
  }

  return {
    n,
    name,
    world,
    worldIds: universes.map((u) => u.id),
    worldTitles: universes.map((u) => u.title),
    worldAccents: universes.map((u) => u.accent),
    worldStart,
    worldSize,
    x0,
    y0,
    edges,
  };
}
