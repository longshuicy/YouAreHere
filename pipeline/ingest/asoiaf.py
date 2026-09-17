"""A Song of Ice and Fire — character interaction networks (Beveridge & Shan).

Raw files in, canonical nodes + edges + provenance out. No filtering, no
analysis, no opinions about difficulty.

Source data is CC BY-NC-SA 4.0. See raw/asoiaf/SOURCE.md.
"""

from __future__ import annotations

import csv
import dataclasses
import re
from collections import defaultdict
from pathlib import Path

from ..canon.licenses import CC_BY_NC_SA_4_0
from ..canon.types import Attribution, CanonicalGraph, Edge, Node, Provenance

RAW = Path(__file__).resolve().parent.parent / "raw" / "asoiaf"

BOOKS = {
    "1": "agot",
    "2": "acok",
    "3": "asos",
    "4": "affc",
    "5": "adwd",
}

ATTRIBUTION = Attribution(
    title="Character Interaction Networks for A Song of Ice and Fire",
    creator="Andrew Beveridge and Jie Shan",
    creator_url="https://mathbeveridge.github.io/",
    source_url="https://github.com/mathbeveridge/asoiaf",
    project_url="https://networkofthrones.wordpress.com",
    citation=(
        "A. Beveridge and J. Shan, \u201cNetwork of Thrones\u201d, "
        "Math Horizons 23(4), 2016, pp. 18\u201322."
    ),
    citation_doi="10.4169/mathhorizons.23.4.18",
    retrieved="2026-09-17",
    modifications=(
        "Merged the five per-book edge lists into one graph, summing tie weights across books.",
        "Derived display names from the dataset's hyphenated identifiers.",
    ),
)


def load() -> CanonicalGraph:
    weights: dict[tuple[str, str], float] = defaultdict(float)
    segments: dict[tuple[str, str], set[str]] = defaultdict(set)
    raw_names: dict[str, str] = {}

    for book, segment in sorted(BOOKS.items()):
        path = RAW / f"asoiaf-book{book}-edges.csv"
        if not path.exists():
            raise FileNotFoundError(f"{path} is missing. See {RAW / 'SOURCE.md'} for how to fetch it.")

        with path.open(encoding="utf-8", newline="") as handle:
            for row in csv.DictReader(handle):
                source, target = row["Source"], row["Target"]
                a, b = _identifier(source), _identifier(target)
                raw_names.setdefault(a, source)
                raw_names.setdefault(b, target)
                key = (a, b) if a <= b else (b, a)
                weights[key] += float(row["weight"])
                segments[key].add(segment)

    nodes = [_node(node_id, raw_names[node_id]) for node_id in sorted(raw_names)]

    order = {segment: i for i, segment in enumerate(BOOKS.values())}
    edges = [
        Edge(
            source=source,
            target=target,
            weight=weights[(source, target)],
            type="cooccurrence",
            segments=tuple(sorted(segments[(source, target)], key=order.__getitem__)),
        )
        for source, target in sorted(weights)
    ]

    provenance = Provenance(
        dataset="beveridge-asoiaf-v1",
        edge_definition="characters named within 15 words of each other",
        source_unit="book",
        weight_semantics="count of qualifying co-occurrences, summed across all five books",
        # A copy, not the constant: later stages append their own changes to this
        # record, and the module-level template must stay clean between builds.
        attribution=dataclasses.replace(ATTRIBUTION),
        license=CC_BY_NC_SA_4_0,
    )

    return CanonicalGraph(
        id="asoiaf",
        title="A Song of Ice and Fire",
        accent="#7A2E2E",
        nodes=nodes,
        edges=edges,
        provenance=provenance,
    ).sorted()


def _identifier(raw: str) -> str:
    return re.sub(r"_+", "_", re.sub(r"[^a-z0-9]+", "_", raw.lower())).strip("_")


def _node(node_id: str, raw: str) -> Node:
    """Names arrive hyphenated, sometimes with a trailing parenthetical.

    The parenthetical is doing one of two jobs and the dataset does not say
    which: `(Maester-Aemon)` is a name a reader might type, `(Wolfs-Den)` is the
    castle this Garth works at, `(Tyrions)` is a possessive. Capitalisation
    looked like a usable signal and is not — it was wrong for half the cases it
    fired on.

    So the adapter no longer guesses. Every parenthetical becomes a qualifier,
    which is inert: never labelled, never matched by the type-ahead. Promoting
    one to a real alias is a decision recorded in aliases/asoiaf.yaml.
    """
    match = re.fullmatch(r"(.+?)-\((.+)\)", raw)
    if not match:
        return Node(id=node_id, name=raw.replace("-", " "), work="asoiaf")

    base, parenthetical = match.groups()
    return Node(
        id=node_id,
        name=base.replace("-", " "),
        work="asoiaf",
        metadata={"qualifier": parenthetical.replace("-", " ").replace("_", " ")},
    )
