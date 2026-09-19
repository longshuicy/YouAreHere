import { useEffect, useMemo, useState } from 'react';
import { useZoom, zoomTransform } from '../graph/zoom';
import { BrandMark, MarginLinks } from '../render/MarginLinks';
import type { Session } from '../engine/session';
import { clueTotal } from '../render/Ledger';
import { describeContext, describeReadings, revealMetrics } from '../graph/metrics';
import type { NodeFacts, PuzzleRecord, Universe, UniverseMeta } from '../types';

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
function FullGraph({
  universe,
  you,
  named,
  tieLine,
}: {
  universe: Universe;
  you: number;
  /** Names the player bought or got right, kept on the paper through the
   * unfold — they earned them, and losing them at the reveal throws away the
   * only part of the map they had actually read. */
  named: Map<number, string>;
  /** What the sidecar says about the tie between you and another node. */
  tieLine: (other: number) => string | null;
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
      yours: m.get(you) ?? null,
    };
  }, [universe, you]);

  /** Your own ties, so the shape you spent the whole game learning is still on
   * the paper at the moment it is explained, instead of dissolving into a
   * uniform mesh. */
  const mine = useMemo(() => {
    const out: Array<[number, number]> = [];
    const neighbours = new Set<number>();
    for (const [s, t] of universe.edges) {
      if (s === you) { out.push([s, t]); neighbours.add(t); }
      else if (t === you) { out.push([s, t]); neighbours.add(s); }
    }
    return { edges: out, neighbours };
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
          {[...named].map(([i, name]) => {
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
            {/* What the tie between you and them was made of. The sidecar has
                carried a written line for every tie in the six enriched worlds
                since the data existed, and nothing had ever read one. */}
            {mine.neighbours.has(hoveredNode.i) && tieLine(hoveredNode.i) && (
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

  /**
   * The structural fact the design has always promised at the reveal.
   *
   * It was to arrive from the pipeline, on `puzzle.reveal.line`. The pipeline
   * has never emitted one — zero of 1,357 puzzles carry the record — so the
   * slot has sat behind a null check since it was written and has never once
   * been seen. Everything below is computed in the browser instead, which also
   * means it works in the 26 worlds whose enrichment sidecar is empty, and
   * those are precisely the worlds the reveal had nothing to say about.
   */
  const metrics = useMemo(() => revealMetrics(universe, session.you), [universe, session.you]);
  const signals = meta?.nodes[String(session.you)]?.signals ?? null;
  const myFacts = useMemo(
    () => (meta?.nodes[String(session.you)]?.facts ?? {}) as NodeFacts,
    [meta, session.you],
  );

  const context = useMemo(() => describeContext(meta, myFacts), [meta, myFacts]);

  /**
   * How the network read, in words. Ordered strongest first and capped, because
   * a reveal is a beat and not a report — six true sentences in a column is a
   * dashboard, and this page is the last thing the player sees.
   */
  const readings = useMemo(() => describeReadings(metrics, signals), [metrics, signals]);

  /** What you actually turned over, and how near you came. Both read off the
   * session rather than the data — this is the part of the page that is about
   * the player rather than the character. */
  const seen = session.known.visible.size;
  const nearest = useMemo(() => {
    const withHops = session.guesses
      .filter((g) => !g.characterCorrect && g.hops !== null)
      .map((g) => ({ name: g.characterQuery, hops: g.hops as number }));
    if (withHops.length === 0) return null;
    return withHops.reduce((a, b) => (b.hops < a.hops ? b : a));
  }, [session.guesses]);

  const tieLine = useMemo(() => {
    const edges = meta?.edges ?? {};
    return (other: number) =>
      edges[`${session.you}-${other}`]?.line ?? edges[`${other}-${session.you}`]?.line ?? null;
  }, [meta, session.you]);

  const structuralLine = puzzle.reveal?.line ?? null;

  /** Context, readings and the pipeline's structural line are all the same kind
   * of remark about the same person, so they are one list and one style. */
  const notes = useMemo(
    () => [...context, ...readings, ...(structuralLine ? [structuralLine] : [])],
    [context, readings, structuralLine],
  );
  const characterLine = meta?.nodes[String(session.you)]?.line ?? null;
  const tieMeaning = universe.provenance?.edgeDefinition
    ? `In this story, a tie meant ${universe.provenance.edgeDefinition}`
    : null;

  const { recognitions } = session.ledger;
  const tally = [
    `${expansions} ${expansions === 1 ? 'expansion' : 'expansions'}`,
    `${facts} ${facts === 1 ? 'reading' : 'readings'}`,
    `${names} ${names === 1 ? 'name' : 'names'}`,
    ...(session.ledger.stories ? ['the story'] : []),
    // The only entry that came back to you. Read out last so the line ends on
    // what you knew rather than on what you bought.
    ...(recognitions ? [`${recognitions} recognised, −${recognitions}`] : []),
  ].join('  ·  ');

  return (
    <div style={{ position: 'relative', height: '100vh', overflow: 'hidden' }}>
      {/* Full-bleed network; the answer floats over it on clean paper. */}
      <div style={{ position: 'absolute', inset: 0 }}>
        <FullGraph
          universe={universe}
          you={session.you}
          named={session.known.named}
          tieLine={tieLine}
        />
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

          <div style={{ fontSize: 23, fontStyle: 'italic', color: 'var(--body)', marginTop: 10 }}>
            {universe.title}
          </div>

          {/* Everything from here down is prose, and prose is read from a fixed
              left edge. The headline above stays centred; the column under it
              does not, because a centred paragraph makes the reader find the
              start of every line for themselves. */}
          <div style={{ textAlign: 'left', width: 'min(560px, 100%)' }}>
          {characterLine && (
            <div style={{ fontSize: 19, color: 'var(--body)', marginTop: 30 }}>
              {characterLine}
            </div>
          )}

          {/* Everything about the run, in one voice. The clue count used to be
              picked out in ink while the rest sat in annotation grey, and the
              coverage lines lived in a second identical block further down the
              page; two blocks styled the same way, separated by prose, is one
              block that has been cut in half for no reason. */}
          <div
            className="mono"
            style={{
              fontSize: 11,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: 'var(--annotation)',
              marginTop: characterLine ? 34 : 30,
              lineHeight: 2.1,
            }}
          >
            <div>{tally}</div>
            <div>
              You found yourself in {clues} {clues === 1 ? 'clue' : 'clues'}
            </div>
            <div>
              You uncovered {seen} of the {metrics.castSize} people in this story
            </div>
            {nearest && (
              <div>
                Your closest guess was {nearest.name}, {nearest.hops}{' '}
                {nearest.hops === 1 ? 'tie' : 'ties'} from you
              </div>
            )}
          </div>

          {/* And everything about the character and the shape they stood in,
              also in one voice. These were three blocks at two sizes, two
              colours and two slopes, which asked the reader to work out what
              the differences meant. They mean nothing: it is all the same kind
              of remark, so it is all set the same way. */}
          {notes.length > 0 && (
            <div
              style={{
                fontSize: 16,
                color: 'var(--annotation)',
                marginTop: 28,
                lineHeight: 1.75,
              }}
            >
              {notes.map((line) => (
                <div key={line}>{line}</div>
              ))}
            </div>
          )}

          </div>

          {tieMeaning && (
            <div className="annot" style={{ marginTop: 30 }}>
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
