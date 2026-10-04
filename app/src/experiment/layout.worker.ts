/**
 * The force layout, off the main thread.
 *
 * At 8,727 nodes and 58,000 ties a single d3-force tick costs tens of
 * milliseconds. On the main thread that is the whole frame budget before
 * anything has been drawn, and the panel's sliders stop responding while the
 * graph is settling. Here it runs on its own clock and posts positions back;
 * the main thread's only obligation is to draw whatever arrived last.
 *
 * The worker owns positions and nothing else. It is told about ties, never
 * about rules — the simulation lives on the main thread, because the graph is
 * also what every metric and the followed character's log are read from.
 */

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
import {
  ALPHA_DECAY,
  ALPHA_MIN,
  ALPHA_START,
  CHARGE_DISTANCE_MAX,
  CHARGE_STRENGTH,
  HOME_PULL,
  LINK_DISTANCE_STRONG,
  LINK_DISTANCE_WEAK,
  S_MAX,
} from './constants';

interface LNode extends SimulationNodeDatum {
  i: number;
}
interface LLink extends SimulationLinkDatum<LNode> {
  s: number;
}

export type ToWorker =
  | {
      type: 'init';
      /** Echoed on every position message, so positions computed before a
       * re-init can be told apart from the ones after it. */
      gen: number;
      x: Float32Array;
      y: Float32Array;
      world: Int32Array;
      homeX: Float64Array;
      homeY: Float64Array;
    }
  /** Ties as flat triples (u, v, strength). Flat because this message is sent
   * every round and an array of 58,000 objects is not something to structured-
   * clone ten times a second. */
  | { type: 'links'; triples: Float32Array }
  | { type: 'kick'; alpha: number }
  | { type: 'stop' };

export type FromWorker = { type: 'pos'; gen: number; x: Float32Array; y: Float32Array };

let gen = 0;
let nodes: LNode[] = [];
let sim: Simulation<LNode, LLink> | null = null;
let link: ReturnType<typeof forceLink<LNode, LLink>> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

/**
 * Twenty a second, not sixty.
 *
 * The layout is not synchronised to the main thread's frames and does not need
 * to be: it posts whatever it has, and the main thread draws whatever it last
 * received. A Barnes–Hut pass over 8,727 nodes with 58,000 links costs tens of
 * milliseconds, so sixty a second asked for more than a core and never got it —
 * the loop simply ran late and the fan came on.
 *
 * It also sets the drawing's rate, which is the other half of the saving: the
 * canvas redraws when new positions arrive and not otherwise, and a redraw is
 * sixty-odd thousand path segments. Sixty a second asked for nearly four
 * million segments a second from the main thread as well. At twenty the motion
 * of a force layout is indistinguishable and both budgets are real.
 */
const TICK_MS = 50;

/**
 * How long to keep ticking after the layout has gone cold.
 *
 * Below `alphaMin` d3 considers the simulation finished and a tick moves
 * nothing measurable, but the loop used to keep calling it — and keep posting
 * two arrays of nine thousand floats — forever, so a paused experiment sitting
 * on screen cost exactly as much as a running one. A few idle ticks are kept so
 * that a kick arriving a moment later is picked up without a restart.
 */
const IDLE_TICKS = 20;
let idle = 0;

function loop() {
  if (!sim) return;
  if (sim.alpha() <= ALPHA_MIN) idle++;
  else idle = 0;

  if (idle > IDLE_TICKS) {
    // Cold. Stop ticking and stop posting; `kick` starts the loop again.
    timer = null;
    return;
  }

  sim.tick();
  const n = nodes.length;
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = nodes[i].x ?? 0;
    y[i] = nodes[i].y ?? 0;
  }
  (self as unknown as Worker).postMessage({ type: 'pos', gen, x, y } satisfies FromWorker, [
    x.buffer,
    y.buffer,
  ]);
  timer = setTimeout(loop, TICK_MS);
}

/** Start the loop if it is not already going. */
function wake() {
  idle = 0;
  if (timer === null && sim) loop();
}

self.onmessage = (event: MessageEvent<ToWorker>) => {
  const msg = event.data;

  if (msg.type === 'init') {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    gen = msg.gen;
    const n = msg.x.length;
    nodes = Array.from({ length: n }, (_, i) => ({ i, x: msg.x[i], y: msg.y[i] }));
    link = forceLink<LNode, LLink>([])
      .id((d) => d.i)
      .distance((l) => LINK_DISTANCE_WEAK - (LINK_DISTANCE_WEAK - LINK_DISTANCE_STRONG) * (l.s / S_MAX));
    sim = forceSimulation<LNode, LLink>(nodes)
      .force('charge', forceManyBody<LNode>().strength(CHARGE_STRENGTH).distanceMax(CHARGE_DISTANCE_MAX))
      .force('link', link)
      // A weak tether to where the world started. Without it the worlds, being
      // disconnected components under mutual repulsion, either fly apart or
      // stack in the middle — and neither is a picture of anything. Weak enough
      // that accumulating cross-world ties drag an island off its mooring,
      // which is the thing the run exists to show.
      .force('homeX', forceX<LNode>((d) => msg.homeX[msg.world[d.i]]).strength(HOME_PULL))
      .force('homeY', forceY<LNode>((d) => msg.homeY[msg.world[d.i]]).strength(HOME_PULL))
      .force('centre', forceCenter(0, 0))
      .alphaDecay(ALPHA_DECAY)
      .alphaMin(ALPHA_MIN)
      .stop();
    // Start cool: the shipped per-world layouts are already good, and opening
    // at d3's default alpha of 1 throws them away before anyone has seen the
    // initial condition.
    sim.alpha(ALPHA_START);
    idle = 0;
    loop();
    return;
  }

  if (msg.type === 'links' && link && sim) {
    const t = msg.triples;
    const links: LLink[] = new Array(t.length / 3);
    for (let k = 0, j = 0; k < t.length; k += 3, j++) {
      links[j] = { source: t[k], target: t[k + 1], s: t[k + 2] };
    }
    link.links(links);
    wake();
    return;
  }

  if (msg.type === 'kick' && sim) {
    sim.alpha(Math.max(sim.alpha(), msg.alpha));
    wake();
    return;
  }

  if (msg.type === 'stop') {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    sim = null;
  }
};
