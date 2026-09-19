"""Les Misérables — Knuth's Stanford GraphBase encounter network.

Public-domain chapter encounters, not a text we processed. Two people are tied
when they share an encounter group in the same chapter. See
raw/lesmiserables/SOURCE.md.
"""

from __future__ import annotations

import dataclasses
from pathlib import Path

from ..canon.licenses import PUBLIC_DOMAIN
from ..canon.types import Attribution, CanonicalGraph, Provenance
from . import graphbase
from .fetch import get

RAW = Path(__file__).resolve().parent.parent / "raw" / "lesmiserables"
REMOTE = "http://ftp.cs.stanford.edu/pub/sgb/jean.dat"

ATTRIBUTION = Attribution(
    title="jean.dat (Les Misérables)",
    creator="Donald E. Knuth, Stanford GraphBase",
    creator_url="https://www-cs-faculty.stanford.edu/~knuth/sgb.html",
    source_url="http://ftp.cs.stanford.edu/pub/sgb/jean.dat",
    project_url="https://www-cs-faculty.stanford.edu/~knuth/sgb.html",
    citation=(
        "D. E. Knuth, The Stanford GraphBase: A Platform for Combinatorial Computing, "
        "ACM Press, 1993. File jean.dat, public domain."
    ),
    retrieved="2026-09-18",
    modifications=(
        "Read the encounter groups as an undirected weighted graph, summing shared groups "
        "across the novel.",
        "Collapsed Hugo's chapter tags to the five volumes, so a segment is a tome.",
        "Dropped redacted and numbered-anonymous figures (G--, Old woman 1) who cannot be guessed.",
    ),
)


def load() -> CanonicalGraph:
    path = RAW / "jean.dat"
    if not path.exists():
        get(REMOTE, dest=path)

    people, chapters = graphbase.parse(path)
    nodes, edges, labels = graphbase.graph_from(
        people, chapters, work="lesmiserables", segment_of=_volume
    )

    provenance = Provenance(
        dataset="sgb-jean-v1",
        edge_definition="characters who share an encounter group in the same chapter",
        source_unit="volume",
        weight_semantics="count of shared encounter groups, across all five volumes",
        attribution=dataclasses.replace(ATTRIBUTION),
        license=PUBLIC_DOMAIN,
    )

    return CanonicalGraph(
        id="lesmiserables",
        title="Les Misérables",
        accent="#3B2D5C",
        nodes=nodes,
        edges=edges,
        provenance=provenance,
        segment_labels=labels,
    ).sorted()


def _volume(tag: str) -> tuple[str, str]:
    volume = tag.split(".", 1)[0]
    return volume, f"Volume {volume}"
