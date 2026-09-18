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
export function useRadialLayout(graph: VisibleGraph, known: Known): Map<number, LaidOutNode> {
  const registry = useRef<Map<number, Placed>>(new Map());

  return useMemo(() => {
    const reg = registry.current;
    const visibleIds = new Set(graph.nodes.map((n) => n.i));

    // Drop nodes that are no longer visible (shouldn't normally happen, but
    // keeps the registry from leaking across a re-roll/new puzzle).
    for (const id of Array.from(reg.keys())) {
      if (!visibleIds.has(id)) reg.delete(id);
    }

    // Group newly discovered nodes by parent so siblings split their parent's
    // angular wedge evenly (angle is inherited from parent).
    const newBySameParent = new Map<number | null, number[]>();
    for (const node of graph.nodes) {
      if (reg.has(node.i)) continue;
      const parent = known.parent.get(node.i) ?? null;
      const list = newBySameParent.get(parent) ?? [];
      list.push(node.i);
      newBySameParent.set(parent, list);
    }

    for (const [parentId, children] of newBySameParent) {
      if (parentId === null) {
        // `you`, or a node with no known parent — place at origin.
        children.forEach((id) => {
          reg.set(id, { i: id, ring: 0, angle: 0, x: 0, y: 0 });
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
      const fullCircle = hop === 1;
      const wedge = fullCircle
        ? Math.PI * 2
        : Math.min(Math.PI * 0.9, Math.max(Math.PI / 2, children.length * 0.13));
      const start = parentAngle - wedge / 2;
      // Over a full circle the last slot would land back on the first, so the
      // step divides by the count rather than the gaps between them.
      const step = children.length === 1 ? 0 : wedge / (fullCircle ? children.length : children.length - 1);
      children.forEach((id, idx) => {
        const angle = children.length === 1 ? parentAngle : start + step * idx;
        // Born at parent's position; simulation below relaxes it outward.
        reg.set(id, { i: id, ring: hop, angle, x: parentX, y: parentY });
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

    const nodesForSim = graph.nodes.map((n) => reg.get(n.i)!);
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
          const targetR = ringRadius(n.ring);
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
      const targetR = ringRadius(n.ring);
      const angle = Math.atan2(n.y ?? 0, n.x ?? 0) || n.angle;
      const x = n.ring === 0 ? 0 : Math.cos(angle) * targetR + ((n.x ?? 0) - Math.cos(angle) * targetR) * 0.3;
      const y = n.ring === 0 ? 0 : Math.sin(angle) * targetR + ((n.y ?? 0) - Math.sin(angle) * targetR) * 0.3;
      n.x = x;
      n.y = y;
      n.angle = angle;
      out.set(n.i, { i: n.i, x, y, ring: n.ring });
    }

    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph.nodes.map((n) => n.i).join(','), known.expanded.size]);
}
