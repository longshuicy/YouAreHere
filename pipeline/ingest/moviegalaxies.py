"""Moviegalaxies film dialogue networks (Harvard Dataverse, CC0).

Two characters are tied when they share dialogue in the same film script.
Franchises are merged across films by normalised character label, with film
segments retained. Generic extras (MAN, DRIVER, AGENT #1, …) are dropped.

See raw/moviegalaxies/SOURCE.md. Some catalogue titles point at the wrong
script — those film IDs are excluded below rather than shipped.
"""

from __future__ import annotations

import dataclasses
import re
import zipfile
import xml.etree.ElementTree as ET
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

from ..canon.licenses import CC0_1_0
from ..canon.types import Attribution, CanonicalGraph, Edge, Node, Provenance
from .fetch import get

RAW = Path(__file__).resolve().parent.parent / "raw" / "moviegalaxies"
GEXF_ZIP_URL = "https://dataverse.harvard.edu/api/access/datafile/3193574"
GEXF_ZIP_NAME = "gexf.zip"

# Script labels that are props, not people a player can name.
GENERIC = frozenset(
    {
        "man",
        "men",
        "woman",
        "girl",
        "boy",
        "driver",
        "guard",
        "cop",
        "nurse",
        "priest",
        "waiter",
        "porter",
        "pilot",
        "co-pilot",
        "crew member",
        "operator",
        "photographer",
        "reporter",
        "doctor",
        "lawyer",
        "vendor",
        "widow",
        "wife",
        "mom",
        "another",
        "another man",
        "fbi man",
        "man 2",
        "old man",
        "old woman",
        "elderly woman",
        "young man",
        "little boy",
        "male student",
        "nazi soldier",
        "radio operator",
        "butler",
        "impresario",
        "courier",
        "maestro",
        "purser",
        "pit boss",
        "senator",
        "now",
        "first draft",
        "villager",
        "merchant",
        "chieftain",
        "shaman",
        "knight",
        "sheriff",
        "halfbreed",
        "fedora",
        "panama hat",
        "clear",
        "ok",
        "easy",
    }
)

ATTRIBUTION = Attribution(
    title="Moviegalaxies — film character interaction networks",
    creator="Moviegalaxies / Skarnitzlová, Holý, et al.",
    creator_url="https://moviegalaxies.com/",
    source_url="https://doi.org/10.7910/DVN/T4HBA3",
    project_url="https://dataverse.harvard.edu/dataset.xhtml?persistentId=doi:10.7910/DVN/T4HBA3",
    citation=(
        "Moviegalaxies, “Moviegalaxies film character networks”, "
        "Harvard Dataverse, doi:10.7910/DVN/T4HBA3."
    ),
    citation_doi="10.7910/DVN/T4HBA3",
    retrieved="2026-09-24",
    modifications=(),
)


@dataclass(frozen=True)
class Film:
    gexf_id: str
    segment: str
    title: str


@dataclass(frozen=True)
class Franchise:
    id: str
    title: str
    accent: str
    films: tuple[Film, ...]
    # Uppercase script label → canonical merge key (also uppercase).
    merge_as: dict[str, str]
    # Canonical merge key → display name preferred over title-case.
    display: dict[str, str]
    note: str


GODFATHER = Franchise(
    id="godfather",
    title="The Godfather",
    accent="#5C4033",
    films=(
        Film("355", "part1", "The Godfather"),
        Film("356", "part2", "The Godfather: Part II"),
    ),
    merge_as={
        "THE GODFATHER": "DON CORLEONE",
        "SAM ROTH": "HYMAN",
        "ROTH": "HYMAN",
        "SIG ABBANDANDO": "GENCO",
        "CARMELLA": "MAMA",
        "SENATOR GEARY": "GEARY",
    },
    display={
        "DON CORLEONE": "Don Corleone",
        "MICHAEL": "Michael Corleone",
        "SONNY": "Sonny Corleone",
        "FREDO": "Fredo Corleone",
        "CONNIE": "Connie Corleone",
        "HAGEN": "Tom Hagen",
        "KAY": "Kay Adams",
        "CLEMENZA": "Peter Clemenza",
        "TESSIO": "Sal Tessio",
        "PENTANGELI": "Frank Pentangeli",
        "HYMAN": "Hyman Roth",
        "VITO": "Vito Corleone",
        "MAMA": "Carmela Corleone",
        "GEARY": "Senator Geary",
        "APPOLONIA": "Apollonia Vitelli",
        "SOLLOZZO": "Virgil Sollozzo",
        "MCCLUSKEY": "Captain McCluskey",
        "WOLTZ": "Jack Woltz",
        "LUCA": "Luca Brasi",
        "NERI": "Al Neri",
        "LAMPONE": "Rocco Lampone",
        "CICCI": "Willie Cicci",
        "FANUCCI": "Don Fanucci",
        "OLA": "Johnny Ola",
    },
    note="Merged Parts I–II; THE GODFATHER collapsed into Don Corleone.",
)

INDIANA = Franchise(
    id="indiana-jones",
    title="Indiana Jones",
    accent="#C45C26",
    films=(
        # Raiders (430) and Crystal Skull (472) are misattributed in the
        # upstream GEXF set — casts do not match the films. Ship the two
        # scripts that are actually Indy.
        Film("429", "temple", "Indiana Jones and the Temple of Doom"),
        Film("427", "crusade", "Indiana Jones and the Last Crusade"),
    ),
    merge_as={
        "INDY": "INDIANA",
        "BRODY": "MARCUS",
    },
    display={
        "INDIANA": "Indiana Jones",
        "HENRY": "Henry Jones Sr.",
        "MARCUS": "Marcus Brody",
        "SALLAH": "Sallah",
        "SHORT ROUND": "Short Round",
        "WILLIE": "Willie Scott",
        "MOLA RAM": "Mola Ram",
        "DONOVAN": "Walter Donovan",
        "ELSA": "Elsa Schneider",
        "VOGEL": "Colonel Vogel",
        "CAPT BLUMBURTT": "Captain Blumburtt",
        "CHATTAR LAL": "Chattar Lal",
        "MRS DONOVAN": "Mrs. Donovan",
    },
    note=(
        "Temple of Doom + Last Crusade only. Moviegalaxies GEXFs labeled "
        "Raiders of the Lost Ark and Kingdom of the Crystal Skull contain "
        "unrelated casts and are excluded."
    ),
)


def load_godfather() -> CanonicalGraph:
    return _load(GODFATHER)


def load_indiana() -> CanonicalGraph:
    return _load(INDIANA)


def _load(franchise: Franchise) -> CanonicalGraph:
    _ensure_films(franchise)

    weights: dict[tuple[str, str], float] = defaultdict(float)
    segments: dict[tuple[str, str], set[str]] = defaultdict(set)
    names: dict[str, str] = {}

    for film in franchise.films:
        for raw_label, peers in _film_adjacency(film.gexf_id).items():
            key = _canonical_key(raw_label, franchise)
            if key is None:
                continue
            names.setdefault(key, _display_name(key, raw_label, franchise))
            for other_label, weight in peers.items():
                other = _canonical_key(other_label, franchise)
                if other is None or other == key:
                    continue
                names.setdefault(other, _display_name(other, other_label, franchise))
                pair = (key, other) if key <= other else (other, key)
                weights[pair] += weight
                segments[pair].add(film.segment)

    order = {film.segment: i for i, film in enumerate(franchise.films)}
    nodes = [
        Node(id=_node_id(key), name=names[key], work=franchise.id)
        for key in sorted(names)
        if any(key in pair for pair in weights)
    ]
    id_map = {key: _node_id(key) for key in names}
    edges = [
        Edge(
            source=id_map[a],
            target=id_map[b],
            weight=weights[(a, b)],
            type="cooccurrence",
            segments=tuple(sorted(segments[(a, b)], key=order.__getitem__)),
        )
        for a, b in sorted(weights)
    ]

    mods = list(ATTRIBUTION.modifications) + [
        f"Selected the {franchise.title} films listed in provenance segments.",
        franchise.note,
        "Dropped generic extras (MAN, DRIVER, AGENT #1, …).",
        "Title-cased script names; applied franchise display-name map.",
    ]
    provenance = Provenance(
        dataset=f"moviegalaxies-{franchise.id}",
        edge_definition="characters who share dialogue in the same film script",
        source_unit="film",
        weight_semantics="script interaction weight, summed across films in the franchise",
        attribution=dataclasses.replace(ATTRIBUTION, modifications=tuple(mods)),
        license=CC0_1_0,
    )

    return CanonicalGraph(
        id=franchise.id,
        title=franchise.title,
        accent=franchise.accent,
        nodes=nodes,
        edges=edges,
        provenance=provenance,
        segment_labels={film.segment: film.title for film in franchise.films},
    ).sorted()


def _ensure_films(franchise: Franchise) -> None:
    missing = [f for f in franchise.films if not (RAW / "gexf" / f"{f.gexf_id}.gexf").exists()]
    if not missing:
        return
    RAW.mkdir(parents=True, exist_ok=True)
    zip_path = RAW / GEXF_ZIP_NAME
    if not zip_path.exists():
        print(f"  fetching {GEXF_ZIP_URL} ...", flush=True)
        get(GEXF_ZIP_URL, dest=zip_path)
    needed = {f.gexf_id for f in franchise.films}
    with zipfile.ZipFile(zip_path) as archive:
        for name in archive.namelist():
            match = re.fullmatch(r"gexf/(\d+)\.gexf", name)
            if not match or match.group(1) not in needed:
                continue
            dest = RAW / "gexf" / f"{match.group(1)}.gexf"
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(archive.read(name))
    still = [f.gexf_id for f in franchise.films if not (RAW / "gexf" / f"{f.gexf_id}.gexf").exists()]
    if still:
        raise FileNotFoundError(f"Moviegalaxies zip missing GEXF ids: {still}")


def _film_adjacency(gexf_id: str) -> dict[str, dict[str, float]]:
    """label → {other_label → weight} for one film."""
    path = RAW / "gexf" / f"{gexf_id}.gexf"
    root = ET.fromstring(path.read_bytes())
    id_to_label: dict[str, str] = {}
    for node in root.iter():
        if node.tag.split("}")[-1] != "node":
            continue
        label = (node.get("label") or "").strip()
        nid = node.get("id")
        if label and nid:
            id_to_label[nid] = label

    adj: dict[str, dict[str, float]] = defaultdict(dict)
    for edge in root.iter():
        if edge.tag.split("}")[-1] != "edge":
            continue
        a = id_to_label.get(edge.get("source") or "")
        b = id_to_label.get(edge.get("target") or "")
        if not a or not b or a == b:
            continue
        weight = float(edge.get("weight") or 1.0)
        adj[a][b] = adj[a].get(b, 0.0) + weight
        adj[b][a] = adj[b].get(a, 0.0) + weight
    return adj


def _canonical_key(raw_label: str, franchise: Franchise) -> str | None:
    upper = raw_label.strip().upper()
    if not upper:
        return None
    upper = franchise.merge_as.get(upper, upper)
    lower = upper.lower()
    if lower in GENERIC:
        return None
    if re.search(r"#\s*\d+\s*$", lower):
        return None
    if re.fullmatch(r"(agent|fbi man|pilot|man|guard)\b.*", lower):
        return None
    return upper


def _display_name(key: str, raw_label: str, franchise: Franchise) -> str:
    if key in franchise.display:
        return franchise.display[key]
    # Prefer the first non-aliased raw form's title case.
    return _title_case(raw_label)


def _title_case(name: str) -> str:
    name = name.strip()
    small = {"a", "an", "the", "of", "and", "de", "von", "van"}
    parts = []
    for i, word in enumerate(name.replace("_", " ").split()):
        lower = word.lower()
        if i > 0 and lower in small:
            parts.append(lower)
        elif "'" in word:
            parts.append("'".join(p.title() for p in word.split("'")))
        else:
            parts.append(word.title())
    return " ".join(parts)


def _node_id(key: str) -> str:
    return re.sub(r"_+", "_", re.sub(r"[^a-z0-9]+", "_", key.lower())).strip("_")
