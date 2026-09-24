"""American Civil War — principal commanders by battle.

Structured tables from Arnold's NPS/CWSAC compilation. Two people are tied when
they served as principal commanders at the same battle. See raw/civilwar/SOURCE.md.
"""

from __future__ import annotations

import csv
import dataclasses
import urllib.request
from collections import defaultdict
from pathlib import Path

from ..canon.licenses import ODC_BY_1_0
from ..canon.types import Attribution, CanonicalGraph, Edge, Node, Provenance

RAW = Path(__file__).resolve().parent.parent / "raw" / "civilwar"

COMMANDERS_URL = (
    "https://raw.githubusercontent.com/jrnold/acw_battle_data/master/"
    "build/acw_battle_data/nps_commanders.csv"
)
BATTLES_URL = (
    "https://raw.githubusercontent.com/jrnold/acw_battle_data/master/"
    "build/acw_battle_data/cwsac_battles.csv"
)

# Highest rank wins when a commander is promoted across the war.
RANK_ORDER = {
    "General": 100,
    "Lieutenant General": 90,
    "Vice Admiral": 88,
    "Major General": 80,
    "Rear Admiral": 78,
    "Brigadier General": 70,
    "Commodore": 65,
    "Colonel": 60,
    "Captain": 50,
    "Lieutenant Colonel": 45,
    "Commander": 42,
    "Major": 40,
    "Lieutenant Commander": 35,
    "Lieutenant": 30,
    "First Lieutenant": 28,
    "Second Lieutenant": 25,
    "Sergeant": 10,
}

SIDE_LABEL = {
    "US": "Union",
    "Confederate": "Confederacy",
    "Native American": "Native American",
}

# NPS UUIDs that name the same person. Prefer the better-spelled / more complete
# record as the canonical id; the adapter remaps every row of the alias.
MERGE_IDS = {
    # "Tecumsheh" misspelling → William T. / Tecumseh Sherman
    "72fc916d-f36e-4ffa-ab9c-bec7bde07002": "033ec012-d845-474f-bf9c-28366e02d1a4",
    # Same Sterling Price under two UUIDs
    "1cd425bc-311a-42c3-9ba2-a16bc1db7eea": "8f232cc9-43e7-4627-ab45-d8fe6873c472",
}

ATTRIBUTION = Attribution(
    title="American Civil War Battle Data (NPS commanders)",
    creator="Jeffrey B. Arnold; National Park Service Civil War Soldiers and Sailors",
    creator_url="https://jrnold.me/",
    source_url="https://doi.org/10.6084/m9.figshare.1515995",
    project_url="https://github.com/jrnold/acw_battle_data",
    citation=(
        "J. B. Arnold, “American Civil War Battle Data,” Figshare, "
        "https://doi.org/10.6084/m9.figshare.1515995. Compiled from National Park "
        "Service Civil War Soldiers and Sailors and CWSAC battle summaries."
    ),
    citation_doi="10.6084/m9.figshare.1515995",
    retrieved="2026-09-23",
    modifications=(
        "Projected each battle's principal-commander set into pairwise ties, "
        "summing shared battles across 1861–1865.",
        "Kept the highest recorded rank per commander for enrichment.",
        "Mapped belligerent labels US/Confederate/Native American to "
        "Union/Confederacy/Native American.",
        "Built display names from given name, middle initial, and surname.",
        "Merged duplicate NPS UUIDs for William T. Sherman and Sterling Price.",
    ),
)


def load() -> CanonicalGraph:
    battles_path = RAW / "cwsac_battles.csv"
    commanders_path = RAW / "nps_commanders.csv"
    if not commanders_path.exists():
        _fetch(COMMANDERS_URL, commanders_path)
    if not battles_path.exists():
        _fetch(BATTLES_URL, battles_path)

    battle_year = _battle_years(battles_path)
    people, battle_cast = _read_commanders(commanders_path)

    weights: dict[tuple[str, str], float] = defaultdict(float)
    segments: dict[tuple[str, str], set[str]] = defaultdict(set)
    years_used: set[str] = set()

    for battle_id, members in battle_cast.items():
        year = battle_year.get(battle_id)
        if year is None or len(members) < 2:
            continue
        years_used.add(year)
        ordered = sorted(members)
        for i, source in enumerate(ordered):
            for target in ordered[i + 1 :]:
                key = (source, target)
                weights[key] += 1
                segments[key].add(year)

    present = {nid for pair in weights for nid in pair}
    year_order = {year: i for i, year in enumerate(sorted(years_used))}

    nodes = [
        Node(
            id=nid,
            name=people[nid]["name"],
            aliases=tuple(people[nid]["aliases"]),
            work="civilwar",
            metadata={
                "side": people[nid]["side"],
                "rank": people[nid]["rank"],
                "navy": people[nid]["navy"],
            },
        )
        for nid in sorted(present)
    ]
    edges = [
        Edge(
            source=source,
            target=target,
            weight=weights[(source, target)],
            type="battle",
            segments=tuple(sorted(segments[(source, target)], key=year_order.__getitem__)),
        )
        for source, target in sorted(weights)
    ]

    provenance = Provenance(
        dataset="arnold-acw-nps-commanders-v1",
        edge_definition=(
            "principal commanders listed for the same battle, on either side"
        ),
        source_unit="year",
        weight_semantics="count of shared battles, across 1861–1865",
        attribution=dataclasses.replace(ATTRIBUTION),
        license=ODC_BY_1_0,
    )

    return CanonicalGraph(
        id="civilwar",
        title="American Civil War",
        accent="#2F4A6E",
        nodes=nodes,
        edges=edges,
        provenance=provenance,
        segment_labels={year: year for year in sorted(years_used)},
    ).sorted()


def _fetch(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(url, headers={"User-Agent": "YouAreHere-pipeline/0.1"})
    with urllib.request.urlopen(request, timeout=60) as response:
        dest.write_bytes(response.read())


def _battle_years(path: Path) -> dict[str, str]:
    years: dict[str, str] = {}
    with path.open(encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            start = (row.get("start_date") or "").strip()
            if len(start) >= 4 and start[:4].isdigit():
                years[row["battle"]] = start[:4]
    return years


def _read_commanders(
    path: Path,
) -> tuple[dict[str, dict], dict[str, set[str]]]:
    """Return (people by id, battle id → set of commander ids)."""
    people: dict[str, dict] = {}
    battle_cast: dict[str, set[str]] = defaultdict(set)

    with path.open(encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            raw_id = (row.get("commander") or "").strip()
            battle = (row.get("cwsac_id") or "").strip()
            if not raw_id or not battle:
                continue
            nid = MERGE_IDS.get(raw_id, raw_id)
            canonical_row = raw_id == nid

            battle_cast[battle].add(nid)
            name, aliases = _display_name(row)
            side = SIDE_LABEL.get((row.get("belligerent") or "").strip(), "")
            rank = (row.get("rank") or "").strip()
            navy = (row.get("navy") or "").strip() in ("1", "true", "TRUE")

            existing = people.get(nid)
            if existing is None:
                people[nid] = {
                    "name": name,
                    "aliases": list(aliases),
                    "side": side,
                    "rank": rank,
                    "navy": navy,
                    "from_canonical": canonical_row,
                }
                continue

            # Prefer the display name from the canonical UUID's own rows — merged
            # duplicates are often the misspelled ones.
            if canonical_row and not existing.get("from_canonical"):
                if existing["name"] != name and existing["name"] not in existing["aliases"]:
                    existing["aliases"].insert(0, existing["name"])
                existing["name"] = name
                existing["from_canonical"] = True
                if side:
                    existing["side"] = side

            if _rank_score(rank) > _rank_score(existing["rank"]):
                existing["rank"] = rank
            if navy:
                existing["navy"] = True
            for alias in aliases:
                if alias not in existing["aliases"] and alias != existing["name"]:
                    existing["aliases"].append(alias)
            # Drop the misspelled Tecumsheh form if the good name is in place.
            existing["aliases"] = [
                a for a in existing["aliases"] if a != existing["name"] and "Tecumsheh" not in a
            ]

    return people, battle_cast


def _rank_score(rank: str) -> int:
    return RANK_ORDER.get(rank, 0)


def _display_name(row: dict) -> tuple[str, tuple[str, ...]]:
    """Build a name a player can type: given + middle initial + surname."""
    first = (row.get("first_name") or "").strip()
    last = (row.get("last_name") or "").strip()
    suffix = (row.get("suffix") or "").strip()
    middle_name = (row.get("middle_name") or "").strip()
    initial = (row.get("middle_initial") or "").strip()

    if initial and not initial.endswith("."):
        initial = initial + "."

    parts = [p for p in (first, initial or None, last) if p]
    primary = " ".join(parts)
    if suffix:
        primary = f"{primary} {suffix}"

    aliases: list[str] = []
    if first and last:
        short = f"{first} {last}"
        if suffix:
            short = f"{short} {suffix}"
        if short != primary:
            aliases.append(short)

    if middle_name and first and last and not (len(middle_name) == 1 or middle_name.endswith(".")):
        full = f"{first} {middle_name} {last}"
        if suffix:
            full = f"{full} {suffix}"
        if full != primary:
            aliases.append(full)

    return primary, tuple(dict.fromkeys(aliases))
