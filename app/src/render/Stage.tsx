import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { VisibleGraph } from '../graph/project';
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
  onOpenGuess?: () => void;
  /** Fact lines for nodes whose facts have been bought, keyed by node index. */
  factLines?: Map<number, string>;
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

export function Stage({
  graph,
  positions,
  session,
  onExpand,
  onFacts,
  onName,
  onOpenGuess,
  factLines,
  dimmed,
  interactive = true,
  showYouCaption = false,
  pannable = true,
}: Props) {
  const { ref: zoomRef, transform } = useZoom([0.4, 6], '[data-node]');
  const [hovered, setHovered] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
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
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // A pinned node wins over whatever the pointer is currently over, so the menu
  // stays put once clicked.
  const active = pinned ?? hovered;
  const activeNode = graph.nodes.find((n) => n.i === active) ?? null;
  const maxHop = Math.max(0, ...graph.nodes.map((n) => n.hop).filter((h) => Number.isFinite(h)));

  const radiusOf = useMemo(() => {
    const byIndex = new Map(graph.nodes.map((n) => [n.i, n]));
    return (i: number) => {
      const n = byIndex.get(i);
      if (!n) return 7;
      return n.isYou ? 8.5 : nodeRadius(n.degree);
    };
  }, [graph.nodes]);

  // Zoom to fit. Only the positions are scaled — node radii, tie widths and
  // labels keep their true size, so degree and tie strength stay readable at
  // every depth instead of shrinking away as the diagram grows.
  const fitted = useMemo(() => {
    let extent = 0;
    for (const n of graph.nodes) {
      const p = positions.get(n.i);
      if (!p) continue;
      extent = Math.max(extent, Math.abs(p.x), Math.abs(p.y));
    }
    const fit = Math.max(80, Math.min(box?.w ?? 640, box?.h ?? 640) / 2 - MARGIN);
    const k = extent === 0 ? 1 : Math.min(2.4, fit / extent);
    const out = new Map<number, LaidOutNode>();
    for (const [i, p] of positions) out.set(i, { ...p, x: p.x * k, y: p.y * k });
    return out;
  }, [graph.nodes, positions, box]);

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
  const view = box ?? { w: 640, h: 640 };

  return (
    <div ref={hostRef} style={{ width: '100%', height: '100%' }}>
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
        }}
      >
        {/* Clicking the paper dismisses a pinned menu. Also the zoom catcher. */}
        <rect
          x={-view.w / 2}
          y={-view.h / 2}
          width={view.w}
          height={view.h}
          fill="transparent"
          onClick={() => setPinned(null)}
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
            onExpand={onExpand}
            onFacts={onFacts}
            onName={onName}
            onOpenGuess={onOpenGuess ?? (() => {})}
            onPointerEnter={cancelClose}
            onPointerLeave={scheduleClose}
          />
        )}
      </svg>
    </div>
  );
}
