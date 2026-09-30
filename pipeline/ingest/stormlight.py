"""The Stormlight Archive — paragraph co-occurrence in the Stormlight Archive Wiki.

The first Cosmere world. Built from the character articles of the Fandom wiki,
read through the MediaWiki API only (the HTML is behind a bot challenge, and the
API is the sanctioned route). Two characters are tied when the same paragraph of
a character article links to both; an article's subject is present in every
paragraph of their own article.

The wiki is CC BY-SA 3.0, so this world is an adaptation under those terms and
ships in its own files. See raw/stormlight/SOURCE.md.
"""

from __future__ import annotations

import dataclasses
import json
import re
import time
import urllib.parse
from collections import defaultdict
from itertools import combinations
from pathlib import Path

from ..canon.licenses import CC_BY_SA_3_0
from ..canon.types import Attribution, CanonicalGraph, Edge, Node, Provenance
from .fetch import get_json

RAW = Path(__file__).resolve().parent.parent / "raw" / "stormlight"
API = "https://stormlightarchive.fandom.com/api.php"
CATEGORY = "Category:Characters"

# The API is anonymous and rate-limited by courtesy, not by contract.
REQUEST_INTERVAL = 1.0
BATCH = 50

# `{{Ref|<book>|c|<chapter>}}` codes → segments, in publication order. Codes not
# listed here (epigraph sources, Words of Brandon) mark no book.
BOOKS = {
    "twok": ("twok", "The Way of Kings"),
    "wor": ("wor", "Words of Radiance"),
    "ed": ("edgedancer", "Edgedancer"),
    "edgedancer": ("edgedancer", "Edgedancer"),
    "ob": ("ob", "Oathbringer"),
    "ds": ("dawnshard", "Dawnshard"),
    "dawnshard": ("dawnshard", "Dawnshard"),
    "row": ("row", "Rhythm of War"),
    "wat": ("wat", "Wind and Truth"),
}
SEGMENT_LABELS = dict(BOOKS.values())

# Sections that are not narrative: links here are editorial cross-references,
# not characters sharing a moment of the story.
SKIP_SECTIONS = {
    "gallery",
    "fan art",
    "references",
    "notes",
    "notes and references",
    "trivia",
    "quotes",
    "external links",
    "see also",
    "sources",
}

ATTRIBUTION = Attribution(
    title="Stormlight Archive Wiki — character articles",
    creator="Stormlight Archive Wiki contributors",
    creator_url="https://stormlightarchive.fandom.com/wiki/Special:ListUsers",
    source_url="https://stormlightarchive.fandom.com/wiki/Category:Characters",
    project_url="https://stormlightarchive.fandom.com/wiki/Cosmere",
    retrieved="2026-09-30",
    modifications=(
        "Read the wikitext of every article in Category:Characters through the MediaWiki API; "
        "no article text is reproduced.",
        "Tied two characters when one paragraph of a character article links to both, counting "
        "an article's subject as present throughout their own article; weight is the number of "
        "such paragraphs.",
        "Dropped non-narrative sections (gallery, references, notes, trivia, quotes).",
        "Took each tie's books from the {{Ref}} chapter citations in the paragraphs behind it.",
        "Resolved wiki redirects to characters and used them, with the infobox aliases, as aliases.",
        "Took gender and nationality from the article infobox as discrete facts.",
    ),
)


INFOBOX_ATTRIBUTION = Attribution(
    title="Stormlight Archive Wiki — character infoboxes",
    creator="Stormlight Archive Wiki contributors",
    creator_url="https://stormlightarchive.fandom.com/wiki/Special:ListUsers",
    source_url="https://stormlightarchive.fandom.com/wiki/Category:Characters",
    retrieved="2026-09-30",
    modifications=(
        "Took gender and nationality as discrete facts; the reveal line is composed here, "
        "not copied or paraphrased from the article.",
    ),
)


def load() -> CanonicalGraph:
    pages, redirects = _ensure_raw()

    # A few category members are redirects themselves (`Wit` → `Hoid`): one
    # person, two titles. They are aliases, not characters.
    for title, text in list(pages.items()):
        target = _REDIRECT.match(text)
        if target:
            redirects.setdefault(title, _normalise_title(target.group(1)))
            del pages[title]

    titles = set(pages)
    resolve = _resolver(titles, redirects)
    names = _display_names(titles)
    ids = {title: _slug(title) for title in titles}

    weights: dict[tuple[str, str], float] = defaultdict(float)
    segments: dict[tuple[str, str], set[str]] = defaultdict(set)
    infoboxes: dict[str, dict[str, str]] = {}

    for title, text in pages.items():
        infobox, body = _split_infobox(text)
        infoboxes[title] = infobox
        units = [(_links(v, resolve), set()) for v in infobox.values()]
        units += [(_links(line, resolve), _books(line)) for line in _paragraphs(body)]
        for linked, books in units:
            present = sorted({ids[title]} | {ids[t] for t in linked})
            for a, b in combinations(present, 2):
                weights[(a, b)] += 1
                segments[(a, b)].update(books)

    present = {nid for pair in weights for nid in pair}
    order = {segment: i for i, segment in enumerate(SEGMENT_LABELS)}
    aliases = _aliases(titles, redirects, infoboxes, names)

    nodes = []
    for title in sorted(titles, key=ids.__getitem__):
        nid = ids[title]
        if nid not in present:
            continue
        infobox = infoboxes[title]
        metadata = {}
        gender = _plain(infobox.get("gender", "")).lower()
        if gender in ("male", "female"):
            metadata["gender"] = gender.capitalize()
        culture = _first(_plain(infobox.get("nationality", "")) or _plain(infobox.get("ethnicity", "")))
        if culture and culture.lower() not in ("unknown", "n/a", "none"):
            metadata["culture"] = culture
        nodes.append(
            Node(
                id=nid,
                name=names[title],
                aliases=aliases.get(title, ()),
                work="stormlight",
                metadata=metadata,
            )
        )

    edges = [
        Edge(
            source=a,
            target=b,
            weight=weights[(a, b)],
            type="cooccurrence",
            segments=tuple(sorted(segments[(a, b)], key=order.__getitem__)),
        )
        for a, b in sorted(weights)
    ]

    provenance = Provenance(
        dataset="stormlight-fandom-wiki-v1",
        edge_definition=(
            "characters linked from the same paragraph of a wiki character article, the "
            "article's subject counting as present throughout"
        ),
        source_unit="book",
        weight_semantics="count of shared article paragraphs across all character articles",
        attribution=dataclasses.replace(ATTRIBUTION),
        license=CC_BY_SA_3_0,
    )

    return CanonicalGraph(
        id="stormlight",
        title="The Stormlight Archive",
        accent="#3E6A8A",
        nodes=nodes,
        edges=edges,
        provenance=provenance,
        segment_labels=dict(SEGMENT_LABELS),
    ).sorted()


def _ensure_raw() -> tuple[dict[str, str], dict[str, str]]:
    """Article wikitext and redirects, fetched once and cached.

    Delete the directory's JSON files to re-fetch.
    """
    pages_path = RAW / "pages.json"
    redirects_path = RAW / "redirects.json"
    if not pages_path.exists() or not redirects_path.exists():
        RAW.mkdir(parents=True, exist_ok=True)
        titles = _category_members(CATEGORY)
        pages: dict[str, str] = {}
        redirects: dict[str, str] = {}
        for start in range(0, len(titles), BATCH):
            batch = titles[start : start + BATCH]
            pages.update(_contents(batch))
            redirects.update(_redirects_to(batch))
        pages_path.write_text(json.dumps(pages, ensure_ascii=False, indent=1, sort_keys=True), encoding="utf-8")
        redirects_path.write_text(
            json.dumps(redirects, ensure_ascii=False, indent=1, sort_keys=True), encoding="utf-8"
        )
    return (
        json.loads(pages_path.read_text(encoding="utf-8")),
        json.loads(redirects_path.read_text(encoding="utf-8")),
    )


def _query(**params) -> dict:
    params.update(format="json", formatversion="2")
    time.sleep(REQUEST_INTERVAL)
    return get_json(f"{API}?{urllib.parse.urlencode(params)}")


def _paged(**params):
    """Every response of a continued query."""
    cont: dict = {}
    while True:
        response = _query(**params, **cont)
        yield response
        if "continue" not in response:
            return
        cont = response["continue"]


def _category_members(category: str) -> list[str]:
    titles = []
    for response in _paged(action="query", list="categorymembers", cmtitle=category, cmnamespace=0, cmlimit=500):
        titles += [m["title"] for m in response["query"]["categorymembers"]]
    return sorted(set(titles))


def _contents(titles: list[str]) -> dict[str, str]:
    response = _query(
        action="query", prop="revisions", rvprop="content", rvslots="main", titles="|".join(titles)
    )
    pages = {}
    for page in response["query"]["pages"]:
        revisions = page.get("revisions")
        if revisions:
            pages[page["title"]] = revisions[0]["slots"]["main"]["content"]
    return pages


def _redirects_to(titles: list[str]) -> dict[str, str]:
    redirects = {}
    for response in _paged(action="query", prop="redirects", rdprop="title", rdlimit="max", titles="|".join(titles)):
        for page in response["query"]["pages"]:
            for redirect in page.get("redirects", ()):
                redirects[redirect["title"]] = page["title"]
    return redirects


_REDIRECT = re.compile(r"^\s*#REDIRECT\s*\[\[([^\]|#]+)", re.I)
_COMMENT = re.compile(r"<!--.*?-->", re.S)
_REF_TAG = re.compile(r"<ref[^>/]*/>|<ref[^>]*>.*?</ref>", re.S | re.I)
_LINK = re.compile(r"\[\[([^\[\]|#]+)(?:#[^\[\]|]*)?(?:\|([^\[\]]*))?\]\]")
_BOOK_REF = re.compile(r"\{\{\s*Ref\s*\|\s*([A-Za-z]+)", re.I)
_HEADING = re.compile(r"^(=+)\s*(.*?)\s*\1\s*$")
_NAMESPACED = re.compile(r"^(file|image|category|template|user|special)\s*:", re.I)


def _split_infobox(text: str) -> tuple[dict[str, str], str]:
    """The `{{Infobox character}}` fields, and the article with the box removed."""
    text = _REF_TAG.sub("", _COMMENT.sub("", text))
    start = text.lower().find("{{infobox")
    if start < 0:
        return {}, text
    depth, end = 0, len(text)
    i = start
    while i < len(text) - 1:
        pair = text[i : i + 2]
        if pair == "{{":
            depth += 1
            i += 2
            continue
        if pair == "}}":
            depth -= 1
            i += 2
            if depth == 0:
                end = i
                break
            continue
        i += 1
    fields = {}
    for line in text[start:end].splitlines():
        match = re.match(r"^\s*\|\s*([\w ]+?)\s*=\s*(.*)$", line)
        if match and match.group(2).strip():
            fields[match.group(1).strip().lower()] = match.group(2).strip()
    return fields, text[:start] + text[end:]


def _paragraphs(body: str):
    """Narrative lines of the article: wikitext keeps each paragraph on one line."""
    section = ""
    for raw in body.splitlines():
        line = raw.strip()
        if not line:
            continue
        heading = _HEADING.match(line)
        if heading:
            if len(heading.group(1)) == 2:
                section = heading.group(2).strip().lower()
            continue
        if section in SKIP_SECTIONS:
            continue
        if line.startswith(("{{", "}}", "{|", "|", "!", "[[File:", "[[Image:", "[[Category:", "__")):
            continue
        yield line


def _links(text: str, resolve) -> set[str]:
    linked = set()
    for match in _LINK.finditer(text):
        target = match.group(1).strip()
        if _NAMESPACED.match(target):
            continue
        title = resolve(target)
        if title:
            linked.add(title)
    return linked


def _books(text: str) -> set[str]:
    return {BOOKS[code.lower()][0] for code in _BOOK_REF.findall(text) if code.lower() in BOOKS}


def _normalise_title(title: str) -> str:
    title = re.sub(r"[\s_]+", " ", title).strip()
    return title[:1].upper() + title[1:]


def _resolver(titles: set[str], redirects: dict[str, str]):
    """Link target → character article title, through one redirect hop."""
    table = {_normalise_title(t): t for t in titles}
    for alias, target in redirects.items():
        if target in titles:
            table.setdefault(_normalise_title(alias), target)
    return lambda target: table.get(_normalise_title(target))


def _display_names(titles: set[str]) -> dict[str, str]:
    """Titles without their disambiguator, unless dropping it makes two collide."""
    base = {t: re.sub(r"\s*\([^)]*\)$", "", t) for t in titles}
    counts = defaultdict(int)
    for name in base.values():
        counts[name] += 1
    return {t: base[t] if counts[base[t]] == 1 else t for t in titles}


def _aliases(titles, redirects, infoboxes, names) -> dict[str, tuple[str, ...]]:
    """Infobox aliases and redirect titles. A form claimed by two characters is dropped."""
    claims: dict[str, set[str]] = defaultdict(set)
    for title in titles:
        for form in re.split(r",|<br\s*/?>|;", infoboxes[title].get("aliases", "")):
            form = _plain(form)
            if form:
                claims[form].add(title)
    for alias, target in redirects.items():
        if target in titles and _is_name(alias, names[target]):
            claims[alias].add(target)

    taken = {name.lower() for name in names.values()}
    collected: dict[str, list[str]] = defaultdict(list)
    for form, owners in sorted(claims.items()):
        if len(owners) != 1 or not 2 <= len(form) <= 40 or not form[0].isupper():
            continue
        owner = next(iter(owners))
        if form.lower() in taken:
            continue
        if form.lower() not in {f.lower() for f in collected[owner]}:
            collected[owner].append(form)
    return {title: tuple(forms) for title, forms in collected.items()}


def _is_name(alias: str, owner: str) -> bool:
    """Whether a redirect title is something the character is called.

    Epithets pass ("Assassin in White"). Descriptions do not: possessives
    ("Eshonai's mother") and section redirects that are the owner's name plus a
    topic ("Dalinar visions").
    """
    if "(" in alias or re.search(r"(?:'s| s) ", alias):
        return False
    words = alias.split()
    if len(words) > 1 and words[0] == owner.split()[0] and any(w[:1].islower() for w in words[1:]):
        return False
    return True


def _plain(value: str) -> str:
    """Wikitext value → display text: links to their labels, markup and templates dropped."""
    value = _LINK.sub(lambda m: (m.group(2) or m.group(1)).strip(), value)
    value = re.sub(r"\{\{[^{}]*\}\}", "", value)
    value = re.sub(r"<[^>]+>", " ", value)
    value = re.sub(r"'{2,}", "", value)
    value = re.sub(r"\([^)]*\)", "", value)
    return re.sub(r"\s+", " ", value).strip(" ,;")


def _first(value: str) -> str:
    return re.split(r",|/| and ", value)[0].strip()


def _slug(title: str) -> str:
    return re.sub(r"[^0-9a-z]+", "_", title.lower()).strip("_")
