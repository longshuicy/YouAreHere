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
  /**
   * How much of the story this character is in, 0 to 1, against the fullest
   * presence in their own world. Free, always: this is what node size encodes.
   *
   * Weighted degree, not a count of ties, and the difference is the point. A
   * count rewards whoever meets many people once each: ranked that way the
   * second and third largest figures in the Bible are Azariah and Shemaiah,
   * named beside many others in genealogies and known to nobody, while Saul,
   * Moses and Aaron draw smaller. A player trying to recognise a book by its
   * shape was being shown a shape drawn on the wrong axis.
   *
   * Logarithmic, because the weights are heavy-tailed, and normalised against
   * the world's own fullest presence so every universe still renders on the
   * same scale.
   */
  presence: number;
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
  /**
   * The tie as the dataset counted it: shared scenes, verses naming both,
   * co-sponsored bills — whatever this world's unit is.
   *
   * Carried only so the strongest tie can put a figure beside itself when the
   * player asks which one it is. It costs nothing, because it is a reading of
   * a mark already on the paper: thickness is this number, log-normalised.
   * Nothing draws it unbidden, and the unit is never named during play — the
   * unit would give the world away, and the figure alone only lets two ties be
   * compared, which is the whole of what it is for.
   */
  weight: number;
}

/** A drawn tie's identity, in the edge's own orientation: the render key, and
 * how the stage tells the renderer which ties to light. */
export function edgeKey(e: VisibleEdge): string {
  return `${e.source}-${e.target}`;
}

export interface VisibleGraph {
  you: NodeIndex;
  nodes: VisibleNode[];
  edges: VisibleEdge[];
}

/** The heaviest tie drawn from a node, and who is on the other end of it. */
export interface StrongestTie {
  /** More than one when two ties are exactly equal — the diagram cannot choose
   * between them, so it declines to, and lights both. */
  neighbours: NodeIndex[];
  weight: number;
  /** How many ties are drawn from the node at all. Below two there is nothing
   * to pick between and the offer is not made. */
  degree: number;
}

/**
 * Which neighbour a node's thickest tie runs to.
 *
 * Thickness has always carried this, and on a leaf it is legible at a glance.
 * On a hub it is not: twenty ties fanning out of one circle, drawn between one
 * and three and a half pixels, and the eye cannot rank them. The information
 * was free and unreadable, which is the same as withheld.
 *
 * Computed over the *drawn* ties only, never the world's. A node's true
 * strongest tie may run to somebody who has not been expanded into view, and
 * saying so would be telling the player about a stranger they have not paid to
 * meet. Read only what is on the paper.
 */
export function strongestTieFrom(edges: VisibleEdge[], i: NodeIndex): StrongestTie | null {
  let weight = -Infinity;
  let neighbours: NodeIndex[] = [];
  let degree = 0;
  for (const e of edges) {
    const other = e.source === i ? e.target : e.target === i ? e.source : null;
    if (other === null) continue;
    degree += 1;
    if (e.weight > weight) {
      weight = e.weight;
      neighbours = [other];
    } else if (e.weight === weight) {
      neighbours.push(other);
    }
  }
  if (degree === 0) return null;
  return { neighbours, weight, degree };
}

/** The world's heaviest tie, which every other tie is drawn relative to. */
function maxWeight(universe: Universe): number {
  let max = 0;
  for (const [, , w] of universe.edges) if (w > max) max = w;
  return max;
}

/** Tie weights summed: roughly how much of the text a character is present
 * for, counted through whoever stands next to them. */
function weightedDegrees(universe: Universe): Map<NodeIndex, number> {
  const out = new Map<NodeIndex, number>();
  for (const n of universe.nodes) out.set(n.i, 0);
  for (const [s, t, w] of universe.edges) {
    out.set(s, (out.get(s) ?? 0) + w);
    out.set(t, (out.get(t) ?? 0) + w);
  }
  return out;
}

export function project(universe: Universe, known: Known, you: NodeIndex): VisibleGraph {
  // Stretched between this world's faintest and fullest presence rather than
  // from zero, because the radius range is deliberately narrow — six to nine
  // and a half units, so the diagram stays one family of marks — and measuring
  // from zero spent only the top two thirds of it. What matters is who is
  // larger than whom inside this book.
  const weighted = weightedDegrees(universe);
  let fullest = 0;
  let faintest = Infinity;
  for (const w of weighted.values()) {
    if (w > fullest) fullest = w;
    if (w < faintest) faintest = w;
  }
  const floor = Math.log1p(Number.isFinite(faintest) ? faintest : 0);
  const span = Math.log1p(fullest) - floor || 1;

  const nodes: VisibleNode[] = [];
  for (const i of known.visible) {
    nodes.push({
      i,
      isYou: i === you,
      presence: (Math.log1p(weighted.get(i) ?? 0) - floor) / span,
      expanded: known.expanded.has(i),
      name: known.named.get(i) ?? null,
      monogram: known.named.has(i) ? null : (known.initials.get(i) ?? null),
      recognised: known.recognised.has(i),
      rejected: known.rejected.get(i) ?? [],
      hop: known.hop.get(i) ?? Infinity,
    });
  }

  const heaviest = maxWeight(universe);
  const tieCeiling = Math.log1p(heaviest) || 1;

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

    edges.push({ source: s, target: t, strength: Math.log1p(weight) / tieCeiling, weight });
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
  const weighted = weightedDegrees(universe);
  const mine = weighted.get(you) ?? 0;
  let above = 0;
  for (const n of universe.nodes) {
    if (n.i === you) continue;
    if ((weighted.get(n.i) ?? 0) > mine) above += 1;
  }
  return above + 1;
}

/**
 * A tie's figure with its unit attached, in the one unit every world shares.
 *
 * The count means something different in each dataset — verses naming both,
 * shared scenes, bills co-sponsored — and saying which would tell the player
 * where they are. *Times* is true of all of them and names none of them, and a
 * bare numeral beside a name reads as an identifier rather than a quantity.
 */
export function timesTogether(weight: number): string {
  return weight === 1 ? 'once' : `${weight} times`;
}

const CARDINALS = [
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve',
];

/** Words up to twelve, numerals past it. */
export function cardinal(n: number): string {
  return n <= CARDINALS.length ? CARDINALS[n - 1] : String(n);
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
