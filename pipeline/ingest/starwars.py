"""Star Wars — scene-speech networks (Gabasova).

Two characters are tied if they speak in the same scene. R2-D2 and Chewbacca
are included from the mentions overlay (they do not speak in the scripts).

Source data is CC BY 3.0, Zenodo 10.5281/zenodo.1411479. See raw/starwars/SOURCE.md.
"""

from __future__ import annotations

import dataclasses
import json
import re
from collections import defaultdict
from pathlib import Path

from ..canon.licenses import CC_BY_3_0
from ..canon.types import Attribution, CanonicalGraph, Edge, Node, Provenance
from .fetch import get

RAW = Path(__file__).resolve().parent.parent / "raw" / "starwars"
GITHUB = "https://raw.githubusercontent.com/evelinag/star-wars-network-data/1.0.1"

EPISODES = {
    "1": ("ep1", "The Phantom Menace"),
    "2": ("ep2", "Attack of the Clones"),
    "3": ("ep3", "Revenge of the Sith"),
    "4": ("ep4", "A New Hope"),
    "5": ("ep5", "The Empire Strikes Back"),
    "6": ("ep6", "Return of the Jedi"),
    "7": ("ep7", "The Force Awakens"),
}

ATTRIBUTION = Attribution(
    title="Star Wars social network",
    creator="Evelina Gabasova",
    creator_url="https://evelinag.com/",
    source_url="https://github.com/evelinag/star-wars-network-data",
    project_url="https://doi.org/10.5281/zenodo.1411479",
    citation="E. Gabasova, “Star Wars social network”, 2016.",
    citation_doi="10.5281/zenodo.1411479",
    retrieved="2026-09-17",
    modifications=(
        "Merged the seven per-episode interaction networks, summing scene counts across films.",
        "Used the allCharacters files so R2-D2 and Chewbacca, who do not speak, are included.",
        "Title-cased display names; identifiers such as R2-D2 were left as written.",
    ),
)


def load() -> CanonicalGraph:
    weights: dict[tuple[str, str], float] = defaultdict(float)
    segments: dict[tuple[str, str], set[str]] = defaultdict(set)
    names: dict[str, str] = {}

    for number, (segment, _title) in EPISODES.items():
        payload = _episode(number)
        index_of = []
        for node in payload["nodes"]:
            node_id = _identifier(node["name"])
            names.setdefault(node_id, _display(node["name"]))
            index_of.append(node_id)
        for link in payload["links"]:
            a, b = index_of[link["source"]], index_of[link["target"]]
            if a == b:
                continue
            key = (a, b) if a <= b else (b, a)
            weights[key] += float(link["value"])
            segments[key].add(segment)

    order = {segment: i for i, (segment, _) in enumerate(EPISODES.values())}
    nodes = [Node(id=node_id, name=names[node_id], work="starwars") for node_id in sorted(names)]
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
        dataset="gabasova-starwars-1.0.1",
        edge_definition="characters who speak in the same scene of a film (droids and Chewbacca via mentions)",
        source_unit="film",
        weight_semantics="count of shared speaking scenes, summed across episodes I–VII",
        attribution=dataclasses.replace(ATTRIBUTION),
        license=CC_BY_3_0,
    )

    return CanonicalGraph(
        id="starwars",
        title="Star Wars",
        accent="#C8A951",
        nodes=nodes,
        edges=edges,
        provenance=provenance,
        segment_labels={segment: title for segment, title in EPISODES.values()},
    ).sorted()


def _episode(number: str) -> dict:
    name = f"starwars-episode-{number}-interactions-allCharacters.json"
    path = RAW / name
    if not path.exists():
        get(f"{GITHUB}/{name}", dest=path)
    return json.loads(path.read_text(encoding="utf-8"))


def _identifier(raw: str) -> str:
    return re.sub(r"_+", "_", re.sub(r"[^a-z0-9]+", "_", raw.lower())).strip("_")


def _display(raw: str) -> str:
    """Scripts shout. 'LUKE' should read as Luke; 'R2-D2' should not become R2-D2's title case."""
    raw = raw.strip()
    if any(ch.isdigit() for ch in raw):
        return raw
    if "-" in raw and raw.replace("-", "").isalpha():
        return "-".join(part.capitalize() for part in raw.split("-"))
    if raw.isupper() or raw.istitle():
        return raw.replace("_", " ").title()
    return raw.replace("_", " ")
