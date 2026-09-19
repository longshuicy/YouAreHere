import type { VisibleNode } from '../graph/project';
import type { LaidOutNode } from '../graph/layout';
import { nodeRadius } from './scales';

interface Props {
  nodes: VisibleNode[];
  positions: Map<number, LaidOutNode>;
  animate?: boolean;
}

/** The width of one monogram rule unit: the remaining characters of a name are
 * drawn as a rule rather than spelled as dots, so length reads exactly without
 * the diagram acquiring a second alphabet. */
const RULE_UNIT = 3.4;
/** Advance width of one 11px IBM Plex Mono glyph, and the air between the
 * initial and the rule that stands in for the rest. */
const INITIAL_W = 6.6;
const GLYPH_GAP = 2.5;

/** A bought name sits above its node in serif — the register change that turns
 * a piece of structure into a person. */
export function Labels({ nodes, positions, animate = true }: Props) {
  return (
    <g className="labels" style={{ pointerEvents: 'none' }}>
      {/* An expanded node that has not been named carries its monogram below:
          the initial in mono — the analytical voice, because this is a
          measurement of a name and not a name — and a rule as long as the
          letters it is standing in for. */}
      {nodes
        .filter((n) => !n.name && n.monogram && !n.isYou)
        .map((n) => {
          const p = positions.get(n.i);
          if (!p || !n.monogram) return null;
          const r = nodeRadius(n.degree);
          const rest = Math.max(0, n.monogram.length - 1);
          const ruleLen = rest * RULE_UNIT;
          // The initial is centred with its rule as one mark, which means
          // guessing the glyph's width — SVG will not measure it for us, and a
          // monogram that hangs off to one side reads as a label that missed.
          const glyphW = INITIAL_W * [...n.monogram.initial].length;
          const left = -(glyphW + (ruleLen > 0 ? GLYPH_GAP + ruleLen : 0)) / 2;
          return (
            <g
              key={`m${n.i}`}
              transform={`translate(${p.x}, ${p.y})`}
              style={{ transition: animate ? 'transform 600ms ease-in-out' : 'none' }}
            >
              <text
                x={left}
                y={r + 15}
                className="mono"
                style={{
                  fontSize: 11,
                  fill: 'var(--unknown)',
                  paintOrder: 'stroke',
                  stroke: 'var(--paper)',
                  strokeWidth: 3.5,
                  strokeLinejoin: 'round',
                }}
              >
                {n.monogram.initial}
              </text>
              {ruleLen > 0 && (
                <line
                  x1={left + glyphW + GLYPH_GAP}
                  y1={r + 14}
                  x2={left + glyphW + GLYPH_GAP + ruleLen}
                  y2={r + 14}
                  stroke="var(--unknown)"
                  strokeWidth={1}
                />
              )}
            </g>
          );
        })}

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
