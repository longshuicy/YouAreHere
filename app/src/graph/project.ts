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
  /** True for a node that was just added by the most recent expand — used to
   * apply reduced-opacity "frontier" styling and to animate outward. */
  hop: number;
}

export interface VisibleEdge {
  source: NodeIndex;
  target: NodeIndex;
  /** Tie strength, always shown — it is the evidence the puzzle is made of, and
   * charging for it was charging for the diagram itself. Rank is relative to
   * whichever endpoint the player is "looking out from"; ties incident to you
   * read from your end, per docs/Data & puzzle pipeline.md. */
  rank: number;
}

export interface VisibleGraph {
  you: NodeIndex;
  nodes: VisibleNode[];
  edges: VisibleEdge[];
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
      hop: known.hop.get(i) ?? Infinity,
    });
  }

  const edges: VisibleEdge[] = [];
  for (const [s, t, , rankFromSource, rankFromTarget] of universe.edges) {
    const sVisible = known.visible.has(s);
    const tVisible = known.visible.has(t);
    if (!sVisible || !tVisible) continue;
    // An edge is drawn only once at least one endpoint has been expanded —
    // expand() is what tells the player "this node's ties are these".
    const sExpanded = known.expanded.has(s);
    const tExpanded = known.expanded.has(t);
    if (!sExpanded && !tExpanded) continue;

    // Read the rank from your end when the tie touches you, so thickness means
    // "strong relative to my other ties"; otherwise from the source's end.
    const rank = t === you ? rankFromTarget : rankFromSource;

    edges.push({ source: s, target: t, rank });
  }

  return { you, nodes, edges };
}
