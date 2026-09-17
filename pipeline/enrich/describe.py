"""Compose one-line descriptions from facts.

The sentences are ours. That is the point rather than a stylistic preference:
assembling our own prose from uncopyrightable attributes keeps the metadata free
of any licence, where copying a wiki's sentence would not.

Deterministic — no sampling, no model, same facts in, same line out. The app
receives the structured facts alongside these lines and may ignore them.
"""

from __future__ import annotations

from .facts import BOOK_ORDER, BOOK_TITLES

COUNT_WORDS = {1: "one", 2: "two", 3: "three", 4: "four", 5: "five"}

# The source mixes three kinds of value under "culture": peoples (Northmen),
# places (Westeros), and adjectives (Valyrian). Only the first takes "of the" —
# "of the Valyrian" is wrong. Anything unlisted falls back to standing on its
# own as an apposition, which reads correctly for places and adjectives alike.
PEOPLES = {
    "northmen", "ironborn", "free folk", "dothraki", "crannogmen",
    "sistermen", "rivermen", "valemen", "mountain clans", "andals", "first men",
}


def node_line(facts: dict) -> str:
    clauses = []

    standing = []
    if facts.get("titles"):
        standing.append(_title(facts["titles"][0]))
    if facts.get("culture"):
        standing.append(_culture(facts["culture"]))
    if facts.get("houses"):
        standing.append(f"sworn to {facts['houses'][0]}")
    if standing:
        clauses.append(_capitalise(", ".join(standing)))

    life = _life(facts)
    if life:
        clauses.append(life)

    presence = _presence(facts)
    if presence:
        clauses.append(presence)

    return " ".join(f"{clause}." for clause in clauses)


def edge_line(facts: dict) -> str:
    clauses = []

    books = facts.get("books", [])
    if books:
        first = BOOK_TITLES[books[0]]
        if len(books) == 1:
            clauses.append(f"They share the page only in {first}")
        elif len(books) == len(BOOK_ORDER):
            clauses.append(f"They share the page in every book, first in {first}")
        else:
            count = COUNT_WORDS.get(len(books), str(len(books)))
            clauses.append(f"They share the page in {count} books, first in {first}")

    if facts.get("sharedHouses"):
        # Stated as a fact about each of them, never as a claim about the tie.
        clauses.append(f"Both are sworn to {facts['sharedHouses'][0]}")

    return " ".join(f"{clause}." for clause in clauses)


def _life(facts: dict) -> str:
    born, died = facts.get("born"), facts.get("died")
    if born and died:
        return f"Born {_lower(born)}, died {_lower(died)}"
    if born:
        return f"Born {_lower(born)}"
    if died:
        return f"Died {_lower(died)}"
    return ""


def _presence(facts: dict) -> str:
    books = facts.get("books", [])
    if not books:
        return ""

    if len(books) == len(BOOK_ORDER):
        where = "Appears in all five books"
    elif len(books) <= 2:
        where = "Appears in " + " and ".join(BOOK_TITLES[b] for b in books)
    else:
        where = f"Appears in {COUNT_WORDS.get(len(books), len(books))} of the five books"

    pov = facts.get("pov")
    if not pov:
        return where

    if pov >= len(books):
        seen = "every one of them"
    elif pov == 1:
        seen = "one of them"
    else:
        seen = f"{COUNT_WORDS.get(pov, pov)} of them"
    return f"{where}, {seen} through {_possessive(facts)} eyes"


def _possessive(facts: dict) -> str:
    return {"Male": "his", "Female": "her"}.get(facts.get("gender"), "their")


def _culture(culture: str) -> str:
    culture = culture.strip()
    # The source is inconsistent about case: both "Free Folk" and "Free folk".
    normalised = " ".join(word.capitalize() for word in culture.split())
    if normalised.lower() in PEOPLES:
        return f"of the {normalised}"
    return normalised


def _title(title: str) -> str:
    """Royal styles run to a full line on their own. The first clause carries the
    rank, which is what the reveal is for."""
    return title.split(",")[0].strip()


def _capitalise(text: str) -> str:
    return text[:1].upper() + text[1:] if text else text


def _lower(text: str) -> str:
    """The API stores dates as 'In 283 AC', which needs lowering mid-sentence."""
    text = text.strip()
    return text[:1].lower() + text[1:] if text else text
