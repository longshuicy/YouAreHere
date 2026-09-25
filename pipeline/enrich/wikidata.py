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
        "Extracted discrete character attributes (occupation, position, noble "
        "title, species, affiliation, homeworld, gender) and Wikipedia sitelink "
        "titles; no wiki descriptions.",
        "Generic stations are kept; only junk labels (classes, misread offices) "
        "are dropped. Sentences are composed here from those attributes.",
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
    "人",
    "人類",
    "人类",
    "虛構人物",
    "虚构人物",
    "文學角色",
    "文学角色",
    "小說人物",
    "小说人物",
    "角色",
}

GENERIC_SPECIES = {"human", "fictional human"}

ETHNIC_SPECIES = {
    "trojans",
    "trojan",
    "greeks",
    "greek",
    "achaeans",
    "achaean",
    "myrmidons",
    "dardanians",
    "lycians",
    "argives",
    "moors",
    "moor",
}

# P31 labels that are a kind of being, not "character from X".
SPECIES_HINTS = (
    "droid",
    "wookiee",
    "hutt",
    "ewok",
    "gungan",
    "rodian",
    "trandoshan",
    "cyclops",
    "nymph",
    "centaur",
    "titan",
    "giant",
    "deity",
    "goddess",
    "olympian",
    "monkey",
    "dragon",
    "demon",
    "immortal",
    "spirit",
    "hobbit",
    "elf",
    "dwarf",
    "orc",
    "ent",
    "maia",
    "maiar",
    "ainur",
    "wizard",
    "希臘神明",
    "希腊神明",
    "神明",
    "神仙",
    "妖怪",
    "妖精",
    "石猴",
)

CIVIC_AFFILIATIONS = {
    "ancient rome",
    "jewish people",
    "france",
    "french",
    "greece",
    "ancient greece",
    "kingdom of france",
    "china",
    "people's republic of china",
    "han dynasty",
    "united states",
    "united states of america",
    "italy",
    "venice",
    "republic of venice",
    "kingdom of denmark",
    "denmark",
    "kingdom of scotland",
    "scotland",
    "england",
    "kingdom of england",
    "spain",
    "egypt",
    "reigning dynasty",
    "當朝",
    "國朝",
    "国朝",
    "唐朝",
    "大唐",
}

WEAK_TITLES = {
    "biblical judge",
    "政府首腦",
    "政府首脑",
    "國家元首",
    "国家元首",
    "儲君",
    "储君",
    "總理",
    "总理",
    "head of state",
    "head of government",
    "director",
    "主管",
}

# Wikidata's office labels are often a class plus a gloss. Strip the gloss,
# then rewrite a few that would otherwise read as encyclopedia entries.
TITLE_REWRITE = {
    "chinese king": "King",
    "chinese emperor": "Emperor",
    "emperor of china": "Emperor",
    "king of china": "King",
    "中国皇帝": "皇帝",
    "中國皇帝": "皇帝",
    "中国国王": "王",
    "中國國王": "王",
    "中国君主": "君主",
    "中國君主": "君主",
}

NAME_SPELLINGS = {
    "athene": "athena",
    "pallas athene": "athena",
}

# Occupations that are junk or a misread of the source, not merely generic.
# Generic stations (poet, warlord, military officer) are kept: Facts is allowed
# to be informative.
WEAK_OCCUPATIONS = {
    "chaser",
    "vedette",
    "director",
    "主管",
    "swordfighter",
    "swordsman",
}

# Prefer these occupations when several are listed (Star Wars and similar).
OCCUPATION_PRIORITY = (
    "ring-bearer",
    "ring bearer",
    "necromancer",
    "wizard",
    "ranger",
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
    "king",
    "emperor",
    "military leader",
    "warlord",
    "navigator",
    "swineherd",
    "aoidos",
    "prophet",
    "seer",
    "herald",
    "priest",
    "poet",
    "paleontologist",
    "executive chef",
    "massage therapist",
    "丞相",
    "謀士",
    "武將",
    "武将",
    "軍閥",
    "军阀",
    "軍事領袖",
    "军事领袖",
    "叛亂領袖",
    "叛乱领袖",
    "道士",
    "比丘",
    "強盜",
    "强盗",
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
    # Dynasty/citizenship labels that most of a literary cast share.
    "漢",
    "漢朝",
    "汉朝",
    "大宋",
    "周朝",
    "燕",
    "西晉",
    "西晋",
    "大晉",
    "大晋",
    "中國",
    "中国",
    "han dynasty",
    "tang dynasty",
    "song dynasty",
    "china",
    "people's republic of china",
    "france",
    "french",
    "kingdom of france",
    "greece",
    "ancient greece",
    "hellas",
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
    "蜀漢",
    "大魏",
    "曹魏",
    "cao wei",
    "吳國",
    "吴国",
    "楚國",
    "楚国",
    "魯國",
    "鲁国",
    "西漢",
    "西汉",
    "秦國",
    "秦国",
    "秦朝",
    "賈府",
    "荣国府",
    "榮國府",
    "三十六天罡星",
    "七十二地煞星",
    "trojans",
    "greeks",
    "friends of the abc",
)

GENDER = {
    "Q6581097": "Male",  # male
    "Q6581072": "Female",  # female
    "Q44148": "Male",  # male organism
    "Q43445": "Female",  # female organism
}

GENDER_ZH = {
    "Q6581097": "男",
    "Q6581072": "女",
    "Q44148": "男",
    "Q43445": "女",
}

PROPS = {
    "P21": "gender",
    "P106": "occupations",
    "P39": "titles",
    "P97": "titles",
    "P172": "species",
    "P463": "affiliations",
    "P27": "affiliations",
    "P1165": "homeworld",
    "P19": "homeworld",
    "P31": "instances",
}


def attributes_for(
    qids: list[str], *, cache_name: str, cache_dir: Path, languages: tuple[str, ...] = ("en",)
) -> dict[str, dict]:
    """Return {qid: {gender, occupations, titles, species, affiliations, homeworld, wiki}}."""
    wanted = sorted({qid for qid in qids if re.fullmatch(r"Q\d+", qid)})
    if not wanted:
        return {}

    path = cache_dir / cache_name
    cached: dict[str, dict] = {}
    if path.exists():
        cached = json.loads(path.read_text(encoding="utf-8"))
        # Absent wiki key = never fetched (or rate-limit aborted). Explicit null =
        # confirmed no preferred sitelink — do not retry every build.
        missing = [
            qid
            for qid in wanted
            if qid not in cached or "wiki" not in cached[qid]
        ]
        if not missing:
            return {qid: cached[qid] for qid in wanted}
        to_fetch = missing
    else:
        to_fetch = wanted

    print(f"  fetching Wikidata attributes for {len(to_fetch)} characters ...")
    fetched = _fetch_attributes(to_fetch, languages=languages)
    cached.update(fetched)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(cached, ensure_ascii=False, indent=1, sort_keys=True), encoding="utf-8")
    print(f"  cached {len(cached)} Wikidata records → {path.name}")
    return {qid: cached[qid] for qid in wanted if qid in cached}


def backfill_sitelinks(
    *, cache_name: str, cache_dir: Path, languages: tuple[str, ...] = ("en",)
) -> int:
    """Add wiki/wikiLang to an existing attributes cache without re-fetching claims.

    Returns how many records were updated.
    """
    path = cache_dir / cache_name
    if not path.exists():
        return 0
    cached: dict[str, dict] = json.loads(path.read_text(encoding="utf-8"))
    # Absent key = never fetched. Explicit null = confirmed miss — leave alone.
    missing = [qid for qid, rec in cached.items() if "wiki" not in rec]
    if not missing:
        return 0

    sites = _wiki_sites(languages=languages)
    print(f"  backfilling Wikipedia sitelinks for {len(missing)} records in {path.name} ...")
    updated = 0
    for start in range(0, len(missing), 50):
        batch = missing[start : start + 50]
        payload = _api(
            {
                "action": "wbgetentities",
                "ids": "|".join(batch),
                "props": "sitelinks",
                "sitefilter": "|".join(sites),
                "format": "json",
            },
            soft=True,
        )
        if not payload.get("entities"):
            print(f"    rate-limited at {start}/{len(missing)}; pausing 60s ...", flush=True)
            time.sleep(60)
            payload = _api(
                {
                    "action": "wbgetentities",
                    "ids": "|".join(batch),
                    "props": "sitelinks",
                    "sitefilter": "|".join(sites),
                    "format": "json",
                },
                soft=True,
            )
        if not payload.get("entities"):
            print(f"    still empty at {start}/{len(missing)}; leaving for a later run", flush=True)
            continue
        for qid, entity in (payload.get("entities") or {}).items():
            if qid not in cached:
                continue
            title, lang = _sitelink_from_entity(entity, sites)
            cached[qid]["wiki"] = title
            cached[qid]["wikiLang"] = lang
            updated += 1
        # Persist incrementally so a mid-run abort keeps progress.
        path.write_text(
            json.dumps(cached, ensure_ascii=False, indent=1, sort_keys=True),
            encoding="utf-8",
        )
        if start + 50 < len(missing):
            time.sleep(1.5)

    path.write_text(json.dumps(cached, ensure_ascii=False, indent=1, sort_keys=True), encoding="utf-8")
    return updated


def work_sitelink(source: str, *, universe_id: str | None = None) -> dict[str, str] | None:
    """Wikipedia page for a world's work, if known. Cached under raw/<source>/.

    `universe_id` matters for split corpora (Shakespeare): each play world gets
    its own DraCor Wikidata id rather than one franchise page.
    """
    if source == "shakespeare" and universe_id:
        qid = _shakespeare_work_qid(universe_id)
        cache_name = f"work-sitelink-{universe_id.removeprefix('shakespeare-')}.json"
    else:
        qid = WORK_PAGES.get(source)
        cache_name = "work-sitelink.json"
    if not qid:
        return None

    cache_dir = RAW / source
    path = cache_dir / cache_name
    if path.exists():
        cached = json.loads(path.read_text(encoding="utf-8"))
        if cached.get("title"):
            return cached

    sites = _wiki_sites(source)
    print(f"  fetching Wikipedia sitelink for work {qid} ({source}/{universe_id or source}) ...", flush=True)
    payload = _api(
        {
            "action": "wbgetentities",
            "ids": qid,
            "props": "sitelinks",
            "sitefilter": "|".join(sites),
            "format": "json",
        }
    )
    entity = (payload.get("entities") or {}).get(qid) or {}
    title, lang = _sitelink_from_entity(entity, sites)
    if not title or not lang:
        return None

    record = {"title": title, "lang": lang, "qid": qid}
    cache_dir.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(record, ensure_ascii=False, indent=1, sort_keys=True), encoding="utf-8")
    return record


# Multi-play Shakespeare components that are not one DraCor drama.
SHAKESPEARE_CYCLE_QIDS = {
    "english-histories": "Q2284425",  # Shakespearean history
    # No single Wikidata item for "Shakespeare's Rome"; Julius Caesar anchors
    # the cycle (DraCor Q215750), with Antony and Cleopatra as its pair.
    "rome": "Q215750",  # Julius Caesar (play)
}


def _shakespeare_work_qid(universe_id: str) -> str | None:
    """DraCor play Wikidata id for a shakespeare-* universe, or a cycle pin."""
    slug = universe_id.removeprefix("shakespeare-")
    if slug in SHAKESPEARE_CYCLE_QIDS:
        return SHAKESPEARE_CYCLE_QIDS[slug]
    corpus_path = RAW / "shakespeare" / "corpus.json"
    if not corpus_path.exists():
        return None
    corpus = json.loads(corpus_path.read_text(encoding="utf-8"))
    for play in corpus.get("dramas") or []:
        if play.get("name") == slug and play.get("wikidataId"):
            return play["wikidataId"]
    return None


def _wiki_sites(source: str | None = None, *, languages: tuple[str, ...] | None = None) -> tuple[str, ...]:
    """Preferred Wikipedia project(s).

    English-primary worlds stay on enwiki only — falling back to zhwiki would
    hand an English player a Chinese article for minor characters that lack an
    English page. Chinese classics prefer zhwiki, then enwiki.
    """
    if source in ZH_SOURCES or (
        languages and any(lang.startswith("zh") for lang in languages)
    ):
        return ("zhwiki", "enwiki")
    return ("enwiki",)


def _sitelink_from_entity(entity: dict, sites: tuple[str, ...]) -> tuple[str | None, str | None]:
    sitelinks = entity.get("sitelinks") or {}
    for site in sites:
        title = (sitelinks.get(site) or {}).get("title")
        if title:
            # enwiki → en, zhwiki → zh
            lang = site[:-4] if site.endswith("wiki") else site
            return title, lang
    return None, None


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


_LOTR_DESC = (
    "tolkien",
    "middle-earth",
    "middle earth",
    "lord of the rings",
    "legendarium",
    "the hobbit",
)


def resolve_lotr_names(names: list[str]) -> dict[str, str]:
    """Map display names → Wikidata QIDs via search, cached under raw/lotr.

    Only accepts hits whose description points at Tolkien's legendarium.
    """
    path = RAW / "lotr" / "wikidata-name-map.json"
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
        print(f"  resolving {len(pending)} LotR names on Wikidata ...", flush=True)
        for i, name in enumerate(pending, 1):
            qid = _search_lotr(name)
            cached[name] = qid
            if qid:
                resolved[name] = qid
            if i % 10 == 0:
                print(f"    {i}/{len(pending)}", flush=True)
            time.sleep(2.0)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(cached, ensure_ascii=False, indent=1, sort_keys=True), encoding="utf-8")

    return resolved


def _search_lotr(name: str) -> str | None:
    for search in (name, f"{name} Tolkien", f"{name} Middle-earth"):
        payload = _api(
            {
                "action": "wbsearchentities",
                "search": search,
                "language": "en",
                "type": "item",
                "limit": 8,
                "format": "json",
            },
            soft=True,
        )
        for hit in payload.get("search") or []:
            description = (hit.get("description") or "").lower()
            if any(token in description for token in _LOTR_DESC):
                return hit["id"]
    return None


_ASOIAF_DESC = (
    "song of ice and fire",
    "game of thrones",
    "westeros",
    "a song of ice",
    "george r. r. martin",
    "george rr martin",
)


def resolve_asoiaf_names(names: list[str]) -> dict[str, str]:
    """Map display names → Wikidata QIDs via search, cached under raw/asoiaf.

    Only accepts hits whose description points at Martin's saga.
    """
    return _resolve_names(
        names,
        cache_path=RAW / "asoiaf" / "wikidata-name-map.json",
        label="A Song of Ice and Fire",
        search=_search_asoiaf,
        sleep=1.5,
    )


# Soft API returned nothing usable (rate-limit / empty body). Do not cache as null.
_UNRESOLVED = object()


def _search_asoiaf(name: str) -> str | None | object:
    saw_response = False
    for search in (name, f"{name} Game of Thrones", f"{name} A Song of Ice and Fire"):
        payload = _api(
            {
                "action": "wbsearchentities",
                "search": search,
                "language": "en",
                "type": "item",
                "limit": 8,
                "format": "json",
            },
            soft=True,
        )
        if not payload:
            continue
        saw_response = True
        for hit in payload.get("search") or []:
            description = (hit.get("description") or "").lower()
            if any(token in description for token in _ASOIAF_DESC):
                return hit["id"]
    return None if saw_response else _UNRESOLVED


_CIVILWAR_DESC = (
    "american civil war",
    "civil war",
    "union army",
    "confederate",
    "confederacy",
    "union general",
    "confederate general",
    "union officer",
    "confederate officer",
    "confederate states army",
    "confederate states of america",
)


def resolve_civilwar_names(names: list[str]) -> dict[str, str]:
    """Map commander names → Wikidata QIDs via search, cached under raw/civilwar.

    Only accepts hits whose description points at the American Civil War, or an
    era army-general description with lifespan covering 1861–65.
    """
    return _resolve_names(
        names,
        cache_path=RAW / "civilwar" / "wikidata-name-map.json",
        label="Civil War",
        search=_search_civilwar,
        sleep=1.5,
    )


def _search_civilwar(name: str) -> str | None | object:
    saw_response = False
    for search in (
        name,
        f"{name} Civil War",
        f"{name} Union",
        f"{name} Confederate",
    ):
        payload = _api(
            {
                "action": "wbsearchentities",
                "search": search,
                "language": "en",
                "type": "item",
                "limit": 8,
                "format": "json",
            },
            soft=True,
        )
        if not payload:
            continue
        saw_response = True
        for hit in payload.get("search") or []:
            if _civilwar_hit_ok(hit):
                return hit["id"]
    return None if saw_response else _UNRESOLVED


def _civilwar_hit_ok(hit: dict) -> bool:
    description = (hit.get("description") or "").lower()
    if any(token in description for token in _CIVILWAR_DESC):
        return True
    # Many generals are described only as "United States Army general (1820–1891)"
    # with no "Civil War" token — accept era lifespans on army/officer hits.
    if not any(
        token in description
        for token in (
            "army general",
            "army officer",
            "naval officer",
            "navy officer",
            "military officer",
        )
    ):
        return False
    match = re.search(r"\((\d{4})\s*[–-]\s*(\d{4})\)", description)
    if not match:
        return False
    born, died = int(match.group(1)), int(match.group(2))
    return born <= 1845 and died >= 1861


def _resolve_names(
    names: list[str],
    *,
    cache_path: Path,
    label: str,
    search,
    sleep: float = 1.5,
) -> dict[str, str]:
    """Shared cached name→QID search used by ASOIAF / Civil War matchers."""
    cached: dict[str, str | None] = {}
    if cache_path.exists():
        cached = json.loads(cache_path.read_text(encoding="utf-8"))

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
        print(f"  resolving {len(pending)} {label} names on Wikidata ...", flush=True)
        for i, name in enumerate(pending, 1):
            qid = search(name)
            if qid is _UNRESOLVED:
                # Soft 429 / empty body — leave uncached so a later run retries.
                if i % 10 == 0:
                    print(f"    {i}/{len(pending)} (rate-limited; will retry later)", flush=True)
                time.sleep(sleep * 2)
                continue
            cached[name] = qid
            if qid:
                resolved[name] = qid
            if i % 10 == 0:
                print(f"    {i}/{len(pending)}", flush=True)
            # Persist every 25 so a mid-run abort keeps progress.
            if i % 25 == 0:
                cache_path.parent.mkdir(parents=True, exist_ok=True)
                cache_path.write_text(
                    json.dumps(cached, ensure_ascii=False, indent=1, sort_keys=True),
                    encoding="utf-8",
                )
            time.sleep(sleep)
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        cache_path.write_text(
            json.dumps(cached, ensure_ascii=False, indent=1, sort_keys=True),
            encoding="utf-8",
        )

    return resolved


WORK_CAST = {
    "friends": "Q79784",
    "iliad": "Q8275",
    "lesmiserables": "Q180736",
    "pride": "Q170583",
    # Film-series cast: short script names match via given-name forms.
    "godfather": "Q3225260",  # The Godfather (film series)
    # Indiana Jones: franchise cast SPARQL times out; pins in aliases cover the leads.
}

# Work / franchise QIDs for a world-level Wikipedia link on the gallery card.
# Broader than WORK_CAST: cast matching is optional; the story link is not.
WORK_PAGES = {
    "asoiaf": "Q45875",  # A Song of Ice and Fire
    "bible": "Q1845",  # Bible
    "civilwar": "Q8676",  # American Civil War
    "congress": "Q11268",  # United States Congress
    "friends": "Q79784",
    "godfather": "Q3225260",
    "hongloumeng": "Q8265",
    "iliad": "Q8275",
    "indiana-jones": "Q2562640",
    "lesmiserables": "Q180736",
    "lotr": "Q15228",  # The Lord of the Rings
    "mmkg": "Q9730",  # History of music
    "odyssey": "Q35160",
    "pride": "Q170583",
    "sanguoyanyi": "Q70806",
    "shiji": "Q272530",
    "shuihuzhuan": "Q70827",
    "starwars": "Q462",  # Star Wars
    "xiyouji": "Q70784",
}

ZH_SOURCES = frozenset(
    {"hongloumeng", "sanguoyanyi", "shiji", "shuihuzhuan", "xiyouji"}
)

# Honorifics are not given names; indexing them as first tokens would collide.
_GIVEN_NAME_SKIP = frozenset(
    {"mr", "mrs", "ms", "miss", "dr", "sir", "lady", "lord", "dame", "frau", "herr"}
)


def match_work_cast(nodes, *, work_qid: str, cache_dir: Path, languages: tuple[str, ...] = ("en", "fr")) -> dict[str, str]:
    """Map node ids → QIDs by unique label/alias against the work's Wikidata cast.

    Ambiguous forms (two Ajaxes both called Ajax) are skipped. Pins happen
    upstream via the identity table. Multi-word cast labels also contribute a
    unique first-token form so TV-style given names (Ross, Rachel) resolve.
    """
    cast = _cast_of_work(work_qid, cache_dir=cache_dir, languages=languages)
    by_form: dict[str, set[str]] = {}
    for qid, figure in cast.items():
        for form in (figure.get("label"), *(figure.get("aliases") or [])):
            if not form:
                continue
            for variant in _name_forms(form):
                by_form.setdefault(variant, set()).add(qid)
        # Given names only from the primary label — aliases like "Rachel's Sister"
        # or "Chandler's Dad" would otherwise steal the first token.
        label = figure.get("label") or ""
        for variant in _given_name_forms(label):
            by_form.setdefault(variant, set()).add(qid)

    unique = {form: next(iter(qids)) for form, qids in by_form.items() if len(qids) == 1}

    matched: dict[str, str] = {}
    for node in nodes:
        hits: set[str] = set()
        for form in (node.name, *node.aliases):
            for variant in _name_forms(form):
                qid = unique.get(variant)
                if qid:
                    hits.add(qid)
        if len(hits) == 1:
            matched[node.id] = next(iter(hits))
    return matched


def _cast_of_work(work_qid: str, *, cache_dir: Path, languages: tuple[str, ...]) -> dict[str, dict]:
    path = cache_dir / "wikidata-cast.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))

    query = f"""
SELECT DISTINCT ?p WHERE {{
  {{ wd:{work_qid} wdt:P674 ?p }}
  UNION {{ ?p wdt:P1441 wd:{work_qid} }}
}}
"""
    print(f"  querying Wikidata cast for {work_qid} ...", flush=True)
    payload = _sparql(query)
    qids = []
    for row in payload.get("results", {}).get("bindings", []):
        qid = row["p"]["value"].rsplit("/", 1)[-1]
        if re.fullmatch(r"Q\d+", qid):
            qids.append(qid)
    qids = sorted(set(qids))
    print(f"  fetching labels for {len(qids)} cast members ...", flush=True)

    cast: dict[str, dict] = {}
    lang = "|".join(languages)
    for start in range(0, len(qids), 50):
        batch = qids[start : start + 50]
        payload = _api(
            {
                "action": "wbgetentities",
                "ids": "|".join(batch),
                "props": "labels|aliases",
                "languages": lang,
                "format": "json",
            }
        )
        for qid, entity in (payload.get("entities") or {}).items():
            labels = entity.get("labels") or {}
            label = ""
            for code in languages:
                label = (labels.get(code) or {}).get("value") or ""
                if label:
                    break
            aliases: list[str] = []
            by_lang = entity.get("aliases") or {}
            for code in languages:
                for item in by_lang.get(code) or []:
                    value = item.get("value") or ""
                    if value and value not in aliases and value != label:
                        aliases.append(value)
            if label:
                cast[qid] = {"label": label, "aliases": aliases}
        if start + 50 < len(qids):
            time.sleep(0.5)

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(cast, ensure_ascii=False, indent=1, sort_keys=True), encoding="utf-8")
    print(f"  cached {len(cast)} cast records → {path.name}", flush=True)
    return cast


def _name_forms(name: str) -> list[str]:
    key = _norm_name(name)
    if not key:
        return []
    forms = [key]
    if key.startswith("great "):
        rest = key[6:]
        forms.append(f"{rest} the great")
    if key.startswith("little "):
        rest = key[7:]
        forms.append(f"{rest} the lesser")
        forms.append(f"{rest} the little")
    if key.endswith(" the great"):
        forms.append("great " + key[: -len(" the great")])
    if key.endswith(" the lesser"):
        forms.append("little " + key[: -len(" the lesser")])
    for prefix in ("monsieur ", "madame ", "mademoiselle ", "madamoiselle ", "sister ", "mother "):
        if key.startswith(prefix):
            forms.append(key[len(prefix) :])
            parts = key.split()
            if len(parts) >= 2:
                forms.append(parts[-1])
    return list(dict.fromkeys(forms))


def _given_name_forms(name: str) -> list[str]:
    """First token of a multi-word label — useful when the graph uses given names."""
    key = _norm_name(name)
    parts = key.split()
    if len(parts) < 2:
        return []
    if parts[0] in _GIVEN_NAME_SKIP:
        return []
    return [parts[0]]


def _norm_name(name: str) -> str:
    text = name.strip().lower()
    replacements = {
        "é": "e",
        "è": "e",
        "ê": "e",
        "ë": "e",
        "á": "a",
        "à": "a",
        "â": "a",
        "ç": "c",
        "î": "i",
        "ï": "i",
        "ô": "o",
        "ö": "o",
        "ù": "u",
        "û": "u",
        "ü": "u",
        "œ": "oe",
    }
    for raw, cooked in replacements.items():
        text = text.replace(raw, cooked)
    text = re.sub(r"[^a-z0-9]+", " ", text)
    text = " ".join(text.split())
    return NAME_SPELLINGS.get(text, text)


def _sparql(query: str) -> dict:
    url = "https://query.wikidata.org/sparql?" + urllib.parse.urlencode(
        {"query": query, "format": "json"}
    )
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    last: Exception | None = None
    for attempt in range(6):
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                return json.loads(response.read().decode("utf-8"), strict=False)
        except urllib.error.HTTPError as exc:
            last = exc
            if exc.code not in (429, 500, 502, 503) or attempt == 5:
                raise
            time.sleep(15 * (attempt + 1))
    raise last  # type: ignore[misc]


def _species_hint(lower: str, label: str) -> bool:
    if "droid" in lower or "astromech" in lower:
        return True
    if re.search(r"\bgod\b", lower):
        return True
    return any(hint in lower or hint in label for hint in SPECIES_HINTS)


def apply_to_record(record: dict, attrs: dict) -> None:
    """Fold Wikidata attributes into a facts record, without overwriting better data."""
    if attrs.get("gender") and "gender" not in record:
        record["gender"] = attrs["gender"]

    if not record.get("titles") and not record.get("occupation") and not record.get("role"):
        title = _prefer_title(attrs.get("titles") or [])
        if title:
            record["titles"] = [title]
        else:
            occupation = _prefer_occupation(attrs.get("occupations") or [])
            if occupation:
                record["occupation"] = occupation

    if attrs.get("species") and "species" not in record and "culture" not in record:
        species = _clean_species(attrs["species"])
        if species:
            record["species"] = species

    if attrs.get("affiliations") and "houses" not in record and "affiliations" not in record:
        affiliations = _prefer_affiliations(attrs["affiliations"])
        if affiliations:
            record["affiliations"] = affiliations

    if attrs.get("homeworld") and "homeworld" not in record:
        record["homeworld"] = attrs["homeworld"]

    # Sitelink title + lang ride on the record until emit lifts them off facts.
    if attrs.get("wiki") and "wiki" not in record:
        record["wiki"] = attrs["wiki"]
        if attrs.get("wikiLang"):
            record["wikiLang"] = attrs["wikiLang"]


def _clean_species(label: str | None) -> str | None:
    if not label:
        return None
    if label.lower().startswith("fictional "):
        label = label[10:].strip()
    lower = label.lower()
    if lower in GENERIC_SPECIES or lower in ETHNIC_SPECIES or lower in JUNK_LABELS:
        return None
    if "character" in lower or "人物" in label or "角色" in label:
        return None
    return label or None


def _prefer_occupation(occupations: list[str]) -> str | None:
    usable = [
        o
        for o in occupations
        if o.lower() not in WEAK_OCCUPATIONS
        and not o.lower().startswith("fictional ")
        and not o.startswith("虛構")
        and not o.startswith("虚构")
    ]
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


def _prefer_title(titles: list[str]) -> str | None:
    usable = []
    for title in titles:
        if not _title_ok(title):
            continue
        rewritten = _rewrite_title(title)
        if rewritten and rewritten not in usable:
            usable.append(rewritten)
    if not usable:
        return None
    # Prefer the most specific imperial/royal style when several offices are listed.
    for needle in (
        "emperor",
        "empress",
        "king",
        "queen",
        "chancellor",
        "supreme",
        "prince",
        "princess",
        "皇帝",
        "皇后",
        "丞相",
        "州牧",
        "將軍",
        "将军",
        "王",
    ):
        for title in usable:
            if needle in title.lower() or needle in title:
                return title
    return usable[0]


def _strip_gloss(title: str) -> str:
    text = title.strip()
    text = re.sub(r"\s+in greek mythology$", "", text, flags=re.I)
    text = re.sub(r"\s+in (?:norse |roman |egyptian )?mythology$", "", text, flags=re.I)
    text = re.sub(r"^mythological\s+", "", text, flags=re.I)
    text = re.sub(r"^legendary\s+", "", text, flags=re.I)
    return text.strip()


def _rewrite_title(title: str) -> str | None:
    stripped = _strip_gloss(title)
    if not stripped:
        return None
    return TITLE_REWRITE.get(stripped.lower()) or TITLE_REWRITE.get(stripped) or stripped


def _title_ok(title: str) -> bool:
    stripped = _strip_gloss(title)
    lower = stripped.lower()
    if lower.startswith("fictional ") or stripped.startswith("虛構") or stripped.startswith("虚构"):
        return False
    if lower in WEAK_TITLES or stripped in WEAK_TITLES:
        return False
    return bool(stripped)


def _prefer_affiliations(affiliations: list[str]) -> list[str]:
    usable = [
        a
        for a in affiliations
        if a.lower() not in WEAK_AFFILIATIONS and a.lower() not in CIVIC_AFFILIATIONS
    ]
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


def _fetch_attributes(qids: list[str], *, languages: tuple[str, ...]) -> dict[str, dict]:
    sites = _wiki_sites(languages=languages)
    entities = _get_entities(qids, sites=sites)
    # Collect referenced entity ids so we can resolve labels in one pass.
    refs: set[str] = set()
    for entity in entities.values():
        for prop in PROPS:
            for value_id in _claim_ids(entity, prop):
                refs.add(value_id)
    labels = _entity_labels(sorted(refs), languages=languages)
    gender = GENDER_ZH if any(lang.startswith("zh") for lang in languages) else GENDER

    out: dict[str, dict] = {}
    for qid in qids:
        entity = entities.get(qid)
        # Missing entity usually means a rate-limit/empty batch — skip so we don't
        # poison the cache with a permanent wiki:null.
        if not entity or entity.get("missing") is not None:
            continue
        out[qid] = _attributes_from_entity(entity, labels, gender=gender, sites=sites)
    return out


def _attributes_from_entity(
    entity: dict,
    labels: dict[str, str],
    *,
    gender: dict[str, str],
    sites: tuple[str, ...] = ("enwiki", "zhwiki"),
) -> dict:
    rec = _empty()

    for value_id in _claim_ids(entity, "P21"):
        if value_id in gender:
            rec["gender"] = gender[value_id]
            break

    for prop, field in (
        ("P106", "occupations"),
        ("P39", "titles"),
        ("P97", "titles"),
        ("P463", "affiliations"),
        ("P27", "affiliations"),
    ):
        for value_id in _claim_ids(entity, prop):
            label = _clean(labels.get(value_id))
            if not label or label in rec[field]:
                continue
            if field == "affiliations" and label.lower() in CIVIC_AFFILIATIONS:
                continue
            if field == "occupations" and label.lower() in WEAK_OCCUPATIONS:
                continue
            if field == "titles" and not _title_ok(label):
                continue
            if field == "occupations" and (
                label.lower().startswith("fictional ")
                or label.startswith("虛構")
                or label.startswith("虚构")
            ):
                continue
            rec[field].append(label)

    for prop in ("P172",):
        for value_id in _claim_ids(entity, prop):
            label = _clean(labels.get(value_id))
            if label and label.lower() not in GENERIC_SPECIES:
                rec["species"] = _clean_species(label)
                if rec["species"]:
                    break

    if not rec["species"]:
        for value_id in _claim_ids(entity, "P31"):
            label = _clean(labels.get(value_id))
            if not label:
                continue
            lower = label.lower()
            if lower in GENERIC_SPECIES or lower in JUNK_LABELS:
                continue
            if "character" in lower or "人物" in label or "角色" in label:
                continue
            if _species_hint(lower, label):
                rec["species"] = _clean_species(label)
                if rec["species"]:
                    break

    for prop in ("P1165", "P19"):
        for value_id in _claim_ids(entity, prop):
            label = _clean(labels.get(value_id))
            if label:
                rec["homeworld"] = label
                break
        if rec["homeworld"]:
            break

    title, lang = _sitelink_from_entity(entity, sites)
    rec["wiki"] = title
    rec["wikiLang"] = lang

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


def _get_entities(qids: list[str], *, sites: tuple[str, ...] = ("enwiki", "zhwiki")) -> dict[str, dict]:
    entities: dict[str, dict] = {}
    for start in range(0, len(qids), 50):
        batch = qids[start : start + 50]
        payload = _api(
            {
                "action": "wbgetentities",
                "ids": "|".join(batch),
                "props": "claims|sitelinks",
                "sitefilter": "|".join(sites),
                "format": "json",
            }
        )
        entities.update(payload.get("entities") or {})
        if start + 50 < len(qids):
            time.sleep(0.5)
    return entities


def _entity_labels(qids: list[str], *, languages: tuple[str, ...] = ("en",)) -> dict[str, str]:
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
                "languages": "|".join(languages),
                "format": "json",
            }
        )
        for qid, entity in (payload.get("entities") or {}).items():
            by_lang = entity.get("labels") or {}
            label = ""
            for lang in languages:
                label = (by_lang.get(lang) or {}).get("value") or ""
                if label:
                    break
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
        "wiki": None,
        "wikiLang": None,
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
