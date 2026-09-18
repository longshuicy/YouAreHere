"""Factual enrichment for the reveal screen.

Runs against the adapter's raw output, before the identity table renames
anything, so matching sees the names the upstream sources also use. Everything
is keyed by node id, which survives renaming and filtering.
"""

from __future__ import annotations

from collections import Counter, defaultdict

from ..canon.types import CanonicalGraph
from . import anapi


def extract(
    graph: CanonicalGraph, overrides: dict[str, dict] | None = None
) -> tuple[dict[str, dict], dict[tuple[str, str], dict], dict]:
    """Returns (node facts, edge facts, coverage stats)."""
    node_facts = _node_facts(graph, overrides or {})
    edge_facts = _edge_facts(graph, node_facts)

    stats = {
        "nodesWithFacts": len(node_facts),
        "nodesTotal": len(graph.nodes),
        "edgesWithFacts": len(edge_facts),
        "edgesTotal": len(graph.edges),
        "field": Counter(),
    }
    for facts in node_facts.values():
        for key in facts:
            stats["field"][key] += 1
    stats["field"] = dict(stats["field"].most_common())
    return node_facts, edge_facts, stats


def _node_facts(graph: CanonicalGraph, overrides: dict[str, dict]) -> dict[str, dict]:
    labels = graph.segment_labels
    order = list(labels) if labels else None

    appearances = _appearances(graph, order)
    api_by_name, api_by_url, houses = {}, {}, {}
    graph_name_counts = Counter(node.name.lower() for node in graph.nodes)

    # Discrete Ice-and-Fire attributes only belong on that universe. Matching
    # "Jon" in Shakespeare against Jon Snow would be a real bug.
    if graph.id == "asoiaf":
        characters = anapi.characters()
        api_by_name = defaultdict(list)
        for character in characters:
            if character.get("name"):
                api_by_name[character["name"].lower()].append(character)
        api_by_url = {character["url"]: character for character in characters}
        houses = anapi.house_names()

    pinned = _pinned(overrides, api_by_url, graph) if api_by_url else {}

    facts: dict[str, dict] = {}
    for node in graph.nodes:
        record: dict = {}

        books = appearances.get(node.id)
        if books:
            record["books"] = [_label(labels, seg) for seg in books]
            record["unit"] = graph.provenance.source_unit
            if labels:
                record["corpusSize"] = len(labels)

        if node.metadata.get("gender") in ("Male", "Female"):
            record["gender"] = node.metadata["gender"]

        if api_by_name:
            key = node.name.lower()
            if node.id in pinned:
                matches = [pinned[node.id]]
                unambiguous = True
            else:
                matches = _resolve(api_by_name.get(key, []))
                unambiguous = graph_name_counts[key] == 1

            if len(matches) == 1 and unambiguous:
                character = matches[0]
                if character.get("gender") in ("Male", "Female"):
                    record["gender"] = character["gender"]
                if character.get("culture"):
                    record["culture"] = character["culture"]
                if character.get("titles"):
                    titles = [t for t in character["titles"] if t]
                    if titles:
                        record["titles"] = titles
                allegiances = [houses[url] for url in character.get("allegiances", []) if url in houses]
                if allegiances:
                    record["houses"] = allegiances
                if character.get("born"):
                    record["born"] = character["born"]
                if character.get("died"):
                    record["died"] = character["died"]
                if character.get("povBooks"):
                    record["pov"] = len(character["povBooks"])

        if record:
            facts[node.id] = record
    return facts


SUBSTANTIVE = ("culture", "titles", "allegiances", "born", "died", "povBooks")


def _pinned(overrides: dict[str, dict], api_by_url: dict[str, dict], graph: CanonicalGraph) -> dict[str, dict]:
    """Let the identity table name an exact source record.

    Two cases need it and neither can be inferred. Some names are genuinely
    ambiguous in the source — there really are two Daenerys Targaryens, an
    ancestor and the queen — so skipping is correct but loses a major character.
    And some characters are filed under a name the graph never uses: Hodor is
    listed under Walder, which is his actual name.
    """
    pinned = {}
    for node_id, override in overrides.items():
        url = override.get("api")
        if not url:
            continue
        if url not in api_by_url:
            raise ValueError(
                f"{graph.id}: identity table pins '{node_id}' to {url}, which is not in the "
                f"cached source data. Check the URL, or delete the cache to refetch."
            )
        pinned[node_id] = api_by_url[url]
    return pinned


def _resolve(matches: list[dict]) -> list[dict]:
    """The API carries empty duplicate records for some characters — there are
    two rows called "Daenerys Targaryen" and one holds nothing.

    A blank duplicate is not a second person, so it should not make the name
    ambiguous. Discard records with no substantive attributes; if exactly one
    real record survives, the name is unambiguous after all. Two populated
    records still count as ambiguous and are skipped.
    """
    if len(matches) <= 1:
        return matches
    populated = [m for m in matches if any(m.get(field) for field in SUBSTANTIVE)]
    return populated or matches


def _appearances(graph: CanonicalGraph, order: list[str] | None) -> dict[str, list[str]]:
    """Which segments a character appears in, taken from the ties themselves."""
    seen: dict[str, set[str]] = defaultdict(set)
    for edge in graph.edges:
        seen[edge.source].update(edge.segments)
        seen[edge.target].update(edge.segments)

    def sort_key(segment: str):
        if order and segment in order:
            return (0, order.index(segment))
        return (1, segment)

    return {
        node_id: sorted(segments, key=sort_key)
        for node_id, segments in seen.items()
        if segments
    }


def _label(labels: dict, segment: str) -> str:
    return labels.get(segment, segment)


def _edge_facts(graph: CanonicalGraph, node_facts: dict[str, dict]) -> dict[tuple[str, str], dict]:
    facts: dict[tuple[str, str], dict] = {}
    labels = graph.segment_labels
    order = list(labels) if labels else None

    def sort_key(segment: str):
        if order and segment in order:
            return (0, order.index(segment))
        return (1, segment)

    for edge in graph.edges:
        if not edge.segments:
            continue
        books = [_label(labels, seg) for seg in sorted(edge.segments, key=sort_key)]
        record = {
            "books": books,
            "first": books[0],
            "unit": graph.provenance.source_unit,
        }
        if labels:
            record["corpusSize"] = len(labels)

        left = set(node_facts.get(edge.source, {}).get("houses", ()))
        right = set(node_facts.get(edge.target, {}).get("houses", ()))
        shared = sorted(left & right)
        if shared:
            record["sharedHouses"] = shared

        facts[edge.key] = record
    return facts
