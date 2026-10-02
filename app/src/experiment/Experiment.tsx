/**
 * The experiment, at prototype scale.
 *
 * Six worlds rather than fifty-two, which is the whole shortcut: at ~880
 * characters and ~8,300 ties SVG still holds the drawing and d3-force still
 * runs on the main thread, so none of the canvas, quadtree or worker machinery
 * in docs/The experiment.md has to exist yet. Everything else here — the merge,
 * the rules, the metrics — is scale-independent and survives into the real one.
 *
 * React renders the node field exactly once; the node set never changes. Every
 * frame after that is imperative: positions onto circles, ties onto a handful
 * of paths. Reconciling nine thousand elements sixty times a second is not
 * something React is for.
 */

import { useEffect, useRef, useState } from 'react';
import {
  forceCenter,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';
import { fetchIndex, fetchUniverse } from '../data/loader';
import { mergeWorlds, PROTOTYPE_WORLDS, S_MAX, type MergedWorld } from './world';
import { DEFAULT_PARAMS, initState, step, type Params, type SimState } from './sim';
import { measure, type LiveMetrics } from './metrics';
import { Controls, Slider } from './Controls';

interface LNode extends SimulationNodeDatum {
  i: number;
}
interface LLink extends SimulationLinkDatum<LNode> {
  s: number;
}

interface Run {
  state: SimState;
  nodes: LNode[];
  sim: Simulation<LNode, LLink>;
  link: ReturnType<typeof forceLink<LNode, LLink>>;
}

/** Four strength bands for within-world ties. Ties darken as they thicken, as
 * everywhere else in this app. */
const BANDS = [
  { width: 0.5, stroke: '#cfc8ba' },
  { width: 0.8, stroke: '#b1aa9e' },
  { width: 1.2, stroke: '#938c81' },
  { width: 1.7, stroke: '#7c756a' },
];

const CLAMP_K = 4;

/** How hard a character is held to the world they started in. Not a statement
 * about loyalty — purely a layout term, so six islands read as six islands
 * until the ties say otherwise. */
const HOME_PULL = 0.04;

type TieView = 'all' | 'cross' | 'none';

export function Experiment({ onExit }: { onExit: () => void }) {
  const [world, setWorld] = useState<MergedWorld | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const [seed, setSeed] = useState(48291);
  /** Bumped to rebuild the run without changing the seed. */
  const [runId, setRunId] = useState(0);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(8);
  const [tieView, setTieView] = useState<TieView>('all');
  const [metrics, setMetrics] = useState<LiveMetrics | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  const runRef = useRef<Run | null>(null);
  const paramsRef = useRef(params);
  const runningRef = useRef(running);
  const speedRef = useRef(speed);
  const tieViewRef = useRef(tieView);
  const hoverRef = useRef<number | null>(null);
  paramsRef.current = params;
  runningRef.current = running;
  speedRef.current = speed;
  tieViewRef.current = tieView;
  hoverRef.current = hover;

  const svgRef = useRef<SVGSVGElement | null>(null);
  const nodeEls = useRef<(SVGCircleElement | null)[]>([]);
  const bandEls = useRef<(SVGPathElement | null)[]>([]);
  const crossEl = useRef<SVGPathElement | null>(null);
  const hoverEl = useRef<SVGPathElement | null>(null);
  const viewRef = useRef<[number, number, number, number] | null>(null);

  // Load the six worlds and merge them into one index space.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const index = await fetchIndex();
        const entries = PROTOTYPE_WORLDS.map((id) => {
          const entry = index.universes.find((u) => u.id === id);
          if (!entry) throw new Error(`World ${id} is not in the index`);
          return entry;
        });
        const universes = await Promise.all(entries.map((e) => fetchUniverse(e.file)));
        if (!cancelled) setWorld(mergeWorlds(universes, CLAMP_K));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Build (or rebuild) the run. Seed changes reset; parameter changes do not —
  // they are meant to be turned mid-run and watched.
  useEffect(() => {
    if (!world) return;
    const state = initState(world, seed);
    const nodes: LNode[] = Array.from({ length: world.n }, (_, i) => ({
      i,
      x: world.x0[i],
      y: world.y0[i],
    }));
    // Each world's home: the centroid of its shipped layout on the grid.
    const homeX = new Float64Array(world.worldIds.length);
    const homeY = new Float64Array(world.worldIds.length);
    for (let w = 0; w < world.worldIds.length; w++) {
      let sx = 0;
      let sy = 0;
      for (let i = world.worldStart[w]; i < world.worldStart[w] + world.worldSize[w]; i++) {
        sx += world.x0[i];
        sy += world.y0[i];
      }
      homeX[w] = sx / world.worldSize[w];
      homeY[w] = sy / world.worldSize[w];
    }

    const link = forceLink<LNode, LLink>([])
      .id((d) => d.i)
      .distance((l) => 55 - 35 * (l.s / S_MAX));
    const sim = forceSimulation<LNode, LLink>(nodes)
      .force('charge', forceManyBody<LNode>().strength(-14).distanceMax(600))
      .force('link', link)
      // A weak tether to where the world started. Without it six disconnected
      // components under mutual repulsion either fly apart or stack in the
      // middle, and neither is a picture of anything. Weak enough that
      // accumulating cross-world ties drag an island off its mooring, which is
      // the thing the run is supposed to show.
      .force('homeX', forceX<LNode>((d) => homeX[world.world[d.i]]).strength(HOME_PULL))
      .force('homeY', forceY<LNode>((d) => homeY[world.world[d.i]]).strength(HOME_PULL))
      .force('centre', forceCenter(0, 0))
      .alphaDecay(0.015)
      .alphaMin(0.0005)
      .stop();
    // Start cool: the shipped per-world layouts are already good, and letting
    // the simulation open at alpha 1 throws them away before anyone sees them.
    sim.alpha(0.3);
    runRef.current = { state, nodes, sim, link };
    rebuildLinks();
    setMetrics(measure(state, world));
    setRunning(false);
  }, [world, seed, runId]);

  function rebuildLinks() {
    const run = runRef.current;
    if (!run) return;
    const links: LLink[] = [];
    const { adj } = run.state;
    for (let u = 0; u < adj.length; u++) {
      for (const [v, s] of adj[u]) if (v > u) links.push({ source: u, target: v, s });
    }
    run.link.links(links);
  }

  // The one loop: advance the simulation on a clock, tick the layout every
  // frame, draw imperatively.
  useEffect(() => {
    if (!world) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;

    const frame = (now: number) => {
      const run = runRef.current;
      if (run) {
        const dt = Math.min(now - last, 250);
        last = now;
        if (runningRef.current) {
          acc += dt;
          const interval = 1000 / speedRef.current;
          let steps = 0;
          // Capped: a backgrounded tab must not come back and run four hundred
          // rounds in one frame.
          while (acc >= interval && steps < 4) {
            acc -= interval;
            steps++;
            step(run.state, world, paramsRef.current);
            if (run.state.round >= paramsRef.current.days) {
              setRunning(false);
              break;
            }
          }
          if (steps > 0) {
            rebuildLinks();
            run.sim.alpha(Math.max(run.sim.alpha(), 0.12));
            setMetrics(measure(run.state, world));
          }
        } else {
          last = now;
          acc = 0;
        }
        run.sim.tick();
        draw(world);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [world]);

  function draw(w: MergedWorld) {
    const run = runRef.current;
    const svg = svgRef.current;
    if (!run || !svg) return;
    const { nodes, state } = run;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const nd of nodes) {
      const x = nd.x ?? 0;
      const y = nd.y ?? 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const pad = Math.max(maxX - minX, maxY - minY) * 0.06 + 10;
    const target: [number, number, number, number] = [
      minX - pad,
      minY - pad,
      maxX - minX + 2 * pad,
      maxY - minY + 2 * pad,
    ];
    // Eased, so a tie forming on the far edge does not jolt the whole frame.
    const prev = viewRef.current;
    const view: [number, number, number, number] = prev
      ? (prev.map((p, k) => p + (target[k] - p) * 0.08) as [number, number, number, number])
      : target;
    viewRef.current = view;
    svg.setAttribute('viewBox', view.map((v) => v.toFixed(1)).join(' '));

    const view3 = tieViewRef.current;
    const bands: string[][] = [[], [], [], []];
    const cross: string[] = [];
    const lit: string[] = [];
    const hovered = hoverRef.current;

    if (view3 !== 'none') {
      for (let u = 0; u < state.adj.length; u++) {
        const a = nodes[u];
        const ax = (a.x ?? 0).toFixed(1);
        const ay = (a.y ?? 0).toFixed(1);
        for (const [v, s] of state.adj[u]) {
          if (v <= u) continue;
          const b = nodes[v];
          const seg = `M${ax} ${ay}L${(b.x ?? 0).toFixed(1)} ${(b.y ?? 0).toFixed(1)}`;
          const isCross = w.world[u] !== w.world[v];
          if (hovered !== null && (u === hovered || v === hovered)) lit.push(seg);
          if (isCross) cross.push(seg);
          else if (view3 === 'all') bands[Math.min(3, Math.floor((s / S_MAX) * 4))].push(seg);
        }
      }
    }

    for (let k = 0; k < 4; k++) bandEls.current[k]?.setAttribute('d', bands[k].join(''));
    crossEl.current?.setAttribute('d', cross.join(''));
    hoverEl.current?.setAttribute('d', lit.join(''));

    for (let i = 0; i < nodes.length; i++) {
      const el = nodeEls.current[i];
      if (!el) continue;
      const nd = nodes[i];
      el.setAttribute('cx', (nd.x ?? 0).toFixed(1));
      el.setAttribute('cy', (nd.y ?? 0).toFixed(1));
      el.setAttribute('r', (1.1 + Math.sqrt(state.adj[i].size) * 0.5).toFixed(2));
    }
  }

  if (error) return <p className="xp-note">{error}</p>;
  if (!world) return <p className="xp-note mono">Loading six worlds…</p>;

  const hoveredInfo =
    hover !== null && runRef.current
      ? {
          name: world.name[hover],
          world: world.worldTitles[world.world[hover]],
          degree: runRef.current.state.adj[hover].size,
        }
      : null;

  return (
    <div className="xp">
      <svg ref={svgRef} className="xp-field" preserveAspectRatio="xMidYMid meet">
        <g>
          {BANDS.map((b, k) => (
            <path
              key={k}
              ref={(el) => {
                bandEls.current[k] = el;
              }}
              fill="none"
              stroke={b.stroke}
              strokeWidth={b.width}
              strokeLinecap="round"
            />
          ))}
          <path ref={hoverEl} fill="none" stroke="var(--ink)" strokeWidth={2} opacity={0.5} />
          <path ref={crossEl} fill="none" stroke="var(--accent)" strokeWidth={1.1} opacity={0.75} />
          {Array.from({ length: world.n }, (_, i) => (
            <circle
              key={i}
              ref={(el) => {
                nodeEls.current[i] = el;
              }}
              r={2}
              fill={world.worldAccents[world.world[i]]}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover((h) => (h === i ? null : h))}
            />
          ))}
        </g>
      </svg>

      <div className="xp-panel xp-left">
        <button type="button" className="mono xp-link" onClick={onExit}>
          ← Back
        </button>
        <h2 className="mono xp-title">The experiment</h2>
        <p className="xp-note">
          Six worlds, no ties between them. Press run and see what is left of the walls.
        </p>

        <div className="xp-transport">
          <button type="button" className="mono xp-link" onClick={() => setRunning((r) => !r)}>
            {running ? '❙❙ Pause' : '▶ Run'}
          </button>
          <button
            type="button"
            className="mono xp-link"
            onClick={() => {
              const run = runRef.current;
              if (!run) return;
              step(run.state, world, paramsRef.current);
              rebuildLinks();
              run.sim.alpha(0.12);
              setMetrics(measure(run.state, world));
            }}
          >
            Step
          </button>
          <button type="button" className="mono xp-link" onClick={() => setRunId((r) => r + 1)}>
            Reset
          </button>
        </div>
        <Slider label="Days per second" value={speed} min={1} max={60} step={1} onChange={setSpeed} />

        <h3 className="mono xp-group">Ties drawn</h3>
        <div className="xp-transport">
          {(['all', 'cross', 'none'] as TieView[]).map((v) => (
            <button
              key={v}
              type="button"
              className={`mono xp-link${tieView === v ? ' on' : ''}`}
              onClick={() => setTieView(v)}
            >
              {v}
            </button>
          ))}
        </div>

        <Controls params={params} onChange={setParams} seed={seed} onSeed={setSeed} />
      </div>

      <div className="xp-panel xp-right">
        {metrics && (
          <>
            <Figure label="Day" value={`${metrics.round} / ${params.days}`} />
            <Figure label="World loyalty" value={`${(metrics.worldLoyalty * 100).toFixed(1)}%`} big />
            <Figure label="Cross-world ties" value={`${(metrics.crossShare * 100).toFixed(1)}%`} big />
            <Figure label="Ties" value={metrics.ties.toLocaleString()} />
            <Figure label="Mean degree" value={metrics.meanDegree.toFixed(2)} />
            <Figure label="Max degree" value={String(metrics.maxDegree)} />
            <Figure label="Components" value={String(metrics.components)} />
            <Figure label="Formed / cut" value={`+${metrics.formed} / −${metrics.cut}`} />

            <h3 className="mono xp-group">Loyalty by world</h3>
            {world.worldTitles.map((title, w) => (
              <div key={w} className="xp-world">
                <span className="mono xp-label" style={{ color: world.worldAccents[w] }}>
                  {title}
                </span>
                <span className="xp-bar">
                  <span
                    className="xp-bar-fill"
                    style={{
                      width: `${metrics.loyaltyByWorld[w] * 100}%`,
                      background: world.worldAccents[w],
                    }}
                  />
                </span>
                <span className="mono xp-value">
                  {(metrics.loyaltyByWorld[w] * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </>
        )}
        {hoveredInfo && (
          <div className="xp-hover">
            <div className="xp-hover-name">{hoveredInfo.name}</div>
            <div className="mono xp-label">{hoveredInfo.world}</div>
            <div className="mono xp-label">{hoveredInfo.degree} ties</div>
          </div>
        )}
      </div>
    </div>
  );
}

function Figure({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className={`xp-figure${big ? ' big' : ''}`}>
      <span className="mono xp-label">{label}</span>
      <span className="mono xp-figure-value">{value}</span>
    </div>
  );
}
