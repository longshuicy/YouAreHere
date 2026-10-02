/**
 * The drawing: a canvas for the mass, an SVG sheet over it for the few marks
 * that have to be sharp, legible or clickable.
 *
 * Fifty-two worlds is 8,727 nodes and 58,000 ties — about 67,000 elements, far
 * past what SVG will animate and far past what React will reconcile. So the
 * field itself is canvas: four batched strokes for the strength bands, one for
 * cross-world ties, one filled pass per world for the nodes.
 *
 * Everything that is *not* mass stays SVG on top, where it keeps crisp text,
 * real hit-testing and the project's own hairline register: world labels, the
 * followed character's ties, the hovered character's ties. There are never more
 * than a few hundred of those, and they are the only marks anyone reads
 * individually.
 *
 * Hover works because a quadtree is cheap — a rebuild at this size costs a
 * millisecond or two, and it is only rebuilt when the pointer actually moves.
 * Ties are deliberately not hoverable: picking one hairline out of fifty-eight
 * thousand is not an interaction anyone can perform.
 */

import { useEffect, useRef, type RefObject } from 'react';
import { quadtree, type Quadtree } from 'd3-quadtree';
import { select } from 'd3-selection';
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
import {
  BANDS,
  CROSS_ALPHA,
  CROSS_STROKE,
  CROSS_WIDTH,
  FIT_EASE,
  FIT_PAD,
  FOLLOW_RING_R,
  LABEL_ALPHA,
  LABEL_PT,
  NODE_BASE_R,
  NODE_DEGREE_R,
  S_MAX,
  ZOOM_EXTENT,
  nodeZoomScale,
} from './constants';
import type { SimState } from './sim';
import type { MergedWorld } from './world';

export interface Positions {
  x: Float32Array;
  y: Float32Array;
}

export type TieView = 'all' | 'cross' | 'none';

interface FieldProps {
  world: MergedWorld;
  /**
   * The graph and the positions arrive as refs, not values.
   *
   * Positions are replaced about sixty times a second and the graph ten; as
   * props they would re-render this component on every one of those, which is
   * the thing canvas was chosen to avoid. The draw loop reads them directly.
   */
  stateRef: RefObject<SimState | null>;
  positionsRef: RefObject<Positions | null>;
  follow: number | null;
  tieView: TieView;
  /** Bumped by the panel's Refit control. */
  refit: number;
  onHover: (i: number | null) => void;
  onPick: (i: number) => void;
}

/** World units to screen pixels, before the user's own zoom. */
interface Fit {
  k: number;
  x: number;
  y: number;
}

export function Field(props: FieldProps) {
  const { world, follow, tieView, refit, onHover, onPick } = props;

  const stateRef = props.stateRef;
  const posRef = props.positionsRef;
  const followRef = useRef(follow);
  const tieViewRef = useRef(tieView);
  const hoverRef = useRef<number | null>(null);
  followRef.current = follow;
  tieViewRef.current = tieView;

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const gRef = useRef<SVGGElement | null>(null);
  const litRef = useRef<SVGPathElement | null>(null);
  const followPathRef = useRef<SVGPathElement | null>(null);
  const ringRef = useRef<SVGCircleElement | null>(null);
  const labelsRef = useRef<SVGGElement | null>(null);

  const fitRef = useRef<Fit | null>(null);
  const zoomRef = useRef<ZoomTransform>(zoomIdentity);
  /** Once the view has been panned or zoomed by hand the automatic fit stops
   * fighting it. Refit puts it back. */
  const zoomedRef = useRef(false);
  const behaviourRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  const treeRef = useRef<Quadtree<number> | null>(null);
  const treeDirty = useRef(true);

  // Pan and zoom, attached to the SVG sheet because it is the topmost surface.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const behaviour = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent(ZOOM_EXTENT)
      .on('zoom', (event) => {
        zoomedRef.current = true;
        zoomRef.current = event.transform;
      });
    behaviourRef.current = behaviour;
    select(svg).call(behaviour);
    return () => {
      select(svg).on('.zoom', null);
    };
  }, []);

  useEffect(() => {
    if (refit === 0) return;
    zoomedRef.current = false;
    zoomRef.current = zoomIdentity;
    fitRef.current = null;
    if (svgRef.current && behaviourRef.current) {
      select(svgRef.current).call(behaviourRef.current.transform, zoomIdentity);
    }
  }, [refit]);

  // World labels: one per world, positioned each frame at the live centroid of
  // its surviving members. At fifty-two they are the only thing that makes the
  // full-scale picture readable as *worlds* rather than as a cloud.
  useEffect(() => {
    const g = labelsRef.current;
    if (!g) return;
    g.replaceChildren();
    for (let w = 0; w < world.worldTitles.length; w++) {
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.textContent = world.worldTitles[w];
      text.setAttribute('class', 'xp-world-label');
      text.setAttribute('text-anchor', 'middle');
      g.appendChild(text);
    }
  }, [world]);

  useEffect(() => {
    let raf = 0;
    const frame = () => {
      draw();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // The loop reads everything through refs on purpose: it must not be torn
    // down and rebuilt on every state change, sixty times a second.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world]);

  function computeFit(pos: Positions, width: number, height: number): Fit {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < pos.x.length; i++) {
      if (pos.x[i] < minX) minX = pos.x[i];
      if (pos.x[i] > maxX) maxX = pos.x[i];
      if (pos.y[i] < minY) minY = pos.y[i];
      if (pos.y[i] > maxY) maxY = pos.y[i];
    }
    const spanX = Math.max(maxX - minX, 1);
    const spanY = Math.max(maxY - minY, 1);
    const pad = 1 + 2 * FIT_PAD;
    const k = Math.min(width / (spanX * pad), height / (spanY * pad));
    return {
      k,
      x: width / 2 - ((minX + maxX) / 2) * k,
      y: height / 2 - ((minY + maxY) / 2) * k,
    };
  }

  function draw() {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const svg = svgRef.current;
    const state = stateRef.current;
    const pos = posRef.current;
    if (!wrap || !canvas || !svg || !state || !pos) return;

    const width = wrap.clientWidth;
    const height = wrap.clientHeight;
    if (width === 0 || height === 0) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }

    // The fit eases toward its target so a tie forming on the far edge does not
    // jolt the whole frame; once the view has been touched by hand it is frozen.
    const target = computeFit(pos, width, height);
    if (!zoomedRef.current) {
      const prev = fitRef.current;
      fitRef.current = prev
        ? {
            k: prev.k + (target.k - prev.k) * FIT_EASE,
            x: prev.x + (target.x - prev.x) * FIT_EASE,
            y: prev.y + (target.y - prev.y) * FIT_EASE,
          }
        : target;
    } else if (!fitRef.current) {
      fitRef.current = target;
    }
    const fit = fitRef.current;
    const z = zoomRef.current;

    // World units straight to device pixels, in one matrix.
    const s = z.k * fit.k;
    const ox = z.k * fit.x + z.x;
    const oy = z.k * fit.y + z.y;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(s * dpr, 0, 0, s * dpr, ox * dpr, oy * dpr);

    const view = tieViewRef.current;
    const { adj } = state;
    const n = adj.length;

    if (view !== 'none') {
      // One path per band, built in a single sweep. Strokes are divided by the
      // scale so thickness stays what it means at any zoom: a hairline that
      // thickens with magnification is a different drawing, not a closer look.
      const bandPaths = BANDS.map(() => new Path2D());
      const crossPath = new Path2D();
      for (let u = 0; u < n; u++) {
        const ax = pos.x[u];
        const ay = pos.y[u];
        for (const [v, st] of adj[u]) {
          if (v <= u) continue;
          const crossWorld = world.world[u] !== world.world[v];
          if (!crossWorld && view === 'cross') continue;
          const path = crossWorld ? crossPath : bandPaths[Math.min(3, Math.floor((st / S_MAX) * 4))];
          path.moveTo(ax, ay);
          path.lineTo(pos.x[v], pos.y[v]);
        }
      }
      if (view === 'all') {
        for (let b = 0; b < BANDS.length; b++) {
          ctx.strokeStyle = BANDS[b].stroke;
          ctx.lineWidth = BANDS[b].width / s;
          ctx.stroke(bandPaths[b]);
        }
      }
      ctx.globalAlpha = CROSS_ALPHA;
      ctx.strokeStyle = CROSS_STROKE;
      ctx.lineWidth = CROSS_WIDTH / s;
      ctx.stroke(crossPath);
      ctx.globalAlpha = 1;
    }

    // Nodes, one filled pass per world so the context's fill style is set
    // fifty-two times rather than nine thousand.
    const zk = nodeZoomScale(z.k);
    for (let w = 0; w < world.worldIds.length; w++) {
      const path = new Path2D();
      const from = world.worldStart[w];
      const to = from + world.worldSize[w];
      for (let i = from; i < to; i++) {
        const r = ((NODE_BASE_R + Math.sqrt(adj[i].size) * NODE_DEGREE_R) * zk) / s;
        path.moveTo(pos.x[i] + r, pos.y[i]);
        path.arc(pos.x[i], pos.y[i], r, 0, Math.PI * 2);
      }
      ctx.fillStyle = world.worldMarks[w];
      ctx.fill(path);
    }

    treeDirty.current = true;

    // ── The SVG sheet ───────────────────────────────────────────────────────
    gRef.current?.setAttribute('transform', `matrix(${s} 0 0 ${s} ${ox} ${oy})`);

    const followed = followRef.current;
    followPathRef.current?.setAttribute('d', followed === null ? '' : tiePath(followed, pos, state));
    const ring = ringRef.current;
    if (ring) {
      if (followed === null) ring.setAttribute('r', '0');
      else {
        ring.setAttribute('cx', String(pos.x[followed]));
        ring.setAttribute('cy', String(pos.y[followed]));
        ring.setAttribute('r', String((FOLLOW_RING_R * zk) / s));
      }
    }
    const hovered = hoverRef.current;
    litRef.current?.setAttribute(
      'd',
      hovered === null || hovered === followed ? '' : tiePath(hovered, pos, state),
    );

    const labels = labelsRef.current;
    if (labels) {
      for (let w = 0; w < world.worldTitles.length; w++) {
        let sx = 0;
        let sy = 0;
        let minX = Infinity;
        let maxX = -Infinity;
        let count = 0;
        const from = world.worldStart[w];
        const to = from + world.worldSize[w];
        for (let i = from; i < to; i++) {
          sx += pos.x[i];
          sy += pos.y[i];
          if (pos.x[i] < minX) minX = pos.x[i];
          if (pos.x[i] > maxX) maxX = pos.x[i];
          count++;
        }
        const el = labels.children[w] as SVGTextElement | undefined;
        if (!el || count === 0) continue;
        el.setAttribute('x', String(sx / count));
        el.setAttribute('y', String(sy / count));
        // Drawn in screen points regardless of zoom, like every other label in
        // this app.
        el.setAttribute('font-size', String(LABEL_PT / s));
        // A name is shown only where its world is wide enough on screen to hold
        // it. Fifty-two titles at once overprint into a grey smear that names
        // nothing; this way the big worlds are named from the start and the
        // small ones appear as you zoom into them.
        const widthPx = (maxX - minX) * s;
        const needed = world.worldTitles[w].length * LABEL_PT * 0.58;
        // Inline style, not the `opacity` attribute: a presentation attribute
        // loses to any CSS declaration, so the stylesheet's own opacity on
        // .xp-world-label silently won and every label stayed visible.
        el.style.opacity = widthPx > needed ? String(LABEL_ALPHA) : '0';
      }
    }
  }

  function tiePath(i: number, pos: Positions, state: SimState): string {
    const parts: string[] = [];
    const ax = pos.x[i];
    const ay = pos.y[i];
    for (const v of state.adj[i].keys()) {
      parts.push(`M${ax} ${ay}L${pos.x[v]} ${pos.y[v]}`);
    }
    return parts.join('');
  }

  function nearest(clientX: number, clientY: number): number | null {
    const pos = posRef.current;
    const fit = fitRef.current;
    const svg = svgRef.current;
    if (!pos || !fit || !svg) return null;
    const rect = svg.getBoundingClientRect();
    const z = zoomRef.current;
    const s = z.k * fit.k;
    const ox = z.k * fit.x + z.x;
    const oy = z.k * fit.y + z.y;
    const wx = (clientX - rect.left - ox) / s;
    const wy = (clientY - rect.top - oy) / s;

    if (treeDirty.current || !treeRef.current) {
      const indices = Array.from({ length: pos.x.length }, (_, i) => i);
      treeRef.current = quadtree<number>()
        .x((i: number) => pos.x[i])
        .y((i: number) => pos.y[i])
        .addAll(indices);
      treeDirty.current = false;
    }
    // Ten screen pixels, in world units.
    const found = treeRef.current.find(wx, wy, 10 / s);
    return found === undefined ? null : found;
  }

  return (
    <div ref={wrapRef} className="xp-field">
      <canvas ref={canvasRef} className="xp-canvas" />
      <svg ref={svgRef} className="xp-sheet">
        <g ref={gRef}>
          <path
            ref={litRef}
            fill="none"
            className="xp-lit"
            vectorEffect="non-scaling-stroke"
          />
          <path
            ref={followPathRef}
            fill="none"
            className="xp-follow"
            vectorEffect="non-scaling-stroke"
          />
          <circle ref={ringRef} r={0} fill="none" className="xp-ring" vectorEffect="non-scaling-stroke" />
          <g ref={labelsRef} />
        </g>
        <rect
          className="xp-hit"
          x={0}
          y={0}
          width="100%"
          height="100%"
          fill="transparent"
          onPointerMove={(e) => {
            const i = nearest(e.clientX, e.clientY);
            if (i !== hoverRef.current) {
              hoverRef.current = i;
              onHover(i);
            }
          }}
          onPointerLeave={() => {
            hoverRef.current = null;
            onHover(null);
          }}
          onClick={(e) => {
            const i = nearest(e.clientX, e.clientY);
            if (i !== null) onPick(i);
          }}
        />
      </svg>
    </div>
  );
}
