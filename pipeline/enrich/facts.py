"""Factual enrichment for the reveal screen.

Runs against the adapter's raw output, before the identity table renames
anything, so matching sees the names the upstream sources also use. Everything
is keyed by node id, which survives renaming and filtering.
"""

from __future__ import annotations

import re
from collections import Counter, defaultdict
from pathlib import Path

from ..canon.types import CanonicalGraph
from . import anapi, folger, knuth, legislators, wikidata

RAW = Path(__file__).resolve().parent.parent / "raw"


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


def meta_sources_for(name: str) -> list[tuple]:
    """Attribution pairs to credit on the enrichment sidecar."""
    if name == "asoiaf":
        return [(anapi.ATTRIBUTION, anapi.LICENSE)]
    if name in ("iliad", "lesmiserables"):
        return [
            (knuth.ATTRIBUTION, knuth.LICENSE),
            (wikidata.ATTRIBUTION, wikidata.LICENSE),
        ]
    if name == "congress":
        return [(legislators.ATTRIBUTION, legislators.LICENSE)]
    if name == "civilwar":
        # Side and rank travel on the node from the NPS tables; no extra
        # enrichment source to credit beyond the graph attribution.
        return []
    if name in (
        "bible",
        "friends",
        "hongloumeng",
        "lotr",
        "odyssey",
        "sanguoyanyi",
        "shiji",
        "shuihuzhuan",
        "xiyouji",
    ):
        return [(wikidata.ATTRIBUTION, wikidata.LICENSE)]
    if name == "shakespeare":
        return [
            (folger.ATTRIBUTION, folger.LICENSE),
            (wikidata.ATTRIBUTION, wikidata.LICENSE),
        ]
    if name == "starwars":
        return [(wikidata.ATTRIBUTION, wikidata.LICENSE)]
    return []


def _node_facts(graph: CanonicalGraph, overrides: dict[str, dict]) -> dict[str, dict]:
    labels = graph.segment_labels
    order = list(labels) if labels else None
    appearances = _appearances(graph, order)

    source = graph.id
    asoiaf = _asoiaf_lookup(graph, overrides) if source == "asoiaf" else None
    roles = _shakespeare_roles(graph) if source == "shakespeare" else {}
    congress_attrs = legislators.attributes_for(graph.nodes) if source == "congress" else {}
    wd_by_qid, qid_by_node = _wikidata_for(graph, overrides)

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

        if asoiaf is not None:
            _apply_asoiaf(record, node, asoiaf)

        if node.id in roles:
            record["role"] = roles[node.id]
        if source == "shakespeare":
            blended = folger.blend_role(node.name, record.get("role"))
            if blended:
                record["role"] = blended

        if source in ("iliad", "lesmiserables"):
            for key, value in knuth.from_node(source, node).items():
                record.setdefault(key, value)

        if node.id in congress_attrs:
            legislators.apply_to_record(record, congress_attrs[node.id])

        if source == "civilwar":
            _apply_civilwar(record, node)

        if source == "lotr":
            _apply_lotr(record, node)

        qid = qid_by_node.get(node.id)
        if qid and qid in wd_by_qid:
            wikidata.apply_to_record(record, wd_by_qid[qid])
        _trim_literary(record, source)

        pinned = _facts_pin(node, overrides)
        for key, value in pinned.items():
            if value in (None, "", [], {}):
                continue
            record[key] = value

        if record:
            facts[node.id] = record
    return facts


def _facts_pin(node, overrides: dict[str, dict]) -> dict:
    """Identity-table `facts:` keyed by adapter id or display name.

    Before Shakespeare is split, duplicate names carry a play qualifier
    (`Juliet (Romeo and Juliet)`). Pins are written against the name a player
    sees, so the qualifier is stripped when looking up.
    """
    keys = [node.id, node.name, node.name.lower()]
    if " (" in node.name and node.name.endswith(")"):
        base = node.name[: node.name.rfind(" (")]
        keys.extend([base, base.lower()])
    for key in keys:
        entry = overrides.get(key)
        if entry and entry.get("facts"):
            return entry["facts"]
    return {}


def _asoiaf_lookup(graph: CanonicalGraph, overrides: dict[str, dict]):
    characters = anapi.characters()
    api_by_name: dict[str, list] = defaultdict(list)
    for character in characters:
        if character.get("name"):
            api_by_name[character["name"].lower()].append(character)
    api_by_url = {character["url"]: character for character in characters}
    houses = anapi.house_names()
    pinned = _pinned_api(overrides, api_by_url, graph)
    name_counts = Counter(node.name.lower() for node in graph.nodes)
    return {
        "by_name": api_by_name,
        "houses": houses,
        "pinned": pinned,
        "name_counts": name_counts,
    }


def _apply_asoiaf(record: dict, node, asoiaf: dict) -> None:
    key = node.name.lower()
    if node.id in asoiaf["pinned"]:
        matches = [asoiaf["pinned"][node.id]]
        unambiguous = True
    else:
        matches = _resolve(asoiaf["by_name"].get(key, []))
        unambiguous = asoiaf["name_counts"][key] == 1

    if not (len(matches) == 1 and unambiguous):
        return

    character = matches[0]
    houses = asoiaf["houses"]
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


def _apply_civilwar(record: dict, node) -> None:
    """Side and rank travel on the node from the NPS commander table."""
    side = node.metadata.get("side")
    if side and "affiliations" not in record and "houses" not in record:
        record["affiliations"] = [side]

    rank = node.metadata.get("rank")
    if rank and "role" not in record and "titles" not in record:
        # Navy captains and army captains share a word; prefer the table's rank
        # as a title so describe.py can say "Major General, of the Union".
        record["titles"] = [rank]


def _apply_lotr(record: dict, node) -> None:
    """Race travels on the node from Calvo Tello's ontology."""
    species = node.metadata.get("species")
    if species and "species" not in record and "culture" not in record:
        record["species"] = species
    culture = node.metadata.get("culture")
    if culture and "culture" not in record and "species" not in record:
        record["culture"] = culture


def _match_lotr(graph: CanonicalGraph, overrides: dict[str, dict]) -> dict[str, str]:
    """Map Calvo Tello ids to Wikidata QIDs. Pins win; names search when unique."""
    matched: dict[str, str] = {}
    for node_id, override in overrides.items():
        qid = override.get("wikidata")
        if qid:
            matched[node_id] = qid

    search_names: dict[str, str] = {}
    for node in graph.nodes:
        if node.id in matched:
            continue
        search_names[node.id] = _lotr_search_name(node)

    name_counts = Counter(search_names.values())
    unique_names = [name for _, name in search_names.items() if name_counts[name] == 1]
    resolved = wikidata.resolve_lotr_names(sorted(set(unique_names)))

    for node_id, name in search_names.items():
        if node_id in matched:
            continue
        if name_counts[name] != 1:
            continue
        qid = resolved.get(name)
        if qid:
            matched[node_id] = qid

    return matched


# Short ontology labels → a form Wikidata's search is likely to hit first.
LOTR_SEARCH_EXPAND = {
    "frodo": "Frodo Baggins",
    "sam": "Samwise Gamgee",
    "merry": "Meriadoc Brandybuck",
    "pippin": "Peregrin Took",
    "aragorn": "Aragorn",
    "gandalf": "Gandalf",
    "gimli": "Gimli",
    "legolas": "Legolas",
    "boromir": "Boromir",
    "faramir": "Faramir",
    "denethor": "Denethor",
    "théoden": "Théoden",
    "theoden": "Théoden",
    "éowyn": "Éowyn",
    "eowyn": "Éowyn",
    "éomer": "Éomer",
    "eomer": "Éomer",
    "gollum": "Gollum",
    "sauron": "Sauron",
    "saruman": "Saruman",
    "elrond": "Elrond",
    "galadriel": "Galadriel",
    "treebeard": "Treebeard",
    "bilbo": "Bilbo Baggins",
    "wormtongue": "Gríma Wormtongue",
    "gildor": "Gildor Inglorion",
}


def _lotr_search_name(node) -> str:
    expanded = LOTR_SEARCH_EXPAND.get(node.name.lower())
    if expanded:
        return expanded
    if " " not in node.name.strip():
        for alias in node.aliases:
            if " " in alias.strip() and len(alias) > len(node.name):
                return alias
    return node.name


def _shakespeare_roles(graph: CanonicalGraph) -> dict[str, str]:
    slugs = sorted(graph.segment_labels) if graph.segment_labels else []
    if not slugs:
        return {}
    return folger.roles_for_corpus(slugs)


def _wikidata_for(
    graph: CanonicalGraph, overrides: dict[str, dict]
) -> tuple[dict[str, dict], dict[str, str]]:
    """Returns (attributes by QID, QID by node id)."""
    source = graph.id
    qid_by_node: dict[str, str] = {}

    for node in graph.nodes:
        pinned = overrides.get(node.id, {}).get("wikidata")
        if pinned:
            qid_by_node[node.id] = pinned
        elif re.fullmatch(r"Q\d+", node.id):
            qid_by_node[node.id] = node.id
        elif node.metadata.get("wikidata"):
            qid_by_node[node.id] = node.metadata["wikidata"]

    if source == "starwars":
        for node_id, qid in _match_starwars(graph, overrides).items():
            qid_by_node.setdefault(node_id, qid)

    if source == "lotr":
        for node_id, qid in _match_lotr(graph, overrides).items():
            qid_by_node.setdefault(node_id, qid)

    work_qid = wikidata.WORK_CAST.get(source)
    if work_qid:
        for node_id, qid in wikidata.match_work_cast(
            graph.nodes,
            work_qid=work_qid,
            cache_dir=RAW / source,
        ).items():
            qid_by_node.setdefault(node_id, qid)

    qids = sorted(set(qid_by_node.values()))
    if not qids:
        return {}, qid_by_node

    cache_dir = RAW / source
    if source in ("hongloumeng", "sanguoyanyi", "shiji", "shuihuzhuan", "xiyouji"):
        attrs = wikidata.attributes_for(
            qids,
            cache_name="wikidata-attributes-zh.json",
            cache_dir=cache_dir,
            languages=("zh-hant", "zh", "zh-hk", "zh-tw", "zh-hans", "zh-cn"),
        )
    else:
        attrs = wikidata.attributes_for(
            qids, cache_name="wikidata-attributes.json", cache_dir=cache_dir
        )

    # Pins that are missing from the cache after a fetch are a real error.
    for node_id, override in overrides.items():
        qid = override.get("wikidata")
        if qid and qid not in attrs:
            raise ValueError(
                f"{graph.id}: identity table pins '{node_id}' to Wikidata {qid}, which is not "
                f"in the cached attribute data. Check the QID, or delete the cache to refetch."
            )

    return attrs, qid_by_node


def _match_starwars(graph: CanonicalGraph, overrides: dict[str, dict]) -> dict[str, str]:
    """Map Gabasova node ids to Wikidata QIDs. Pins win; names search when unique."""
    matched: dict[str, str] = {}
    for node_id, override in overrides.items():
        qid = override.get("wikidata")
        if qid:
            matched[node_id] = qid

    # Expand short script names via Gabasova's own alias table where present.
    search_names: dict[str, str] = {}  # node_id → search string
    for node in graph.nodes:
        if node.id in matched:
            continue
        search_names[node.id] = _starwars_search_name(node.name, overrides.get(node.id, {}))

    # Ambiguous identical display names are skipped unless pinned.
    name_counts = Counter(search_names.values())
    unique_names = [name for node_id, name in search_names.items() if name_counts[name] == 1]
    resolved = wikidata.resolve_starwars_names(sorted(set(unique_names)))

    for node_id, name in search_names.items():
        if node_id in matched:
            continue
        if name_counts[name] != 1:
            continue
        qid = resolved.get(name)
        if qid:
            matched[node_id] = qid

    return matched


# Gabasova's script shorthand → a name Wikidata is likely to find.
SEARCH_EXPAND = {
    "luke": "Luke Skywalker",
    "leia": "Leia Organa",
    "han": "Han Solo",
    "anakin": "Anakin Skywalker",
    "obi-wan": "Obi-Wan Kenobi",
    "obi wan": "Obi-Wan Kenobi",
    "emperor": "Palpatine",
    "padme": "Padmé Amidala",
    "jar jar": "Jar Jar Binks",
    "qui-gon": "Qui-Gon Jinn",
    "qui gon": "Qui-Gon Jinn",
    "jabba": "Jabba the Hutt",
    "lando": "Lando Calrissian",
    "rey": "Rey",
    "finn": "Finn",
    "poe": "Poe Dameron",
    "maz": "Maz Kanata",
    "snoke": "Snoke",
    "yoda": "Yoda",
    "chewbacca": "Chewbacca",
    "wedge": "Wedge Antilles",
    "biggs": "Biggs Darklighter",
    "owen": "Owen Lars",
    "beru": "Beru Whitesun Lars",
    "shmi": "Shmi Skywalker",
    "tarkin": "Wilhuff Tarkin",
    "greedo": "Greedo",
    "watto": "Watto",
    "sebulba": "Sebulba",
    "valorum": "Finis Valorum",
    "piett": "Firmus Piett",
    "ozzel": "Kendal Ozzel",
    "needa": "Lorth Needa",
    "motti": "Conan Antonio Motti",
    "rieekan": "Carlist Rieekan",
    "dodonna": "Jan Dodonna",
    "ackbar": "Admiral Ackbar",
}


def _starwars_search_name(display: str, override: dict) -> str:
    if override.get("wikidataSearch"):
        return override["wikidataSearch"]
    key = display.strip().lower()
    if key in SEARCH_EXPAND:
        return SEARCH_EXPAND[key]
    return display.strip()


def _norm_sw_name(name: str) -> str:
    """Collapse Gabasova script names and Wikidata labels to a match key."""
    text = name.strip().lower()
    text = text.replace("é", "e").replace("á", "a").replace("ú", "u").replace("ó", "o")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return " ".join(text.split())


SUBSTANTIVE = ("culture", "titles", "allegiances", "born", "died", "povBooks")


def _pinned_api(overrides: dict[str, dict], api_by_url: dict[str, dict], graph: CanonicalGraph) -> dict[str, dict]:
    """Let the identity table name an exact An API of Ice and Fire record."""
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


# Species "human" is already dropped as generic. Homeworld for sitcoms is a
# real-world city and names the wrong kind of world; keep stripping that one.
STRIP_SPECIES_HOMEWORLD = {
    "friends",
}
STRIP_AFFILIATIONS: set[str] = set()


def _trim_literary(record: dict, source: str) -> None:
    if source in STRIP_SPECIES_HOMEWORLD:
        record.pop("species", None)
        record.pop("homeworld", None)
    if source in STRIP_AFFILIATIONS:
        record.pop("affiliations", None)
    if source == "iliad":
        if record.get("homeworld") in {"Troy", "Greece"}:
            record.pop("homeworld", None)
        mapped = []
        for affiliation in record.get("affiliations") or []:
            camp = {"Troy": "Trojans", "Greece": "Greeks"}.get(affiliation, affiliation)
            if camp not in mapped:
                mapped.append(camp)
        if mapped:
            record["affiliations"] = mapped


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

        left_houses = set(node_facts.get(edge.source, {}).get("houses", ()))
        right_houses = set(node_facts.get(edge.target, {}).get("houses", ()))
        shared_houses = sorted(left_houses & right_houses)
        if shared_houses:
            record["sharedHouses"] = shared_houses

        left_aff = set(node_facts.get(edge.source, {}).get("affiliations", ()))
        right_aff = set(node_facts.get(edge.target, {}).get("affiliations", ()))
        shared_aff = sorted(left_aff & right_aff)
        if shared_aff:
            record["sharedAffiliations"] = shared_aff

        facts[edge.key] = record
    return facts
