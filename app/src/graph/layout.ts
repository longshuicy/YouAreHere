import { useMemo, useRef } from 'react';
import { forceCollide, forceSimulation, type SimulationNodeDatum } from 'd3-force';
import type { Known } from '../engine/session';
import type { VisibleGraph } from './project';

export interface LaidOutNode {
  i: number;
  x: number;
  y: number;
  ring: number;
}

interface Placed extends SimulationNodeDatum {
  i: number;
  ring: number;
  angle: number;
  /** Where this node's ring sits. Held rather than derived from `ring`, because
   * your own ties are spread across a band of several radii — see `bandRings`. */
  radius: number;
}

const TICKS = 60;

function ringRadius(hop: number): number {
  if (hop <= 0) return 0;
  // Ring spacing shrinks slightly as radius grows, per Technical architecture.md.
  let r = 0;
  let step = 95;
  for (let h = 1; h <= hop; h++) {
    r += step;
    step = Math.max(40, step * 0.82);
  }
  return r;
}

/** Spacing between the sub-rings your own ties are spread across. */
const BAND_STEP = 48;

/** Centre to centre, in screen pixels, between two people standing side by side.
 *
 * Node radii do not scale with the stage's zoom-to-fit — deliberately, so
 * presence and tie strength stay readable at every depth — which is what makes
 * this an absolute number rather than a ratio. Nodes run 13 to 19 pixels across,
 * so this is the widest of them plus a little air.
 */
const NEIGHBOUR_GAP = 28;

/** Radius the cold open's stage can show, in the same pixels.
 *
 * The cold open is the binding frame: it is the shortest stage in the game, and
 * a start that cannot be drawn there cannot be woken into. Its stage is
 * `min(620px, 80vw)` by `min(440px, 44vh)`, the fit takes half the smaller side,
 * and the stage keeps a 64px margin inside that — so on a laptop window it is
 * around 125, and this is the short end of the range rather than the tall one.
 * Measured, not reasoned: at 156 the band came out two rings short and 62 pairs
 * of neighbours overlapped in a 72-person opening.
 */
const COLD_OPEN_FIT = 120;

/**
 * How many concentric rings your own ties need.
 *
 * One ring holds about forty people, and that number used to decide who you
 * were allowed to be: `starts.py` refused any character with more than forty
 * ties, on the grounds that the opening ring could not draw them. In a large
 * world that is a description of the cast's leads — Tyrion has 114 ties,
 * Chandler 302 — so a drawing constraint was quietly deciding that you could
 * never wake as anyone the reader had heard of.
 *
 * So the ring becomes a band. Enough rings that the whole neighbourhood has
 * NEIGHBOUR_GAP pixels per person once the stage has zoomed the band to fit —
 * which is a real ceiling, not a free one, because widening the band pushes the
 * outermost ring out and the zoom answers by shrinking everything. Past about
 * three hundred ties the two cancel and more rings stop buying room; that is a
 * property of the stage, and the remedy is a taller one.
 */
function bandRings(count: number): number {
  for (let rings = 1; rings <= 16; rings++) {
    let circumference = 0;
    for (let i = 0; i < rings; i++) circumference += ringRadius(1) + i * BAND_STEP;
    const extent = ringRadius(1) + (rings - 1) * BAND_STEP;
    const zoom = Math.min(2.4, COLD_OPEN_FIT / extent);
    if (2 * Math.PI * circumference * zoom >= count * NEIGHBOUR_GAP) return rings;
  }
  return 16;
}

/** How many of your ties stand on each ring of the band.
 *
 * Proportional to each ring's circumference, so the gap between neighbours is
 * the same wherever they are standing and the band reads as one crowd rather
 * than as rings of different densities. */
function bandShares(count: number): number[] {
  const rings = bandRings(count);
  const radii = Array.from({ length: rings }, (_, i) => ringRadius(1) + i * BAND_STEP);
  const total = radii.reduce((sum, r) => sum + r, 0);
  const shares = radii.map((r) => Math.floor((count * r) / total));
  // Rounding leaves a few people unplaced; they go on the outermost rings,
  // which have the most room for them.
  let left = count - shares.reduce((sum, n) => sum + n, 0);
  for (let i = shares.length - 1; left > 0; i = i === 0 ? shares.length - 1 : i - 1) {
    shares[i] += 1;
    left -= 1;
  }
  return shares;
}

/**
 * Radial ego layout, implementing the stability rules from
 * docs/Technical architecture.md:
 *  1. A placed node keeps its coordinates.
 *  2. `you` is pinned at the origin, permanently.
 *  3. New nodes are born at their parent's position and animate outward
 *     (the caller does the animating via CSS transition on x/y; this hook
 *     hands back the *target* position, which is enough for that to work
 *     because React will transition from the previous render's coordinates).
 *  4. Relaxation is bounded to a fixed tick count.
 *  5. A node reachable by two paths keeps the ring of the shorter path; this
 *     hook does not re-parent an already-placed node.
 */
export function useRadialLayout(graph: VisibleGraph, known: Known, run: string): Map<number, LaidOutNode> {
  const registry = useRef<Map<number, Placed>>(new Map());
  const lastRun = useRef<string | null>(null);

  return useMemo(() => {
    const reg = registry.current;
    const visibleIds = new Set(graph.nodes.map((n) => n.i));

    // A new waking gets a clean registry. Rule 1 — a placed node keeps its
    // coordinates — holds *within* one graph, and node indices are per-universe,
    // so carrying placements across a re-roll hands a stranger in the new world
    // the position of whoever held that index in the old one. Dropping the ids
    // that are no longer visible is not enough: the two worlds overlap on almost
    // every index, so the entries that survive are exactly the wrong ones. The
    // worst of them is the previous `you`, whose entry is ring 0 at radius 0 —
    // inherited by a neighbour, it draws them sitting on top of your own node,
    // which is how this was found.
    if (lastRun.current !== run) {
      reg.clear();
      lastRun.current = run;
    }

    // Anyone no longer visible has nothing to keep a place for.
    for (const id of Array.from(reg.keys())) {
      if (!visibleIds.has(id)) reg.delete(id);
    }

    // How strongly each of your own ties pulls, so the band can stand the
    // closest people closest.
    const tieToYou = new Map<number, number>();
    for (const edge of graph.edges) {
      if (edge.source === graph.you) tieToYou.set(edge.target, edge.strength);
      else if (edge.target === graph.you) tieToYou.set(edge.source, edge.strength);
    }

    // How far out your own band reaches. Everything deeper is pushed past it,
    // so a wide band never has the second hop standing inside it. Fixed from the
    // first frame, because your own ties are all visible from the first frame —
    // which is what lets rule 1 hold while the band exists at all.
    const yourTies = graph.nodes.filter((n) => known.hop.get(n.i) === 1).length;
    const bandWidth = (bandRings(yourTies) - 1) * BAND_STEP;

    // Group newly discovered nodes by parent so siblings split their parent's
    // angular wedge evenly (angle is inherited from parent). Horizon waits
    // until after the sim, so its spokes still meet the people they belong to.
    const newBySameParent = new Map<number | null, number[]>();
    for (const node of graph.nodes) {
      if (reg.has(node.i) || node.horizon) continue;
      const parent = known.parent.get(node.i) ?? node.parent ?? null;
      const list = newBySameParent.get(parent) ?? [];
      list.push(node.i);
      newBySameParent.set(parent, list);
    }

    for (const [parentId, children] of newBySameParent) {
      if (parentId === null) {
        // `you`, or a node with no known parent — place at origin.
        children.forEach((id) => {
          reg.set(id, { i: id, ring: 0, angle: 0, radius: 0, x: 0, y: 0 });
        });
        continue;
      }
      const parentPlaced = reg.get(parentId);
      const parentAngle = parentPlaced?.angle ?? 0;
      const parentX = parentPlaced?.x ?? 0;
      const parentY = parentPlaced?.y ?? 0;
      const hop = known.hop.get(children[0]) ?? 1;

      // Your own neighbours get the whole circle; everyone else's get a wedge
      // facing away from the node that revealed them.
      //
      // A wedge is right for an expansion — it reads as the graph opening
      // outward from the node you clicked — but wrong at the centre, where
      // there is no direction to face away from. The cap meant your own ring
      // was laid out across 162 degrees however many people were on it, so
      // twenty-two neighbours already overlapped in the opening frame while more
      // than half the circle stood empty. That looked like a stage too small for
      // the graph, and it was really a graph drawn into two thirds of the stage.
      if (hop === 1) {
        // Your own ties get the whole circle, and a band of rings when there are
        // more of them than one ring can hold. Strongest ties innermost: the
        // people you are most present with stand closest, which is the order the
        // diagram already draws in tie thickness.
        const order = [...children].sort((a, b) => (tieToYou.get(b) ?? 0) - (tieToYou.get(a) ?? 0));
        const shares = bandShares(order.length);
        let placedSoFar = 0;
        shares.forEach((onThisRing, ringIndex) => {
          const radius = ringRadius(1) + ringIndex * BAND_STEP;
          // Alternate rings start half a slot around, so a wide band does not
          // draw spokes of people lined up along the same angle.
          const offset = ringIndex % 2 === 0 ? 0 : Math.PI / Math.max(1, onThisRing);
          for (let k = 0; k < onThisRing; k++) {
            const id = order[placedSoFar++];
            const angle = offset + (Math.PI * 2 * k) / onThisRing;
            reg.set(id, {
              i: id,
              ring: hop,
              angle,
              radius,
              // Born *on* the ring rather than at the centre. The other rings
              // are born at their parent and relax outward, which reads as the
              // graph opening from the node you clicked — but your own ties are
              // all born at once, at the same point, and the collision force
              // then scatters a hundred coincident nodes in whatever direction
              // it likes. The relaxation re-reads each node's angle from where
              // it ended up, so every angle assigned above was being thrown
              // away: a 146-person opening came out with 251 overlapping pairs
              // on a stage with room for all of them.
              x: Math.cos(angle) * radius,
              y: Math.sin(angle) * radius,
            });
          }
        });
        continue;
      }

      const wedge = Math.min(Math.PI * 0.9, Math.max(Math.PI / 2, children.length * 0.13));
      const start = parentAngle - wedge / 2;
      const step = children.length === 1 ? 0 : wedge / (children.length - 1);
      children.forEach((id, idx) => {
        const angle = children.length === 1 ? parentAngle : start + step * idx;
        // Born at parent's position; simulation below relaxes it outward.
        reg.set(id, { i: id, ring: hop, angle, radius: ringRadius(hop) + bandWidth, x: parentX, y: parentY });
      });
    }

    // Update ring for nodes whose hop distance changed (rule 5: only if it
    // actually got shorter — hop map never grows for an existing node in our
    // reducer, so this is mostly a no-op safeguard).
    for (const node of graph.nodes) {
      const placed = reg.get(node.i);
      if (placed && known.hop.has(node.i)) {
        placed.ring = known.hop.get(node.i) ?? placed.ring;
      }
    }

    const nodesForSim = graph.nodes.filter((n) => !n.horizon).map((n) => reg.get(n.i)!);
    const you = nodesForSim.find((n) => n.ring === 0);
    if (you) {
      you.fx = 0;
      you.fy = 0;
    }

    const sim = forceSimulation(nodesForSim)
      .force('collide', forceCollide<Placed>(26))
      .force('radial', () => {
        for (const n of nodesForSim) {
          if (n.fx !== undefined) continue;
          const targetR = n.radius;
          const angle = Math.atan2(n.y ?? 0, n.x ?? 0) || n.angle;
          const pull = 0.12;
          const nx = (n.x ?? 0) + (Math.cos(angle) * targetR - (n.x ?? 0)) * pull;
          const ny = (n.y ?? 0) + (Math.sin(angle) * targetR - (n.y ?? 0)) * pull;
          n.x = nx;
          n.y = ny;
        }
      })
      .stop();

    for (let i = 0; i < TICKS; i++) sim.tick();

    // Snap ring-0 and clamp final radius so numerical drift doesn't wander.
    const out = new Map<number, LaidOutNode>();
    for (const n of nodesForSim) {
      const targetR = n.radius;
      const angle = Math.atan2(n.y ?? 0, n.x ?? 0) || n.angle;
      const x = n.ring === 0 ? 0 : Math.cos(angle) * targetR + ((n.x ?? 0) - Math.cos(angle) * targetR) * 0.3;
      const y = n.ring === 0 ? 0 : Math.sin(angle) * targetR + ((n.y ?? 0) - Math.sin(angle) * targetR) * 0.3;
      n.x = x;
      n.y = y;
      n.angle = angle;
      out.set(n.i, { i: n.i, x, y, ring: n.ring });
    }

    // Halo sits just outside the opening band, using each parent's final angle
    // so a faint spoke still reads as belonging to someone on the first ring.
    const haloRadius = ringRadius(1) + bandWidth + 42;
    const horizonByParent = new Map<number, number[]>();
    for (const node of graph.nodes) {
      if (!node.horizon || node.parent == null) continue;
      const list = horizonByParent.get(node.parent) ?? [];
      list.push(node.i);
      horizonByParent.set(node.parent, list);
    }
    for (const [parentId, children] of horizonByParent) {
      const parentPlaced = reg.get(parentId);
      const parentAngle = parentPlaced?.angle ?? 0;
      const wedge = Math.min(Math.PI * 0.55, Math.max(0.18, children.length * 0.12));
      const start = parentAngle - wedge / 2;
      const step = children.length === 1 ? 0 : wedge / (children.length - 1);
      children.forEach((id, idx) => {
        const angle = children.length === 1 ? parentAngle : start + step * idx;
        const x = Math.cos(angle) * haloRadius;
        const y = Math.sin(angle) * haloRadius;
        const placed = { i: id, ring: 2, angle, radius: haloRadius, x, y };
        reg.set(id, placed);
        out.set(id, { i: id, x, y, ring: 2 });
      });
    }

    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph.nodes.map((n) => n.i).join(','), known.expanded.size, run]);
}
