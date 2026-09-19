"""Classical Chinese novels — sentence co-occurrence from Gutenberg + Wikidata.

Same job as 紅樓夢, parameterised. A public-domain text plus Wikidata's character
list. Two people are tied when the same sentence names both. Aliases are the
whole difficulty: the novels write 孔明 and 悟空, Wikidata has 諸葛亮 and 孫悟空.
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

WIKIDATA = "https://query.wikidata.org/sparql"
WIKIDATA_API = "https://www.wikidata.org/w/api.php"

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
    "大王",
    "妖怪",
    "妖精",
    "神仙",
    "菩薩",
    "菩萨",
    "皇帝",
    "將軍",
    "将军",
    "丞相",
    "太守",
    "員外",
    "员外",
}

DOMINANCE = 2

HEADING = re.compile(
    r"^[ \t]*第([一二三四五六七八九十零〇○百]+)回(?:[：:\u3000\s].*)?$",
    re.MULTILINE,
)
SENTENCE = re.compile(r"[。．！？!?]")
CJK = re.compile(r"^[\u3400-\u9fff\uF900-\uFAFF]{2,}$")
DIGITS = {
    "零": 0,
    "〇": 0,
    "○": 0,
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


@dataclasses.dataclass(frozen=True)
class Work:
    id: str
    title: str
    accent: str
    gutenberg_id: int
    work_qid: str
    chapter_count: int
    author: str
    extra_generic: frozenset[str] = frozenset()


def load_work(work: Work) -> CanonicalGraph:
    raw = Path(__file__).resolve().parent.parent / "raw" / work.id
    figures = _figures(work, raw)
    surface_forms = _resolve_surface_forms(figures, work)
    chapters = _chapters(work, raw)

    if not surface_forms:
        raise ValueError(f"{work.id}: no Chinese names resolved from Wikidata")
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
            work=work.id,
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

    attribution = Attribution(
        title=work.title,
        creator=f"Public domain text; digital edition via Project Gutenberg (eBook #{work.gutenberg_id})",
        creator_url="https://www.gutenberg.org/",
        source_url=f"https://www.gutenberg.org/ebooks/{work.gutenberg_id}",
        project_url="https://www.wikidata.org/",
        citation=(
            f"Text: {work.author}, {work.title}, Project Gutenberg eBook #{work.gutenberg_id}, "
            "public domain. Identification of persons: Wikidata (CC0 1.0), queried for "
            "characters of the novel."
        ),
        retrieved="2026-09-18",
        modifications=(
            "Built a character network from the text: two people are tied when a sentence names both.",
            "Identified persons from Wikidata rather than from the text, so that places, titles, "
            "and unnamed extras are never nodes.",
            "Resolved shared names to the most prominent claimant, and dropped those too close to call.",
            "Dropped generic kinship and office words which name a role far more often than a person.",
            "Derived the names the novel actually uses by dropping the surname from each figure's Chinese label.",
        ),
    )

    provenance = Provenance(
        dataset=f"{work.id}-sentence-cooccurrence-v1",
        edge_definition="people named in the same sentence",
        source_unit="chapter",
        weight_semantics=(
            f"count of sentences naming both, across all {work.chapter_count} chapters"
        ),
        attribution=attribution,
        license=PUBLIC_DOMAIN,
    )

    return CanonicalGraph(
        id=work.id,
        title=work.title,
        accent=work.accent,
        nodes=nodes,
        edges=edges,
        provenance=provenance,
        segment_labels={str(n): f"第{n}回" for n, _ in chapters},
    ).sorted()


def _aliases(figure: dict, zh_forms: list[str]) -> tuple[str, ...]:
    seen = {figure["zh_label"], figure["label"]}
    aliases = []
    for form in zh_forms:
        if form not in seen:
            seen.add(form)
            aliases.append(form)
    return tuple(aliases)


def _resolve_surface_forms(figures: dict[str, dict], work: Work) -> dict[str, str]:
    by_label: dict[str, set[str]] = defaultdict(set)
    by_alias: dict[str, set[str]] = defaultdict(set)

    for qid, figure in figures.items():
        for form, is_primary in _name_forms(figure, work):
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


def _name_forms(figure: dict, work: Work) -> list[tuple[str, bool]]:
    primary = figure["zh_label"].strip()
    seen: set[str] = set()
    out: list[tuple[str, bool]] = []
    for i, raw in enumerate([primary, *figure["zh"]]):
        form = raw.strip()
        if not _is_chinese_name(form, work) or form in seen:
            continue
        seen.add(form)
        out.append((form, i == 0 and form == primary))
    if _is_chinese_name(primary, work) and len(primary) >= 3:
        short = primary[1:]
        if _is_chinese_name(short, work) and short not in seen:
            out.append((short, False))
    return out


def _is_chinese_name(form: str, work: Work) -> bool:
    form = form.strip()
    blocked = GENERIC | work.extra_generic
    return form not in blocked and bool(CJK.fullmatch(form))


def _figures(work: Work, raw: Path) -> dict[str, dict]:
    path = raw / "wikidata-figures.json"
    if path.exists():
        payload = json.loads(path.read_text(encoding="utf-8"), strict=False)
        return {qid: _figure_from_cache(record) for qid, record in payload.items()}

    query = f"""
SELECT DISTINCT ?p ?links WHERE {{
  {{ wd:{work.work_qid} wdt:P674 ?p }}
  UNION {{
    ?p wdt:P1441 wd:{work.work_qid} .
    ?p wdt:P31 wd:Q15632617
  }}
  ?p wikibase:sitelinks ?links .
}}
"""
    payload = _sparql(query)

    figures: dict[str, dict] = {}
    for row in payload["results"]["bindings"]:
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
        url = (
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
        )
        last: Exception | None = None
        body = None
        for attempt in range(6):
            try:
                body = json.loads(get(url).decode("utf-8"), strict=False)
                break
            except urllib.error.HTTPError as exc:
                last = exc
                if exc.code not in (429, 500, 502, 503) or attempt == 5:
                    raise
                time.sleep(15 * (attempt + 1))
        if body is None:
            raise last
        for qid, entity in (body.get("entities") or {}).items():
            if qid not in figures:
                continue
            figures[qid] = _figure_from_entity(figures[qid], entity)
        if start + 50 < len(figures):
            time.sleep(1.0)

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


def _chapters(work: Work, raw: Path) -> list[tuple[int, str]]:
    path = raw / f"gutenberg-{work.gutenberg_id}.txt"
    if not path.exists():
        get(f"https://www.gutenberg.org/ebooks/{work.gutenberg_id}.txt.utf-8", dest=path)
    text = path.read_text(encoding="utf-8")

    start = text.index("*** START OF THE PROJECT GUTENBERG EBOOK")
    end = text.index("*** END OF THE PROJECT GUTENBERG EBOOK")
    body = text[text.index("\n", start) + 1 : end]

    accepted: list[tuple[int, re.Match[str]]] = []
    seen: set[int] = set()
    for match in HEADING.finditer(body):
        number = _chapter_number(match.group(1), work.chapter_count)
        if number is None or number in seen:
            continue
        seen.add(number)
        accepted.append((number, match))

    chapters: list[tuple[int, str]] = []
    for i, (number, match) in enumerate(accepted):
        close = accepted[i + 1][1].start() if i + 1 < len(accepted) else len(body)
        chapters.append((number, body[match.end() : close]))

    expected = list(range(1, work.chapter_count + 1))
    found = [n for n, _ in chapters]
    if found != expected:
        raise ValueError(
            f"{work.id}: expected chapters 1–{work.chapter_count}, found {len(found)} "
            f"(first {found[:5]}, last {found[-5:]}). The Gutenberg file's heading "
            f"pattern may have changed."
        )
    return chapters


def _chapter_number(raw: str, maximum: int) -> int | None:
    """Parse 回 numbers as the Gutenberg Chinese files actually write them.

    Classical: 十, 十一, 二十, 九十九. Digit-by-digit with 零/〇/○ as zero:
    第一○回, 第一○○回. Mixed 百 for a few headings: 一百二十.
    """
    value = _read_chinese_int(raw)
    if value is None or not (1 <= value <= maximum):
        return None
    return value


def _read_chinese_int(raw: str) -> int | None:
    if not raw:
        return None
    if "百" in raw:
        left, _, right = raw.partition("百")
        if left and any(ch not in DIGITS for ch in left):
            return None
        hundreds = DIGITS[left] if left else 1
        rest = _read_chinese_int(right) if right else 0
        if rest is None:
            return None
        return hundreds * 100 + rest
    if "十" in raw:
        left, _, right = raw.partition("十")
        if any(ch not in DIGITS for ch in left + right):
            return None
        tens = DIGITS[left] if left else 1
        ones = DIGITS[right] if right else 0
        return tens * 10 + ones
    if any(ch not in DIGITS for ch in raw):
        return None
    value = 0
    for ch in raw:
        value = value * 10 + DIGITS[ch]
    return value


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
