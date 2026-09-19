"""The Odyssey — sentence co-occurrence in the Butcher & Lang prose.

Built here rather than taken ready-made. Knuth's GraphBase covers the Iliad,
not this poem, and published Homer networks are either ShareAlike or mix people
with places. The path that already works for the Bible: a public-domain English
text plus Wikidata's people. Two people are tied when the same sentence names
both.

Butcher and Lang write Odysseus and Athene, not Ulysses and Minerva, so the
names a player types are the names in the text.
"""

from __future__ import annotations

import dataclasses
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

from ..canon.licenses import PUBLIC_DOMAIN
from ..canon.types import Attribution, CanonicalGraph, Edge, Node, Provenance
from .fetch import get

RAW = Path(__file__).resolve().parent.parent / "raw" / "odyssey"
GUTENBERG = "https://www.gutenberg.org/ebooks/1728.txt.utf-8"

FIGURES_QUERY = """
SELECT DISTINCT ?p ?links WHERE {
  { wd:Q35160 wdt:P674 ?p }
  UNION {
    ?p wdt:P1441 wd:Q35160 .
    { ?p wdt:P31 wd:Q15632617 }
    UNION { ?p wdt:P31 wd:Q22989102 }
    UNION { ?p wdt:P31 wd:Q22988604 }
    UNION { ?p wdt:P31 wd:Q178885 }
    UNION { ?p wdt:P31 wd:Q5 }
  }
  UNION {
    VALUES ?p {
      wd:Q171839 wd:Q204227 wd:Q41743 wd:Q748296 wd:Q172549
      wd:Q1333846 wd:Q615201 wd:Q496595 wd:Q83213
      wd:Q140478 wd:Q193551 wd:Q172845
    }
  }
  ?p wikibase:sitelinks ?links .
}
"""

# Spellings this translation uses that Wikidata does not treat as English labels.
EXTRA_FORMS = {
    "Q37122": ("Athene", "Pallas Athene"),
    "Q135224": ("Nausicaa", "Nausicaä"),
    "Q579000": ("Antinous", "Antinoos", "Antinoös"),
    "Q1333846": ("Eumaeus", "Eumaios"),
    "Q615201": ("Eurycleia", "Euryclea", "Eurykleia"),
    "Q496595": ("Alcinous", "Alkinoos"),
    "Q171839": ("Menelaus", "Menelaos"),
}

# Common English nouns that are also deities or places in Wikidata. Left in
# they make Dawn the largest hub on the strength of weather.
BLOCKED = {
    "Dawn",
    "Night",
    "Sun",
    "Earth",
    "Sea",
    "Fate",
    "Death",
    "Sleep",
    "Strife",
    "Rumour",
    "Rumor",
    "Troy",
    "Ithaca",
    "Olympus",
}

DOMINANCE = 2
BOOK = re.compile(r"^BOOK ([IVXL]+)\.\s*$", re.MULTILINE)
SENTENCE = re.compile(r"(?<=[.!?])\s+")

ATTRIBUTION = Attribution(
    title="The Odyssey of Homer (Butcher and Lang)",
    creator="Public domain text; digital edition via Project Gutenberg (eBook #1728)",
    creator_url="https://www.gutenberg.org/",
    source_url="https://www.gutenberg.org/ebooks/1728",
    project_url="https://www.wikidata.org/",
    citation=(
        "Text: Homer, The Odyssey, trans. S. H. Butcher and A. Lang, "
        "Project Gutenberg eBook #1728, public domain. "
        "Identification of persons: Wikidata (CC0 1.0), queried for figures of the poem."
    ),
    retrieved="2026-09-18",
    modifications=(
        "Built a character network from the text: two people are tied when a sentence names both.",
        "Identified persons from Wikidata rather than from the text, so that places and "
        "common nouns are never nodes.",
        "Resolved shared names to the most prominent claimant, and dropped those too close to call.",
        "Blocked English common nouns that are also deities (Dawn, Night) and place-names "
        "(Troy, Ithaca).",
    ),
)


def load() -> CanonicalGraph:
    figures = _figures()
    surface_forms = _resolve_surface_forms(figures)
    books = _books()

    if not surface_forms:
        raise ValueError("odyssey: no English names resolved from Wikidata")

    pattern = re.compile(
        r"\b(" + "|".join(re.escape(f) for f in sorted(surface_forms, key=len, reverse=True)) + r")\b"
    )

    weights: dict[tuple[str, str], float] = defaultdict(float)
    segments: dict[tuple[str, str], set[str]] = defaultdict(set)
    appearances: Counter[str] = Counter()
    forms_of: dict[str, list[str]] = defaultdict(list)
    for form, qid in sorted(surface_forms.items(), key=lambda item: (-len(item[0]), item[0])):
        forms_of[qid].append(form)

    for number, text in books:
        segment = str(number)
        for sentence in SENTENCE.split(text.replace("\n", " ")):
            named = {surface_forms[match.group(1)] for match in pattern.finditer(sentence)}
            if len(named) < 1:
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
            name=figures[qid]["label"],
            aliases=tuple(
                form
                for form in forms_of.get(qid, ())
                if form != figures[qid]["label"]
            ),
            work="odyssey",
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
        dataset="odyssey-butcher-lang-sentence-v1",
        edge_definition="people named in the same sentence",
        source_unit="book",
        weight_semantics="count of sentences naming both, across all 24 books",
        attribution=dataclasses.replace(ATTRIBUTION),
        license=PUBLIC_DOMAIN,
    )

    return CanonicalGraph(
        id="odyssey",
        title="The Odyssey",
        accent="#2F5F6F",
        nodes=nodes,
        edges=edges,
        provenance=provenance,
        segment_labels={str(n): f"Book {n}" for n, _ in books},
    ).sorted()


def _resolve_surface_forms(figures: dict[str, dict]) -> dict[str, str]:
    by_label: dict[str, set[str]] = defaultdict(set)
    by_alias: dict[str, set[str]] = defaultdict(set)

    for qid, figure in figures.items():
        if _is_name(figure["label"]):
            by_label[figure["label"]].add(qid)
        for alias in figure["aliases"]:
            if _is_name(alias):
                by_alias[alias].add(qid)

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


def _is_name(form: str) -> bool:
    form = form.strip()
    if form in BLOCKED:
        return False
    return len(form) >= 3 and bool(re.fullmatch(r"[A-Z][A-Za-z'\-]*(?: [A-Za-z'\-]+)*", form))


def _figures() -> dict[str, dict]:
    from urllib.parse import urlencode
    import time

    from .chinese_novel import _batches, _figure_from_entity, _sparql

    path = RAW / "wikidata-figures.json"
    cached = json.loads(path.read_text(encoding="utf-8"), strict=False) if path.exists() else None
    if cached and "results" not in cached:
        figures = {}
        for qid, record in cached.items():
            label = record.get("label") or ""
            if not label or re.fullmatch(r"Q\d+", label) or label[:1].islower():
                continue
            aliases = set(record.get("aliases") or ())
            aliases.update(EXTRA_FORMS.get(qid, ()))
            if " son of " in label:
                short = label.split(" son of ", 1)[0]
                aliases.add(short)
                label = short
            figures[qid] = {"label": label, "links": int(record["links"]), "aliases": aliases}
        return figures

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
    api = "https://www.wikidata.org/w/api.php"
    for start, batch in _batches(sorted(figures), 50):
        body = json.loads(
            get(
                api
                + "?"
                + urlencode(
                    {
                        "action": "wbgetentities",
                        "ids": "|".join(batch),
                        "props": "labels|aliases",
                        "languages": "en",
                        "format": "json",
                    }
                )
            ).decode("utf-8"),
            strict=False,
        )
        for qid, entity in (body.get("entities") or {}).items():
            if qid not in figures:
                continue
            figures[qid] = _figure_from_entity(figures[qid], entity)
        if start + 50 < len(figures):
            time.sleep(0.5)

    kept = {}
    for qid, figure in figures.items():
        label = figure["label"]
        if not label or re.fullmatch(r"Q\d+", label) or label[:1].islower():
            continue
        aliases = set(figure.get("aliases") or ())
        aliases.update(EXTRA_FORMS.get(qid, ()))
        if " son of " in label:
            short = label.split(" son of ", 1)[0]
            aliases.add(short)
            label = short
        kept[qid] = {"label": label, "links": figure["links"], "aliases": sorted(aliases)}

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(kept, ensure_ascii=False, indent=1, sort_keys=True), encoding="utf-8")
    print(f"  cached {len(kept)} Wikidata records → {path.name}")
    return {
        qid: {"label": r["label"], "links": r["links"], "aliases": set(r["aliases"])}
        for qid, r in kept.items()
    }


def _books() -> list[tuple[int, str]]:
    path = RAW / "gutenberg-1728.txt"
    if not path.exists():
        get(GUTENBERG, dest=path)
    text = path.read_text(encoding="utf-8")

    start = text.index("*** START OF THE PROJECT GUTENBERG EBOOK")
    end = text.index("*** END OF THE PROJECT GUTENBERG EBOOK")
    body = text[text.index("\n", start) + 1 : end]

    # The contents page lists BOOK I–XXIV before the poem does. Last match wins.
    by_number: dict[int, re.Match[str]] = {}
    for match in BOOK.finditer(body):
        number = _roman(match.group(1))
        if number is None or not (1 <= number <= 24):
            continue
        by_number[number] = match

    if sorted(by_number) != list(range(1, 25)):
        found = sorted(by_number)
        raise ValueError(
            f"odyssey: expected books 1–24, found {found}. The Gutenberg heading pattern may have changed."
        )

    ordered = [(n, by_number[n]) for n in range(1, 25)]
    books: list[tuple[int, str]] = []
    for i, (number, match) in enumerate(ordered):
        close = ordered[i + 1][1].start() if i + 1 < len(ordered) else len(body)
        books.append((number, body[match.end() : close]))
    return books


def _roman(raw: str) -> int | None:
    values = {"I": 1, "V": 5, "X": 10, "L": 50}
    total = 0
    prev = 0
    for ch in reversed(raw):
        value = values.get(ch)
        if value is None:
            return None
        if value < prev:
            total -= value
        else:
            total += value
            prev = value
    return total
