"""Shakespeare — merged DraCor scene networks.

Each play is a segment. Recurring characters keep DraCor's stable ids (Falstaff
is Falstaff_1H4 even in 2 Henry IV). Crowd roles (Messenger, Soldier) stay
play-specific so they are not collapsed into one person.

Source texts are Folger Shakespeare Library, CC BY-NC 3.0, via DraCor.
See raw/shakespeare/SOURCE.md.
"""

from __future__ import annotations

import csv
import dataclasses
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

from ..canon.licenses import CC_BY_NC_3_0
from ..canon.types import Attribution, CanonicalGraph, Edge, Node, Provenance
from .fetch import get, get_json

RAW = Path(__file__).resolve().parent.parent / "raw" / "shakespeare"
CORPUS = "https://dracor.org/api/v0/corpora/shake"

ATTRIBUTION = Attribution(
    title="Shakespeare Drama Corpus (DraCor)",
    creator="DraCor / Folger Shakespeare Library",
    creator_url="https://dracor.org/",
    source_url="https://github.com/dracor-org/shakedracor",
    project_url="https://dracor.org/shake",
    citation=(
        "F. Fischer et al., “Programmable Corpora: Introducing DraCor”, DH2019. "
        "Texts from the Folger Shakespeare Library."
    ),
    retrieved="2026-09-17",
    modifications=(
        "Merged all 37 plays into one graph, summing scene co-presence across plays.",
        "Dropped group nodes (crowds, attendants) so a waking is always a person.",
        "Disambiguated repeated generic names (Messenger, Soldier) with the play title.",
    ),
)


def load() -> CanonicalGraph:
    corpus_path = RAW / "corpus.json"
    if not corpus_path.exists():
        get(CORPUS, dest=corpus_path)
    corpus = json.loads(corpus_path.read_text(encoding="utf-8"))

    plays = sorted(corpus["dramas"], key=lambda p: p["name"])
    labels = {play["name"]: play["title"] for play in plays}

    weights: dict[tuple[str, str], float] = defaultdict(float)
    segments: dict[tuple[str, str], set[str]] = defaultdict(set)
    records: dict[str, dict] = {}

    for play in plays:
        slug = play["name"]
        for character in _cast(slug):
            if not _is_person(character):
                continue
            records.setdefault(character["id"], character)
        for source, target, weight in _edges(slug):
            if source not in records or target not in records or source == target:
                continue
            key = (source, target) if source <= target else (target, source)
            weights[key] += weight
            segments[key].add(slug)

    name_counts = Counter(records[node_id]["name"] for node_id in records)
    play_of = {node_id: node_id.rsplit("_", 1)[-1] for node_id in records}
    code_to_title = {}
    for play in plays:
        for character in _cast(play["name"]):
            if "_" in character["id"]:
                code_to_title[character["id"].rsplit("_", 1)[-1]] = play["title"]
                break

    tentative = {}
    for node_id in records:
        character = records[node_id]
        name = character["name"]
        if name_counts[name] > 1:
            name = f"{name} ({code_to_title.get(play_of[node_id], play_of[node_id])})"
        tentative[node_id] = name

    still = Counter(tentative.values())
    nodes = []
    for node_id in sorted(records):
        character = records[node_id]
        name = tentative[node_id]
        if still[name] > 1:
            stem = node_id.rsplit("_", 1)[0]
            pretty = re.sub(r"(?<!^)([A-Z])", r" \1", stem).replace(".", " ").strip()
            play = code_to_title.get(play_of[node_id], play_of[node_id])
            name = f"{pretty} ({play})"
        metadata = {}
        if character.get("wikidataId"):
            metadata["wikidata"] = character["wikidataId"]
        gender = character.get("sex") or character.get("gender")
        if gender in ("MALE", "FEMALE"):
            metadata["gender"] = gender.title()
        nodes.append(Node(id=node_id, name=name, work="shakespeare", metadata=metadata))

    order = {slug: i for i, slug in enumerate(sorted(labels))}
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
        dataset="dracor-shake-v0",
        edge_definition="characters who appear in the same scene of a play",
        source_unit="play",
        weight_semantics="count of shared scenes, summed across the 37-play corpus",
        attribution=dataclasses.replace(ATTRIBUTION),
        license=CC_BY_NC_3_0,
    )

    return CanonicalGraph(
        id="shakespeare",
        title="Shakespeare",
        accent="#3D5C4A",
        nodes=nodes,
        edges=edges,
        provenance=provenance,
        segment_labels=labels,
    ).sorted()


def _is_person(character: dict) -> bool:
    """DraCor marks crowds as groups, but unnamed messengers often have isGroup
    false and a machine id as their 'name'. Those are not someone a player can
    guess."""
    if character.get("isGroup"):
        return False
    name = character.get("name") or ""
    if not name or name == character["id"]:
        return False
    if "," in name:
        return False
    if name.lower().startswith("both "):
        return False
    return True


def _cast(slug: str) -> list[dict]:
    path = RAW / "cast" / f"{slug}.json"
    if not path.exists():
        get(f"{CORPUS}/play/{slug}", dest=path)
    return json.loads(path.read_text(encoding="utf-8"))["cast"]


def _edges(slug: str) -> list[tuple[str, str, float]]:
    path = RAW / "network" / f"{slug}.csv"
    if not path.exists():
        get(f"{CORPUS}/play/{slug}/networkdata/csv", dest=path)
    rows = []
    with path.open(encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            rows.append((row["Source"], row["Target"], float(row["Weight"])))
    return rows
