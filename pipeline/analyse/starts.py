"""Which characters make a puzzle.

Provisional and deliberately crude. Real difficulty is measured from structural
signatures and cross-universe candidate counts, and that cannot be calibrated
until puzzles have been played, so this stage only rules out the starts that are
obviously unplayable: too isolated to explore from, or with more neighbours than
the opening ring can legibly draw.

It used to also rule out the most connected characters, on the reasoning that a
famous shape gives its book away. That reasoning was backwards. Waking as
somebody the reader recognises is the easy end of the difficulty range, not a
leak — and banning it meant the recognisable characters were exactly the ones a
player could never be. Every one of the eight best-known characters in ASOIAF and
in the Bible was unreachable: never Tyrion, never Jon Snow, never Moses, never
David. What was left was always a minor character, in every world, every time,
which is most of why the game played as hard as it did.
"""

from __future__ import annotations

from collections import deque

from ..canon.normalise import degrees
from ..canon.types import CanonicalGraph

MIN_DEGREE = 6

# The ceiling is a drawing constraint, not a difficulty one — and for a long
# while it was quietly a difficulty one anyway.
#
# Every neighbour lands on a ring, and the stage zooms that ring to fit its box.
# Node radii do not scale with that zoom, so the gap between neighbours is what
# decides legibility, and one ring holds about forty people. That forty then sat
# here as a cap on who you were allowed to be — which in a large world is a
# description of the leads. Tyrion has 114 ties, David 131, Chandler 302. The
# note at the top of this file says the game stopped banning the recognisable
# characters; the cap had been re-banning them ever since, and every large world
# was handing the player its 77th most present character and calling it the easy
# end of the scale.
#
# The client now spreads your own ties across a band of concentric rings rather
# than one, so the ceiling is where the band stops buying room: widening it pushes
# the outermost ring out, and the zoom-to-fit answers by shrinking everything.
# They cancel somewhere past four hundred ties. Nothing in the catalogue is near
# that — the widest neighbourhood shipped is Chandler's 302 — so this is a real
# limit that currently excludes nobody, which is the right shape for it.
#
# Do not try to raise it by growing the ring radius in the client's layout: the
# zoom-to-fit cancels that exactly. Stage height, or another ring, is the lever.
MAX_DEGREE = 400

MIN_REACHABLE_WITHIN_3 = 20

# What fraction of a small world must lie within three hops instead.
#
# The reach test asks "is there enough graph in front of this node to explore?",
# which is a question about the *world*, not the node — so a flat 20 is only
# meaningful in a world large enough for 20 to be a fraction of it. Calibrated on
# a 592-character novel, it silently rejects every start in any world smaller
# than 21 characters: not because those starts play badly, but because the
# threshold exceeds the entire cast. A single Shakespeare play is 12-28
# characters, so a flat 20 makes Hamlet, Macbeth, Othello, Lear and The Tempest
# unplayable by arithmetic.
REACH_FRACTION_OF_SMALL_WORLD = 0.55


def select(graph: CanonicalGraph) -> tuple[list[str], dict]:
    degree = degrees(graph)
    min_reach = _min_reach(len(graph.nodes))

    adjacency: dict[str, set[str]] = {n.id: set() for n in graph.nodes}
    for edge in graph.edges:
        adjacency[edge.source].add(edge.target)
        adjacency[edge.target].add(edge.source)

    playable = []
    rejected = {"degree": 0, "reach": 0}
    for node in sorted(degree):
        if not MIN_DEGREE <= degree[node] <= MAX_DEGREE:
            rejected["degree"] += 1
            continue
        if _reach_within(adjacency, node, 3) < min_reach:
            rejected["reach"] += 1
            continue
        playable.append(node)

    stats = {
        "minDegree": MIN_DEGREE,
        "maxDegree": MAX_DEGREE,
        "minReachableWithin3": min_reach,
        "playable": len(playable),
        "rejected": rejected,
    }
    return playable, stats


def _min_reach(world_size: int) -> int:
    """The flat threshold where the world is big enough to mean it, a share of
    the world where it is not.

    Never more than the flat value, so growing a world can only ever relax this
    test — a large world is judged exactly as before.
    """
    return max(1, min(MIN_REACHABLE_WITHIN_3, round(REACH_FRACTION_OF_SMALL_WORLD * (world_size - 1))))


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
