"""Folger dramatis personae — station and office from DraCor TEI.

The ShakeDraCor TEI (Folger, CC BY-NC 3.0) carries <roleDesc> on the cast list.
Those descriptions are researched here and encoded as short station attributes —
never copied as sentences. Kinship and friendship clauses are dropped; they name
other people and assert affection, which enrichment refuses.
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from pathlib import Path

from ..canon.licenses import CC_BY_NC_3_0
from ..canon.types import Attribution
from ..ingest.fetch import get

RAW = Path(__file__).resolve().parent.parent / "raw" / "shakespeare" / "tei"
GITHUB = "https://raw.githubusercontent.com/dracor-org/shakedracor/master/tei"

ATTRIBUTION = Attribution(
    title="Folger Shakespeare Library dramatis personae (via DraCor TEI)",
    creator="Folger Shakespeare Library / DraCor",
    creator_url="https://www.folger.edu/",
    source_url="https://github.com/dracor-org/shakedracor",
    retrieved="2026-09-18",
    modifications=(
        "Read <roleDesc> from the TEI cast list as research material only.",
        "Encoded discrete station and office attributes; kinship and friendship "
        "clauses were discarded rather than adapted.",
        "Composed original one-line descriptions from those attributes.",
    ),
)

LICENSE = CC_BY_NC_3_0

# Clauses that name another person or assert a bond — not a standing fact.
KINSHIP_OR_BOND = re.compile(
    r"\b("
    r"son|daughter|father|mother|brother|sister|widow|wife|husband|"
    r"uncle|aunt|nephew|niece|cousin|kinsman|kinswoman|"
    r"friend|confidant|companion|lover|mistress|suitor|betrothed|"
    r"married|wedded"
    r")\b",
    re.IGNORECASE,
)

# Leading station / office phrases worth keeping.
# Place names after "of" must stay capitalised: IGNORECASE would let
# "Prince of Wales and heir" swallow the rest of the sentence.
STATION = re.compile(
    r"(?i)^(?:"
    r"(?:prince|princess|king|queen|duke|duchess|earl|count|countess|"
    r"baron|baroness|lord|lady|marquis|marquess|viscount|emperor|empress|"
    r"cardinal|bishop|abbot|abbess|friar|priest|nun|pope|"
    r"general|admiral|captain|lieutenant|sergeant|ensign|"
    r"senator|tribune|consul|praetor|censor|"
    r"doctor|apothecary|nurse|midwife|lawyer|justice|judge|"
    r"fool|clown|soothsayer|prophet|witch|porter|jailer|gaoler|"
    r"herald|messenger|servant|steward|chamberlain|constable|"
    r"watchman|citizen|gentleman|gentlewoman|page|squire|"
    r"ambassador|legate|councillor|counselor"
    r")"
    r"(?:\s+of\s+(?-i:[A-Z][A-Za-z'\-]+(?:\s+[A-Z][A-Za-z'\-]+){0,3}))?"
    r")"
)


def roles_for_corpus(play_slugs: list[str]) -> dict[str, str]:
    """Map DraCor character id → encoded station, across the given plays."""
    roles: dict[str, str] = {}
    for slug in play_slugs:
        for character_id, station in _roles_for_play(slug).items():
            roles.setdefault(character_id, station)
    return roles


def _roles_for_play(slug: str) -> dict[str, str]:
    path = RAW / f"{slug}.xml"
    if not path.exists():
        # DraCor drops a leading "the-" on some TEI filenames.
        candidates = [slug]
        if slug.startswith("the-"):
            candidates.append(slug[len("the-") :])
        else:
            candidates.append(f"the-{slug}")
        fetched = False
        for name in candidates:
            try:
                get(f"{GITHUB}/{name}.xml", dest=path)
                fetched = True
                break
            except Exception:
                continue
        if not fetched:
            print(f"  warning: no Folger TEI for {slug}, skipping role enrichment")
            return {}

    # Folger TEI is large; only the cast list matters here.
    text = path.read_text(encoding="utf-8")
    # Some files declare a default TEI namespace; ElementTree needs it.
    try:
        root = ET.fromstring(text)
    except ET.ParseError:
        return {}

    roles: dict[str, str] = {}
    # Handle both namespaced and bare tags.
    for item in list(root.iter("{http://www.tei-c.org/ns/1.0}castItem")) + list(root.iter("castItem")):
        character_id = _character_id(item)
        if not character_id:
            continue
        desc = _role_desc_text(item)
        if not desc:
            continue
        station = encode_station(desc)
        if station:
            roles[character_id] = station
    return roles


def encode_station(role_desc: str) -> str | None:
    """Turn a Folger roleDesc into one short station attribute, or None."""
    text = " ".join(role_desc.split()).strip(" .;")
    if not text:
        return None

    for clause in re.split(r"[,;]", text):
        clause = clause.strip()
        if not clause or KINSHIP_OR_BOND.search(clause):
            continue
        match = STATION.match(clause)
        if not match:
            continue
        station = match.group(0).strip()
        return station[:1].upper() + station[1:] if station else None
    return None


def _character_id(item: ET.Element) -> str | None:
    same = item.get("sameAs") or ""
    if same.startswith("#"):
        return same[1:]
    xml_id = item.get("{http://www.w3.org/XML/1998/namespace}id") or item.get("id")
    return xml_id


def _role_desc_text(item: ET.Element) -> str:
    parts = []
    for child in item:
        tag = child.tag.split("}")[-1] if "}" in child.tag else child.tag
        if tag == "roleDesc":
            parts.append("".join(child.itertext()))
    return " ".join(parts).strip()
