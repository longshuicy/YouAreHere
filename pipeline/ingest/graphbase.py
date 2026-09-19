"""Stanford GraphBase literary encounter files.

Knuth's `gb_books` datasets are public-domain character lists plus per-chapter
encounter groups. Two people are tied when they share a group; the weight is
how many groups they share. The files themselves are not modified — see each
source's SOURCE.md.
"""

from __future__ import annotations

import re
from collections import defaultdict
from pathlib import Path

from ..canon.types import Edge, Node

CHAR_LINE = re.compile(r"^([A-Z0-9]{2}) (.+)$")
ENCOUNTER_LINE = re.compile(r"^([0-9.&]+):?(.*)$")

# TeX diacritics Knuth actually writes in these two files.
_TEX = (
    (r"\c{c}", "ç"),
    (r"\c{C}", "Ç"),
    (r"\'e", "é"),
    (r"\'E", "É"),
    (r"\'a", "á"),
    (r"\'i", "í"),
    (r"\'o", "ó"),
    (r"\'u", "ú"),
    (r"\`e", "è"),
    (r"\`a", "à"),
    (r"\^o", "ô"),
    (r"\^e", "ê"),
    (r"\^a", "â"),
    (r"\^i", "î"),
)


def detex(text: str) -> str:
    for raw, cooked in _TEX:
        text = text.replace(raw, cooked)
    return text


def parse(path: Path) -> tuple[dict[str, tuple[str, str]], list[tuple[str, list[list[str]]]]]:
    """Return (code → (name, description), [(segment, encounter groups)])."""
    path = Path(path)
    people: dict[str, tuple[str, str]] = {}
    chapters: list[tuple[str, list[list[str]]]] = []
    current: str | None = None
    groups: list[list[str]] = []
    in_people = True

    def flush() -> None:
        nonlocal current, groups
        if current is not None:
            chapters.append((current, groups))
        current, groups = None, []

    for raw in path.read_text(encoding="latin-1").splitlines():
        if raw.startswith("*"):
            continue
        if in_people:
            match = CHAR_LINE.match(raw)
            if match:
                code, rest = match.groups()
                name, _, description = rest.partition(",")
                people[code] = (detex(name.strip()), detex(description.strip()))
                continue
            in_people = False

        headed = ENCOUNTER_LINE.match(raw)
        if not headed:
            continue
        tag, payload = headed.groups()
        if tag == "&":
            if current is None:
                raise ValueError(f"{path.name}: continuation with no open chapter")
            groups.extend(_groups(payload))
            continue
        flush()
        current = tag
        groups = _groups(payload)
    flush()
    return people, chapters


def _groups(payload: str) -> list[list[str]]:
    payload = payload.strip()
    if not payload:
        return []
    return [
        [code.strip() for code in group.split(",") if code.strip()]
        for group in payload.split(";")
        if group.strip()
    ]


def is_person(name: str, description: str) -> bool:
    """Drop crowds, redacted names, and paired livestock — not a waking."""
    if "collectively" in description.lower():
        return False
    if "*" in name or re.search(r"[A-Z]--", name):
        return False
    if re.match(r"^(Old woman|Child)\s+\d+", name):
        return False
    if " and " in name:
        return False
    if name == "Homer":
        return False
    return True


TITLES = (
    "Monsieur",
    "Madame",
    "Mademoiselle",
    "Madamoiselle",
    "Sister",
    "Count",
    "Countess",
    "Lieutenant",
    "Baroness",
)


def display_name(raw: str) -> tuple[str, tuple[str, ...]]:
    """`Aphrodite (Venus)` → Aphrodite, alias Venus.

    Courtesy titles keep the full form as the label — 'Madame Thénardier' is
    how the character is known — and add the last word so a player who types
    Thénardier still matches.
    """
    aliases: list[str] = []
    match = re.fullmatch(r"(.+?) \((.+)\)$", raw)
    if match:
        raw, extra = match.group(1).strip(), match.group(2).strip()
        aliases.extend(part.strip() for part in extra.split("/") if part.strip())
    parts = raw.split()
    if len(parts) >= 2 and parts[0] in TITLES:
        aliases.append(parts[-1])
    return raw, tuple(dict.fromkeys(aliases))


def graph_from(
    people: dict[str, tuple[str, str]],
    chapters: list[tuple[str, list[list[str]]]],
    *,
    work: str,
    segment_of,
) -> tuple[list[Node], list[Edge], dict[str, str]]:
    """Build nodes and weighted edges. `segment_of(tag)` maps a chapter tag to
    the segment id shipped on the edge, and to a label."""
    kept = {
        code: display_name(name)
        for code, (name, description) in people.items()
        if is_person(name, description)
    }

    weights: dict[tuple[str, str], float] = defaultdict(float)
    segments: dict[tuple[str, str], set[str]] = defaultdict(set)
    labels: dict[str, str] = {}

    for tag, groups in chapters:
        segment, label = segment_of(tag)
        labels[segment] = label
        for group in groups:
            named = sorted({code for code in group if code in kept})
            for i, source in enumerate(named):
                for target in named[i + 1 :]:
                    key = (source, target)
                    weights[key] += 1
                    segments[key].add(segment)

    present = {code for pair in weights for code in pair}
    nodes = [
        Node(
            id=code.lower(),
            name=kept[code][0],
            aliases=kept[code][1],
            work=work,
            metadata={"graphbase": people[code][1]},
        )
        for code in sorted(present)
    ]
    order = {segment: i for i, segment in enumerate(labels)}
    edges = [
        Edge(
            source=source.lower(),
            target=target.lower(),
            weight=weights[(source, target)],
            type="cooccurrence",
            segments=tuple(sorted(segments[(source, target)], key=order.__getitem__)),
        )
        for source, target in sorted(weights)
    ]
    return nodes, edges, labels
