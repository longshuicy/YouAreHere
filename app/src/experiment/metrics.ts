/**
 * The figures that are cheap enough to recompute every round.
 *
 * All O(V + E). The expensive ones — modularity, clustering, path length,
 * drift from the gallery's fingerprint — belong to the end-of-run report and
 * are not here.
 */

import type { SimState } from './sim';
import type { MergedWorld } from './world';

export interface LiveMetrics {
  round: number;
  nodes: number;
  ties: number;
  density: number;
  meanDegree: number;
  maxDegree: number;
  components: number;
  /** Share of all surviving ties that join two different worlds. */
  crossShare: number;
  /** Mean over connected characters of the share of their surviving ties still
   * inside the world they started in. 1 at round 0, by construction. */
  worldLoyalty: number;
  /** The same, per world. */
  loyaltyByWorld: number[];
  formed: number;
  cut: number;
}

export function measure(state: SimState, world: MergedWorld): LiveMetrics {
  const n = world.n;
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;

  const find = (x: number): number => {
    let r = x;
    while (parent[r] !== r) r = parent[r];
    while (parent[x] !== r) {
      const next = parent[x];
      parent[x] = r;
      x = next;
    }
    return r;
  };

  let ties = 0;
  let crossTies = 0;
  let maxDegree = 0;

  const loyaltySum = new Float64Array(world.worldIds.length);
  const loyaltyCount = new Int32Array(world.worldIds.length);
  let totalLoyalty = 0;
  let connected = 0;

  for (let u = 0; u < n; u++) {
    const row = state.adj[u];
    const degree = row.size;
    if (degree > maxDegree) maxDegree = degree;

    let ownWorld = 0;
    for (const v of row.keys()) {
      if (world.world[v] === world.world[u]) ownWorld++;
      if (v > u) {
        ties++;
        if (world.world[v] !== world.world[u]) crossTies++;
        const a = find(u);
        const b = find(v);
        if (a !== b) parent[a] = b;
      }
    }

    if (degree > 0) {
      const loyalty = ownWorld / degree;
      totalLoyalty += loyalty;
      connected++;
      loyaltySum[world.world[u]] += loyalty;
      loyaltyCount[world.world[u]]++;
    }
  }

  let components = 0;
  for (let i = 0; i < n; i++) if (find(i) === i) components++;

  return {
    round: state.round,
    nodes: n,
    ties,
    density: n > 1 ? (2 * ties) / (n * (n - 1)) : 0,
    meanDegree: (2 * ties) / n,
    maxDegree,
    components,
    crossShare: ties > 0 ? crossTies / ties : 0,
    worldLoyalty: connected > 0 ? totalLoyalty / connected : 1,
    loyaltyByWorld: Array.from(loyaltySum, (sum, w) =>
      loyaltyCount[w] > 0 ? sum / loyaltyCount[w] : 1,
    ),
    formed: state.formed,
    cut: state.cut,
  };
}
