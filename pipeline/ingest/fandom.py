"""Worlds built from Fandom wikis — paragraph co-occurrence in character articles.

One engine, one `Wiki` per world. Each is read through the MediaWiki API only
(the HTML sits behind a bot challenge, and the API is the sanctioned route). Two
characters are tied when the same paragraph of a character article links to
both; an article's subject is present in every paragraph of their own article.

What differs between wikis is declared, not coded around: which articles are the
cast (a category, per-work categories, or an Appearances section), which
citations say what book a paragraph is about, and which sections are about some
other canon — a video game, a TV adaptation — and so are skipped.

Fandom text is CC BY-SA 3.0 unless a wiki says otherwise (Memory Alpha is
CC BY-NC 4.0), so every world here is an adaptation under its wiki's terms and
ships in its own files. See raw/<world>/SOURCE.md.
"""

from __future__ import annotations

import dataclasses
import functools
import json
import re
import time
import urllib.parse
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from itertools import combinations
from pathlib import Path
from typing import Callable, Iterable, NamedTuple

from ..canon.licenses import CC_BY_NC_4_0, CC_BY_SA_3_0
from ..canon.types import Attribution, CanonicalGraph, Edge, License, Node, Provenance
from .fetch import get_json

RAW = Path(__file__).resolve().parent.parent / "raw"

# The API is anonymous and rate-limited by courtesy, not by contract.
REQUEST_INTERVAL = 1.0
BATCH = 50

# Sections that are not narrative: links here are editorial cross-references,
# not characters sharing a moment of the story.
SKIP_SECTIONS = frozenset({
    "gallery",
    "fan art",
    "references",
    "notes",
    "notes and references",
    "footnotes",
    "trivia",
    "quotes",
    "external links",
    "see also",
    "sources",
    "appearances",
    "behind the scenes",
    "etymology",
    "in other languages",
    "voice actor",
    "portrayals",
})


@dataclass(frozen=True)
class Segment:
    """One book, film or season. `category` and `appearance` say how a character
    is known to be in it, when the wiki records that."""

    id: str
    label: str
    category: str = ""
    appearance: str = ""


class Entry(NamedTuple):
    """One item of an infobox list: its text, and the aside the wiki put beside
    it — `(formerly)`, `<small>mentioned</small>`."""

    text: str
    note: str


class Infobox:
    """An infobox's fields as lists of entries, for reading facts."""

    def __init__(self, fields: dict[str, str], codes: dict[str, dict[str, str]], name: str, aliases=()):
        self.fields = fields
        self.codes = codes
        # A fact must not name the character: facts can be bought before naming.
        self.leaks = [w for w in re.findall(r"[a-z]{3,}", name.lower()) if w not in _NAME_FILLER]
        self.leaks += [a.lower() for a in aliases if len(a) >= 4]

    def entries(self, *names: str) -> list[Entry]:
        """Entries of the first listed field that has any, minus ones naming the character."""
        for name in names:
            found = [
                e for e in _entries(self.fields.get(name, ""), self.codes)
                if e.text.lower() not in _EMPTY_VALUES and not self._leaks(e.text)
            ]
            if found:
                return found
        return []

    def first(self, *names: str, skip: Iterable[str] = ()) -> str:
        """The first entry that is not a listed weak value (case-insensitive)."""
        weak = {s.lower() for s in skip}
        for entry in self.entries(*names):
            if entry.text.lower() not in weak:
                return entry.text
        return ""

    def _leaks(self, text: str) -> bool:
        lower = text.lower()
        return any(re.search(rf"\b{re.escape(w)}\b", lower) for w in self.leaks)


@dataclass(frozen=True)
class Reading:
    """Where a wiki keeps each reveal fact. Each tuple lists infobox fields to
    try in order; the first with any entry wins. The defaults are the names most
    Fandom character infoboxes use."""

    titles: tuple[str, ...] = ("titles", "title", "position", "rank", "ranks")
    occupation: tuple[str, ...] = ("occupation", "profession", "job")
    # One trait from each group of fields: a Hogwarts house, a blood status.
    traits: tuple[tuple[str, ...], ...] = ()
    culture: tuple[str, ...] = ("ethnicity", "nationality", "citizenship")
    species: tuple[str, ...] = ("species", "race")
    affiliations: tuple[str, ...] = ("affiliations", "affiliation", "loyalty")
    # An affiliation is kept only if it matches: some wikis list groups among kin.
    group_pattern: str = ""
    # Words that rank a title or trade first, and a group first, in this order.
    prefer_titles: tuple[str, ...] = ()
    prefer_groups: tuple[str, ...] = ()
    # Words that rule a value out: honorifics, a nationality nearly everyone shares.
    skip: tuple[str, ...] = ()
    # Raw value → what to show, for fields that hold codes ("water" → "Water Tribe").
    values: tuple[tuple[str, str], ...] = ()
    # Word → trait, when the wiki has no field for it and only mentions it.
    vocabulary: tuple[tuple[str, str], ...] = ()
    vocabulary_fields: tuple[str, ...] = ()
    # A birth field written `date, year, <br> place, planet`: the year, and the
    # last place named as the homeworld unless it is everyone's.
    born: tuple[str, ...] = ()
    ordinary_homeworlds: tuple[str, ...] = ()


@dataclass(frozen=True)
class Wiki:
    id: str
    title: str
    accent: str
    host: str
    name: str
    retrieved: str
    segments: tuple[Segment, ...] = ()
    license: License = CC_BY_SA_3_0
    # The cast when segments do not define it: category members, or the articles
    # that use a template (a wiki with no characters category).
    categories: tuple[str, ...] = ()
    templates: tuple[str, ...] = ()
    # An article is a character only if its wikitext opens one of these boxes.
    infoboxes: tuple[str, ...] = ()
    # Titles that are another version of a cast member (`Kira Nerys (mirror)`).
    skip_titles: str = ""
    # Paragraph wikitext → segment ids it cites.
    cites: Callable[[str], set[str]] | None = None
    # Article wikitext → segment ids the character appears in.
    appears: Callable[[str], set[str]] | None = None
    # Paragraph wikitext → whether it cites only another canon (and is skipped).
    offscope: Callable[[str], bool] | None = None
    skip_sections: frozenset[str] = SKIP_SECTIONS
    alias_fields: tuple[str, ...] = ("aliases", "alias", "aka", "nicknames")
    reading: Reading = Reading()
    # Templates that expand a code from a Lua data module: `{{Affiliation|SHD2}}`.
    code_templates: tuple[tuple[str, str], ...] = ()
    # Templates that are links: (name, target, label) with `{1}`, `{2}` for the
    # parameters. `{{dis|Worf|...}}` is as much a link to a character as `[[Worf]]`.
    link_templates: tuple[tuple[str, str, str], ...] = ()
    # Gender from the pronouns of the article's opening, for a wiki with no field.
    gender_from_pronouns: bool = False
    # What the reveal facts are, for the sidecar's attribution.
    fact_fields: str = "gender, nationality and species"
    source_unit: str = "book"
    scope_note: str = ""
    extra_modifications: tuple[str, ...] = field(default_factory=tuple)

    @property
    def raw(self) -> Path:
        return RAW / self.id

    @property
    def api(self) -> str:
        return f"https://{self.host}/api.php"

    @property
    def attribution(self) -> Attribution:
        scope = self.scope_note or "character articles"
        return Attribution(
            title=f"{self.name} — {scope}",
            creator=f"{self.name} contributors",
            creator_url=f"https://{self.host}/wiki/Special:ListUsers",
            source_url=f"https://{self.host}/wiki/Special:AllPages",
            project_url=f"https://{self.host}/",
            retrieved=self.retrieved,
            modifications=(
                "Read the wikitext of the character articles through the MediaWiki API; "
                "no article text is reproduced.",
                "Tied two characters when one paragraph of a character article links to both, "
                "counting an article's subject as present throughout their own article; weight is "
                "the number of such paragraphs.",
                "Dropped non-narrative sections (gallery, references, notes, trivia, quotes, "
                "behind the scenes) and sections about other canons.",
                *self.extra_modifications,
                "Resolved wiki redirects to characters and used them, with the infobox aliases, "
                "as aliases.",
                f"Took {self.fact_fields} from the article infobox as discrete facts.",
            ),
        )

    @property
    def infobox_attribution(self) -> Attribution:
        return Attribution(
            title=f"{self.name} — character infoboxes",
            creator=f"{self.name} contributors",
            creator_url=f"https://{self.host}/wiki/Special:ListUsers",
            source_url=f"https://{self.host}/wiki/Special:AllPages",
            retrieved=self.retrieved,
            modifications=(
                f"Took {self.fact_fields} as discrete facts; the reveal line is composed here, "
                "not copied or paraphrased from the article.",
                "Left out any fact that names the character, since facts can be read before naming.",
            ),
        )


def load(wiki: Wiki) -> CanonicalGraph:
    pages, redirects, listings = _ensure_raw(wiki)

    # A few cast members are redirects themselves (`Wit` → `Hoid`): one person,
    # two titles. They are aliases, not characters.
    for title, text in list(pages.items()):
        target = _REDIRECT.match(text)
        if target:
            redirects.setdefault(title, _normalise_title(target.group(1)))
            del pages[title]
    if wiki.link_templates:
        pages = {title: _expand_link_templates(text, wiki.link_templates) for title, text in pages.items()}

    cast = _cast(wiki, pages, listings)
    titles = set(cast)
    resolve = _resolver(titles, redirects)
    names = _display_names(titles)
    ids = {title: _slug(title) for title in titles}
    segment_order = {segment.id: i for i, segment in enumerate(wiki.segments)}

    weights: dict[tuple[str, str], float] = defaultdict(float)
    cited: dict[tuple[str, str], set[str]] = defaultdict(set)
    infoboxes: dict[str, dict[str, str]] = {}

    for title in titles:
        infobox, body = _split_infobox(pages[title])
        infoboxes[title] = infobox
        units = [(_links(v, resolve), set()) for v in infobox.values()]
        for line in _paragraphs(body, wiki.skip_sections):
            books = wiki.cites(line) if wiki.cites else set()
            if not books and wiki.offscope and wiki.offscope(line):
                continue
            units.append((_links(line, resolve), books))
        for linked, books in units:
            present = sorted({ids[title]} | {ids[t] for t in linked})
            for a, b in combinations(present, 2):
                weights[(a, b)] += 1
                cited[(a, b)].update(books)

    # A tie with no citation behind it takes the works both characters are
    # recorded in. Weaker — "both appear in this film" is not "together in
    # it" — but where the wiki cites nothing it is the only reading there is.
    appears = {ids[title]: cast[title] for title in titles}
    segments = {pair: books or (appears[pair[0]] & appears[pair[1]]) for pair, books in cited.items()}
    # Where the wiki lists each character's appearances, a cited series neither
    # of them appears in is a paragraph recalling someone else's history: Spock's
    # article citing TOS beside a mention of Picard does not put Picard in TOS.
    if wiki.appears:
        for (a, b), books in segments.items():
            for side in (a, b):
                if appears[side]:
                    books = books & appears[side]
            segments[(a, b)] = books

    present = {nid for pair in weights for nid in pair}
    aliases = _aliases(titles, redirects, infoboxes, names, wiki.alias_fields)
    codes = _ensure_codes(wiki)
    people = set(names.values()) | {form for forms in aliases.values() for form in forms}

    cast = [title for title in sorted(titles, key=ids.__getitem__) if ids[title] in present]
    metadata = [
        _metadata(
            Infobox(_infobox_fields(pages[title]), codes, names[title], aliases.get(title, ())),
            wiki,
            people,
            set(names.values()) | {form for form in people if " " in form},
        )
        for title in cast
    ]
    if wiki.gender_from_pronouns:
        for title, facts in zip(cast, metadata):
            if "gender" not in facts:
                gender = _pronoun_gender(_split_infobox(pages[title])[1], wiki.skip_sections)
                if gender:
                    facts["pronounGender"] = gender
    _drop_common(metadata)
    _as_written(metadata, [pages[title] for title in cast])
    nodes = [
        Node(id=ids[title], name=names[title], aliases=aliases.get(title, ()), work=wiki.id, metadata=facts)
        for title, facts in zip(cast, metadata)
    ]

    edges = [
        Edge(
            source=a,
            target=b,
            weight=weights[(a, b)],
            type="cooccurrence",
            segments=tuple(sorted(segments[(a, b)], key=segment_order.__getitem__)),
        )
        for a, b in sorted(weights)
    ]

    provenance = Provenance(
        dataset=f"{wiki.id}-fandom-wiki-v1",
        edge_definition=(
            "characters linked from the same paragraph of a wiki character article, the "
            "article's subject counting as present throughout"
        ),
        source_unit=wiki.source_unit,
        weight_semantics="count of shared article paragraphs across all character articles",
        attribution=dataclasses.replace(wiki.attribution),
        license=wiki.license,
    )

    return CanonicalGraph(
        id=wiki.id,
        title=wiki.title,
        accent=wiki.accent,
        nodes=nodes,
        edges=edges,
        provenance=provenance,
        segment_labels={segment.id: segment.label for segment in wiki.segments},
    ).sorted()


def _metadata(box: Infobox, wiki: Wiki, people: set[str], names: set[str]) -> dict:
    """Gender and the world's facts. An affiliation that is a person (a liege,
    an employer) is a relationship, not a group, and is dropped."""
    metadata = {}
    gender = box.first("gender", "sex").lower()
    pronouns = box.first("pronouns").lower()
    if gender in ("male", "female"):
        metadata["gender"] = gender.capitalize()
    elif pronouns.startswith(("he/", "she/")):
        metadata["gender"] = "Male" if pronouns.startswith("he/") else "Female"
    for key, value in _read(box, wiki.reading).items():
        if key == "affiliations":
            value = [v for v in value if not _names_person(v, people, names)]
        if value:
            metadata[key] = value
    return metadata


_HE = re.compile(r"\b(?:he|him|his|himself)\b", re.I)
_SHE = re.compile(r"\b(?:she|her|hers|herself)\b", re.I)
PRONOUN_PARAGRAPHS = 3
PRONOUN_MIN = 3


def _pronoun_gender(body: str, skip: frozenset[str]) -> str:
    """Male or Female when the article's first paragraphs, which are about
    their subject, use one set of pronouns at least three times as often as
    the other, and at least three times; otherwise nothing."""
    lead = " ".join(_LINK.sub(lambda m: m.group(2) or m.group(1), line)
                    for line, _ in zip(_paragraphs(body, skip), range(PRONOUN_PARAGRAPHS)))
    he, she = len(_HE.findall(lead)), len(_SHE.findall(lead))
    if he >= PRONOUN_MIN and he >= 3 * she:
        return "Male"
    if she >= PRONOUN_MIN and she >= 3 * he:
        return "Female"
    return ""


def _expand_link_templates(text: str, templates: tuple[tuple[str, str, str], ...]) -> str:
    """`{{dis|Worf|Klingon}}` → `[[Worf (Klingon)|Worf]]`, for each declared template.
    The first letter of a template name is case-insensitive, as on the wiki."""
    for name, target, label in templates:
        pattern = re.compile(
            r"\{\{\s*[%s%s]%s\s*\|([^{}|]+)(?:\|([^{}|]*))?(?:\|[^{}]*)?\}\}"
            % (name[0].upper(), name[0].lower(), re.escape(name[1:]))
        )

        def link(match: re.Match) -> str:
            first, second = match.group(1).strip(), (match.group(2) or "").strip()
            fill = lambda form: form.replace("{1}", first).replace("{2}", second)  # noqa: E731
            to = fill(target) if second or "{2}" not in target else first
            return f"[[{to.strip()}|{fill(label).strip()}]]"

        text = pattern.sub(link, text)
    return text


def _as_written(metadata: list[dict], texts: list[str]) -> None:
    """Groups and traits as the wiki writes them in running text: whether a
    group takes "the" ("the Avengers", but "Stark Industries"), and a trait's
    case mid-sentence ("pure-blood"). A group the text never mentions gets no
    article here, and the describer falls back on its own rule."""
    groups = {a for m in metadata for a in m.get("affiliations", ())}
    traits = {t for m in metadata for t in m.get("traits", ())}
    usage = _usage(texts, groups | traits)
    for m in metadata:
        if m.get("traits"):
            m["traits"] = [_usual_form(t, usage) for t in m["traits"]]
        articles = {}
        for group in m.get("affiliations", ()):
            seen = usage.get(group.lower())
            # A name that opens with "The", or a possessive, never takes another article.
            if group.startswith("The ") or "'s " in group:
                articles[group] = ""
            elif seen and seen.total:
                articles[group] = "the" if seen.after_the * 2 > seen.total else ""
        if articles:
            m["articles"] = articles


class _Seen(NamedTuple):
    total: int
    after_the: int
    forms: Counter


# "member of the Avengers", "joined Stark Industries": where a group's article
# is a choice. Elsewhere it is not ("two Death Eaters", "a Hydra agent").
_GROUP_SLOT = re.compile(r"\b(?:of|in|to|by|with|from|for|joined|within|against|into|left)( the)? $")


def _usage(texts: list[str], phrases: set[str]) -> dict[str, _Seen]:
    """Lower-cased phrase → how often the texts put it after a preposition, how
    often with "the" between, and how it is capitalised away from the start of a
    sentence or line. Italics are titles of works, not the thing itself."""
    by_first: dict[str, list[str]] = defaultdict(list)
    for phrase in phrases:
        words = phrase.lower().split()
        if words:
            by_first[words[0]].append(phrase.lower())
    totals: Counter = Counter()
    after_the: Counter = Counter()
    forms: dict[str, Counter] = defaultdict(Counter)
    for text in texts:
        prose = _LINK.sub(lambda m: (m.group(2) or m.group(1)).strip(), text).replace("'''", "")
        prose = re.sub(r"''[^'\n]*''", " ", prose)
        lower = prose.lower()
        for match in re.finditer(r"[\w.'-]+", lower):
            token = match.group()
            # "S.H.I.E.L.D." at the end of a sentence, or the wiki's own spelling.
            candidates = set(by_first.get(token, ())) | set(by_first.get(token.rstrip(".'-"), ()))
            for phrase in candidates:
                start, end = match.start(), match.start() + len(phrase)
                if not lower.startswith(phrase, start) or (end < len(lower) and lower[end].isalnum()):
                    continue
                slot = _GROUP_SLOT.search(lower, max(0, start - 20), start)
                if slot:
                    totals[phrase] += 1
                    after_the[phrase] += bool(slot.group(1))
                # Case only from mid-sentence, and not inside a longer name
                # ("Half-Blood Prince", "The Last Airbender").
                before = prose[max(0, start - 30):start]
                after = prose[end:end + 30]
                if (
                    before.rstrip(" ")[-1:] not in ("", *".!?*=|\n:")
                    and not re.search(r"[A-Z][\w'-]* $", before)
                    and not re.match(r" [A-Z]", after)
                ):
                    forms[phrase][prose[start:end]] += 1
    return {p: _Seen(totals[p], after_the[p], forms[p]) for p in set(totals) | set(forms)}


def _usual_form(phrase: str, usage: dict[str, _Seen]) -> str:
    seen = usage.get(phrase.lower())
    if not seen or not seen.forms:
        return phrase
    return seen.forms.most_common(1)[0][0]


def _drop_common(metadata: list[dict]) -> None:
    """Drop affiliations most of the cast shares: "Hogwarts" says nothing about
    one Hogwarts student. Then keep each character's first two."""
    held = Counter(a for m in metadata for a in m.get("affiliations", ()))
    common = {a for a, n in held.items() if n > COMMON_SHARE * len(metadata)}
    for m in metadata:
        kept = [a for a in m.pop("affiliations", ()) if a not in common][:2]
        if kept:
            m["affiliations"] = kept


# --- reveal facts -------------------------------------------------------------
#
# Infoboxes describe a character as of the wiki's latest canon, so the last
# office held is often a spoiler or comes from a sequel. Entries the wiki marks
# as past, claimed or feigned are passed over, and a world's preferred words
# rank what a character is known as throughout ahead of what they became.

_NAME_FILLER = frozenset({"the", "and", "von", "van", "der", "des", "del"})
_EMPTY_VALUES = frozenset({"", "unknown", "none", "n/a", "?", "various", "unnamed"})
_HUMAN = frozenset({"human", "humans", "human being", "mortal"})
# Never used: not held in earnest, outside the canon, or from an epilogue era.
_NEVER = ("claimant", "undercover", "unwilling", "honorary", "games", "disputed", "self-proclaimed", "as of")
# Used only when nothing current is listed.
_PAST = ("formerly", "former", "posthumous", "retired", "briefly")
# A form of address, not a title.
_HONORIFICS = frozenset({"mr", "mr.", "mrs", "mrs.", "ms", "miss", "madam", "madame", "mister", "sir", "lady", "lord"})
COMMON_SHARE = 0.3


def _read(box: Infobox, reading: Reading) -> dict:
    values = dict(reading.values)

    def listed(fields: tuple[str, ...], prefer: tuple[str, ...] = (), past: bool = True) -> list[str]:
        entries = [
            Entry(values.get(e.text.lower(), e.text), e.note) for e in box.entries(*fields)
            if not any(n in e.note for n in _NEVER)
            and " or " not in e.text
            and e.text.lower() not in _HONORIFICS
            and not any(_has_word(e.text, word) for word in reading.skip)
        ]
        now = [e.text for e in entries if not any(n in e.note for n in _PAST)]
        return _ranked(list(dict.fromkeys(now or ([e.text for e in entries] if past else []))), prefer)

    def first(fields: tuple[str, ...], prefer: tuple[str, ...] = (), past: bool = True) -> str:
        return (listed(fields, prefer, past) or [""])[0]

    kind = first(reading.species)
    if kind.lower() in _HUMAN:
        kind = ""
    mentioned = " ".join(
        f"{e.text} {e.note}" for name in reading.vocabulary_fields for e in box.entries(name)
    )
    # The one the wiki names first: a bloodbender's fighting style opens with waterbending.
    found = [(m.start(), trait) for word, trait in reading.vocabulary for m in [_word(word).search(mentioned)] if m]
    traits = [min(found)[1]] if found else []
    traits += [first(fields) for fields in reading.traits]
    # One or the other: an occupation listed beside a title is often a later
    # job. The title stands unless only the occupation is a preferred word.
    # A trade given up is as likely a later one as an earlier one, so only
    # titles and groups fall back on what a character used to be.
    titles = listed(reading.titles, reading.prefer_titles)[:1]
    occupation = first(reading.occupation, reading.prefer_titles, past=False)
    preferred = lambda text: any(_has_word(text, word) for word in reading.prefer_titles)
    if titles and occupation:
        if preferred(occupation) and not preferred(titles[0]):
            titles = []
        else:
            occupation = ""
    # A people says more than "Human"; for anyone else the species says more.
    culture = "" if kind else first(reading.culture).split("/")[0]
    traits = [t for t in traits if t]
    pattern = re.compile(reading.group_pattern) if reading.group_pattern else None
    # A group already said as a people or a trait ("Gryffindor") adds nothing.
    said = {culture.lower(), *(t.lower() for t in traits)}
    born, homeworld = _birth(box, reading)
    return {
        "titles": titles,
        "occupation": occupation,
        "traits": traits,
        "culture": culture,
        "species": kind,
        "homeworld": homeworld,
        "born": born,
        "affiliations": [
            g for g in listed(reading.affiliations, reading.prefer_groups)
            if g.lower() not in said and (not pattern or pattern.search(g))
        ],
    }


_YEAR = re.compile(r"\d{3,4}")
_CENTURY = re.compile(r"\d{1,2}(?:st|nd|rd|th) century", re.I)
_MONTHS = frozenset({
    "january", "february", "march", "april", "may", "june", "july", "august", "september",
    "october", "november", "december",
})


def _birth(box: Infobox, reading: Reading) -> tuple[str, str]:
    """("In 2305", "Earth") from `July 13, 2305, <br> La Barre, France, Earth`.

    Only a bare year or century is a year: "After 2376" and "Mid-20th century"
    are guesses the wiki hedged, and are left out. The place is the last one
    named, which is the planet; a starship is not a homeworld.
    """
    if not reading.born:
        return "", ""
    year = place = ""
    for entry in box.entries(*reading.born):
        text = entry.text
        if _YEAR.fullmatch(text) or _CENTURY.fullmatch(text):
            year = year or (f"In {text}" if _YEAR.fullmatch(text) else f"In the {text}")
        elif not re.search(r"\d", text) and text.lower() not in _MONTHS and not text.startswith(("USS ", "ISS ")):
            place = text
    if place in reading.ordinary_homeworlds:
        place = ""
    return year, place


def _word(word: str) -> re.Pattern:
    """A word or phrase, whole, in either case, singular or plural."""
    return re.compile(rf"(?<!\w){re.escape(word)}s?(?!\w)", re.I)


def _has_word(text: str, word: str) -> bool:
    return _word(word).search(text) is not None


def _significant(text: str) -> set[str]:
    """Words long enough to say the same thing twice: "Chaser" and "Chaser for the Irish team"."""
    return {w for w in re.findall(r"\w{4,}", text.lower())}


def _ranked(texts: list[str], prefer: Iterable[str]) -> list[str]:
    """Texts containing a preferred word (whole word, so "Prince" does not find
    "Highprince") first, in preference order, then the rest as the wiki lists them."""
    ranked = []
    for word in prefer:
        ranked += [t for t in texts if t not in ranked and _has_word(t, word)]
    return ranked + [t for t in texts if t not in ranked]


def _names_person(value: str, people: set[str], names: set[str]) -> bool:
    """A person, or one with a title ("King Henselt of Kaedwen"): a relationship,
    not a group. A possessive names a group ("Renfri's band")."""
    if value in people:
        return True
    lower = value.lower()
    # The substring test first: a cast of thousands would otherwise compile a
    # regex per name per value.
    return "'s " not in value and any(name.lower() in lower and _has_word(value, name) for name in names)


# --- the cast ---------------------------------------------------------------


def _cast(wiki: Wiki, pages: dict[str, str], listings: dict[str, list[str]]) -> dict[str, set[str]]:
    """Character article title → the segments it is recorded in."""
    cast: dict[str, set[str]] = defaultdict(set)
    for segment in wiki.segments:
        if segment.category:
            for title in listings.get(segment.category, ()):
                cast[title].add(segment.id)
    for listing in (*wiki.categories, *wiki.templates):
        for title in listings.get(listing, ()):
            cast.setdefault(title, set())

    appearance = {s.appearance: s.id for s in wiki.segments if s.appearance}
    if appearance:
        for title, text in pages.items():
            books = _appearances(text, appearance)
            if books:
                cast[title] |= books

    skip = re.compile(wiki.skip_titles) if wiki.skip_titles else None
    kept = {}
    for title, books in cast.items():
        text = pages.get(title)
        # Subpages are a character's adaptation variants (`Paul Atreides/2021 film`).
        if text is None or "/" in title or (skip and skip.search(title)):
            continue
        if wiki.infoboxes and not any(f"{{{{{box.lower()}" in text.lower() for box in wiki.infoboxes):
            continue
        kept[title] = books | (wiki.appears(text) if wiki.appears else set())
    return kept


def _appearances(text: str, templates: dict[str, str]) -> set[str]:
    """Books from an `==Appearances==` list of `*{{PS}}`-style entries.

    A bare template is the book; a parameter (`{{PS|F}}`, `{{PS|G}}`) is its film
    or game. An entry flagged `{{Mention}}` is a name dropped, not an appearance.
    """
    match = re.search(r"^==\s*Appearances\s*==\s*$(.*?)(?=^==[^=]|\Z)", text, re.M | re.S | re.I)
    if not match:
        return set()
    books = set()
    for line in match.group(1).splitlines():
        entry = re.match(r"^\*\s*\{\{\s*([^|}]+?)\s*\}\}(.*)$", line.strip())
        if entry and entry.group(1) in templates and "mention" not in entry.group(2).lower():
            books.add(templates[entry.group(1)])
    return books


# --- fetching ---------------------------------------------------------------


def _ensure_raw(wiki: Wiki) -> tuple[dict[str, str], dict[str, str], dict[str, list[str]]]:
    """Article wikitext, redirects and cast listings, fetched once and cached.

    Delete the world's JSON files under raw/ to re-fetch.
    """
    raw = wiki.raw
    paths = {name: raw / f"{name}.json" for name in ("pages", "redirects", "listings")}
    if all(path.exists() for path in paths.values()):
        return tuple(json.loads(paths[n].read_text(encoding="utf-8")) for n in ("pages", "redirects", "listings"))

    raw.mkdir(parents=True, exist_ok=True)
    listings = {}
    for category in [s.category for s in wiki.segments if s.category] + list(wiki.categories):
        listings[category] = _category_members(wiki, category)
    for template in wiki.templates:
        listings[template] = sorted(set(_embedding(wiki, template)))
    candidates = {t for titles in listings.values() for t in titles}
    for segment in wiki.segments:
        if segment.appearance:
            candidates |= set(_embedding(wiki, f"Template:{segment.appearance}"))

    titles = sorted(candidates)
    pages: dict[str, str] = {}
    redirects: dict[str, str] = {}
    for start in range(0, len(titles), BATCH):
        batch = titles[start : start + BATCH]
        pages.update(_contents(wiki, batch))
    # Redirects only for articles that are characters: the listing can be far
    # wider than the cast (every page that uses a book template, for one).
    cast = sorted(_cast(wiki, pages, listings))
    for start in range(0, len(cast), BATCH):
        redirects.update(_redirects_to(wiki, cast[start : start + BATCH]))

    for name, payload in (("pages", pages), ("redirects", redirects), ("listings", listings)):
        paths[name].write_text(json.dumps(payload, ensure_ascii=False, indent=1, sort_keys=True), encoding="utf-8")
    return pages, redirects, listings


def _ensure_codes(wiki: Wiki) -> dict[str, dict[str, str]]:
    """Code → wikitext for each code template, read from its Lua data module.

    Cached in raw/<world>/codes.json; delete it to re-fetch.
    """
    if not wiki.code_templates:
        return {}
    path = wiki.raw / "codes.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    modules = _contents(wiki, [module for _, module in wiki.code_templates])
    codes = {}
    for template, module in wiki.code_templates:
        if module not in modules:
            raise ValueError(f"{wiki.id}: {module} does not exist on {wiki.host}.")
        # Keys are bare (`SHD2 = "..."`) or quoted titles (`["Mudd's Women"] = "..."`).
        pairs = re.findall(
            r'^\s*(?:\["((?:[^"\\]|\\.)*)"\]|\[?"?([\w-]+)"?\]?)\s*=\s*"((?:[^"\\]|\\.)*)"', modules[module], re.M
        )
        codes[template] = {quoted or bare: value for quoted, bare, value in pairs}
    path.write_text(json.dumps(codes, ensure_ascii=False, indent=1, sort_keys=True), encoding="utf-8")
    return codes


def _query(wiki: Wiki, **params) -> dict:
    params.update(format="json", formatversion="2")
    time.sleep(REQUEST_INTERVAL)
    return get_json(f"{wiki.api}?{urllib.parse.urlencode(params)}")


def _paged(wiki: Wiki, **params):
    """Every response of a continued query."""
    cont: dict = {}
    while True:
        response = _query(wiki, **params, **cont)
        yield response
        if "continue" not in response:
            return
        cont = response["continue"]


def _category_members(wiki: Wiki, category: str) -> list[str]:
    titles = []
    for response in _paged(
        wiki, action="query", list="categorymembers", cmtitle=category, cmnamespace=0, cmlimit=500
    ):
        titles += [m["title"] for m in response["query"]["categorymembers"]]
    if not titles:
        raise ValueError(f"{wiki.id}: {category} is empty or does not exist on {wiki.host}.")
    return sorted(set(titles))


def _embedding(wiki: Wiki, template: str) -> list[str]:
    titles = []
    for response in _paged(wiki, action="query", list="embeddedin", eititle=template, einamespace=0, eilimit=500):
        titles += [m["title"] for m in response["query"]["embeddedin"]]
    return titles


def _contents(wiki: Wiki, titles: list[str]) -> dict[str, str]:
    """Wikitext for a batch. Long articles overflow one response, so the query
    is continued until every page has arrived."""
    pages = {}
    for response in _paged(
        wiki, action="query", prop="revisions", rvprop="content", rvslots="main", titles="|".join(titles)
    ):
        for page in response["query"]["pages"]:
            revisions = page.get("revisions")
            if revisions and "content" in revisions[0]["slots"]["main"]:
                pages[page["title"]] = revisions[0]["slots"]["main"]["content"]
    return pages


def _redirects_to(wiki: Wiki, titles: list[str]) -> dict[str, str]:
    redirects = {}
    for response in _paged(
        wiki, action="query", prop="redirects", rdprop="title", rdlimit="max", titles="|".join(titles)
    ):
        for page in response["query"]["pages"]:
            for redirect in page.get("redirects", ()):
                redirects[redirect["title"]] = page["title"]
    return redirects


# --- wikitext ---------------------------------------------------------------

_REDIRECT = re.compile(r"^\s*#REDIRECT\s*\[\[([^\]|#]+)", re.I)
_COMMENT = re.compile(r"<!--.*?-->", re.S)
_REF_TAG = re.compile(r"<ref[^>/]*/>|<ref[^>]*>(.*?)</ref>", re.S | re.I)
_LINK = re.compile(r"\[\[([^\[\]|#]+)(?:#[^\[\]|]*)?(?:\|([^\[\]]*))?\]\]")
_HEADING = re.compile(r"^(=+)\s*(.*?)\s*\1\s*$")
_NAMESPACED = re.compile(r"^(file|image|category|template|user|special)\s*:", re.I)


def _unref(match: re.Match) -> str:
    """A citation keeps only its templates, so the book it names can be read.
    Its text and links are the source's, not the story's."""
    inner = match.group(1) or ""
    return " " + " ".join(re.findall(r"\{\{[^{}]*\}\}", inner)) + " "


def _infobox_span(text: str) -> tuple[int, int] | None:
    match = re.search(r"\{\{\s*(infobox[ _]\w+|\w+[ _]infobox|sidebar[ _](?:individual|hologram)|character\s*(?=\||\n))", text, re.I)
    if not match:
        return None
    start = match.start()
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
    return start, end


def _split_infobox(text: str) -> tuple[dict[str, str], str]:
    """The first infobox's fields, and the article with the box removed.

    A field here is the first line of its value only. The ties and aliases are
    built from that reading; `_infobox_fields` is the full one, for facts.
    """
    text = _REF_TAG.sub(_unref, _COMMENT.sub("", text))
    span = _infobox_span(text)
    if span is None:
        return {}, text
    start, end = span
    fields = {}
    for line in text[start:end].splitlines():
        match = re.match(r"^\s*\|\s*([\w ]+?)\s*=\s*(.*)$", line)
        if match and match.group(2).strip():
            fields[match.group(1).strip().lower()] = match.group(2).strip()
    return fields, text[:start] + text[end:]


def _infobox_fields(text: str) -> dict[str, str]:
    """Every field of the first infobox, with values that run over several lines
    or hold nested templates (`{{Alias|codenames = ...}}`) kept whole."""
    text = _REF_TAG.sub("", _COMMENT.sub("", text))
    text = re.sub(r"<gallery[^>]*>.*?</gallery>", "", text, flags=re.S | re.I)
    span = _infobox_span(text)
    if span is None:
        return {}
    start, end = span
    fields = {}
    for part in _split_top(text[start + 2 : end - 2])[1:]:
        key, eq, value = part.partition("=")
        key = re.sub(r"[\s_]+", " ", key).strip().lower()
        if eq and key and value.strip():
            fields[key] = value.strip()
    return fields


def _split_top(text: str) -> list[str]:
    """Split on `|` outside nested templates and links."""
    parts, depth, current, i = [], 0, [], 0
    while i < len(text):
        pair = text[i : i + 2]
        if pair in ("{{", "[["):
            depth += 1
            current.append(pair)
            i += 2
        elif pair in ("}}", "]]"):
            depth -= 1
            current.append(pair)
            i += 2
        elif text[i] == "|" and depth == 0:
            parts.append("".join(current))
            current = []
            i += 1
        else:
            current.append(text[i])
            i += 1
    parts.append("".join(current))
    return parts


# Templates whose parameters are the list items themselves.
_LIST_TEMPLATES = frozenset({"infobox list", "collapse", "plainlist", "ubl", "unbulleted list", "flatlist", "hlist"})
_INNERMOST = re.compile(r"\{\{([^{}]*)\}\}")
_ASIDE = re.compile(r"<small>(.*?)</small>|\(([^()]*)\)", re.S | re.I)


def _entries(value: str, codes: dict[str, dict[str, str]]) -> list[Entry]:
    """An infobox value as its list items: bullets, line breaks, commas and list
    templates all separate items. Asides go to the entry's note."""

    def expand(match: re.Match) -> str:
        name, *params = _split_top(match.group(1))
        name = name.strip()
        key = name.lower()
        if key in _LIST_TEMPLATES:
            return "\n".join(p for p in params if "=" not in p.split("[[")[0])
        if name in codes and params:
            return codes[name].get(params[0].strip(), "")
        if key == "small" and params:
            return f"<small>{params[0]}</small>"
        return ""

    previous = None
    while previous != value:
        previous, value = value, _INNERMOST.sub(expand, value)
    value = re.sub(r"\[\[(?:file|image):[^\[\]]*\]\]", "", value, flags=re.I)
    value = _LINK.sub(lambda m: (m.group(2) or m.group(1)).strip(), value)

    entries = []
    for line in re.split(r"<br\s*/?>|\n", value, flags=re.I):
        line = line.strip().lstrip("*#:").strip()
        for item in _split_commas(line):
            note = " ".join(a or b for a, b in _ASIDE.findall(item))
            note = " ".join(re.sub(r"<[^>]+>|[()']", " ", note).split()).lower()
            text = _plain(_ASIDE.sub(" ", item)).replace("†", "").strip(" .,;:")
            if text:
                entries.append(Entry(text, note))
    return entries


def _split_commas(line: str) -> list[str]:
    """Commas separate items, except inside parentheses and asides."""
    items, depth, current = [], 0, []
    for token in re.split(r"(\(|\)|<small>|</small>|,)", line, flags=re.I):
        lower = token.lower()
        if token == "(" or lower == "<small>":
            depth += 1
        elif token == ")" or lower == "</small>":
            depth = max(0, depth - 1)
        elif token == "," and depth == 0:
            items.append("".join(current))
            current = []
            continue
        current.append(token)
    items.append("".join(current))
    return [i.strip() for i in items if i.strip()]


def _paragraphs(body: str, skip: frozenset[str]):
    """Narrative lines of the article: wikitext keeps each paragraph on one line.

    A section is skipped when its heading, or any heading above it, is listed in
    `skip` or is itself a template — wikis title another canon's section with its
    abbreviation (`== {{tw3}} ==`).
    """
    open_sections: dict[int, bool] = {}
    for raw in body.splitlines():
        line = raw.strip()
        if not line:
            continue
        heading = _HEADING.match(line)
        if heading:
            level = len(heading.group(1))
            name = heading.group(2).strip()
            open_sections = {k: v for k, v in open_sections.items() if k < level}
            open_sections[level] = name.lower() in skip or name.startswith("{{")
            continue
        if any(open_sections.values()):
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


def _aliases(titles, redirects, infoboxes, names, fields) -> dict[str, tuple[str, ...]]:
    """Infobox aliases and redirect titles. A form claimed by two characters is dropped."""
    claims: dict[str, set[str]] = defaultdict(set)
    for title in titles:
        for name in fields:
            for form in re.split(r",|<br\s*/?>|;|\n\*|^\*", infoboxes[title].get(name, "")):
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
    if "(" in alias or "/" in alias or re.search(r"(?:'s| s) ", alias):
        return False
    words = alias.split()
    if len(words) > 1 and words[0] == owner.split()[0] and any(w[:1].islower() for w in words[1:]):
        return False
    return True


def _plain(value: str) -> str:
    """Wikitext value → display text: links to their labels, markup and templates dropped."""
    value = _LINK.sub(lambda m: (m.group(2) or m.group(1)).strip(), value)
    value = re.sub(r"\[https?://[^\]]*\]", "", value)
    value = re.sub(r"\{\{[^{}]*\}\}", "", value)
    value = re.sub(r"<[^>]+>", " ", value)
    value = re.sub(r"'{2,}", "", value)
    value = re.sub(r"\([^)]*\)", "", value)
    return re.sub(r"\s+", " ", value).strip(" ,;*")


def _slug(title: str) -> str:
    return re.sub(r"[^0-9a-z]+", "_", title.lower()).strip("_")


# --- citations --------------------------------------------------------------


def _template_cites(codes: dict[str, str], allow_params: Callable[[str], bool] = lambda p: True):
    """Citation templates named for their book: `{{BoF}}`, `{{DH|B|E}}`."""
    pattern = re.compile(r"\{\{\s*([A-Za-z0-9]+)\s*(\|[^{}]*)?\}\}")

    def cites(text: str) -> set[str]:
        found = set()
        for name, params in pattern.findall(text):
            if name in codes and allow_params(params.lstrip("|")):
                found.add(codes[name])
        return found

    return cites


def _mentions_any(names: tuple[str, ...]):
    pattern = re.compile(r"\{\{\s*(?:%s)\b" % "|".join(re.escape(n) for n in names), re.I)
    return lambda text: bool(pattern.search(text))


# --- what each world's infobox calls things ------------------------------------

_RADIANT_ORDERS = (
    "Windrunner", "Skybreaker", "Dustbringer", "Edgedancer", "Truthwatcher",
    "Lightweaver", "Elsecaller", "Willshaper", "Stoneward", "Bondsmith",
)

STORMLIGHT_READING = Reading(
    # Houses are listed among kin, not in a field of their own.
    affiliations=("family",),
    group_pattern=r"^House ",
    # A rank held throughout ahead of a crown, which is often taken in a later book.
    prefer_titles=(
        "Wit", "Prince", "Princess", "Highprince", "Highprincess", "Captain", "Highmarshal", "Marshal",
        "General", "Lieutenant", "Sergeant", "Stormwarden", "Ardent",
    ),
    skip=("Brightlord", "Brightlady", "Brightness", "Radiant", "Noble", "Shadesmar"),
    vocabulary=tuple((order, order) for order in _RADIANT_ORDERS),
    vocabulary_fields=("abilities", "occupation", "titles", "title"),
)

HARRY_POTTER_READING = Reading(
    traits=(("house",), ("blood",)),
    prefer_titles=(
        "Dark Lord", "Minister for Magic", "Headmaster", "Headmistress", "Keeper of the Keys",
        "Professor", "Auror", "Triwizard Champion", "Seeker", "Keeper", "Chaser", "Beater",
        "Head Boy", "Head Girl", "Prefect",
    ),
    prefer_groups=("Order of the Phoenix", "Death Eaters", "Dumbledore's Army", "Marauders"),
    # Nearly everyone is English or British; only the exceptions say anything.
    skip=("English", "British", "Half-breed"),
)

WITCHER_READING = Reading(
    prefer_titles=(
        "Emperor", "Empress", "King", "Queen", "Heir", "Heiress", "Prince", "Princess", "Duke", "Duchess",
        "Jarl", "Count", "Countess", "Viscount", "Baron", "Baroness", "Lady", "Lord",
        "Witcher", "Mage", "Druid", "Bard", "Priestess", "Mercenary",
    ),
    skip=("Advisor",),
)

LAST_AIRBENDER_READING = Reading(
    # `position` mixes offices with descriptions ("Refugee") and later-era posts.
    titles=(),
    culture=("ethnicity", "nation"),
    values=(("air", "Air Nomads"), ("water", "Water Tribe"), ("earth", "Earth Kingdom"), ("fire", "Fire Nation")),
    prefer_titles=("Avatar",),
    prefer_groups=("Team Avatar", "Royal Family", "Kyoshi Warriors", "Dai Li", "Freedom Fighters", "White Lotus"),
    # Posts held after the series.
    skip=("instructor", "Ambassador", "Politician"),
    # The four elements first: a bloodbender is a waterbender first.
    vocabulary=tuple(
        (f"{art}bending", f"{art}bender")
        for art in ("air", "water", "earth", "fire", "blood", "metal", "lava", "combustion")
    ),
    vocabulary_fields=("fightingstyle",),
)

MCU_READING = Reading(
    prefer_titles=(
        "God of", "Prince of", "Princess of", "King of", "Queen of", "Director of", "CEO of",
        "General", "Colonel", "Captain", "Sergeant",
    ),
    prefer_groups=(
        "Avengers", "Guardians of the Galaxy", "Hydra", "S.H.I.E.L.D", "Black Order", "Dora Milaje",
        "Ravagers", "Howling Commandos", "Masters of the Mystic Arts", "Stark Industries",
    ),
    skip=("American",),
)


# --- the worlds -------------------------------------------------------------

_STORMLIGHT_REF = re.compile(r"\{\{\s*Ref\s*\|\s*([A-Za-z]+)", re.I)
_STORMLIGHT_BOOKS = {
    "twok": "twok", "wor": "wor", "ed": "edgedancer", "edgedancer": "edgedancer",
    "ob": "ob", "ds": "dawnshard", "dawnshard": "dawnshard", "row": "row", "wat": "wat",
}

STORMLIGHT = Wiki(
    id="stormlight",
    title="The Stormlight Archive",
    accent="#3E6A8A",
    host="stormlightarchive.fandom.com",
    name="Stormlight Archive Wiki",
    retrieved="2026-10-04",
    segments=(
        Segment("twok", "The Way of Kings"),
        Segment("wor", "Words of Radiance"),
        Segment("edgedancer", "Edgedancer"),
        Segment("ob", "Oathbringer"),
        Segment("dawnshard", "Dawnshard"),
        Segment("row", "Rhythm of War"),
        Segment("wat", "Wind and Truth"),
    ),
    categories=("Category:Characters",),
    reading=STORMLIGHT_READING,
    fact_fields="gender, title, occupation, Radiant order, people, species and noble house",
    cites=lambda text: {
        _STORMLIGHT_BOOKS[c.lower()] for c in _STORMLIGHT_REF.findall(text) if c.lower() in _STORMLIGHT_BOOKS
    },
    extra_modifications=("Took each tie's books from the {{Ref}} chapter citations in the paragraphs behind it.",),
)

_HP_BOOKS = (
    ("ps", "Philosopher's Stone", "PS"),
    ("cos", "Chamber of Secrets", "COS"),
    ("poa", "Prisoner of Azkaban", "POA"),
    ("gof", "Goblet of Fire", "GOF"),
    ("ootp", "Order of the Phoenix", "OOTP"),
    ("hbp", "Half-Blood Prince", "HBP"),
    ("dh", "Deathly Hallows", "DH"),
)

HARRY_POTTER = Wiki(
    id="harry-potter",
    title="Harry Potter",
    accent="#7F1D1D",
    host="harrypotter.fandom.com",
    name="Harry Potter Wiki",
    retrieved="2026-10-04",
    segments=tuple(Segment(sid, label, appearance=code) for sid, label, code in _HP_BOOKS),
    infoboxes=("Individual infobox",),
    # `{{PS}}` or `{{PS|B|C1}}` is the book; `{{PS|F}}` the film, `{{PS|G}}` the game.
    cites=_template_cites(
        {code: sid for sid, _, code in _HP_BOOKS},
        allow_params=lambda p: not p or p.split("|")[0] in ("B", ""),
    ),
    offscope=_mentions_any(("HPTV", "FB", "COG", "TSOD", "CC", "HM", "HL", "PM", "LEGO", "HBPG", "DH|G")),
    alias_fields=("alias", "aliases", "nicknames"),
    reading=HARRY_POTTER_READING,
    fact_fields="gender, title, job, Hogwarts house, blood status, nationality, species and allegiances",
    scope_note="characters appearing in the seven novels",
    extra_modifications=(
        "Took the cast from the Appearances section: characters with an entry for one of the "
        "seven novels (not the films or games), unless the entry is only a mention.",
        "Took each tie's books from book citations in the paragraphs behind it, or else the "
        "novels both characters appear in.",
    ),
)

_WITCHER_BOOKS = (
    ("tlw", "The Last Wish", "TLW"),
    ("sod", "Sword of Destiny", "SoD"),
    ("boe", "Blood of Elves", "BoE"),
    ("toc", "Time of Contempt", "ToC"),
    ("bof", "Baptism of Fire", "BoF"),
    ("ttots", "The Tower of the Swallow", "TTotS"),
    ("tlotl", "The Lady of the Lake", "TLotL"),
    ("sos", "Season of Storms", "SoS"),
)

WITCHER = Wiki(
    id="witcher",
    title="The Witcher",
    accent="#5B5B4B",
    host="witcher.fandom.com",
    name="Witcher Wiki",
    retrieved="2026-10-04",
    segments=tuple(Segment(sid, label, category=f"Category:{label} characters") for sid, label, _ in _WITCHER_BOOKS),
    cites=_template_cites({code: sid for sid, _, code in _WITCHER_BOOKS}),
    offscope=_mentions_any(("Tw1", "Tw2", "Tw3", "HoS", "BaW", "TWAG", "TWBA", "Gwent", "Netflix", "Ronin")),
    alias_fields=("aka", "alias", "aliases"),
    reading=WITCHER_READING,
    fact_fields="gender, title, profession, nationality, race and affiliations",
    scope_note="characters of Sapkowski's saga",
    extra_modifications=(
        "Took the cast from the per-book character categories of the eight saga books; game and "
        "television sections are skipped.",
        "Took each tie's books from book citations in the paragraphs behind it, or else the "
        "books both characters appear in.",
    ),
)

_ATLA_BOOKS = (("water", "Book One: Water"), ("earth", "Book Two: Earth"), ("fire", "Book Three: Fire"))
_ATLA_EPISODE = re.compile(r"\{\{\s*Cite episode\s*\|\s*1\s*\|\s*([123])\d\d", re.I)

LAST_AIRBENDER = Wiki(
    id="last-airbender",
    title="Avatar: The Last Airbender",
    accent="#B45309",
    host="avatar.fandom.com",
    name="Avatar Wiki",
    retrieved="2026-10-04",
    segments=tuple(Segment(sid, label) for sid, label in _ATLA_BOOKS),
    categories=("Category:Avatar: The Last Airbender characters",),
    cites=lambda text: {_ATLA_BOOKS[int(n) - 1][0] for n in _ATLA_EPISODE.findall(text)},
    offscope=_mentions_any(("Cite comic", "Cite novel", "Cite game", "Cite film", "Cite episode|2")),
    reading=LAST_AIRBENDER_READING,
    fact_fields="gender, profession, bending art, people and affiliations",
    source_unit="season",
    scope_note="characters of the animated series",
    extra_modifications=(
        "Took each tie's season from the episode citations in the paragraphs behind it; "
        "paragraphs citing only the comics, novels or The Legend of Korra are skipped.",
    ),
)

_MCU_FILMS = (
    ("iron-man", "Iron Man", "Iron Man (film)"),
    ("incredible-hulk", "The Incredible Hulk", "The Incredible Hulk"),
    ("iron-man-2", "Iron Man 2", "Iron Man 2"),
    ("thor", "Thor", "Thor (film)"),
    ("first-avenger", "Captain America: The First Avenger", "Captain America: The First Avenger"),
    ("avengers", "The Avengers", "The Avengers"),
    ("iron-man-3", "Iron Man 3", "Iron Man 3"),
    ("dark-world", "Thor: The Dark World", "Thor: The Dark World"),
    ("winter-soldier", "Captain America: The Winter Soldier", "Captain America: The Winter Soldier"),
    ("guardians", "Guardians of the Galaxy", "Guardians of the Galaxy (film)"),
    ("age-of-ultron", "Avengers: Age of Ultron", "Avengers: Age of Ultron"),
    ("ant-man", "Ant-Man", "Ant-Man (film)"),
    ("civil-war", "Captain America: Civil War", "Captain America: Civil War"),
    ("doctor-strange", "Doctor Strange", "Doctor Strange (film)"),
    ("guardians-2", "Guardians of the Galaxy Vol. 2", "Guardians of the Galaxy Vol. 2"),
    ("homecoming", "Spider-Man: Homecoming", "Spider-Man: Homecoming"),
    ("ragnarok", "Thor: Ragnarok", "Thor: Ragnarok"),
    ("black-panther", "Black Panther", "Black Panther (film)"),
    ("infinity-war", "Avengers: Infinity War", "Avengers: Infinity War"),
    ("ant-man-wasp", "Ant-Man and the Wasp", "Ant-Man and the Wasp"),
    ("captain-marvel", "Captain Marvel", "Captain Marvel (film)"),
    ("endgame", "Avengers: Endgame", "Avengers: Endgame"),
    ("far-from-home", "Spider-Man: Far From Home", "Spider-Man: Far From Home"),
)

MCU = Wiki(
    id="mcu",
    title="The Marvel Cinematic Universe",
    accent="#9F1239",
    host="marvelcinematicuniverse.fandom.com",
    name="Marvel Cinematic Universe Wiki",
    retrieved="2026-10-04",
    segments=tuple(Segment(sid, label, category=f"Category:{page} Characters") for sid, label, page in _MCU_FILMS),
    # Articles are titled by whichever name the films lean on — "Iron Man" but
    # "Steve Rogers" — so the other name must reach the type-ahead.
    alias_fields=("real name", "alias", "aliases"),
    code_templates=(
        ("Affiliation", "Module:Affiliation/data"),
        ("Citizenship", "Module:Citizenship/data"),
        ("Military Rank", "Module:Military Rank/data"),
    ),
    reading=MCU_READING,
    fact_fields="gender, title, citizenship, species and affiliations",
    source_unit="film",
    scope_note="characters of the Infinity Saga films",
    extra_modifications=(
        "Took the cast from the character categories of the 23 Infinity Saga films "
        "(Iron Man to Spider-Man: Far From Home).",
        "Gave each tie the films both characters appear in; the wiki's citations do not name films.",
    ),
)

# Memory Alpha's series codes, in order of first broadcast. Short Treks, Very
# Short Treks, Scouts and the like get no segment: a tie they alone cite still
# counts, it just names no series.
_TREK_SERIES = (
    ("tos", "The Original Series", "TOS"),
    ("tas", "The Animated Series", "TAS"),
    ("films", "the films", "FLM"),
    ("tng", "The Next Generation", "TNG"),
    ("ds9", "Deep Space Nine", "DS9"),
    ("voy", "Voyager", "VOY"),
    ("ent", "Enterprise", "ENT"),
    ("dis", "Discovery", "DIS"),
    ("pic", "Picard", "PIC"),
    ("ld", "Lower Decks", "LD"),
    ("pro", "Prodigy", "PRO"),
    ("snw", "Strange New Worlds", "SNW"),
    ("sa", "Starfleet Academy", "SA"),
)
_TREK_CODES = {code: sid for sid, _, code in _TREK_SERIES}
# `{{DS9|Emissary|A Man Alone}}`, `{{TOS-R|...}}` (remastered), or a bare `{{DS9}}`.
_TREK_SERIES_CITE = re.compile(r"\{\{\s*(%s)(?:-R)?\s*[|}]" % "|".join(_TREK_CODES))
_TREK_FILM_CITE = re.compile(r"\{\{\s*film\s*\|", re.I)
# `{{e|A Time to Stand}}` leaves the series to Module:EpisodeData/A; a third
# parameter overrides it.
_TREK_EPISODE_CITE = re.compile(r"\{\{\s*e\s*\|([^|{}]+)(?:\|[^|{}]*)?(?:\|([^|{}]*))?\}\}")
# An appearance only as a hologram, archive footage, a picture or a voice is
# not being there: `{{small|(archive footage)}}`, `{{small|(picture only)}}`.
_TREK_NOT_THERE = re.compile(
    r"\{\{\s*small\s*\|[^{}]*\b(?:only|archive|archival|footage|image|picture|photo|recording|hologram|"
    r"mention|dream|voice)",
    re.I,
)


@functools.cache
def _trek_episodes() -> dict[str, str]:
    """Episode title → series code, from the wiki's own lookup module."""
    return _ensure_codes(STAR_TREK).get("E", {})


def _trek_cites(text: str) -> set[str]:
    found = {_TREK_CODES[code] for code in _TREK_SERIES_CITE.findall(text)}
    if _TREK_FILM_CITE.search(text):
        found.add("films")
    for title, series in _TREK_EPISODE_CITE.findall(text):
        title = re.sub(r"\s*\((?:episode|film)\)$", "", title.strip())
        code = series.strip() or _trek_episodes().get(title, "")
        if code in _TREK_CODES:
            found.add(_TREK_CODES[code])
    return found


# `{{s|DIS}}` names a series. In an appearances list it means all of it; in
# prose it is only a mention, so it is not read as a citation.
_TREK_WHOLE_SERIES = re.compile(r"\{\{\s*s\s*\|\s*(%s)\s*\}\}" % "|".join(_TREK_CODES))


def _trek_appears(text: str) -> set[str]:
    """Series from the `=== Appearances ===` list of an article."""
    match = re.search(r"^=+\s*Appearances\s*=+\s*$(.*?)(?=^=|\Z)", text, re.M | re.S | re.I)
    if not match:
        return set()
    return {
        segment
        for line in match.group(1).splitlines()
        if not _TREK_NOT_THERE.search(line)
        for segment in _trek_cites(line) | {_TREK_CODES[c] for c in _TREK_WHOLE_SERIES.findall(line)}
    }


STAR_TREK_READING = Reading(
    occupation=("occupation",),
    # A rank held through a series ahead of the flag rank many reach in its sequel.
    prefer_titles=(
        "Captain", "Commander", "Lieutenant Commander", "Lieutenant", "Ensign", "Constable",
        "Chancellor", "Grand Nagus", "Gul", "Legate", "Kai", "Doctor",
    ),
    born=("born", "birth date", "birth place"),
    # Most of Starfleet: "of Earth" says nothing about one Human officer.
    ordinary_homeworlds=("Earth",),
)

STAR_TREK = Wiki(
    id="startrek",
    title="Star Trek",
    accent="#6A4C93",
    host="memory-alpha.fandom.com",
    name="Memory Alpha",
    retrieved="2026-10-04",
    segments=tuple(Segment(sid, label) for sid, label, _ in _TREK_SERIES),
    license=CC_BY_NC_4_0,
    # Holograms (the Doctor, Vic Fontaine) carry their own box.
    templates=("Template:Sidebar individual", "Template:Sidebar hologram"),
    # The prime timeline: mirror-universe and Kelvin-timeline counterparts are
    # their own articles, and would be the same character twice.
    skip_titles=r"\((?:mirror|alternate reality)\)$",
    cites=_trek_cites,
    appears=_trek_appears,
    skip_sections=SKIP_SECTIONS | {
        "memorable quotes", "appendices", "apocrypha", "background information", "chronology",
        "related topics", "related articles",
    },
    code_templates=(("E", "Module:EpisodeData/A"),),
    link_templates=(("dis", "{1} ({2})", "{1}"), ("USS", "USS {1} ({2})", "USS {1}")),
    gender_from_pronouns=True,
    reading=STAR_TREK_READING,
    fact_fields="rank, occupation, species, birth year, homeworld and affiliations",
    source_unit="series",
    scope_note="individuals of the prime timeline",
    extra_modifications=(
        "Took the cast from the articles that carry the individual sidebar, leaving out "
        "mirror-universe and Kelvin-timeline counterparts.",
        "Took each tie's series from the episode and film citations in the paragraphs behind it, "
        "or else the series both characters appear in.",
        "Read the wiki's link templates ({{dis}}, {{USS}}) as the links they render.",
        "Where neither the sidebar nor Wikidata gives a gender, took it from the pronouns of the "
        "article's first three paragraphs when one set outnumbers the other three to one.",
    ),
)

WIKIS: dict[str, Wiki] = {
    w.id: w for w in (STORMLIGHT, HARRY_POTTER, WITCHER, LAST_AIRBENDER, MCU, STAR_TREK)
}


def loader(world: str) -> Callable[[], CanonicalGraph]:
    return lambda: load(WIKIS[world])


def title_resolver(world: str) -> Callable[[str], str]:
    """Wiki page title, or a redirect to one → the node id that page became."""
    redirects = json.loads((WIKIS[world].raw / "redirects.json").read_text(encoding="utf-8"))

    def node_id(title: str) -> str:
        title = _normalise_title(title)
        return _slug(redirects.get(title, title))

    return node_id
