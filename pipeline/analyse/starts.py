"""Which characters make a puzzle.

Provisional and deliberately crude. Real difficulty is measured from structural
signatures and cross-universe candidate counts, and that cannot be calibrated
until puzzles have been played, so this stage only rules out the starts that are
obviously unplayable: too isolated to explore from, or so central that the shape
gives the book away.
"""

from __future__ import annotations

from collections import deque

from ..canon.normalise import degrees
from ..canon.types import CanonicalGraph

MIN_DEGREE = 6
MAX_DEGREE = 15
EXCLUDE_TOP_HUBS = 3
MIN_REACHABLE_WITHIN_3 = 20


def select(graph: CanonicalGraph) -> tuple[list[str], dict]:
    degree = degrees(graph)
    ranked = sorted(degree, key=lambda n: (-degree[n], n))
    hubs = set(ranked[:EXCLUDE_TOP_HUBS])

    adjacency: dict[str, set[str]] = {n.id: set() for n in graph.nodes}
    for edge in graph.edges:
        adjacency[edge.source].add(edge.target)
        adjacency[edge.target].add(edge.source)

    playable = []
    rejected = {"degree": 0, "hub": 0, "reach": 0}
    for node in sorted(degree):
        if node in hubs:
            rejected["hub"] += 1
            continue
        if not MIN_DEGREE <= degree[node] <= MAX_DEGREE:
            rejected["degree"] += 1
            continue
        if _reach_within(adjacency, node, 3) < MIN_REACHABLE_WITHIN_3:
            rejected["reach"] += 1
            continue
        playable.append(node)

    stats = {
        "minDegree": MIN_DEGREE,
        "maxDegree": MAX_DEGREE,
        "excludeTopHubs": EXCLUDE_TOP_HUBS,
        "minReachableWithin3": MIN_REACHABLE_WITHIN_3,
        "playable": len(playable),
        "rejected": rejected,
        "banded": False,
    }
    return playable, stats


def _reach_within(adjacency: dict[str, set[str]], start: str, hops: int) -> int:
    seen = {start}
    queue = deque([(start, 0)])
    while queue:
        node, depth = queue.popleft()
        if depth == hops:
            continue
        for neighbour in adjacency[node]:
            if neighbour not in seen:
                seen.add(neighbour)
                queue.append((neighbour, depth + 1))
    return len(seen) - 1
