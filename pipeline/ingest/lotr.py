"""The Lord of the Rings — paragraph co-occurrence networks (Calvo Tello).

People only: places, groups, the Ring, and ontology animals are dropped.
See raw/lotr/SOURCE.md.
"""

from __future__ import annotations

import csv
import dataclasses
import urllib.request
from collections import defaultdict
from pathlib import Path

from ..canon.licenses import CC_BY_4_0
from ..canon.types import Attribution, CanonicalGraph, Edge, Node, Provenance

RAW = Path(__file__).resolve().parent.parent / "raw" / "lotr"
BASE = "https://raw.githubusercontent.com/morethanbooks/projects/master/LotR"

VOLUMES = {
    "volume1": ("fotr", "The Fellowship of the Ring"),
    "volume2": ("ttt", "The Two Towers"),
    "volume3": ("rotk", "The Return of the King"),
}

FILES = {
    "ontology.csv": f"{BASE}/ontologies/ontology.csv",
    "pre-ontology.csv": f"{BASE}/ontologies/pre-ontology.csv",
    "networks-id-volume1.csv": f"{BASE}/tables/networks-id-volume1.csv",
    "networks-id-volume2.csv": f"{BASE}/tables/networks-id-volume2.csv",
    "networks-id-volume3.csv": f"{BASE}/tables/networks-id-volume3.csv",
}

# Ontology subtype → species, except Men (culture) which reads better as a people.
SPECIES = {
    "hobbit": "Hobbit",
    "elves": "Elf",
    "dwarf": "Dwarf",
    "ainur": "Ainur",
    "orcs": "Orc",
    "ents": "Ent",
}

ATTRIBUTION = Attribution(
    title="Lord of the Rings Networks",
    creator="José Calvo Tello",
    creator_url="https://github.com/morethanbooks",
    source_url="https://github.com/morethanbooks/projects/tree/master/LotR",
    project_url="http://www.morethanbooks.eu/graph-network-of-the-lord-of-the-rings/",
    citation=(
        "J. Calvo Tello, “Lord of the Rings Networks,” morethanbooks/projects, "
        "https://github.com/morethanbooks/projects/tree/master/LotR."
    ),
    retrieved="2026-09-24",
    modifications=(
        "Merged the three per-volume edge lists into one graph, summing tie "
        "weights across volumes.",
        "Kept only ontology type=per nodes; dropped places, groups, the Ring, "
        "and subtype=animal (Bill, Shadowfax, Shelob).",
        "Applied pre-ontology aliases (Mithrandir → Gandalf, Strider → Aragorn, …).",
        "Normalised gender labels to Male/Female; mapped race subtypes to species.",
    ),
)


def load() -> CanonicalGraph:
    _ensure_raw()

    people = _people(RAW / "ontology.csv")
    aliases = _aliases(RAW / "pre-ontology.csv", people)

    weights: dict[tuple[str, str], float] = defaultdict(float)
    segments: dict[tuple[str, str], set[str]] = defaultdict(set)

    for volume, (segment, _label) in VOLUMES.items():
        path = RAW / f"networks-id-{volume}.csv"
        for source, target, weight in _edges(path):
            if source not in people or target not in people:
                continue
            a, b = (source, target) if source <= target else (target, source)
            weights[(a, b)] += weight
            segments[(a, b)].add(segment)

    present = {nid for pair in weights for nid in pair}
    order = {segment: i for i, (segment, _) in enumerate(VOLUMES.values())}

    nodes = [
        Node(
            id=nid,
            name=people[nid]["name"],
            aliases=tuple(aliases.get(nid, ())),
            work="lotr",
            metadata={
                "gender": people[nid]["gender"],
                "species": people[nid]["species"],
                "culture": people[nid]["culture"],
            },
        )
        for nid in sorted(present)
    ]
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
        dataset="calvo-tello-lotr-v1",
        edge_definition="characters named in the same paragraph",
        source_unit="volume",
        weight_semantics=(
            "count of shared paragraphs, summed across The Fellowship of the Ring, "
            "The Two Towers, and The Return of the King"
        ),
        attribution=dataclasses.replace(ATTRIBUTION),
        license=CC_BY_4_0,
    )

    return CanonicalGraph(
        id="lotr",
        title="The Lord of the Rings",
        accent="#3D5A45",
        nodes=nodes,
        edges=edges,
        provenance=provenance,
        segment_labels={segment: label for segment, label in VOLUMES.values()},
    ).sorted()


def _ensure_raw() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    for name, url in FILES.items():
        path = RAW / name
        if not path.exists():
            _fetch(url, path)


def _fetch(url: str, dest: Path) -> None:
    request = urllib.request.Request(url, headers={"User-Agent": "YouAreHere-pipeline/0.1"})
    with urllib.request.urlopen(request, timeout=60) as response:
        dest.write_bytes(response.read())


def _people(path: Path) -> dict[str, dict]:
    people: dict[str, dict] = {}
    with path.open(encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle, delimiter="\t"):
            if (row.get("type") or "").strip() != "per":
                continue
            subtype = (row.get("subtype") or "").strip().lower()
            if subtype == "animal":
                continue
            nid = (row.get("id") or "").strip()
            name = (row.get("Label") or "").strip()
            if not nid or not name:
                continue
            gender_raw = (row.get("gender") or "").strip().lower()
            gender = {"male": "Male", "female": "Female"}.get(gender_raw, "")
            species = SPECIES.get(subtype, "")
            culture = "Men" if subtype == "men" else ""
            people[nid] = {
                "name": name,
                "gender": gender,
                "species": species,
                "culture": culture,
            }
    return people


def _aliases(path: Path, people: dict[str, dict]) -> dict[str, tuple[str, ...]]:
    """pre-ontology lists every surface form; keep ones that differ from the Label."""
    collected: dict[str, list[str]] = defaultdict(list)
    with path.open(encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle, delimiter="\t"):
            if (row.get("type") or "").strip() != "per":
                continue
            nid = (row.get("id") or "").strip()
            if nid not in people:
                continue
            surface = (row.get("normalizedName") or row.get("name") or "").strip()
            if not surface or surface == people[nid]["name"]:
                continue
            if surface not in collected[nid]:
                collected[nid].append(surface)
    return {nid: tuple(names) for nid, names in collected.items()}


def _edges(path: Path) -> list[tuple[str, str, float]]:
    """Volume 3 uses Source/Target; volumes 1–2 use IdSource/IdTarget."""
    rows: list[tuple[str, str, float]] = []
    with path.open(encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            source = (row.get("IdSource") or row.get("Source") or "").strip()
            target = (row.get("IdTarget") or row.get("Target") or "").strip()
            if not source or not target or source == target:
                continue
            try:
                weight = float(row.get("Weight") or 0)
            except ValueError:
                continue
            if weight <= 0:
                continue
            rows.append((source, target, weight))
    return rows
