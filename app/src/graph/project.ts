import type { Known } from '../engine/session';
import type { NodeIndex, Universe } from '../types';

/**
 * The security boundary. This is the ONLY thing standing between the fully
 * loaded universe (every name, every weight) and the render layer. Components
 * under /render and /screens must never receive a `Universe` directly — only
 * the `VisibleGraph` this function returns.
 */
export interface VisibleNode {
  i: NodeIndex;
  isYou: boolean;
  /** Free, always: node size encodes degree, in the full graph. */
  degree: number;
  expanded: boolean;
  name: string | null;
  /** Left behind by an expansion: the first character of this node's name and
   * how long it is. Present only while the node is unnamed — once there is a
   * name, the monogram has nothing left to say. */
  monogram: { initial: string; length: number } | null;
  /** True when the name was got right rather than bought. Drawn no differently;
   * carried so the reveal can count them. */
  recognised: boolean;
  /** Names the player put to this node and was refused, newest last. */
  rejected: string[];
  /** True for a node that was just added by the most recent expand — used to
   * apply reduced-opacity "frontier" styling and to animate outward. */
  hop: number;
}

export interface VisibleEdge {
  source: NodeIndex;
  target: NodeIndex;
  /**
   * Tie strength on one scale for the whole world, 0 to 1. Always shown — it is
   * the evidence the puzzle is made of, and charging for it was charging for
   * the diagram itself.
   *
   * This used to be the per-endpoint *rank*: how strong the tie was relative to
   * that character's own other ties. The reasoning was that raw weights are not
   * comparable across datasets, which is true, and the conclusion drawn from it
   * was wrong. Ranking per endpoint means every node has a strongest tie, a
   * second strongest and so on, so a hub and a leaf present the same ladder and
   * the diagram flattens into one repeated pattern. Thickness stopped saying
   * anything about the book.
   *
   * Normalising the raw weight against the world's own heaviest tie keeps the
   * comparison inside one dataset, where it is meaningful, and keeps every
   * world rendering on the same 0-to-1 scale, which is what the invariant
   * actually asks for. Logarithmic because the weights are heavy-tailed — a
   * linear scale on ASOIAF's 3-to-334 range draws almost every tie as a
   * hairline.
   */
  strength: number;
}

export interface VisibleGraph {
  you: NodeIndex;
  nodes: VisibleNode[];
  edges: VisibleEdge[];
}

/** The world's heaviest tie, which every other tie is drawn relative to. */
function maxWeight(universe: Universe): number {
  let max = 0;
  for (const [, , w] of universe.edges) if (w > max) max = w;
  return max;
}

function degreeOf(universe: Universe, node: NodeIndex): number {
  let d = 0;
  for (const [s, t] of universe.edges) {
    if (s === node || t === node) d++;
  }
  return d;
}

export function project(universe: Universe, known: Known, you: NodeIndex): VisibleGraph {
  const nodes: VisibleNode[] = [];
  for (const i of known.visible) {
    nodes.push({
      i,
      isYou: i === you,
      degree: degreeOf(universe, i),
      expanded: known.expanded.has(i),
      name: known.named.get(i) ?? null,
      monogram: known.named.has(i) ? null : (known.initials.get(i) ?? null),
      recognised: known.recognised.has(i),
      rejected: known.rejected.get(i) ?? [],
      hop: known.hop.get(i) ?? Infinity,
    });
  }

  const heaviest = maxWeight(universe);
  const ceiling = Math.log1p(heaviest) || 1;

  const edges: VisibleEdge[] = [];
  for (const [s, t, weight] of universe.edges) {
    const sVisible = known.visible.has(s);
    const tVisible = known.visible.has(t);
    if (!sVisible || !tVisible) continue;
    // An edge is drawn only once at least one endpoint has been expanded —
    // expand() is what tells the player "this node's ties are these".
    const sExpanded = known.expanded.has(s);
    const tExpanded = known.expanded.has(t);
    if (!sExpanded && !tExpanded) continue;

    edges.push({ source: s, target: t, strength: Math.log1p(weight) / ceiling });
  }

  return { you, nodes, edges };
}

/**
 * Where you stand in this world, by number of ties.
 *
 * Free, and said in words rather than left to be read off the size of a circle.
 * Degree has always been given away — node size encodes it — but a size is only
 * legible against the sizes beside it, and your own node has nothing to be
 * compared with until you have expanded far enough to find somebody bigger. A
 * rank is the same free information made usable on the first frame, and it is
 * strongly discriminating once the world is known: the fourth most connected
 * person in a story is a short list in any book.
 *
 * Nothing here is for sale and nothing here is your name. The denominator is
 * withheld, because the size of the graph is withheld — though a high rank does
 * imply a large world, which is a leak the design accepts in exchange for the
 * reading being possible at all.
 */
export function standingOf(universe: Universe, you: NodeIndex): number {
  const mine = degreeOf(universe, you);
  let above = 0;
  for (const n of universe.nodes) {
    if (n.i === you) continue;
    if (degreeOf(universe, n.i) > mine) above += 1;
  }
  return above + 1;
}

const ORDINALS = [
  'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth',
  'ninth', 'tenth', 'eleventh', 'twelfth',
];

/** Words up to twelfth, numerals past it — "two hundred and thirteenth" is a
 * sentence the eye trips over, and the exact figure is the point by then. */
export function ordinal(n: number): string {
  if (n <= ORDINALS.length) return ORDINALS[n - 1];
  const tens = n % 100;
  const suffix =
    tens >= 11 && tens <= 13 ? 'th' : { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th';
  return `${n}${suffix}`;
}
