"""Dream of the Red Chamber — sentence co-occurrence.

Built here rather than taken ready-made. The PKU character×event matrix
(yuany-pku/dream-of-the-red-chamber) is the dataset the notes pointed at, but
the GitHub dump carries no licence, so it cannot be folded into `/data`. See
raw/hongloumeng/SOURCE.md.

So the graph is assembled from two sources that carry no such problem: the
Chinese text on Project Gutenberg, which is out of copyright, and Wikidata's
characters of the novel, which are CC0. Two people are tied when the same
sentence names both.

Aliases are the whole job. The novel almost never writes 賈寶玉; it writes 寶玉.
Those short forms come from Wikidata's own alias table, in both simplified and
traditional, and a shared name is given to its best-known claimant or dropped.
"""

from __future__ import annotations

import dataclasses
import json
import re
import time
import urllib.error
from collections import defaultdict
from pathlib import Path
from urllib.parse import quote, urlencode

from ..canon.licenses import PUBLIC_DOMAIN
from ..canon.types import Attribution, CanonicalGraph, Edge, Node, Provenance
from .fetch import get

RAW = Path(__file__).resolve().parent.parent / "raw" / "hongloumeng"

GUTENBERG = "https://www.gutenberg.org/ebooks/24264.txt.utf-8"
WIKIDATA = "https://query.wikidata.org/sparql"
WIKIDATA_API = "https://www.wikidata.org/w/api.php"

# Who counts as a person in the novel, according to Wikidata.
#
# The work's own P674 "characters" list is only the famous fifty or so. The
# broader branch — fictional humans present in the work — is the rest of the
# household, and it is also where adaptation-only records sneak in. Those are
# not a problem in practice: they share a name with someone in the text and
# lose it under the sitelink rule below, or they share none and never match a
# sentence. The subclass walk `P31/P279*` 502s this endpoint; `P31` on
# fictional human, plus P674, covers the same people.
FIGURES_QUERY = """
SELECT DISTINCT ?p ?links WHERE {
  { wd:Q8265 wdt:P674 ?p }
  UNION {
    ?p wdt:P1441 wd:Q8265 .
    ?p wdt:P31 wd:Q15632617
  }
  ?p wikibase:sitelinks ?links .
}
"""

# Forms that are a role or a kinship term at least as often as they are a person.
# Left in the alias table they make every "second wife" Wang Xifeng, and every
# "girl" a Lin. A name that is only this word is dropped; 林姑娘 still matches.
GENERIC = {
    "夫人",
    "奶奶",
    "太太",
    "老爷",
    "老爺",
    "姑娘",
    "小姐",
    "丫头",
    "丫頭",
    "婆子",
    "姐姐",
    "哥哥",
    "妹妹",
    "嫂子",
    "媳妇",
    "媳婦",
    "公公",
    "舅舅",
    "姨妈",
    "姨媽",
    "和尚",
    "道士",
    "尼姑",
    "公子",
    "二奶奶",
    "大奶奶",
    "平姑娘",
    "姥姥",
    "家的",
    "大夫",
}

# How far ahead of its rivals a figure must be to claim a shared name.
DOMINANCE = 2

HEADING = re.compile(
    r"^第([一二三四五六七八九十零〇]+)回(?:[\u3000\s].*)?$",
    re.MULTILINE,
)
SENTENCE = re.compile(r"[。．！？!?]")
CJK = re.compile(r"^[\u3400-\u9fff\uF900-\uFAFF]{2,}$")
DIGITS = {
    "零": 0,
    "〇": 0,
    "一": 1,
    "二": 2,
    "三": 3,
    "四": 4,
    "五": 5,
    "六": 6,
    "七": 7,
    "八": 8,
    "九": 9,
}

ATTRIBUTION = Attribution(
    title="紅樓夢",
    creator="Public domain text; digital edition via Project Gutenberg (eBook #24264)",
    creator_url="https://www.gutenberg.org/",
    source_url="https://www.gutenberg.org/ebooks/24264",
    project_url="https://www.wikidata.org/",
    citation=(
        "Text: Cao Xueqin, 紅樓夢, Project Gutenberg eBook #24264, public domain. "
        "Identification of persons: Wikidata (CC0 1.0), queried for characters of the novel."
    ),
    retrieved="2026-09-18",
    modifications=(
        "Built a character network from the text: two people are tied when a sentence names both.",
        "Identified persons from Wikidata rather than from the text, so that places, titles, "
        "and unnamed servants are never nodes.",
        "Resolved shared names to the most prominent claimant, and dropped those too close to call.",
        "Dropped generic kinship and office words (夫人, 二奶奶, 家的) which name a role "
        "far more often than a person.",
        "Derived the names the novel actually uses (寶釵, 探春) by dropping the surname "
        "from each figure's Chinese label.",
    ),
)


def load() -> CanonicalGraph:
    figures = _figures()
    surface_forms = _resolve_surface_forms(figures)
    chapters = _chapters()

    if not surface_forms:
        raise ValueError("hongloumeng: no Chinese names resolved from Wikidata")
    ordered_forms = sorted(surface_forms, key=len, reverse=True)
    pattern = re.compile("|".join(re.escape(form) for form in ordered_forms))

    weights: dict[tuple[str, str], float] = defaultdict(float)
    segments: dict[tuple[str, str], set[str]] = defaultdict(set)
    appearances: dict[str, int] = defaultdict(int)
    forms_of: dict[str, list[str]] = defaultdict(list)
    for form, qid in sorted(surface_forms.items(), key=lambda item: (-len(item[0]), item[0])):
        forms_of[qid].append(form)

    for number, text in chapters:
        segment = str(number)
        for sentence in SENTENCE.split(text.replace("\n", "")):
            if not sentence:
                continue
            named = {
                surface_forms[match.group(0)]
                for match in pattern.finditer(sentence)
                if figures[surface_forms[match.group(0)]].get("zh_label")
            }
            if not named:
                continue
            for figure in named:
                appearances[figure] += 1
            ordered = sorted(named)
            for i, source in enumerate(ordered):
                for target in ordered[i + 1 :]:
                    key = (source, target)
                    weights[key] += 1
                    segments[key].add(segment)

    nodes = [
        Node(
            id=qid,
            name=figures[qid]["zh_label"] or figures[qid]["label"],
            aliases=_aliases(figures[qid], forms_of.get(qid, ())),
            work="hongloumeng",
            metadata={"wikidata": qid, "sentencesNamedIn": appearances[qid]},
        )
        for qid in sorted(appearances)
    ]

    edges = [
        Edge(
            source=source,
            target=target,
            weight=weights[(source, target)],
            type="cooccurrence",
            segments=tuple(sorted(segments[(source, target)], key=int)),
        )
        for source, target in sorted(weights)
    ]

    provenance = Provenance(
        dataset="hongloumeng-sentence-cooccurrence-v1",
        edge_definition="people named in the same sentence",
        source_unit="chapter",
        weight_semantics="count of sentences naming both, across all 120 chapters",
        attribution=dataclasses.replace(ATTRIBUTION),
        license=PUBLIC_DOMAIN,
    )

    return CanonicalGraph(
        id="hongloumeng",
        title="紅樓夢",
        accent="#A12B3C",
        nodes=nodes,
        edges=edges,
        provenance=provenance,
        segment_labels={str(n): f"第{n}回" for n, _ in chapters},
    ).sorted()


def _aliases(figure: dict, zh_forms: list[str]) -> tuple[str, ...]:
    """Other Chinese forms a player might type. No pinyin, no English.

    The display name is the Chinese label, so it is not repeated here.
    """
    seen = {figure["zh_label"], figure["label"]}
    aliases = []
    for form in zh_forms:
        if form not in seen:
            seen.add(form)
            aliases.append(form)
    return tuple(aliases)


def _resolve_surface_forms(figures: dict[str, dict]) -> dict[str, str]:
    """Which written name belongs to which person.

    Shared names are common — 寶玉 is both Jia Baoyu and, rarely, Zhen Baoyu —
    and a sentence naming one of them offers nothing to tell them apart with.
    Two rules decide, in the same order as the Bible adapter.

    A figure's own name beats somebody else's nickname. Where a name is nobody's
    primary name, or is several people's, the best known claimant takes it, but
    only if clearly ahead. Where nobody is clearly ahead, the name is dropped
    rather than guessed.
    """
    by_label: dict[str, set[str]] = defaultdict(set)
    by_alias: dict[str, set[str]] = defaultdict(set)

    for qid, figure in figures.items():
        for form, is_primary in _name_forms(figure):
            if is_primary:
                by_label[form].add(qid)
            else:
                by_alias[form].add(qid)

    resolved = {}
    for form in set(by_label) | set(by_alias):
        claimants = by_label.get(form) or by_alias[form]
        ranked = sorted(claimants, key=lambda qid: (-figures[qid]["links"], qid))
        if len(ranked) == 1:
            resolved[form] = ranked[0]
            continue
        best, runner_up = figures[ranked[0]]["links"], figures[ranked[1]]["links"]
        if best >= max(3, DOMINANCE * runner_up):
            resolved[form] = ranked[0]

    return resolved


def _name_forms(figure: dict) -> list[tuple[str, bool]]:
    """Written Chinese forms, including the surname-stripped short name.

    The novel almost never uses the three-character full name. Wikidata has
    薛寶釵 and 宝钗, and the Gutenberg text writes 寶釵 — three different
    strings for one person. Dropping the first character of every full name
    produces the missing traditional short form from the traditional label,
    without a conversion library. 王夫人 → 夫人, which is generic and dropped.
    """
    primary = figure["zh_label"].strip()
    seen: set[str] = set()
    out: list[tuple[str, bool]] = []
    for i, raw in enumerate([primary, *figure["zh"]]):
        form = raw.strip()
        if not _is_chinese_name(form) or form in seen:
            continue
        seen.add(form)
        out.append((form, i == 0 and form == primary))
    if _is_chinese_name(primary) and len(primary) >= 3:
        short = primary[1:]
        if _is_chinese_name(short) and short not in seen:
            out.append((short, False))
    return out


def _is_chinese_name(form: str) -> bool:
    form = form.strip()
    return form not in GENERIC and bool(CJK.fullmatch(form))


def _figures() -> dict[str, dict]:
    path = RAW / "wikidata-figures.json"
    if path.exists():
        payload = json.loads(path.read_text(encoding="utf-8"), strict=False)
        return {qid: _figure_from_cache(record) for qid, record in payload.items()}

    raw = _sparql(FIGURES_QUERY)

    figures: dict[str, dict] = {}
    for row in raw["results"]["bindings"]:
        qid = row["p"]["value"].rsplit("/", 1)[-1]
        figures[qid] = {
            "label": "",
            "zh_label": "",
            "links": int(row["links"]["value"]),
            "aliases": [],
            "zh": [],
        }

    print(f"  fetching Wikidata labels for {len(figures)} characters ...")
    for start, batch in _batches(sorted(figures), 50):
        payload = json.loads(
            get(
                WIKIDATA_API
                + "?"
                + urlencode(
                    {
                        "action": "wbgetentities",
                        "ids": "|".join(batch),
                        "props": "labels|aliases",
                        "languages": "en|zh|zh-hans|zh-hant|zh-cn|zh-tw|zh-hk",
                        "format": "json",
                    }
                )
            ).decode("utf-8"),
            strict=False,
        )
        for qid, entity in (payload.get("entities") or {}).items():
            if qid not in figures:
                continue
            figures[qid] = _figure_from_entity(figures[qid], entity)
        if start + 50 < len(figures):
            time.sleep(0.5)

    kept = {}
    for qid, figure in figures.items():
        if figure["zh_label"] and not re.fullmatch(r"Q\d+", figure["zh_label"]):
            kept[qid] = figure

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(kept, ensure_ascii=False, indent=1, sort_keys=True),
        encoding="utf-8",
    )
    print(f"  cached {len(kept)} Wikidata records → {path.name}")
    return kept


def _figure_from_cache(record: dict) -> dict:
    return {
        "label": record["label"],
        "zh_label": record.get("zh_label", ""),
        "links": int(record["links"]),
        "aliases": list(record.get("aliases") or ()),
        "zh": list(record.get("zh") or ()),
    }


def _figure_from_entity(figure: dict, entity: dict) -> dict:
    labels = entity.get("labels") or {}
    aliases = entity.get("aliases") or {}

    en = (labels.get("en") or {}).get("value") or ""
    zh_label = ""
    for lang in ("zh-hant", "zh", "zh-hk", "zh-tw", "zh-hans", "zh-cn"):
        value = (labels.get(lang) or {}).get("value") or ""
        if value:
            zh_label = value
            break

    english: list[str] = []
    chinese: list[str] = []
    if en:
        english.append(en)
    if zh_label:
        chinese.append(zh_label)
    for lang, entries in aliases.items():
        for entry in entries:
            value = (entry or {}).get("value") or ""
            if not value:
                continue
            if lang == "en":
                english.append(value)
            else:
                chinese.append(value)
    for lang, obj in labels.items():
        if lang == "en":
            continue
        value = (obj or {}).get("value") or ""
        if value:
            chinese.append(value)

    figure["label"] = en or zh_label
    figure["zh_label"] = zh_label
    figure["aliases"] = list(dict.fromkeys(english))
    figure["zh"] = list(dict.fromkeys(chinese))
    return figure


def _chapters() -> list[tuple[int, str]]:
    path = RAW / "gutenberg-24264.txt"
    if not path.exists():
        get(GUTENBERG, dest=path)
    text = path.read_text(encoding="utf-8")

    start = text.index("*** START OF THE PROJECT GUTENBERG EBOOK")
    end = text.index("*** END OF THE PROJECT GUTENBERG EBOOK")
    body = text[text.index("\n", start) + 1 : end]

    accepted: list[tuple[int, re.Match[str]]] = []
    seen: set[int] = set()
    for match in HEADING.finditer(body):
        number = _chapter_number(match.group(1))
        if number is None or number in seen:
            continue
        seen.add(number)
        accepted.append((number, match))

    chapters: list[tuple[int, str]] = []
    for i, (number, match) in enumerate(accepted):
        close = accepted[i + 1][1].start() if i + 1 < len(accepted) else len(body)
        chapters.append((number, body[match.end() : close]))

    if [n for n, _ in chapters] != list(range(1, 121)):
        found = [n for n, _ in chapters]
        raise ValueError(
            f"hongloumeng: expected chapters 1–120, found {len(found)} "
            f"(first {found[:5]}, last {found[-5:]}). The Gutenberg file's heading "
            f"pattern may have changed."
        )
    return chapters


def _chapter_number(raw: str) -> int | None:
    """Parse the chapter numbers this Gutenberg file actually writes.

    1–99 are classical: 十, 十一, 二十, 九十九. 100–120 are digit-by-digit
    with 零 as zero: 一零零, 一一八, 一二零. Anything else is prose that
    happened to start with 第…回, and is not a heading.
    """
    if "十" in raw:
        left, _, right = raw.partition("十")
        if any(ch not in DIGITS for ch in left + right):
            return None
        tens = DIGITS[left] if left else 1
        ones = DIGITS[right] if right else 0
        value = tens * 10 + ones
    else:
        if not raw or any(ch not in DIGITS for ch in raw):
            return None
        value = 0
        for ch in raw:
            value = value * 10 + DIGITS[ch]
    if 1 <= value <= 120:
        return value
    return None


def _sparql(query: str) -> dict:
    url = WIKIDATA + "?query=" + quote(query, safe="") + "&format=json"
    last: Exception | None = None
    for attempt in range(6):
        try:
            return json.loads(get(url).decode("utf-8"), strict=False)
        except urllib.error.HTTPError as exc:
            last = exc
            if exc.code not in (429, 500, 502, 503) or attempt == 5:
                raise
            time.sleep(15 * (attempt + 1))
    raise last


def _batches(items: list[str], size: int):
    for start in range(0, len(items), size):
        yield start, items[start : start + size]
