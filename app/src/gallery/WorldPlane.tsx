import { useMemo, useState } from 'react';
import type { WorldMetrics } from './metrics';

/**
 * Every loaded world as one dot, on the two axes that are not cast size.
 *
 * Drawn in the graph's own vocabulary rather than a chart's: hairline rules,
 * open circles at the paper fill, no gridlines, no frame, no legend box. A
 * world here is the same mark a character is on the stage, which is the point —
 * this is the same material seen from further away.
 *
 * The axes are fixed constants, not the catalogue's own range. The gallery's
 * standing rule is that a drawing may only move when its subject does (see
 * `metrics.ts`), and a plane scaled to its own extremes would redraw every dot
 * each time a world was added. The bounds are wide enough to hold a world more
 * extreme than any loaded today; anything beyond them is clamped to the edge
 * rather than dropped, so a dot is never silently missing.
 *
 * Not currently placed on a page. The ledger is the comparison surface; this is
 * the map, and where it sits relative to the ledger is still open.
 */

const AXIS = {
  x: { min: 0.05, max: 0.85 },
  y: { min: 0.28, max: 0.92 },
} as const;

const VIEW = { w: 720, h: 452 };
const PLOT = { left: 30, top: 20, width: 646, height: 334 };

function clamp(v: number, low: number, high: number) {
  return Math.min(high, Math.max(low, v));
}

export function WorldPlane({
  worlds,
  onOpen,
  hovered,
  onHover,
}: {
  worlds: WorldMetrics[];
  onOpen?: (id: string) => void;
  /** Shared with the ledger, so a mark and a row light together. */
  hovered?: string | null;
  onHover?: (id: string | null) => void;
}) {
  const [localHover, setLocalHover] = useState<string | null>(null);
  const hover = hovered ?? localHover;
  const setHover = (id: string | null) => {
    setLocalHover(id);
    onHover?.(id);
  };

  const dots = useMemo(() => {
    const x = (v: number) =>
      PLOT.left + ((clamp(v, AXIS.x.min, AXIS.x.max) - AXIS.x.min) / (AXIS.x.max - AXIS.x.min)) * PLOT.width;
    const y = (v: number) =>
      PLOT.top + ((AXIS.y.max - clamp(v, AXIS.y.min, AXIS.y.max)) / (AXIS.y.max - AXIS.y.min)) * PLOT.height;
    return worlds.map((w) => ({
      id: w.id,
      title: w.title,
      nodes: w.nodes,
      cx: x(w.centralization),
      cy: y(w.distanceSpread),
      // Area on the log of the cast, so a world of nine hundred is a larger
      // mark than one of twelve without being seventy times the mark. Size is
      // the thing both axes refuse to report, so it is drawn and not plotted.
      r: 2.4 + Math.log(Math.max(2, w.nodes)) * 0.66,
      /** The pipeline names a world after its source, so one author's plays
       * share a prefix. Derived rather than listed: a world is in this set
       * because of its id, and no world has to be added to a constant here. */
      sameHand: w.id.startsWith('shakespeare-'),
    }));
  }, [worlds]);

  /**
   * Which dots print their name: the corners of what is actually loaded, found
   * rather than chosen, so the labelled worlds change when the catalogue does
   * and nothing here is a list of titles. Everything else answers the pointer.
   */
  const labelled = useMemo(() => {
    if (worlds.length === 0) return new Map<string, 'start' | 'end'>();
    const pick = (of: (w: WorldMetrics) => number, sign: 1 | -1) =>
      worlds.reduce((best, w) => (sign * of(w) > sign * of(best) ? w : best), worlds[0]);
    const out = new Map<string, 'start' | 'end'>();
    // Anchored away from the dot's own side of the plane, so a label on a world
    // at the right edge runs back into the drawing instead of off the page.
    out.set(pick((w) => w.centralization, 1).id, 'end');
    out.set(pick((w) => w.centralization, -1).id, 'start');
    out.set(pick((w) => w.distanceSpread, 1).id, 'start');
    out.set(pick((w) => w.distanceSpread, -1).id, 'start');
    out.set(pick((w) => w.nodes, 1).id, 'start');
    return out;
  }, [worlds]);

  const hand = dots.filter((d) => d.sameHand);
  const rest = dots.filter((d) => !d.sameHand);
  const axisY = PLOT.top + PLOT.height;
  const axisX = PLOT.left;

  return (
    /**
     * The drawing keeps its width and the page scrolls to it, rather than
     * shrinking to whatever it is given. Fifty-odd marks and their labels are
     * drawn at a size legible at 720 across; scaled into a phone column they
     * come out at four and a half pixels, which is a texture rather than a
     * figure. Everywhere else in this app a drawing squeezes, because
     * everywhere else it is a dozen nodes with no type on them. This one is
     * type.
     */
    <div style={{ overflowX: 'auto', overflowY: 'hidden', paddingBottom: 4 }}>
      <svg
        viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
        width="100%"
        style={{ display: 'block', maxWidth: VIEW.w, minWidth: VIEW.w, overflow: 'visible' }}
        role="img"
        aria-label={`${worlds.length} worlds plotted by how much one character dominates, against how far apart people are`}
      >
        <line x1={axisX} y1={axisY} x2={PLOT.left + PLOT.width} y2={axisY} stroke="var(--rule)" strokeWidth={1} />
        <line x1={axisX} y1={PLOT.top} x2={axisX} y2={axisY} stroke="var(--rule)" strokeWidth={1} />

        {rest.map((d) => (
          <circle
            key={d.id}
            cx={d.cx}
            cy={d.cy}
            r={d.r}
            fill="var(--paper)"
            stroke={hover === d.id ? 'var(--accent)' : 'var(--tie-strong)'}
            strokeWidth={hover === d.id ? 1.8 : 1.25}
          />
        ))}
        {hand.map((d) => (
          <circle
            key={d.id}
            cx={d.cx}
            cy={d.cy}
            r={d.r}
            fill="var(--paper)"
            stroke={hover === d.id ? 'var(--accent)' : 'var(--tie-hairline)'}
            strokeWidth={hover === d.id ? 1.8 : 1}
          />
        ))}

        {dots.map((d) => {
          const anchor = hover === d.id ? (d.cx > VIEW.w * 0.62 ? 'end' : 'start') : labelled.get(d.id);
          if (!anchor) return null;
          // Lifted off the dot's own line rather than set beside it. Two worlds
          // can sit at almost the same height — the Civil War and 史記 differ in
          // the third decimal — and a label on the centre line of one is
          // printed straight through the other.
          const offset = d.r + 5;
          return (
            <text
              key={`label-${d.id}`}
              className="annot"
              x={anchor === 'end' ? d.cx - offset : d.cx + offset}
              y={d.cy - d.r - 5}
              textAnchor={anchor}
              fontSize={9.5}
              letterSpacing="0.1em"
              fill={hover === d.id ? 'var(--accent)' : 'var(--annotation)'}
              style={{ pointerEvents: 'none' }}
            >
              {d.title}
            </text>
          );
        })}

        {/* Targets last and invisible, so a small dot under a neighbour's label
            is still reachable and the hit area is a finger rather than four
            pixels. */}
        {dots.map((d) => (
          <circle
            key={`hit-${d.id}`}
            cx={d.cx}
            cy={d.cy}
            r={Math.max(d.r + 5, 11)}
            fill="transparent"
            style={{ cursor: onOpen ? 'pointer' : 'default' }}
            onMouseEnter={() => setHover(d.id)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(d.id)}
            onBlur={() => setHover(null)}
            onClick={() => onOpen?.(d.id)}
            tabIndex={onOpen ? 0 : -1}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpen?.(d.id);
              }
            }}
          >
            <title>{`${d.title} — cast ${d.nodes}`}</title>
          </circle>
        ))}

        <text
          className="annot"
          x={PLOT.left + PLOT.width}
          y={axisY + 26}
          textAnchor="end"
          fontSize={10}
          letterSpacing="0.18em"
          fill="var(--annotation)"
        >
          One character dominates →
        </text>
        {/* Rotated about the foot of its own axis, so it runs up from the
            bottom rather than out of the top of the drawing. */}
        <text
          className="annot"
          x={axisX - 11}
          y={axisY}
          textAnchor="start"
          fontSize={10}
          letterSpacing="0.18em"
          fill="var(--annotation)"
          transform={`rotate(-90 ${axisX - 11} ${axisY})`}
        >
          People are further apart →
        </text>

        <g transform={`translate(${PLOT.left}, ${axisY + 52})`}>
          <circle cx={5} cy={-4} r={4.5} fill="var(--paper)" stroke="var(--tie-hairline)" strokeWidth={1} />
          <text className="annot" x={18} y={-1} fontSize={9.5} letterSpacing="0.12em" fill="var(--annotation)">
            One hand
          </text>
          <circle cx={115} cy={-4} r={4.5} fill="var(--paper)" stroke="var(--tie-strong)" strokeWidth={1.25} />
          <text className="annot" x={128} y={-1} fontSize={9.5} letterSpacing="0.12em" fill="var(--annotation)">
            Everything else
          </text>
          <text className="annot" x={290} y={-1} fontSize={9.5} letterSpacing="0.12em" fill="var(--unknown)">
            Mark size: cast
          </text>
        </g>
      </svg>
    </div>
  );
}
