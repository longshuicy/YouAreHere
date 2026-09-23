import { useEffect, useMemo, useState } from 'react';
import { useZoom, zoomTransform } from '../graph/zoom';
import type { Universe } from '../types';

/**
 * The full named network, pannable and zoomable, naming any node on hover.
 *
 * Shared by the reveal and the gallery. The reveal passes `you` and gets the
 * accent mark; the gallery passes nothing, because in a gallery nobody is you —
 * that accent is reserved for the player's own position and means nothing here.
 *
 * `role` is why the two can share one component. Backdrop is the faint mesh
 * for when the graph sits under words. Subject is the network as something
 * to look at — the gallery, and the reveal once the answer has its own column.
 */
export type GraphRole = 'backdrop' | 'subject';

export function FullGraph({
  universe,
  you,
  named,
  formerSelves,
  mapped,
  labelled,
  tieLine,
  role = 'backdrop',
  folded = false,
}: {
  universe: Universe;
  you?: number;
  /** Names the player bought or got right, kept on the paper through the
   * unfold. They earned them, and dropping them at the reveal throws away the
   * only part of the map the player had actually read. Absent in the gallery,
   * where nobody has read anything yet. */
  named?: Map<number, string>;
  /** Nodes the player has woken as in a residence. Marked as *you were here*,
   * not as bought names. */
  formerSelves?: ReadonlySet<number>;
  /** What the player drew during play. A tie they saw is coloured even where
   * neither end is named: the map is the ties walked, the names are earned. */
  mapped?: { visible: ReadonlySet<number>; expanded: ReadonlySet<number> };
  /** Which of `named` are printed on the paper; the rest of them show on
   * hover. Absent: all of them. A whole map of earned names is a wall of text. */
  labelled?: ReadonlySet<number>;
  /** What the sidecar says about the tie between `you` and another node, shown
   * when one of your own neighbours is hovered. */
  tieLine?: (other: number) => string | null;
  role?: GraphRole;
  /**
   * Residence mid-run: the full mesh is visible, but unnamed nodes stay unnamed
   * even on hover. Unfolding is an explicit door — see docs/Residence.md.
   */
  folded?: boolean;
}) {
  const { ref, transform } = useZoom([0.5, 12]);
  const [hovered, setHovered] = useState<number | null>(null);

  const { viewBox, vbW, vbH, byIndex, yours } = useMemo(() => {
    const xs = universe.nodes.map((n) => n.x);
    const ys = universe.nodes.map((n) => n.y);
    const pad = 40;
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const w = maxX - minX + pad * 2;
    const h = maxY - minY + pad * 2;
    const m = new Map<number, (typeof universe.nodes)[number]>();
    universe.nodes.forEach((n) => m.set(n.i, n));
    return {
      viewBox: `${minX - pad} ${minY - pad} ${w} ${h}`,
      vbW: w,
      vbH: h,
      byIndex: m,
      yours: you === undefined ? null : (m.get(you) ?? null),
    };
  }, [universe, you]);

  // The layout's coordinate space is nothing like CSS pixels, so measure the
  // rendered size and express every mark in real pixels. Without this the hit
  // targets come out a couple of pixels wide and hovering a node is luck.
  const [rendered, setRendered] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setRendered({ w: width, h: height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  const baseScale =
    rendered.w > 0 && rendered.h > 0 ? Math.min(rendered.w / vbW, rendered.h / vbH) : 1;
  /** User units per CSS pixel at the current zoom. */
  const unit = 1 / (baseScale * transform.k);

  const hoveredNode = hovered !== null ? byIndex.get(hovered) : null;

  /** Your own ties, so the shape you spent the whole game learning is still on
   * the paper at the moment it is explained, instead of dissolving into a
   * uniform mesh. Empty when there is no `you`, which is the gallery. */
  const mine = useMemo(() => {
    const edges: Array<[number, number]> = [];
    const neighbours = new Set<number>();
    if (you === undefined) return { edges, neighbours };
    for (const [s, t] of universe.edges) {
      if (s === you) { edges.push([s, t]); neighbours.add(t); }
      else if (t === you) { edges.push([s, t]); neighbours.add(s); }
    }
    return { edges, neighbours };
  }, [universe, you]);

  // The same rule the stage draws by: both ends on the paper, one of them opened.
  const walked = useMemo(() => {
    if (!mapped) return [];
    return universe.edges.filter(
      ([s, t]) =>
        s !== you &&
        t !== you &&
        mapped.visible.has(s) &&
        mapped.visible.has(t) &&
        (mapped.expanded.has(s) || mapped.expanded.has(t)),
    );
  }, [universe, mapped, you]);

  // Weight, not hue. The gallery was unreadable because the network was drawn
  // at eleven percent of a grey, so what it needed was presence: darker ink,
  // heavier strokes, solid nodes. Colour was the wrong answer to that — the
  // accent belongs to your own position and to nothing else, and a whole graph
  // drawn in it says "you are here" about every character at once.
  const subject = role === 'subject';
  const ink = subject ? 'var(--tie-strong)' : 'var(--unknown)';

  return (
    <svg
      ref={ref}
      viewBox={viewBox}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      style={{ cursor: 'grab', touchAction: 'none' }}
    >
      <g transform={zoomTransform(transform)}>
        <g stroke={ink} strokeWidth={(subject ? 1.15 : 0.9) * unit} opacity={subject ? 0.5 : 0.11}>
          {universe.edges.map(([s, t], idx) => {
            const a = byIndex.get(s);
            const b = byIndex.get(t);
            if (!a || !b) return null;
            return <line key={idx} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
          })}
        </g>

        <g opacity={subject ? 1 : 0.3}>
          {universe.nodes.map((n) => (
            <circle
              key={n.i}
              cx={n.x}
              cy={n.y}
              r={(subject ? 3.8 : 3.5) * unit}
              fill="var(--paper)"
              stroke={ink}
              strokeWidth={(subject ? 1.15 : 1) * unit}
            />
          ))}
        </g>

        {/* Generous invisible hit targets, so naming by hover is easy. */}
        <g>
          {universe.nodes.map((n) => (
            <circle
              key={n.i}
              cx={n.x}
              cy={n.y}
              r={11 * unit}
              fill="transparent"
              onMouseEnter={() => setHovered(n.i)}
              onMouseLeave={() => setHovered((h) => (h === n.i ? null : h))}
            />
          ))}
        </g>

        {/* The map walked so far, in the same accent as your ring. */}
        {walked.length > 0 && (
          <g stroke="var(--accent)" strokeWidth={1.1 * unit} opacity={0.5}>
            {walked.map(([s, t]) => {
              const a = byIndex.get(s);
              const b = byIndex.get(t);
              if (!a || !b) return null;
              return <line key={`map-${s}-${t}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
            })}
          </g>
        )}

        {/* Your ring, drawn over the faint mesh. */}
        <g stroke="var(--accent)" strokeWidth={1.1 * unit} opacity={0.5}>
          {mine.edges.map(([s, t]) => {
            const a = byIndex.get(s);
            const b = byIndex.get(t);
            if (!a || !b) return null;
            return <line key={`me-${s}-${t}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
          })}
        </g>

        {/* Names the player already had. Held at a size that survives the zoom. */}
        <g pointerEvents="none">
          {[...(named ?? [])].filter(([i]) => !labelled || labelled.has(i)).map(([i, name]) => {
            const n = byIndex.get(i);
            if (!n) return null;
            return (
              <text
                key={`n-${i}`}
                x={n.x}
                y={n.y - 11 * unit}
                textAnchor="middle"
                style={{
                  font: `${12 * unit}px var(--serif)`,
                  fill: 'var(--body)',
                  paintOrder: 'stroke',
                  stroke: 'var(--paper)',
                  strokeWidth: 3.5 * unit,
                  strokeLinejoin: 'round',
                }}
              >
                {name}
              </text>
            );
          })}
        </g>

        {yours && <circle cx={yours.x} cy={yours.y} r={6 * unit} fill="var(--accent)" />}

        {/* Former selves: a thin accent ring, not a label — "you were here"
            rather than another bought name. */}
        {formerSelves && formerSelves.size > 0 && (
          <g fill="none" stroke="var(--accent)" strokeWidth={1.2 * unit} opacity={0.7}>
            {[...formerSelves].map((i) => {
              if (i === you) return null;
              const n = byIndex.get(i);
              if (!n) return null;
              return <circle key={`self-${i}`} cx={n.x} cy={n.y} r={7.5 * unit} />;
            })}
          </g>
        )}

        {hoveredNode && (
          <g pointerEvents="none">
            <circle
              cx={hoveredNode.x}
              cy={hoveredNode.y}
              r={9 * unit}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={1 * unit}
              opacity={0.6}
            />
            {(!folded || named?.has(hoveredNode.i)) && (
            <text
              x={hoveredNode.x}
              y={hoveredNode.y - 14 * unit}
              textAnchor="middle"
              style={{
                font: `${15 * unit}px var(--serif)`,
                fill: 'var(--ink)',
                paintOrder: 'stroke',
                stroke: 'var(--paper)',
                strokeWidth: 4 * unit,
                strokeLinejoin: 'round',
              }}
            >
              {named?.get(hoveredNode.i) ?? hoveredNode.n}
            </text>
            )}
            {/* What the tie between you and them was made of. The sidecar has
                carried a written line for every tie in the six enriched worlds
                since the data existed, and nothing had ever read one. */}
            {mine.neighbours.has(hoveredNode.i) && tieLine?.(hoveredNode.i) && (
              <text
                x={hoveredNode.x}
                y={hoveredNode.y + 20 * unit}
                textAnchor="middle"
                style={{
                  font: `${11 * unit}px var(--serif)`,
                  fontStyle: 'italic',
                  fill: 'var(--body)',
                  paintOrder: 'stroke',
                  stroke: 'var(--paper)',
                  strokeWidth: 4 * unit,
                  strokeLinejoin: 'round',
                }}
              >
                {tieLine(hoveredNode.i)}
              </text>
            )}
          </g>
        )}
      </g>
    </svg>
  );
}
