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
from .ingest import asoiaf


@dataclass(frozen=True)
class Source:
    name: str
    load: Callable[[], CanonicalGraph]
    min_edge_weight: float
    min_degree: int


SOURCES: dict[str, Source] = {
    "asoiaf": Source(
        name="asoiaf",
        load=asoiaf.load,
        min_edge_weight=1,
        min_degree=2,
    ),
}
