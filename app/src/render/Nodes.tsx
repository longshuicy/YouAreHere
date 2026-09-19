import type { VisibleNode } from '../graph/project';
import type { LaidOutNode } from '../graph/layout';
import { nodeRadius } from './scales';

interface Props {
  nodes: VisibleNode[];
  positions: Map<number, LaidOutNode>;
  hovered: number | null;
  onHover: (i: number | null) => void;
  onPointerDown: (i: number, e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (i: number, e: React.PointerEvent) => void;
  maxHop: number;
  interactive?: boolean;
  /** The cold open and the reveal caption your node; mid-game it is unlabelled. */
  showYouCaption?: boolean;
  /** Nodes on the far end of a lit tie — the pick the player was offered.
   * Ringed in the accent so a tied pair reads as two choices, not as noise. */
  lit?: Set<number>;
  /** Suppressed mid-drag: a node that eases while its ties track the pointer
   * exactly reads as the edge dragging the node along behind it. */
  animate?: boolean;
}

export function Nodes({
  nodes,
  positions,
  hovered,
  onHover,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  maxHop,
  interactive = true,
  showYouCaption = false,
  animate = true,
  lit,
}: Props) {
  return (
    <g className="nodes">
      {nodes.map((n) => {
        const p = positions.get(n.i);
        if (!p) return null;
        const r = n.isYou ? 8.5 : nodeRadius(n.presence);
        const isFrontier = !n.isYou && !n.expanded && n.hop === maxHop;
        return (
          <g
            key={n.i}
            data-node={interactive ? n.i : undefined}
            transform={`translate(${p.x}, ${p.y})`}
            style={{
              transition: animate ? 'transform 600ms ease-in-out' : 'none',
              cursor: interactive ? 'grab' : 'default',
            }}
            onMouseEnter={interactive ? () => onHover(n.i) : undefined}
            onMouseLeave={interactive ? () => onHover(null) : undefined}
            onPointerDown={interactive ? (e) => onPointerDown(n.i, e) : undefined}
            onPointerMove={interactive ? onPointerMove : undefined}
            onPointerUp={interactive ? (e) => onPointerUp(n.i, e) : undefined}
          >
            {/* Invisible hit target — the drawn circles are only 6–9.5 units
                across, which is a cruel thing to ask a pointer to find. */}
            {interactive && <circle r={Math.max(r + 10, 17)} fill="transparent" />}

            {/* The other end of a lit tie wears a dashed ring: this is the one
                to name, expand or read — or one of the two, when they tie. */}
            {lit?.has(n.i) && (
              <circle
                r={r + 6.5}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={1}
                strokeDasharray="2 3"
              />
            )}

            {/* The hovered node wears a thin accent ring, and the menu hangs off it. */}
            {hovered === n.i && interactive && (
              <circle r={r + 10.5} fill="none" stroke="var(--accent)" strokeWidth={1} opacity={0.45} />
            )}

            <circle
              r={r}
              fill={n.isYou ? 'var(--accent)' : 'var(--paper)'}
              stroke={n.isYou ? 'none' : n.expanded ? 'var(--body)' : 'var(--unknown)'}
              strokeWidth={n.expanded ? 1.6 : 1.25}
              opacity={isFrontier ? 0.35 : 1}
              style={{ transition: 'r 250ms ease-out, opacity 300ms ease-out, stroke-width 300ms ease-out' }}
            />

            {n.isYou && showYouCaption && (
              <g>
                <line x1={0} y1={r + 3.5} x2={0} y2={r + 29} stroke="var(--accent)" strokeWidth={1} />
                <text
                  y={r + 49}
                  textAnchor="middle"
                  style={{
                    font: "10px var(--mono)",
                    letterSpacing: '2.2px',
                    fill: 'var(--accent)',
                  }}
                >
                  YOU
                </text>
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
}
