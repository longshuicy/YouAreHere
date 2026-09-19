"""The Iliad — Knuth's Stanford GraphBase encounter network.

Public-domain chapter encounters, not a text we processed. Two people are tied
when they share an encounter group in the same book of the poem. See
raw/iliad/SOURCE.md.
"""

from __future__ import annotations

import dataclasses
from pathlib import Path

from ..canon.licenses import PUBLIC_DOMAIN
from ..canon.types import Attribution, CanonicalGraph, Provenance
from . import graphbase
from .fetch import get

RAW = Path(__file__).resolve().parent.parent / "raw" / "iliad"
REMOTE = "http://ftp.cs.stanford.edu/pub/sgb/homer.dat"

ATTRIBUTION = Attribution(
    title="homer.dat (The Iliad)",
    creator="Donald E. Knuth, Stanford GraphBase",
    creator_url="https://www-cs-faculty.stanford.edu/~knuth/sgb.html",
    source_url="http://ftp.cs.stanford.edu/pub/sgb/homer.dat",
    project_url="https://www-cs-faculty.stanford.edu/~knuth/sgb.html",
    citation=(
        "D. E. Knuth, The Stanford GraphBase: A Platform for Combinatorial Computing, "
        "ACM Press, 1993. File homer.dat, public domain."
    ),
    retrieved="2026-09-18",
    modifications=(
        "Read the encounter groups as an undirected weighted graph, summing shared groups "
        "across the 24 books.",
        "Dropped collective nodes (armies, the Olympians as a body) and paired livestock.",
        "Took the Greek name as the label where Knuth gives a Latin equivalent in parentheses.",
    ),
)


def load() -> CanonicalGraph:
    path = RAW / "homer.dat"
    if not path.exists():
        get(REMOTE, dest=path)

    people, chapters = graphbase.parse(path)
    nodes, edges, labels = graphbase.graph_from(
        people, chapters, work="iliad", segment_of=_book
    )

    provenance = Provenance(
        dataset="sgb-homer-v1",
        edge_definition="characters who share an encounter group in the same book",
        source_unit="book",
        weight_semantics="count of shared encounter groups, across all 24 books",
        attribution=dataclasses.replace(ATTRIBUTION),
        license=PUBLIC_DOMAIN,
    )

    return CanonicalGraph(
        id="iliad",
        title="The Iliad",
        accent="#8A5A2B",
        nodes=nodes,
        edges=edges,
        provenance=provenance,
        segment_labels=labels,
    ).sorted()


def _book(tag: str) -> tuple[str, str]:
    number = int(tag)
    return str(number), f"Book {number}"
