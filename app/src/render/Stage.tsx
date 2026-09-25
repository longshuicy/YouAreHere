import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { VisibleGraph } from '../graph/project';
import { edgeKey, strongestTieFrom } from '../graph/project';
import type { LaidOutNode } from '../graph/layout';
import { useZoom, zoomTransform } from '../graph/zoom';
import { Edges } from './Edges';
import { Nodes } from './Nodes';
import { Labels } from './Labels';
import { NodeMenu } from './NodeMenu';
import { nodeRadius } from './scales';
import type { Session } from '../engine/session';

interface Props {
  graph: VisibleGraph;
  positions: Map<number, LaidOutNode>;
  session: Session;
  onExpand: (i: number) => void;
  onFacts: (i: number) => void;
  onName: (i: number) => void;
  onClaim?: (i: number, query: string) => void;
  /** Name suggestions for the claim field, drawn from every loaded story. */
  suggest?: (query: string) => string[];
  /** Whether the sidecar holds a reading for a node. */
  hasFacts?: (i: number) => boolean;
  onOpenGuess?: () => void;
  /** Fact lines for nodes whose facts have been bought, keyed by node index. */
  factLines?: Map<number, string>;
  /** Free clue text for a visible tie, from the enrichment sidecar. */
  edgeLine?: (a: number, b: number) => string | null;
  dimmed?: boolean;
  interactive?: boolean;
  showYouCaption?: boolean;
  pannable?: boolean;
}

/** Grace period so the pointer can travel from a node to its menu without the
 * menu unmounting mid-journey. Without this the menu is unreachable by mouse. */
const CLOSE_DELAY_MS = 180;
/** Breathing room between the outermost ring and the edge of the stage. */
const MARGIN = 64;
/** Breathing room between your own circle and the nearest neighbour's. */
const CENTRE_AIR = 9;

export function Stage({
  graph,
  positions,
  session,
  onExpand,
  onFacts,
  onName,
  onClaim,
  suggest,
  hasFacts,
  onOpenGuess,
  factLines,
  edgeLine,
  dimmed,
  interactive = true,
  showYouCaption = false,
  pannable = true,
}: Props) {
  const { ref: zoomRef, transform } = useZoom([0.4, 6], '[data-node]');
  const [hovered, setHovered] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  // Which node's heaviest tie is currently picked out on the paper. Sticky once
  // the player has committed to it — hovering the row is a peek, clicking it is
  // a decision, and a decision that unlit itself the moment the pointer moved
  // to the node it pointed at would be useless.
  const [lit, setLit] = useState<{ from: number; sticky: boolean } | null>(null);
  const closeTimer = useRef<number | null>(null);

  // The stage measures itself and maps one user unit to one CSS pixel, so type
  // and stroke widths render at their true size in every context — the cold
  // open's small diagram and the full-window explore view alike.
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  // Measured before paint, so entering a screen never shows an empty stage for
  // a frame while the observer catches up.
  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) setBox({ w: rect.width, h: rect.height });
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setBox({ w: width, h: height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const cancelClose = () => {
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setHovered(null), CLOSE_DELAY_MS);
  };
  useEffect(() => cancelClose, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPinned(null);
        setHovered(null);
        setLit(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // A pinned node wins over whatever the pointer is currently over, so the menu
  // stays put once clicked.
  const active = pinned ?? hovered;
  const activeNode = graph.nodes.find((n) => n.i === active && !n.horizon) ?? null;


  const strongestOf = (i: number) => strongestTieFrom(graph.edges, i);
  const litTie = lit ? strongestOf(lit.from) : null;
  const litEdges = useMemo(() => {
    const keys = new Set<string>();
    if (!lit || !litTie) return keys;
    const ends = new Set(litTie.neighbours);
    for (const e of graph.edges) {
      if (e.horizon) continue;
      const other = e.source === lit.from ? e.target : e.target === lit.from ? e.source : null;
      if (other !== null && ends.has(other)) keys.add(edgeKey(e));
    }
    return keys;
  }, [graph.edges, lit, litTie]);
  const litNodes = useMemo(
    () => new Set(litTie ? litTie.neighbours : []),
    [litTie],
  );

  // A neighbour is written on the menu exactly as the paper writes them: their
  // bought name, the monogram an expansion left behind, or nothing at all.
  const labelOf = (i: number) => {
    const n = graph.nodes.find((m) => m.i === i);
    if (!n) return 'someone';
    if (n.isYou) return 'you';
    if (n.name) return n.name;
    if (n.monogram) return `${n.monogram.initial}\u2014`;
    return 'a stranger';
  };
  const maxHop = Math.max(
    0,
    ...graph.nodes.filter((n) => !n.horizon && !n.faded).map((n) => n.hop).filter((h) => Number.isFinite(h)),
  );

  const radiusOf = useMemo(() => {
    const byIndex = new Map(graph.nodes.map((n) => [n.i, n]));
    return (i: number) => {
      const n = byIndex.get(i);
      if (!n) return 7;
      return n.isYou ? 8.5 : nodeRadius(n.presence);
    };
  }, [graph.nodes]);

  // Zoom to fit. Only the positions are scaled — node radii, tie widths and
  // labels keep their true size, so degree and tie strength stay readable at
  // every depth instead of shrinking away as the diagram grows.
  //
  // Which is exactly what puts your own node at risk. The layout sets the first
  // ring at a fixed 95 units and lets the band grow outward from there, so a hub
  // start — a hundred and more first-ring ties — pushes the outermost ring far
  // out, the fit answers by shrinking everything, and the first ring arrives
  // back at the centre while the circles standing on it have not shrunk at all.
  // On a phone, 200 ties landed the nearest neighbour 16px from the origin with
  // 18px of node between them: a stranger sitting on top of you. So the fit
  // keeps a clearance around the centre, by pushing every ring outward by a
  // constant rather than by scaling the innermost one up — a constant preserves
  // the spacing between rings, and it is the gap at the middle that is wrong,
  // not the band.
  const fitted = useMemo(() => {
    let extent = 0;
    let inner = Infinity;
    let widest = 0;
    for (const n of graph.nodes) {
      if (n.horizon) continue;
      const p = positions.get(n.i);
      if (!p) continue;
      extent = Math.max(extent, Math.abs(p.x), Math.abs(p.y));
      const r = Math.hypot(p.x, p.y);
      if (r <= 0.5) continue; // you, at the origin
      inner = Math.min(inner, r);
      widest = Math.max(widest, radiusOf(n.i));
    }
    const fit = Math.max(80, Math.min(box?.w ?? 640, box?.h ?? 640) / 2 - MARGIN);
    let k = extent === 0 ? 1 : Math.min(2.4, fit / extent);

    // Centre to centre: your own circle, the largest circle that could be
    // standing on the first ring, and air between the two.
    const clearance = radiusOf(graph.you) + widest + CENTRE_AIR;
    let push = 0;
    if (Number.isFinite(inner) && extent > inner && fit > clearance && k * inner < clearance) {
      // The two conditions the drawing has to satisfy at once: the first ring
      // stands clear of you, and the last one still lands inside the stage.
      // Solving `k·inner + push = clearance` with `k·extent + push = fit` gives
      // the largest scale that does both.
      k = Math.min(k, (fit - clearance) / (extent - inner));
      push = clearance - k * inner;
    }

    const out = new Map<number, LaidOutNode>();
    for (const [i, p] of positions) {
      const r = Math.hypot(p.x, p.y);
      const scale = r > 0.5 ? (r * k + push) / r : k;
      out.set(i, { ...p, x: p.x * scale, y: p.y * scale });
    }
    return out;
  }, [graph.nodes, graph.you, positions, box, radiusOf]);

  // Nodes the player has dragged out of the way, in fitted units. Kept here
  // rather than in the layout so a relayout never fights a manual placement.
  const [nudges, setNudges] = useState<Map<number, { dx: number; dy: number }>>(new Map());
  const placed = useMemo(() => {
    if (nudges.size === 0) return fitted;
    const out = new Map(fitted);
    for (const [i, d] of nudges) {
      const p = out.get(i);
      if (p) out.set(i, { ...p, x: p.x + d.dx, y: p.y + d.dy });
    }
    return out;
  }, [fitted, nudges]);

  const drag = useRef<{ i: number; startX: number; startY: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);

  const onNodePointerDown = (i: number, e: React.PointerEvent) => {
    if (!interactive || dimmed) return;
    e.stopPropagation(); // keep the pan gesture from starting under us
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { i, startX: e.clientX, startY: e.clientY, moved: false };
  };

  const onNodePointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < 3) return; // still a click, not a drag
    if (!d.moved) setDragging(true);
    d.moved = true;
    d.startX = e.clientX;
    d.startY = e.clientY;
    // Screen pixels to diagram units: the stage is 1:1, so only zoom divides out.
    const ux = dx / transform.k;
    const uy = dy / transform.k;
    setNudges((prev) => {
      const next = new Map(prev);
      const cur = next.get(d.i) ?? { dx: 0, dy: 0 };
      next.set(d.i, { dx: cur.dx + ux, dy: cur.dy + uy });
      return next;
    });
  };

  const onNodePointerUp = (i: number, e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    // A drag must not also pin the menu open.
    if (d && !d.moved) {
      cancelClose();
      setPinned((prev) => (prev === i ? null : i));
      setHovered(i);
    }
  };

  // Until the stage has measured itself the fit is guesswork, and a diagram
  // that lands wrong and then animates into place is the first thing the player
  // sees. Hold the content for that one frame instead.
  const hasHorizon = graph.nodes.some((n) => n.horizon);
  const view = box ?? { w: 640, h: 640 };

  return (
    <div ref={hostRef} style={{ width: '100%', height: '100%', overflow: hasHorizon ? 'visible' : undefined }}>
      <svg
        ref={pannable ? zoomRef : undefined}
        viewBox={`${-view.w / 2} ${-view.h / 2} ${view.w} ${view.h}`}
        width="100%"
        height="100%"
        style={{
          // The guess screen keeps the graph as evidence, not as competition:
          // it must stay legible behind a form without pulling the eye.
          opacity: dimmed ? 0.07 : 1,
          transition: 'opacity 300ms ease',
          display: 'block',
          cursor: pannable ? 'grab' : 'default',
          touchAction: 'none',
          overflow: hasHorizon ? 'visible' : undefined,
        }}
      >
        {/* Clicking the paper dismisses a pinned menu. Also the zoom catcher. */}
        <rect
          x={-view.w / 2}
          y={-view.h / 2}
          width={view.w}
          height={view.h}
          fill="transparent"
          onClick={() => {
            setPinned(null);
            setLit(null);
          }}
        />
        {/* Nothing is mounted until the stage knows its size, so nodes are born
            at their real coordinates instead of easing in from a wrong guess. */}
        {box && (
        <g transform={zoomTransform(transform)}>
          <Edges
            edges={graph.edges}
            positions={placed}
            you={graph.you}
            radiusOf={radiusOf}
            animate={!dragging}
            lit={litEdges}
            litFrom={lit?.from ?? null}
            edgeLine={interactive && !dimmed ? edgeLine : undefined}
          />
          <Nodes
            nodes={graph.nodes}
            positions={placed}
            animate={!dragging}
            hovered={active}
            onHover={(i) => {
              if (i === null) {
                scheduleClose();
              } else {
                cancelClose();
                setHovered(i);
              }
            }}
            onPointerDown={onNodePointerDown}
            onPointerMove={onNodePointerMove}
            onPointerUp={onNodePointerUp}
            maxHop={maxHop}
            lit={litNodes}
            interactive={interactive && !dimmed}
            showYouCaption={showYouCaption}
          />
          <Labels nodes={graph.nodes} positions={placed} animate={!dragging} />
        </g>
        )}
        {box && !dimmed && interactive && (
          <NodeMenu
            node={activeNode}
            positions={placed}
            zoom={transform}
            halfWidth={view.w / 2}
            session={session}
            factLine={activeNode ? (factLines?.get(activeNode.i) ?? null) : null}
            onExpand={(i) => {
              cancelClose();
              setPinned(i);
              setHovered(i);
              onExpand(i);
            }}
            onFacts={(i) => {
              // Pin before the purchase lands: buying a reading used to unmount
              // the Facts row (and insert the line above the remaining actions),
              // which fired mouseleave, closed the menu, and hid the thing just
              // paid for. The menu stays until the paper is clicked or Escape.
              cancelClose();
              setPinned(i);
              setHovered(i);
              onFacts(i);
            }}
            onName={(i) => {
              cancelClose();
              setPinned(i);
              setHovered(i);
              onName(i);
            }}
            onClaim={(i, query) => {
              // Pinned before the claim lands, for the same reason buying a
              // reading is: a correct claim removes the row that was clicked,
              // which fires mouseleave and hides the result.
              cancelClose();
              setPinned(i);
              setHovered(i);
              onClaim?.(i, query);
            }}
            strongest={activeNode ? strongestOf(activeNode.i) : null}
            labelOf={labelOf}
            lit={lit !== null && activeNode !== null && lit.from === activeNode.i}
            onLightStrongest={(on) => {
              if (!activeNode) return;
              if (on) setLit({ from: activeNode.i, sticky: false });
              else setLit((prev) => (prev && prev.sticky ? prev : null));
            }}
            onPickStrongest={() => {
              if (!activeNode) return;
              const tie = strongestOf(activeNode.i);
              setLit({ from: activeNode.i, sticky: true });
              // One winner: hand the player its menu, so naming, expanding or
              // reading them is the next click. A tie between two: leave both
              // lit and both ringed, and let them choose on the paper.
              if (tie && tie.neighbours.length === 1) {
                cancelClose();
                setPinned(tie.neighbours[0]);
                setHovered(tie.neighbours[0]);
              }
            }}
            suggest={suggest ?? (() => [])}
            hasFacts={hasFacts ?? (() => true)}
            onOpenGuess={onOpenGuess ?? (() => {})}
            onPointerEnter={cancelClose}
            onPointerLeave={scheduleClose}
          />
        )}
      </svg>
    </div>
  );
}
