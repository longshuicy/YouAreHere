import { useEffect, useMemo, useState } from 'react';
import { useZoom, zoomTransform } from '../graph/zoom';
import { BrandMark, MarginLinks } from '../render/MarginLinks';
import type { Session } from '../engine/session';
import { clueTotal } from '../render/Ledger';
import type { PuzzleRecord, Universe, UniverseMeta } from '../types';

interface Props {
  session: Session;
  universe: Universe;
  puzzle: PuzzleRecord;
  meta: UniverseMeta | null;
  onWakeElsewhere: () => void;
  onOpenKey: () => void;
  onStartAgain: () => void;
}

/** The full named network, faint, with your node held in the accent.
 * Pannable and zoomable; hovering any node names it. */
function FullGraph({ universe, you }: { universe: Universe; you: number }) {
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
      yours: m.get(you) ?? null,
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

export function Reveal({
  session,
  universe,
  puzzle,
  meta,
  onWakeElsewhere,
  onOpenKey,
  onStartAgain,
}: Props) {
  const you = universe.nodes.find((n) => n.i === session.you);
  const clues = clueTotal(session.ledger);
  const { expansions, facts, names } = session.ledger;

  const structuralLine = puzzle.reveal?.line ?? null;
  const characterLine = meta?.nodes[String(session.you)]?.line ?? null;
  const tieMeaning = universe.provenance?.edgeDefinition
    ? `In this story, a tie meant ${universe.provenance.edgeDefinition}`
    : null;

  const tally = [
    `${expansions} ${expansions === 1 ? 'expansion' : 'expansions'}`,
    `${facts} ${facts === 1 ? 'reading' : 'readings'}`,
    `${names} ${names === 1 ? 'name' : 'names'}`,
    ...(session.ledger.stories ? ['the story'] : []),
  ].join('  ·  ');

  return (
    <div style={{ position: 'relative', height: '100vh', overflow: 'hidden' }}>
      {/* Full-bleed network; the answer floats over it on clean paper. */}
      <div style={{ position: 'absolute', inset: 0 }}>
        <FullGraph universe={universe} you={session.you} />
      </div>

      <div
        style={{
          position: 'absolute',
          inset: 0,
          padding: '44px 64px 56px 64px',
          display: 'flex',
          flexDirection: 'column',
          // Let hovers reach the network underneath; only the exits take clicks.
          pointerEvents: 'none',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <BrandMark onStartAgain={onStartAgain} />
          <MarginLinks onOpenKey={onOpenKey} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 46, textAlign: 'center' }}>
          <div className="chrome" style={{ letterSpacing: '0.3em' }}>You are</div>

          <div style={{ fontSize: 57, letterSpacing: '0.015em', marginTop: 14, lineHeight: 1.1 }}>
            {you?.n ?? 'Unknown'}
          </div>

          {characterLine && (
            <div style={{ fontSize: 19, color: 'var(--body)', marginTop: 14, maxWidth: 620 }}>
              {characterLine}
            </div>
          )}

          <div style={{ fontSize: 23, fontStyle: 'italic', color: 'var(--body)', marginTop: characterLine ? 10 : 6 }}>
            {universe.title}
          </div>

          <div
            className="mono"
            style={{
              fontSize: 11,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: 'var(--annotation)',
              marginTop: 42,
              lineHeight: 2.1,
            }}
          >
            <div>{tally}</div>
            <div style={{ color: 'var(--ink)' }}>
              You found yourself in {clues} {clues === 1 ? 'clue' : 'clues'}
            </div>
          </div>

          {structuralLine && (
            <div style={{ fontSize: 21, fontStyle: 'italic', color: 'var(--body)', marginTop: 34 }}>
              {structuralLine}
            </div>
          )}

          {tieMeaning && (
            <div className="annot" style={{ marginTop: 22 }}>
              {tieMeaning}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 36, marginTop: 40, pointerEvents: 'auto' }}>
            <button className="action" style={{ letterSpacing: '0.3em' }} onClick={onWakeElsewhere}>
              Wake somewhere else
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
