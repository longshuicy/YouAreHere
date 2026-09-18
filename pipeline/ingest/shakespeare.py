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
        "Dropped unnamed crowd roles that no play-level qualifier can tell apart.",
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
    # Which play a character is credited to: recorded while walking the plays,
    # not recovered afterwards from the id. DraCor's id suffixes are play codes,
    # but they are not unique to a play and not every id in a play carries the
    # same one, so reading the play back out of the id produced confident and
    # wrong attributions — a Duchess of York labelled to Henry IV. A recurring
    # character belongs to the first play they appear in, matching how their id
    # is assigned.
    play_of: dict[str, str] = {}

    for play in plays:
        slug = play["name"]
        for character in _cast(slug):
            if not _is_person(character):
                continue
            if character["id"] not in records:
                records[character["id"]] = character
                play_of[character["id"]] = slug
        for source, target, weight in _edges(slug):
            if source not in records or target not in records or source == target:
                continue
            key = (source, target) if source <= target else (target, source)
            weights[key] += weight
            segments[key].add(slug)

    name_counts = Counter(records[node_id]["name"] for node_id in records)

    tentative = {}
    for node_id in records:
        character = records[node_id]
        name = character["name"]
        if name_counts[name] > 1:
            name = f"{name} ({labels[play_of[node_id]]})"
        tentative[node_id] = name

    # Names still colliding after the play qualifier are indistinguishable crowd
    # roles — two unnamed "First Lord"s in the same play, one attending each
    # duke. They used to be named from their DraCor id, which produced
    # "L O R D S  F R E D E R I C K 0 1" on a player's screen. Nobody can guess
    # that, and nobody can guess "First Lord" either: if two characters cannot be
    # told apart by name, the guess field has no answer for either of them. So
    # they are dropped, on the same grounds as the group nodes above.
    still = Counter(tentative.values())
    indistinguishable = {node_id for node_id in records if still[tentative[node_id]] > 1}

    nodes = []
    for node_id in sorted(records):
        if node_id in indistinguishable:
            continue
        character = records[node_id]
        name = tentative[node_id]
        metadata = {}
        if character.get("wikidataId"):
            metadata["wikidata"] = character["wikidataId"]
        gender = character.get("sex") or character.get("gender")
        if gender in ("MALE", "FEMALE"):
            metadata["gender"] = gender.title()
        nodes.append(Node(id=node_id, name=name, work="shakespeare", metadata=metadata))

    kept = {node.id for node in nodes}
    for key in [k for k in weights if k[0] not in kept or k[1] not in kept]:
        del weights[key]

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


# Components that span more than one play, named for what actually holds them
# together. A component is matched against these by subset, not equality, so a
# play dropping out under a different filter setting renames nothing.
#
# The first is the two tetralogies — one continuous dynastic quarrel from
# Richard II to Richard III — plus The Merry Wives of Windsor, which is attached
# to it by Falstaff, Pistol, Bardolph and Mistress Quickly rather than by any
# king. The second is the Roman pair, joined by Antony, Octavius and Lepidus.
CYCLES: tuple[tuple[frozenset[str], str, str], ...] = (
    (
        frozenset({
            "richard-ii",
            "henry-iv-part-1",
            "henry-iv-part-2",
            "henry-v",
            "henry-vi-part-1",
            "henry-vi-part-2",
            "henry-vi-part-3",
            "richard-iii",
            "the-merry-wives-of-windsor",
        }),
        "english-histories",
        "The English Histories",
    ),
    (
        frozenset({"julius-caesar", "antony-and-cleopatra"}),
        "rome",
        "Shakespeare's Rome",
    ),
)


def name_component(node_ids: set[str], segments: set[str]) -> tuple[str, str]:
    """What to call one connected component of the corpus.

    Almost every component is exactly one play, because plays almost never share
    a character. The exceptions are the two cycles above, where they do.
    """
    titles = _load_titles()

    if len(segments) == 1:
        slug = next(iter(segments))
        return slug, titles.get(slug, slug)

    for plays, slug, title in CYCLES:
        if segments <= plays:
            return slug, title

    # A grouping nobody has named yet. Listing the plays is honest and loud
    # enough to be noticed and given a proper name in CYCLES.
    ordered = sorted(segments)
    return "-and-".join(ordered), " & ".join(titles.get(s, s) for s in ordered)


def _load_titles() -> dict[str, str]:
    corpus_path = RAW / "corpus.json"
    if not corpus_path.exists():
        get(CORPUS, dest=corpus_path)
    corpus = json.loads(corpus_path.read_text(encoding="utf-8"))
    return {play["name"]: play["title"] for play in corpus["dramas"]}


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
