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

# The ceiling is a drawing constraint, not a difficulty one.
#
# Every neighbour lands on a single ring, and the stage zooms that ring to fit
# its box — so the ring always fills the frame, and the gap between neighbours is
# the frame's circumference divided by how many there are. Node radii do not
# scale with that zoom, so the gap is what decides legibility.
#
# The binding frame is the cold open's, because the fit takes half the *smaller*
# side of the stage and that stage is the shortest one in the game. Two things
# were fixed in the client to make this number reachable at all, both found by
# measuring the rendered frame rather than reasoning about it:
#
#   - your own neighbours were being laid out across 162 degrees rather than the
#     full circle, so they crowded at a dozen while half the ring stood empty;
#   - the cold open's stage was 300px tall, which after the fit's 64px margin
#     left 86px of usable radius — 540px of circumference for ring nodes 12.5
#     to 19px across.
#
# With both addressed, nineteen neighbours stand clear where seventeen used to
# overlap. Forty is still the optimistic end of the range: the relaxation does
# not space the ring perfectly evenly, so a start near the cap can put two
# neighbours closer together than the average gap suggests. It is kept at forty
# because the 30-40 band is where several genuinely recognisable characters live
# — Aaron, Solomon, Obi-Wan — and losing them to a rounder number costs the
# player more than the occasional tight pair does.
#
# Do not try to raise this by growing the ring radius in the client's layout: the
# zoom-to-fit cancels it exactly. Stage height is the lever.
MAX_DEGREE = 40

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
