"""The Bible — verse co-occurrence in the King James text.

Built here rather than taken ready-made. Every published Bible graph found was
either unusable or unshippable: the KONECT `bible_nouns` network mixes people
with places, so a waking lands you on "Jerusalem"; Theographic and its relatives
are CC BY-SA, which cannot be folded in beside the CC BY-NC-SA graphs already in
`/data` without producing a file that has no valid licence at all. See
raw/bible/SOURCE.md for the survey.

So the graph is assembled from two sources that carry no such problem: the 1769
King James text, which is out of copyright, and Wikidata's biblical figures,
which are CC0. Two people are tied when the same verse names them both.

The hard part is not the graph, it is deciding which capitalised word is a
person. Three things are done about that, in `_resolve_surface_forms` and
`EPONYMS` below, and each of them is a judgement that can be wrong — the coverage
counts printed at build time are the check on it.
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

RAW = Path(__file__).resolve().parent.parent / "raw" / "bible"

KJV = (
    "https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/json/KJV.json"
)

WIKIDATA = "https://query.wikidata.org/sparql"

# Who counts as a person in the Bible, according to Wikidata.
#
# Three branches, because Wikidata does not model this in one place and any
# single branch loses people nobody would accept losing. The class "human
# biblical figure" covers the Hebrew Bible well but does not contain Peter or
# Paul, who are plain humans carrying a "present in work" statement instead; and
# that in turn misses Stephen and Caiaphas, who are reached through their entry
# in a Bible encyclopedia. Together the three cover every major figure spot
# checked. Deliberately *not* included: a branch on "described by source" for
# general encyclopedias, which pulls in tens of thousands of unrelated people.
FIGURES_QUERY = """
SELECT DISTINCT ?p ?pLabel ?links ?alias WHERE {
  { ?p wdt:P31 wd:Q20643955 }
  UNION {
    ?p wdt:P31 wd:Q5 ; wdt:P1441 ?w .
    ?w (wdt:P361|wdt:P179)* ?b .
    VALUES ?b { wd:Q1845 wd:Q19786 wd:Q18813 }
  }
  UNION { ?p wdt:P31 wd:Q5 ; wdt:P1343 wd:Q4086271 }
  ?p wikibase:sitelinks ?links .
  OPTIONAL { ?p skos:altLabel ?alias . FILTER(lang(?alias) = "en") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
"""

# Names that are a people or a place at least as often as they are a person.
#
# This is the trap the whole source is prone to, and it does not arrive through
# the node list — every one of these *is* a person in Wikidata, correctly. It
# arrives through the text. Jacob is also the name of a nation, and "Israel"
# stands in the King James text 2,576 times against "Jacob"'s 377, nearly all of
# them the people rather than the man. Left alone it made Jacob the largest hub
# in the graph on the strength of verses he is not in, and tied him to Moses,
# whom he never met, more heavily than to his own sons.
#
# The sons of Jacob are the awkward case, being both the founding characters of
# Genesis and, for the rest of the book, twelve territories. They are matched
# inside Genesis, where they act, and blocked elsewhere, where their names are
# land. Everything mapped to an empty tuple is blocked outright: the table of
# nations in Genesis 10 is a genealogy of peoples, and its "characters" are
# eponyms who never do anything.
EPONYMS: dict[str, tuple[str, ...]] = {
    "Israel": (),
    "Jeshurun": (),
    "Judah": ("Genesis",),
    "Levi": ("Genesis",),
    "Simeon": ("Genesis",),
    "Reuben": ("Genesis",),
    "Dan": ("Genesis",),
    "Gad": ("Genesis",),
    "Asher": ("Genesis",),
    "Naphtali": ("Genesis",),
    "Issachar": ("Genesis",),
    "Zebulun": ("Genesis",),
    "Benjamin": ("Genesis",),
    "Ephraim": ("Genesis",),
    "Manasseh": ("Genesis",),
    "Canaan": (),
    "Moab": (),
    "Ammon": (),
    "Edom": (),
    "Seir": (),
    "Amalek": (),
    "Midian": (),
    "Cush": (),
    "Mizraim": (),
    "Put": (),
    "Phut": (),
    "Sheba": (),
    "Havilah": (),
    "Jezreel": (),
    "Gilead": (),
    "Aram": (),
    "Elam": (),
    "Asshur": (),
    "Lud": (),
    "Uz": (),
    "Heth": (),
    "Ashkenaz": (),
    "Tarshish": (),
    "Javan": (),
    "Gomer": (),
    "Magog": (),
    "Tubal": (),
    "Meshech": (),
    "Madai": (),
    "Tiras": (),
    "Kedar": (),
    "Nebaioth": (),
    "Dedan": (),
    "Ophir": (),
    "Sidon": (),
    "Riphath": (),
    "Togarmah": (),
    "Anak": (),
    # Towns and districts that are also somebody's name. Kept apart from the
    # nations above because they were found differently: Wikidata lists them as
    # both a person and a place, and the King James text then settles which one
    # it means. Each of these stands after "in", "at", "unto" or "the city of"
    # in two thirds or more of its appearances, against a quarter or less for
    # Joshua, Shimei, Rahab and Seraiah, who are listed the same way but are
    # plainly people in use. Hebron was the clearest case and the most damaging:
    # 68% locative, and a degree-41 hub in the graph before it was removed.
    "Hebron": (),
    "Shiloh": (),
    "Shechem": (),
    "Debir": (),
    "Ephrath": (),
    "Ephron": (),
    "Eshcol": (),
    "Machir": (),
    "Tirzah": (),
    "Ur": (),
}

# How far ahead of its rivals a figure must be to claim a shared name.
DOMINANCE = 2

ATTRIBUTION = Attribution(
    title="The Holy Bible, King James Version (1769 Blayney edition)",
    creator="Public domain text; digital edition via scrollmapper/bible_databases",
    creator_url="https://github.com/scrollmapper",
    source_url="https://github.com/scrollmapper/bible_databases",
    project_url="https://www.wikidata.org/",
    citation=(
        "Text: King James Version, 1769 Blayney revision, public domain. "
        "Identification of persons: Wikidata (CC0 1.0), queried for biblical figures."
    ),
    retrieved="2026-09-18",
    modifications=(
        "Built a character network from the text: two people are tied when a verse names both.",
        "Identified persons from Wikidata rather than from the text, so that places, peoples, "
        "and titles are never nodes.",
        "Resolved shared names to the most prominent claimant, and dropped those too close to call.",
        "Blocked tribal and territorial eponyms, which name a people far more often than a person.",
    ),
)


def load() -> CanonicalGraph:
    figures = _figures()
    surface_forms = _resolve_surface_forms(figures)
    restrictions = _restrictions(surface_forms)
    verses = _verses()

    pattern = re.compile(
        r"\b(" + "|".join(re.escape(f) for f in sorted(surface_forms, key=len, reverse=True)) + r")\b"
    )

    weights: dict[tuple[str, str], float] = defaultdict(float)
    segments: dict[tuple[str, str], set[str]] = defaultdict(set)
    appearances: Counter[str] = Counter()

    for book, text in verses:
        named = set()
        for match in pattern.finditer(text):
            figure = surface_forms[match.group(1)]
            allowed = restrictions.get(figure)
            if allowed is not None and book not in allowed:
                continue
            named.add(figure)

        for figure in named:
            appearances[figure] += 1

        ordered = sorted(named)
        for i, source in enumerate(ordered):
            for target in ordered[i + 1 :]:
                key = (source, target)
                weights[key] += 1
                segments[key].add(book)

    nodes = [
        Node(
            id=qid,
            name=figures[qid]["label"],
            work="bible",
            metadata={"wikidata": qid, "versesNamedIn": appearances[qid]},
        )
        for qid in sorted(appearances)
    ]

    books = _book_order(verses)
    order = {book: i for i, book in enumerate(books)}
    edges = [
        Edge(
            source=source,
            target=target,
            weight=weights[(source, target)],
            type="cooccurrence",
            segments=tuple(sorted(segments[(source, target)], key=order.__getitem__)),
        )
        for source, target in sorted(weights)
    ]

    provenance = Provenance(
        dataset="kjv-verse-cooccurrence-v1",
        edge_definition="people named in the same verse",
        source_unit="book",
        weight_semantics="count of verses naming both, across the whole King James text",
        attribution=dataclasses.replace(ATTRIBUTION),
        license=PUBLIC_DOMAIN,
    )

    return CanonicalGraph(
        id="bible",
        title="The Bible",
        accent="#7A5C3D",
        nodes=nodes,
        edges=edges,
        provenance=provenance,
        segment_labels={book: book for book in books},
    ).sorted()


def _resolve_surface_forms(figures: dict[str, dict]) -> dict[str, str]:
    """Which written name belongs to which person.

    Shared names are the rule in this corpus, not the exception — there are eight
    Abijahs — and a verse naming one of them offers nothing to tell them apart
    with. Two rules decide, in order.

    A figure's own name beats somebody else's nickname. Without this, "Miriam"
    resolved to Mary the mother of Jesus, because Miriam is one of Mary's
    alternative names and Mary is by far the better known of the two; Moses'
    sister was quietly written out of Exodus and her verses handed to the New
    Testament.

    Where a name is nobody's primary name, or is several people's, the best known
    claimant takes it, but only if clearly ahead — the reading an ordinary reader
    would make. Where nobody is clearly ahead, the name is dropped rather than
    guessed, which is why John is absent: the Baptist and the Apostle are too
    close to separate, and inventing a winner would put half of one man's verses
    in the other's ego network.
    """
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


def _restrictions(surface_forms: dict[str, str]) -> dict[str, tuple[str, ...]]:
    """Lift the eponym table from names onto the people who hold them.

    Blocking the written form alone leaks: "Seir" is in the table and "Seir the
    Horite" is not, and both resolve to the same figure, so the name went on
    being matched through the back door and the territory stayed in the graph.
    A restriction belongs to the person, and applies however they are written.

    Where a figure's names disagree, the narrowest wins — a name is suppressed
    where any of its spellings is known to be unreliable.
    """
    restrictions: dict[str, tuple[str, ...]] = {}
    for form, figure in surface_forms.items():
        if form not in EPONYMS:
            continue
        allowed = EPONYMS[form]
        if figure in restrictions:
            allowed = tuple(book for book in allowed if book in restrictions[figure])
        restrictions[figure] = allowed
    return restrictions


def _is_name(form: str) -> bool:
    """A capitalised word or words, long enough not to collide with ordinary
    prose. Three characters is the floor because "Er" and "On" are real biblical
    names and also ordinary English."""
    form = form.strip()
    return len(form) >= 3 and bool(re.fullmatch(r"[A-Z][A-Za-z'\-]*(?: [A-Za-z'\-]+)*", form))


def _figures() -> dict[str, dict]:
    path = RAW / "wikidata-figures.json"
    if not path.exists():
        query = "?query=" + _quote(FIGURES_QUERY)
        get(f"{WIKIDATA}{query}&format=json", dest=path)

    payload = json.loads(path.read_text(encoding="utf-8"), strict=False)

    figures: dict[str, dict] = {}
    for row in payload["results"]["bindings"]:
        qid = row["p"]["value"].rsplit("/", 1)[-1]
        label = row["pLabel"]["value"]
        if re.fullmatch(r"Q\d+", label):
            continue  # no English label; nothing a player could be asked to name
        figure = figures.setdefault(
            qid, {"label": label, "links": int(row["links"]["value"]), "aliases": set()}
        )
        if "alias" in row:
            figure["aliases"].add(row["alias"]["value"])
    return figures


def _verses() -> list[tuple[str, str]]:
    path = RAW / "kjv.json"
    if not path.exists():
        get(KJV, dest=path)
    payload = json.loads(path.read_text(encoding="utf-8"), strict=False)

    verses = []
    for book in payload["books"]:
        name = book["name"]
        for chapter in book["chapters"]:
            for verse in chapter["verses"]:
                verses.append((name, verse.get("text", "")))
    return verses


def _book_order(verses: list[tuple[str, str]]) -> list[str]:
    """Canonical order, which is the order the file is in — not alphabetical."""
    return list(dict.fromkeys(book for book, _ in verses))


def _quote(query: str) -> str:
    from urllib.parse import quote

    return quote(query, safe="")
