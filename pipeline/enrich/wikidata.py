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
}

WEAK_TITLES = {
    "biblical judge",
    "政府首腦",
    "政府首脑",
    "國家元首",
    "国家元首",
    "中国皇帝",
    "中國皇帝",
    "中国国王",
    "中國國王",
    "中国君主",
    "中國君主",
    "儲君",
    "储君",
    "總理",
    "总理",
    "head of state",
    "head of government",
}

NAME_SPELLINGS = {
    "athene": "athena",
    "pallas athene": "athena",
}

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
    "waiter",
    "waitress",
    "assistant",
    "vedette",
    "作家",
    "詩人",
    "诗人",
    "政治人物",
    "軍人",
    "军人",
    "軍官",
    "官员",
    "官員",
    "家務工",
    "家务工",
    "戰士",
    "战士",
    "公務員",
    "公务员",
    "政治家",
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
    "swineherd",
    "aoidos",
    "prophet",
    "seer",
    "herald",
    "priest",
    "paleontologist",
    "executive chef",
    "massage therapist",
    "謀士",
    "武將",
    "武将",
    "軍閥",
    "军阀",
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
    fetched = _fetch_attributes(to_fetch, languages=languages)
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


WORK_CAST = {
    "friends": "Q79784",
    "iliad": "Q8275",
    "lesmiserables": "Q180736",
}

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
    usable = [t for t in titles if _title_ok(t)]
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


def _title_ok(title: str) -> bool:
    lower = title.lower()
    if lower.startswith("fictional ") or title.startswith("虛構") or title.startswith("虚构"):
        return False
    if lower in WEAK_TITLES or title in WEAK_TITLES:
        return False
    if "in greek mythology" in lower or "in mythology" in lower:
        return " of " in lower
    return True


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


def _fetch_attributes(qids: list[str], *, languages: tuple[str, ...]) -> dict[str, dict]:
    entities = _get_entities(qids)
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
        if not entity:
            out[qid] = _empty()
            continue
        out[qid] = _attributes_from_entity(entity, labels, gender=gender)
    return out


def _attributes_from_entity(entity: dict, labels: dict[str, str], *, gender: dict[str, str]) -> dict:
    rec = _empty()

    for value_id in _claim_ids(entity, "P21"):
        if value_id in gender:
            rec["gender"] = gender[value_id]
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
