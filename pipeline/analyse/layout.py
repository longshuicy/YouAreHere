"""Full-graph layout, computed once at build time.

The reveal interpolates from the radial ego diagram to these coordinates, so
they have to be identical on every run and on every machine.
"""

from __future__ import annotations

import math

import networkx as nx

from ..canon.types import CanonicalGraph

SEED = 1
SCALE = 600.0


def compute(graph: CanonicalGraph, *, seed: int = SEED, scale: float = SCALE) -> dict[str, tuple[float, float]]:
    g = nx.Graph()
    g.add_nodes_from(n.id for n in graph.nodes)
    for edge in graph.edges:
        # Raw weights span three orders of magnitude here, and feeding them to the
        # spring layout collapses the hubs into a knot. The log keeps strong ties
        # short without letting one tie dominate the whole arrangement.
        g.add_edge(edge.source, edge.target, springWeight=math.log1p(edge.weight))

    positions = nx.spring_layout(g, weight="springWeight", seed=seed, iterations=200)

    return {
        node: (round(float(x) * scale, 1), round(float(y) * scale, 1))
        for node, (x, y) in positions.items()
    }
