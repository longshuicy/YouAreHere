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
  MIN_WORLD_RADIUS,
  NODE_WASH,
  PAPER,
  S_MAX,
  S_MIN,
  WORLD_GAP,
  WORLD_SCALE,
  mixHex,
} from './constants';

export { S_MAX, S_MIN } from './constants';

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

/**
 * Where the worlds sit at t = 0.
 *
 * They used to go on a square grid at a fixed pitch, every cell the same size
 * whatever was in it. 水滸傳 has 974 characters and Indiana Jones has 20, and
 * both got the same square — so the small worlds floated in acres of nothing
 * while the big ones very nearly touched, and the drawing spent most of its
 * area saying nothing. The pitch was a constant; only the radius varied.
 *
 * So they are packed instead, largest first, each one placed at whichever
 * position tangent to two already-placed worlds sits closest to the origin.
 * That is the standard greedy circle pack, and at fifty-two circles the
 * quadratic candidate search is a few hundred thousand operations once, at
 * load — nothing worth being clever about. The result is a rough disc whose
 * area is the population, which is the picture the experiment is about.
 */
export function packCircles(radii: number[], gap: number): { x: number[]; y: number[] } {
  const n = radii.length;
  const x = new Array<number>(n).fill(0);
  const y = new Array<number>(n).fill(0);
  if (n === 0) return { x, y };
  const order = radii.map((_, i) => i).sort((a, b) => radii[b] - radii[a]);
  const placed: number[] = [];

  /** Does a circle of radius `r` at (cx, cy) clear everything already down? */
  const clear = (cx: number, cy: number, r: number): boolean => {
    for (const m of placed) {
      const need = radii[m] + r + gap;
      const dx = cx - x[m];
      const dy = cy - y[m];
      if (dx * dx + dy * dy < need * need - 1e-6) return false;
    }
    return true;
  };

  for (const i of order) {
    const r = radii[i];
    if (placed.length === 0) {
      placed.push(i);
      continue;
    }
    if (placed.length === 1) {
      const j = placed[0];
      x[i] = x[j] + radii[j] + gap + r;
      placed.push(i);
      continue;
    }

    let best: { x: number; y: number; d: number } | null = null;
    for (let a = 0; a < placed.length; a++) {
      for (let b = a + 1; b < placed.length; b++) {
        const j = placed[a];
        const k = placed[b];
        for (const p of tangentTo(x[j], y[j], radii[j] + gap + r, x[k], y[k], radii[k] + gap + r)) {
          if (!clear(p.x, p.y, r)) continue;
          const d = Math.hypot(p.x, p.y);
          if (!best || d < best.d) best = { x: p.x, y: p.y, d };
        }
      }
    }

    if (best) {
      x[i] = best.x;
      y[i] = best.y;
    } else {
      // No tangent position was free, which a pack of discs should not manage
      // but a degenerate set of radii could. Walk out along a ring until there
      // is room, so a pathological input still produces a drawing.
      let ring = 0;
      outer: for (;;) {
        ring += gap + r;
        const steps = Math.max(8, Math.round((2 * Math.PI * ring) / Math.max(r, gap)));
        for (let t = 0; t < steps; t++) {
          const a = (t / steps) * Math.PI * 2;
          const cx = Math.cos(a) * ring;
          const cy = Math.sin(a) * ring;
          if (clear(cx, cy, r)) {
            x[i] = cx;
            y[i] = cy;
            break outer;
          }
        }
      }
    }
    placed.push(i);
  }
  return { x, y };
}

/** The nought, one or two points at distance `ra` from A and `rb` from B. */
function tangentTo(
  ax: number,
  ay: number,
  ra: number,
  bx: number,
  by: number,
  rb: number,
): { x: number; y: number }[] {
  const dx = bx - ax;
  const dy = by - ay;
  const d = Math.hypot(dx, dy);
  if (d < 1e-9 || d > ra + rb || d < Math.abs(ra - rb)) return [];
  const a = (ra * ra - rb * rb + d * d) / (2 * d);
  const h2 = ra * ra - a * a;
  if (h2 < 0) return [];
  const h = Math.sqrt(h2);
  const mx = ax + (a * dx) / d;
  const my = ay + (a * dy) / d;
  return [
    { x: mx + (h * dy) / d, y: my - (h * dx) / d },
    { x: mx - (h * dy) / d, y: my + (h * dx) / d },
  ];
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

  const maxN = Math.max(...universes.map((u) => u.nodes.length));
  // Where each world sits, packed rather than gridded. See `packCircles`.
  const radii = universes.map((u) => Math.max(MIN_WORLD_RADIUS, Math.sqrt(u.nodes.length / maxN)));
  const home = packCircles(radii, WORLD_GAP);

  let offset = 0;
  universes.forEach((u, w) => {
    worldStart[w] = offset;
    worldSize[w] = u.nodes.length;

    // Normalise this world's shipped layout into a disc, then drop it on the
    // grid. The shipped coordinates are per-world and in arbitrary units.
    let maxR = 1e-9;
    for (const node of u.nodes) maxR = Math.max(maxR, Math.hypot(node.x, node.y));
    const cx = home.x[w];
    const cy = home.y[w];
    const radius = radii[w];

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
