"""Folger dramatis personae — station and office from DraCor TEI.

The ShakeDraCor TEI (Folger, CC BY-NC 3.0) carries <roleDesc> on the cast list.
Those descriptions are researched here and encoded as short attributes — never
copied as sentences. Kinship is kept: Facts is allowed to name other people.
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
        "Encoded station, office, and kinship as short attributes; sentences "
        "are composed here rather than copied from the TEI.",
    ),
)

LICENSE = CC_BY_NC_3_0

# Leading station / office phrases. Place names after "of" must stay
# capitalised: IGNORECASE would let "Prince of Wales and heir" swallow the rest.
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
    r"ambassador|legate|councillor|counselor|thane|sir|knight"
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
    """Turn a Folger roleDesc into a short standing line, or None.

    Kinship stays. The TEI often has nothing else for the leads — Claudius is
    only 'brother to the late King Hamlet' — and Facts is allowed to say so.
    """
    text = " ".join(role_desc.split()).strip(" .;")
    # Folger concatenates some names: "King Hamletand Queen Gertrude".
    text = re.sub(r"([a-z])and ([A-Z])", r"\1 and \2", text)
    if not text:
        return None
    return text[:1].upper() + text[1:]


def station_from_name(name: str) -> str | None:
    """Office already written on the display name: King Claudius, Earl of Kent."""
    text = " ".join((name or "").split()).strip()
    if not text:
        return None
    match = STATION.match(text)
    if not match:
        return None
    station = match.group(0).strip()
    return station[:1].upper() + station[1:] if station else None


def blend_role(name: str, role: str | None) -> str | None:
    """Prefix a name-derived station when the Folger line does not already open with one."""
    station = station_from_name(name)
    if not role:
        return station
    if station and not STATION.match(role):
        return f"{station}, {role}"
    return role


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
