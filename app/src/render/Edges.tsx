import type { VisibleEdge } from '../graph/project';
import type { LaidOutNode } from '../graph/layout';
import { tieColor, tieWidth } from './scales';

interface Props {
  edges: VisibleEdge[];
  positions: Map<number, LaidOutNode>;
  you: number;
  /** Drawn radius of a node, so ties can stop at its edge. */
  radiusOf: (i: number) => number;
  /** Transitions are suppressed mid-drag so the tie tracks the node exactly. */
  animate?: boolean;
}

/** Ties meet the circumference of a node, never its centre — a line running
 * under a hollow circle reads as a line crossing it, not as a tie to it. */
export function Edges({ edges, positions, radiusOf, animate = true }: Props) {
  return (
    <g className="edges">
      {edges.map((e) => {
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

        return (
          <line
            key={`${e.source}-${e.target}`}
            x1={a.x + ux * gapA}
            y1={a.y + uy * gapA}
            x2={b.x - ux * gapB}
            y2={b.y - uy * gapB}
            stroke={tieColor(e.strength)}
            strokeWidth={tieWidth(e.strength)}
            style={{
              transition: animate
                ? 'x1 400ms ease-out, y1 400ms ease-out, x2 400ms ease-out, y2 400ms ease-out, stroke-width 300ms ease-out, stroke 300ms ease-out'
                : 'none',
            }}
          />
        );
      })}
    </g>
  );
}
