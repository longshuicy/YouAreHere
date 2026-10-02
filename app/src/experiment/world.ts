/**
 * The merged population: every shipped world laid side by side in one index
 * space, with no ties between them.
 *
 * That absence is the initial condition, not a gap to fill. Everything the
 * simulation does afterwards is measured against it.
 */

import type { Universe } from '../types';
import {
  CLAMP_K,
  GRID_PITCH,
  MIN_WORLD_RADIUS,
  NODE_WASH,
  PAPER,
  S_MAX,
  S_MIN,
  WORLD_SCALE,
  mixHex,
} from './constants';

export { S_MAX, S_MIN } from './constants';

/**
 * Six worlds: a shortcut in the world picker, and the fast instrument.
 *
 * Not a lesser version of the experiment — a different one. A round over six
 * worlds costs about a twentieth of a round over all fifty-two, so a parameter
 * can be turned and judged in seconds rather than a minute, and every rule here
 * was tuned on this set before it was ever run at scale. Deliberately spread
 * across languages and centuries so dissolution has somewhere to go.
 */
export const SIX_WORLDS = [
  'harry-potter',
  'hongloumeng',
  'shiji',
  'shakespeare-hamlet',
  'starwars',
  'odyssey',
] as const;

export interface MergedWorld {
  n: number;
  /** Display name per node. */
  name: string[];
  /** Which world each node came from. */
  world: Int32Array;
  worldIds: string[];
  worldTitles: string[];
  /** The shipped accent, used wherever one world is named on its own. */
  worldAccents: string[];
  /** The accent washed back toward the paper, for filling eight thousand nodes
   * at once. See `NODE_WASH`. */
  worldMarks: string[];
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

export function mergeWorlds(universes: Universe[]): MergedWorld {
  const n = universes.reduce((sum, u) => sum + u.nodes.length, 0);
  const name: string[] = new Array(n);
  const world = new Int32Array(n);
  const x0 = new Float32Array(n);
  const y0 = new Float32Array(n);
  const worldStart = new Int32Array(universes.length);
  const worldSize = new Int32Array(universes.length);
  const edges: [number, number, number][] = [];

  const cols = Math.ceil(Math.sqrt(universes.length));
  const maxN = Math.max(...universes.map((u) => u.nodes.length));

  let offset = 0;
  universes.forEach((u, w) => {
    worldStart[w] = offset;
    worldSize[w] = u.nodes.length;

    // Normalise this world's shipped layout into a disc, then drop it on the
    // grid. The shipped coordinates are per-world and in arbitrary units.
    let maxR = 1e-9;
    for (const node of u.nodes) maxR = Math.max(maxR, Math.hypot(node.x, node.y));
    const cx = (w % cols) * GRID_PITCH;
    const cy = Math.floor(w / cols) * GRID_PITCH;
    const radius = Math.max(MIN_WORLD_RADIUS, Math.sqrt(u.nodes.length / maxN));

    u.nodes.forEach((node, i) => {
      const id = offset + i;
      name[id] = node.n;
      world[id] = w;
      x0[id] = cx + (node.x / maxR) * radius;
      y0[id] = cy + (node.y / maxR) * radius;
    });

    const med = median(u.edges.map((e) => e[2]));
    for (const [a, b, weight] of u.edges) {
      edges.push([offset + a, offset + b, initialStrength(weight, med, CLAMP_K)]);
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
  for (let i = 0; i < n; i++) {
    x0[i] = (x0[i] - mx) * WORLD_SCALE;
    y0[i] = (y0[i] - my) * WORLD_SCALE;
  }

  return {
    n,
    name,
    world,
    worldIds: universes.map((u) => u.id),
    worldTitles: universes.map((u) => u.title),
    worldAccents: universes.map((u) => u.accent),
    worldMarks: universes.map((u) => mixHex(u.accent, PAPER, NODE_WASH)),
    worldStart,
    worldSize,
    x0,
    y0,
    edges,
  };
}

/** Each world's home on the grid, for the layout's tether. */
export function worldHomes(world: MergedWorld): { x: Float64Array; y: Float64Array } {
  const x = new Float64Array(world.worldIds.length);
  const y = new Float64Array(world.worldIds.length);
  for (let w = 0; w < world.worldIds.length; w++) {
    let sx = 0;
    let sy = 0;
    for (let i = world.worldStart[w]; i < world.worldStart[w] + world.worldSize[w]; i++) {
      sx += world.x0[i];
      sy += world.y0[i];
    }
    x[w] = sx / world.worldSize[w];
    y[w] = sy / world.worldSize[w];
  }
  return { x, y };
}
