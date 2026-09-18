"""Wikidata — discrete attributes for enrichment.

Wikidata is CC0. Only structured claims are taken — occupation, position held,
species, affiliation, homeworld, gender. No descriptions, no Wikipedia prose.
Responses are cached under raw/ so the build stays offline and deterministic.

Uses the MediaWiki wbgetentities API rather than SPARQL: it is the same CC0
data, and it tolerates batching without the query service's rate-limit cliffs.
"""

from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from ..canon.licenses import CC0_1_0
from ..canon.types import Attribution

RAW = Path(__file__).resolve().parent.parent / "raw"
API = "https://www.wikidata.org/w/api.php"
USER_AGENT = "YouAreHere-pipeline/0.1 (reveal-screen enrichment; local build)"

ATTRIBUTION = Attribution(
    title="Wikidata",
    creator="Wikidata contributors",
    creator_url="https://www.wikidata.org/",
    source_url="https://www.wikidata.org/",
    retrieved="2026-09-18",
    modifications=(
        "Extracted discrete character attributes only (occupation, position, "
        "species, affiliation, homeworld, gender); no descriptions or prose.",
        "Filtered class and meta labels that are not standing facts a player can use.",
        "Composed original one-line descriptions from those attributes.",
    ),
)

LICENSE = CC0_1_0

# Labels that are classes or meta-typing, not a character's station.
JUNK_LABELS = {
    "human",
    "human biblical figure",
    "biblical figure",
    "fictional character",
    "fictional human",
    "literary character",
    "theatrical character",
    "comics character",
    "video game character",
    "animated character",
    "film character",
    "television character",
    "star wars character",
    "wikimedia list of fictional characters",
    "character",
    "organism",
    "taxon",
    "person",
}

GENERIC_SPECIES = {"human", "fictional human"}

# Occupations that are too vague or wrongly assigned to be a standing clause.
WEAK_OCCUPATIONS = {
    "writer",
    "artisan",
    "instrumentalist",
    "warlord",
    "ruler",
    "politician",
    "magician",
    "chaser",
    "seamster",
    "translator",
    "orator",
    "poet",
    "historian",
    "mechanic",
    "mass murderer",
    "war criminal",
    "drug trafficker",
    "deserter",
    "impersonator",
    "gambler",
    "author",
    "alchemist",
    "swordfighter",
    "military personnel",
    "military officer",
    "first officer",
    "commander-in-chief",
    "space pirate",
    "bounty hunter",  # kept only if nothing better; R2 is not one
    "starship pilot",
    "pilot",
}

# Prefer these occupations when several are listed (Star Wars and similar).
OCCUPATION_PRIORITY = (
    "jedi master",
    "jedi knight",
    "protocol droid",
    "astromech droid",
    "sith",
    "jedi",
    "smuggler",
    "crime boss",
    "senator",
    "rebel",
    "warrior",
    "dictator",
    "monarch",
    "chancellor",
    "queen",
    "princess",
    "navigator",
)

WEAK_AFFILIATIONS = {
    "crimson dawn",
    "skywalker family",
    "bright tree tribe",
    "endor strike team",
    "jabba's criminal empire",
    "bounty hunters' guild",
    "aurra sing's crew",
    "krayt's claw",
    "fett gotra",
    "rogue squadron",
    "red squadron",
    "7th sky corps",
    "501st legion",
    "trade federation",
    "galactic senate",
    "galactic federation of free alliances",
    "shadow collective",
}

AFFILIATION_PRIORITY = (
    "rebel alliance",
    "resistance",
    "sith",
    "jedi order",
    "jedi",
    "first order",
    "royal house of naboo",
    "house of organa",
    "galactic republic",
    "galactic empire",
    "new republic",
    "confederacy of independent systems",
    "new jedi order",
)

GENDER = {
    "Q6581097": "Male",  # male
    "Q6581072": "Female",  # female
    "Q44148": "Male",  # male organism
    "Q43445": "Female",  # female organism
}

PROPS = {
    "P21": "gender",
    "P106": "occupations",
    "P39": "titles",
    "P172": "species",
    "P463": "affiliations",
    "P27": "affiliations",
    "P1165": "homeworld",
    "P19": "homeworld",
    "P31": "instances",
}


def attributes_for(qids: list[str], *, cache_name: str, cache_dir: Path) -> dict[str, dict]:
    """Return {qid: {gender, occupations, titles, species, affiliations, homeworld}}."""
    wanted = sorted({qid for qid in qids if re.fullmatch(r"Q\d+", qid)})
    if not wanted:
        return {}

    path = cache_dir / cache_name
    cached: dict[str, dict] = {}
    if path.exists():
        cached = json.loads(path.read_text(encoding="utf-8"))
        missing = [qid for qid in wanted if qid not in cached]
        if not missing:
            return {qid: cached[qid] for qid in wanted}
        # Incremental fill when the cast grows.
        to_fetch = missing
    else:
        to_fetch = wanted

    print(f"  fetching Wikidata attributes for {len(to_fetch)} characters ...")
    fetched = _fetch_attributes(to_fetch)
    cached.update(fetched)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(cached, ensure_ascii=False, indent=1, sort_keys=True), encoding="utf-8")
    print(f"  cached {len(cached)} Wikidata records → {path.name}")
    return {qid: cached[qid] for qid in wanted if qid in cached}


def resolve_starwars_names(names: list[str]) -> dict[str, str]:
    """Map display names → Wikidata QIDs via search, cached under raw/starwars.

    Only accepts hits whose description mentions Star Wars, so a trilobite named
    Han does not win.
    """
    path = RAW / "starwars" / "wikidata-name-map.json"
    cached: dict[str, str | None] = {}
    if path.exists():
        cached = json.loads(path.read_text(encoding="utf-8"))

    resolved: dict[str, str] = {}
    pending = []
    for name in names:
        key = name.strip()
        if not key:
            continue
        if key in cached:
            if cached[key]:
                resolved[key] = cached[key]
            continue
        pending.append(key)

    if pending:
        print(f"  resolving {len(pending)} Star Wars names on Wikidata ...", flush=True)
        for i, name in enumerate(pending, 1):
            qid = _search_starwars(name)
            cached[name] = qid
            if qid:
                resolved[name] = qid
            if i % 10 == 0:
                print(f"    {i}/{len(pending)}", flush=True)
            time.sleep(1.5)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(cached, ensure_ascii=False, indent=1, sort_keys=True), encoding="utf-8")

    return resolved


def _search_starwars(name: str) -> str | None:
    for search in (name, f"{name} Star Wars"):
        payload = _api(
            {
                "action": "wbsearchentities",
                "search": search,
                "language": "en",
                "type": "item",
                "limit": 5,
                "format": "json",
            },
            soft=True,
        )
        for hit in payload.get("search") or []:
            description = (hit.get("description") or "").lower()
            if "star wars" in description:
                return hit["id"]
    return None


def apply_to_record(record: dict, attrs: dict) -> None:
    """Fold Wikidata attributes into a facts record, without overwriting better data."""
    if attrs.get("gender") and "gender" not in record:
        record["gender"] = attrs["gender"]

    if not record.get("titles") and not record.get("occupation") and not record.get("role"):
        if attrs.get("titles"):
            record["titles"] = [_prefer_title(attrs["titles"])]
        else:
            occupation = _prefer_occupation(attrs.get("occupations") or [])
            if occupation:
                record["occupation"] = occupation

    if attrs.get("species") and "species" not in record and "culture" not in record:
        record["species"] = attrs["species"]

    if attrs.get("affiliations") and "houses" not in record and "affiliations" not in record:
        affiliations = _prefer_affiliations(attrs["affiliations"])
        if affiliations:
            record["affiliations"] = affiliations

    if attrs.get("homeworld") and "homeworld" not in record:
        record["homeworld"] = attrs["homeworld"]


def _prefer_occupation(occupations: list[str]) -> str | None:
    usable = [o for o in occupations if o.lower() not in WEAK_OCCUPATIONS and not o.lower().startswith("fictional ")]
    if not usable:
        return None
    lowered = {o.lower(): o for o in usable}
    for preferred in OCCUPATION_PRIORITY:
        if preferred in lowered:
            return lowered[preferred]
        for key, original in lowered.items():
            if preferred in key:
                return original
    return usable[0]


def _prefer_title(titles: list[str]) -> str:
    usable = [t for t in titles if not t.lower().startswith("fictional ")]
    if not usable:
        return titles[0]
    # Prefer the most specific imperial/royal style when several offices are listed.
    for needle in ("emperor", "empress", "king", "queen", "chancellor", "supreme", "prince", "princess"):
        for title in usable:
            if needle in title.lower():
                return title
    return usable[0]


def _prefer_affiliations(affiliations: list[str]) -> list[str]:
    usable = [a for a in affiliations if a.lower() not in WEAK_AFFILIATIONS]
    if not usable:
        return []
    ranked = []
    lowered = {a.lower(): a for a in usable}
    for preferred in AFFILIATION_PRIORITY:
        if preferred in lowered and lowered[preferred] not in ranked:
            ranked.append(lowered[preferred])
        for key, original in lowered.items():
            if preferred in key and original not in ranked:
                ranked.append(original)
    for affiliation in usable:
        if affiliation not in ranked:
            ranked.append(affiliation)
    return ranked[:3]


def _fetch_attributes(qids: list[str]) -> dict[str, dict]:
    entities = _get_entities(qids)
    # Collect referenced entity ids so we can resolve labels in one pass.
    refs: set[str] = set()
    for entity in entities.values():
        for prop in PROPS:
            for value_id in _claim_ids(entity, prop):
                refs.add(value_id)
    labels = _entity_labels(sorted(refs))

    out: dict[str, dict] = {}
    for qid in qids:
        entity = entities.get(qid)
        if not entity:
            out[qid] = _empty()
            continue
        out[qid] = _attributes_from_entity(entity, labels)
    return out


def _attributes_from_entity(entity: dict, labels: dict[str, str]) -> dict:
    rec = _empty()

    for value_id in _claim_ids(entity, "P21"):
        if value_id in GENDER:
            rec["gender"] = GENDER[value_id]
            break

    for prop, field in (
        ("P106", "occupations"),
        ("P39", "titles"),
        ("P463", "affiliations"),
        ("P27", "affiliations"),
    ):
        for value_id in _claim_ids(entity, prop):
            label = _clean(labels.get(value_id))
            if not label or label in rec[field]:
                continue
            if field == "affiliations" and label.lower() in {"ancient rome", "jewish people"}:
                continue
            if field == "occupations" and label.lower() in WEAK_OCCUPATIONS:
                continue
            if field == "titles" and (
                label.lower() in {"biblical judge"} or label.lower().startswith("fictional ")
            ):
                continue
            if field == "occupations" and label.lower().startswith("fictional "):
                continue
            rec[field].append(label)

    for prop in ("P172",):
        for value_id in _claim_ids(entity, prop):
            label = _clean(labels.get(value_id))
            if label and label.lower() not in GENERIC_SPECIES:
                rec["species"] = label
                break

    if not rec["species"]:
        for value_id in _claim_ids(entity, "P31"):
            label = _clean(labels.get(value_id))
            if not label:
                continue
            lower = label.lower()
            if lower in GENERIC_SPECIES or lower in JUNK_LABELS:
                continue
            if lower in {"droid", "wookiee", "hutt", "ewok", "gungan", "rodian", "trandoshan"} or "droid" in lower or "astromech" in lower:
                rec["species"] = label
                break

    for prop in ("P1165", "P19"):
        for value_id in _claim_ids(entity, prop):
            label = _clean(labels.get(value_id))
            if label:
                rec["homeworld"] = label
                break
        if rec["homeworld"]:
            break

    # Preserve Wikidata's preferred-then-normal order; do not alphabetise.
    return rec


def _claim_ids(entity: dict, prop: str) -> list[str]:
    """Entity ids from claims, preferred rank first, then normal; skip deprecated."""
    claims = entity.get("claims", {}).get(prop, [])
    preferred, normal = [], []
    for claim in claims:
        rank = claim.get("rank", "normal")
        if rank == "deprecated":
            continue
        mainsnak = claim.get("mainsnak") or {}
        if mainsnak.get("snaktype") != "value":
            continue
        datavalue = mainsnak.get("datavalue") or {}
        if datavalue.get("type") != "wikibase-entityid":
            continue
        qid = (datavalue.get("value") or {}).get("id")
        if not qid:
            continue
        if rank == "preferred":
            preferred.append(qid)
        else:
            normal.append(qid)
    return preferred + normal


def _get_entities(qids: list[str]) -> dict[str, dict]:
    entities: dict[str, dict] = {}
    for start in range(0, len(qids), 50):
        batch = qids[start : start + 50]
        payload = _api(
            {
                "action": "wbgetentities",
                "ids": "|".join(batch),
                "props": "claims",
                "format": "json",
            }
        )
        entities.update(payload.get("entities") or {})
        if start + 50 < len(qids):
            time.sleep(0.5)
    return entities


def _entity_labels(qids: list[str]) -> dict[str, str]:
    labels: dict[str, str] = {}
    for start in range(0, len(qids), 50):
        batch = qids[start : start + 50]
        if not batch:
            continue
        payload = _api(
            {
                "action": "wbgetentities",
                "ids": "|".join(batch),
                "props": "labels",
                "languages": "en",
                "format": "json",
            }
        )
        for qid, entity in (payload.get("entities") or {}).items():
            label = ((entity.get("labels") or {}).get("en") or {}).get("value")
            if label:
                labels[qid] = label
        if start + 50 < len(qids):
            time.sleep(0.5)
    return labels


def _empty() -> dict:
    return {
        "gender": None,
        "occupations": [],
        "titles": [],
        "species": None,
        "affiliations": [],
        "homeworld": None,
    }


def _clean(label: str | None) -> str | None:
    if not label:
        return None
    if re.fullmatch(r"Q\d+", label):
        return None
    if label.lower() in JUNK_LABELS:
        return None
    return label


def _api(params: dict, *, soft: bool = False) -> dict:
    url = API + "?" + urllib.parse.urlencode(params)
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    attempts = 3 if soft else 6
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                return json.loads(response.read().decode("utf-8"), strict=False)
        except urllib.error.HTTPError as exc:
            if soft and exc.code == 429:
                # Name search is best-effort; skip rather than block the build.
                time.sleep(5)
                return {}
            if exc.code not in (429, 500, 502, 503) or attempt == attempts - 1:
                if soft:
                    return {}
                raise
            time.sleep(15 * (attempt + 1))
    return {}
