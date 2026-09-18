import { useEffect, useMemo, useState } from 'react';
import { useZoom, zoomTransform } from '../graph/zoom';
import type { Universe } from '../types';

/**
 * The full named network, faint, pannable and zoomable, naming any node on
 * hover.
 *
 * Shared by the reveal and the gallery. The reveal passes `you` and gets the
 * accent mark; the gallery passes nothing, because in a gallery nobody is you —
 * the accent is reserved for the player's own position and means nothing here.
 */
export function FullGraph({ universe, you }: { universe: Universe; you?: number }) {
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
        <g stroke="var(--unknown)" strokeWidth={0.9 * unit} opacity={0.11}>
          {universe.edges.map(([s, t], idx) => {
            const a = byIndex.get(s);
            const b = byIndex.get(t);
            if (!a || !b) return null;
            return <line key={idx} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
          })}
        </g>

        <g opacity={0.3}>
          {universe.nodes.map((n) => (
            <circle
              key={n.i}
              cx={n.x}
              cy={n.y}
              r={3.5 * unit}
              fill="var(--paper)"
              stroke="var(--unknown)"
              strokeWidth={1 * unit}
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

        {yours && <circle cx={yours.x} cy={yours.y} r={6 * unit} fill="var(--accent)" />}

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
              {hoveredNode.n}
            </text>
          </g>
        )}
      </g>
    </svg>
  );
}
