"""How hard a start is, measured once at build time.

`starts.py` decides whether a character can be a puzzle at all. This decides how
hard that puzzle is, on a continuous scale from 0 to 1.

It deliberately does **not** sort starts into named bands. An earlier version cut
the scale at a threshold and shipped "approachable" or "hard", which put an
arbitrary boundary in the middle of a measurement: Laertes at 0.570 was hard and
Gertrude at 0.653 was approachable, and nothing whatever happens in between. The
client selects by sliding along the score, so the cut bought nothing and claimed
a distinction the numbers do not support.

Nothing here runs in the client. Difficulty is a property of a fixed graph, so it
is a fixed number, and the client's whole share of the work is reading it off a
puzzle record. That matters for what a difficulty *setting* is allowed to be: it
chooses which start you are handed, and it never touches what an action costs or
what is given away. A slider that made clues cheaper would be a different game
played on the same graph.

Three signals, and the game asks two questions, so they do not all serve the same
one. **Ambiguity** — how many characters anywhere wear the same shape — is what
makes *which story* hard. **Your own prominence** and **your neighbours'** are
what make *who you are* hard. They are combined into one number because the
client selects along one axis, which is a simplification to revisit once puzzles
have actually been played.

Provisional, and calibrated against nothing but judgement so far. The pipeline
doc is right that this wants tuning against real play; what is checked here is
only that the ordering is not absurd — that Hamlet, Claudius and Gertrude come
out easier than Voltemand, Marcellus and Barnardo, and that the interchangeable
eunuchs of Esther 1 come out hardest of all.
"""

from __future__ import annotations

import math
from collections import defaultdict

from ..canon.types import CanonicalGraph

# Degree bands, narrow in the middle where most characters sit.
#
# Compared in bands rather than exactly because exact matching finds almost no
# collisions, which scores every puzzle as unique on paper while it plays as
# ambiguous — the failure the pipeline doc warns about under "Tolerance". An
# early version of this file matched exact degree ±1 and an exact neighbour
# profile; half of all starts came out with zero look-alikes, and every puzzle
# in the game scored as easy.
DEGREE_BANDS = ((6, 7), (8, 9), (10, 12), (13, 16), (17, 22), (23, 30))

# A neighbour is a landmark above this prominence, and furniture below the
# second. What a player reads off a diagram is "a couple of big ones and a lot of
# small ones", so that is what is compared.
LANDMARK_AT = 0.85
MIDDLING_AT = 0.55

# Counts of each are capped: beyond three landmark neighbours, one more does not
# change what the neighbourhood looks like.
NEIGHBOUR_CAP = 3

# Where look-alikes stop mattering, on a log scale.
#
# Log rather than linear because the difference between 2 look-alikes and 12 is
# most of the puzzle, and the difference between 200 and 210 is nothing. Linear
# scaling let this term swamp everything else in the small worlds, where nearly
# every shape is common corpus-wide: it put Polonius and Horatio among the
# hardest starts in Hamlet, and Macduff and Banquo among the hardest in Macbeth,
# which is plainly wrong about both plays.
AMBIGUITY_CEILING = 300.0

# What the signals are worth against each other.
WEIGHT_AMBIGUITY = 0.30
WEIGHT_SELF = 0.45
WEIGHT_NEIGHBOURS = 0.25


def signature(degree: int, neighbour_prominence: list[float]) -> tuple:
    """What a character looks like from outside, to the precision a player can
    actually read: roughly how many ties, and roughly how important the people on
    the other end of them are."""
    landmarks = sum(1 for p in neighbour_prominence if p >= LANDMARK_AT)
    middling = sum(1 for p in neighbour_prominence if MIDDLING_AT <= p < LANDMARK_AT)
    return (
        _degree_band(degree),
        min(NEIGHBOUR_CAP, landmarks),
        min(NEIGHBOUR_CAP, middling),
    )


def build_corpus_index(worlds: list[CanonicalGraph]) -> dict:
    """Every character in every world, filed by the shape they present.

    Across all worlds, not just their own. The player answers *which story*
    first, so a shape that is unique in Macbeth but ordinary in the Bible is not
    a unique shape. Built once so a start is compared against the whole catalogue
    in constant time rather than walked against it.
    """
    index: dict[tuple, int] = defaultdict(int)
    for world in worlds:
        for sig in _signatures(world).values():
            index[sig] += 1
    return index


def score(world: CanonicalGraph, playable: list[str], corpus_index: dict) -> dict[str, dict]:
    """Difficulty for each playable start in one world."""
    signatures = _signatures(world)
    prominence = _prominence(world)
    adjacency = _adjacency(world)

    scored = {}
    for node_id in playable:
        look_alikes = max(0, corpus_index.get(signatures[node_id], 0) - 1)
        unambiguous = 1.0 - min(1.0, math.log1p(look_alikes) / math.log1p(AMBIGUITY_CEILING))

        neighbours = adjacency[node_id]
        company = (
            sum(prominence[n] for n in neighbours) / len(neighbours) if neighbours else 0.0
        )

        ease = (
            WEIGHT_AMBIGUITY * unambiguous
            + WEIGHT_SELF * prominence[node_id]
            + WEIGHT_NEIGHBOURS * company
        )

        scored[node_id] = {
            "ease": round(ease, 3),
            "lookAlikes": look_alikes,
            "prominence": round(prominence[node_id], 3),
            "company": round(company, 3),
        }
    return scored


def _prominence(world: CanonicalGraph) -> dict[str, float]:
    """How much of the story a character is in, as a rank from 0 to 1.

    Weighted degree, not plain degree, and the weighting is the whole point. An
    edge weight counts shared units — scenes, verses, sentence windows — so the
    sum over a character's ties is roughly how much of the text they are present
    for, counted through whoever stands next to them. That tracks how well known
    a character is, because authors give page time to the people they want
    remembered, and readers remember who they spent time with.

    Plain degree measures something else and gets it wrong in a particular way:
    it rewards whoever meets many people once each. Ranked by plain degree, the
    best-connected people in the Bible are Shemaiah and Azariah, named beside
    many others in genealogies and known to almost nobody. Weighted, they fall
    away and David, Moses, Saul and Aaron rise to the top.

    Known blind spot: this cannot see a character who matters while *alone*. A
    narrator in a cell or on an island accumulates no co-appearances and scores
    near zero however central they are. Nothing shipped here has that shape, but
    a novel with an isolated narrator would need a different measure.
    """
    weighted: dict[str, float] = {node.id: 0.0 for node in world.nodes}
    for edge in world.edges:
        weighted[edge.source] += edge.weight
        weighted[edge.target] += edge.weight

    # Rank, not the raw total: weights are not comparable between datasets, a
    # verse count and a scene count being different units.
    ordered = sorted(weighted, key=lambda n: (weighted[n], n))
    span = len(ordered) - 1
    return {node_id: (i / span if span else 1.0) for i, node_id in enumerate(ordered)}


def _degree_band(degree: int) -> int:
    for i, (low, high) in enumerate(DEGREE_BANDS):
        if low <= degree <= high:
            return i
    return len(DEGREE_BANDS)


def _signatures(world: CanonicalGraph) -> dict[str, tuple]:
    adjacency = _adjacency(world)
    prominence = _prominence(world)
    return {
        node.id: signature(
            len(adjacency[node.id]),
            [prominence[n] for n in adjacency[node.id]],
        )
        for node in world.nodes
    }


def _adjacency(world: CanonicalGraph) -> dict[str, set[str]]:
    adjacency: dict[str, set[str]] = {node.id: set() for node in world.nodes}
    for edge in world.edges:
        adjacency[edge.source].add(edge.target)
        adjacency[edge.target].add(edge.source)
    return adjacency
