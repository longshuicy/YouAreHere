import { useState } from 'react';
import { edgeKey, timesFigure, type VisibleEdge } from '../graph/project';
import type { LaidOutNode } from '../graph/layout';
import { REMOTE_OPACITY, tieColor, tieWidth } from './scales';

/** How far off the tie its reading is set, in diagram units. Far enough that
 * the halo behind the words never touches the stroke they are about; near
 * enough that the eye does not have to leave the tie to read them. */
const LEADER = 13;

interface Props {
  edges: VisibleEdge[];
  positions: Map<number, LaidOutNode>;
  you: number;
  /** Drawn radius of a node, so ties can stop at its edge. */
  radiusOf: (i: number) => number;
  /** Transitions are suppressed mid-drag so the tie tracks the node exactly. */
  animate?: boolean;
  /** Keys — `source-target`, in the edge's own order — of the ties the player
   * has asked to see picked out: a node's heaviest. Drawn in the accent with
   * their figure beside them; everything else fades back so the answer is the
   * only thing on the paper that is fully inked. */
  lit?: Set<string>;
  /** The node the lit ties run out from, so the figure can be set at the far
   * end of them, clear of that node's open menu. */
  litFrom?: number | null;
  /** Prose for a visible tie from the enrichment sidecar — free clue on hover. */
  edgeLine?: (a: number, b: number) => string | null;
  /** When set, horizon and carried-over ties are omitted entirely rather than
   * drawn at reduced opacity. */
  hideBackground?: boolean;
}

/** Ties meet the circumference of a node, never its centre — a line running
 * under a hollow circle reads as a line crossing it, not as a tie to it. */
export function Edges({
  edges,
  positions,
  radiusOf,
  animate = true,
  lit,
  litFrom,
  edgeLine,
  hideBackground = false,
}: Props) {
  const [hovered, setHovered] = useState<string | null>(null);
  const litAny = lit !== undefined && lit.size > 0;
  // Carried map underneath, this start's walk over it.
  const ordered = edges.some((e) => e.faded)
    ? [...edges].sort((a, b) => Number(Boolean(b.faded)) - Number(Boolean(a.faded)))
    : edges;
  return (
    <g className="edges">
      {ordered.map((e) => {
        if (hideBackground && (e.horizon || e.faded)) return null;
        const a = positions.get(e.source);
        const b = positions.get(e.target);
        if (!a || !b) return null;

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        const gapA = radiusOf(e.source) + 1.5;
        const gapB = radiusOf(e.target) + 1.5;
        // If the nodes overlap there is no visible tie to draw between them.
        if (len <= gapA + gapB) return null;
        const ux = dx / len;
        const uy = dy / len;

        const key = edgeKey(e);
        const isLit = !e.horizon && litAny && lit!.has(key);
        const isHovered = hovered === key;
        // A tie being read is inked like a lit one. It is the whole of the
        // connection between the paper and the sentence in the margin, so it
        // has to be unmistakable — but it does not dim the rest of the fan the
        // way lighting does, because that fires on every pointer move across
        // the diagram and a page that flinches whenever the mouse crosses it
        // is unreadable.
        const inked = isLit || isHovered;
        const line =
          !e.horizon && edgeLine ? edgeLine(e.source, e.target) : null;
        const x1 = a.x + ux * gapA;
        const y1 = a.y + uy * gapA;
        const x2 = b.x - ux * gapB;
        const y2 = b.y - uy * gapB;
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        // Perpendicular to the tie — the one direction guaranteed to clear it.
        // Most ties here radiate straight out from you, and for those the
        // perpendicular is tangential: it moves the label sideways into the
        // gap between two spokes, which is where the room is. The sign test
        // only bites on a chord, a tie between two people in the same ring,
        // where it takes the side away from the hub rather than into it.
        const outward = -uy * midX + ux * midY >= 0 ? 1 : -1;
        const perpX = -uy * outward;
        const perpY = ux * outward;

        return (
          <g key={key}>
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={e.horizon ? 'var(--unknown)' : inked ? 'var(--accent)' : tieColor(e.strength)}
              strokeWidth={e.horizon ? 0.7 : inked ? tieWidth(e.strength) + 1 : tieWidth(e.strength)}
              // Not hidden, dimmed: the rest of the fan is still the context
              // that makes the lit tie mean anything.
              opacity={e.horizon ? 0.18 : litAny && !inked ? 0.3 : e.faded ? REMOTE_OPACITY : 1}
              style={{
                transition: animate
                  ? 'x1 400ms ease-out, y1 400ms ease-out, x2 400ms ease-out, y2 400ms ease-out, stroke-width 300ms ease-out, stroke 300ms ease-out, opacity 200ms ease-out'
                  : 'none',
                pointerEvents: 'none',
              }}
            />
            {/* Fat invisible hit target — drawn ties are often a pixel or two. */}
            {line && (
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="transparent"
                strokeWidth={14}
                style={{ cursor: 'default' }}
                onPointerEnter={() => setHovered(key)}
                onPointerLeave={() => setHovered((prev) => (prev === key ? null : prev))}
              />
            )}
            {/* The figure the thickness stands for, set in the analytical voice
                and only while the tie is lit. Two of them side by side is the
                whole reason it is here: 47× against 12× settles in a
                glance what two strokes a pixel apart never will. The sign is
                *times* in every world, because the real unit — verses, scenes,
                bills — would say which world this is. */}
            {isLit && !e.horizon && (
              <text
                // Two thirds of the way along rather than halfway: the tie is
                // lit from a node whose menu is open over the near end, and a
                // figure set at the midpoint of a short tie hides under it.
                x={x1 + (x2 - x1) * (litFrom === e.target ? 0.34 : 0.66)}
                y={y1 + (y2 - y1) * (litFrom === e.target ? 0.34 : 0.66) - 4}
                textAnchor="middle"
                className="mono"
                style={{
                  fontSize: 11,
                  fill: 'var(--accent)',
                  paintOrder: 'stroke',
                  stroke: 'var(--paper)',
                  strokeWidth: 3.5,
                  strokeLinejoin: 'round',
                  pointerEvents: 'none',
                }}
              >
                {timesFigure(e.weight)}
              </text>
            )}
            {/* The tie's prose, set beside the tie rather than on it.

                It used to sit on the midpoint under a paper halo, which erased
                the line it was describing: you hovered a tie to read about it
                and the tie went away. It was tried in the margin next, which
                occludes nothing but asks the eye to travel the width of the
                page and come back, on a diagram whose whole argument is
                proximity.

                So: off to one side, on a leader, the way a monogram hangs off
                its node. The offset is perpendicular to the tie, which is the
                one direction guaranteed to clear it, and it is taken on the
                side facing away from the centre — outward is where this layout
                keeps its empty paper, inward is the hub. */}
            {isHovered && line && (
              <g style={{ pointerEvents: 'none' }}>
                <line
                  x1={midX + perpX * 3}
                  y1={midY + perpY * 3}
                  x2={midX + perpX * LEADER}
                  y2={midY + perpY * LEADER}
                  stroke="var(--accent)"
                  strokeWidth={0.75}
                />
                <text
                  x={midX + perpX * (LEADER + 3)}
                  y={midY + perpY * (LEADER + 3)}
                  dy="0.35em"
                  textAnchor={perpX >= 0 ? 'start' : 'end'}
                  style={{
                    font: '12px var(--serif)',
                    fontStyle: 'italic',
                    fill: 'var(--ink)',
                    paintOrder: 'stroke',
                    stroke: 'var(--paper)',
                    strokeWidth: 4,
                    strokeLinejoin: 'round',
                  }}
                >
                  {line}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
}
