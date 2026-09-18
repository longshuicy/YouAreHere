import type { VisibleNode } from '../graph/project';
import type { LaidOutNode } from '../graph/layout';
import { nodeRadius } from './scales';

interface Props {
  nodes: VisibleNode[];
  positions: Map<number, LaidOutNode>;
  animate?: boolean;
}

/** A bought name sits above its node in serif — the register change that turns
 * a piece of structure into a person. */
export function Labels({ nodes, positions, animate = true }: Props) {
  return (
    <g className="labels" style={{ pointerEvents: 'none' }}>
      {nodes
        .filter((n) => n.name)
        .map((n) => {
          const p = positions.get(n.i);
          if (!p) return null;
          const r = nodeRadius(n.degree);
          return (
            <g
              key={n.i}
              transform={`translate(${p.x}, ${p.y})`}
              style={{ transition: animate ? 'transform 600ms ease-in-out' : 'none' }}
            >
              <text
                y={-(r + 11)}
                textAnchor="middle"
                style={{
                  font: '17px var(--serif)',
                  fill: 'var(--ink)',
                  // A paper halo keeps the name legible where it crosses a tie.
                  paintOrder: 'stroke',
                  stroke: 'var(--paper)',
                  strokeWidth: 4,
                  strokeLinejoin: 'round',
                }}
              >
                {n.name}
              </text>
            </g>
          );
        })}
    </g>
  );
}
