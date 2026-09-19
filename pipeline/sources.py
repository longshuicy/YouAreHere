"""Source registry.

A universe ships under its own name: `asoiaf` becomes `data/asoiaf.json`. A
player with devtools open can read that and spoil themselves, which is a trade
made deliberately — see the deployment notes in the architecture doc.

`min_edge_weight` and `min_degree` are per-source because the sources produce
differently shaped tails — an edge list is already pruned, a bipartite projection
is not.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from .canon.types import CanonicalGraph
from .ingest import (
    asoiaf,
    bible,
    hongloumeng,
    iliad,
    lesmiserables,
    odyssey,
    sanguoyanyi,
    shakespeare,
    shuihuzhuan,
    starwars,
    xiyouji,
)


@dataclass(frozen=True)
class Source:
    """One dataset, and how to get a world out of it.

    `split_components` is for corpora that are not one world. When set, every
    connected component of at least `min_component_size` characters is emitted as
    its own universe, and `name_component` says what each is called. A source
    that leaves it false ships exactly one universe, as before.
    """

    name: str
    load: Callable[[], CanonicalGraph]
    min_edge_weight: float
    min_degree: int
    min_component_size: int | None = None
    split_components: bool = False
    name_component: Callable[[set, set], tuple[str, str]] | None = None


SOURCES: dict[str, Source] = {
    "asoiaf": Source(
        name="asoiaf",
        load=asoiaf.load,
        min_edge_weight=1,
        min_degree=2,
    ),
    "bible": Source(
        name="bible",
        load=bible.load,
        # A verse naming two people together is already a deliberate act of the
        # text, so a single co-occurrence means something here in a way one
        # sentence-window hit in a novel does not.
        min_edge_weight=1,
        min_degree=2,
    ),
    "hongloumeng": Source(
        name="hongloumeng",
        load=hongloumeng.load,
        # Sentence co-occurrence in a novel is noisier than a verse in the
        # Bible: a banquet sentence can name a dozen people who never address
        # each other. Two shared sentences is the same floor the notes give
        # matrix projections.
        min_edge_weight=2,
        min_degree=2,
    ),
    "iliad": Source(
        name="iliad",
        load=iliad.load,
        min_edge_weight=1,
        min_degree=2,
    ),
    "lesmiserables": Source(
        name="lesmiserables",
        load=lesmiserables.load,
        min_edge_weight=1,
        min_degree=2,
    ),
    "odyssey": Source(
        name="odyssey",
        load=odyssey.load,
        # A sentence naming two people in this translation is already a
        # deliberate act of the verse, closer to a biblical verse than to a
        # banquet sentence in a novel.
        min_edge_weight=1,
        min_degree=2,
    ),
    "sanguoyanyi": Source(
        name="sanguoyanyi",
        load=sanguoyanyi.load,
        min_edge_weight=2,
        min_degree=2,
    ),
    "shuihuzhuan": Source(
        name="shuihuzhuan",
        load=shuihuzhuan.load,
        min_edge_weight=2,
        min_degree=2,
    ),
    "xiyouji": Source(
        name="xiyouji",
        load=xiyouji.load,
        min_edge_weight=2,
        min_degree=2,
    ),
    "starwars": Source(
        name="starwars",
        load=starwars.load,
        min_edge_weight=1,
        min_degree=2,
    ),
    "shakespeare": Source(
        name="shakespeare",
        load=shakespeare.load,
        min_edge_weight=1,
        min_degree=2,
        # Plays barely share characters, so the corpus is 28 separate worlds
        # rather than one. Keeping only the giant component would throw away
        # Hamlet to save the Henry VI cycle; merging them all into one universe
        # asks the player to name a corpus while showing them a play.
        min_component_size=8,
        split_components=True,
        name_component=shakespeare.name_component,
    ),
}
