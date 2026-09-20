"""Compose one-line descriptions from facts.

The sentences are ours. That is the point rather than a stylistic preference:
assembling our own prose from uncopyrightable attributes keeps the metadata free
of any licence, where copying a wiki's sentence would not.

Deterministic — no sampling, no model, same facts in, same line out. The app
receives the structured facts alongside these lines and may ignore them.
"""

from __future__ import annotations

import re

COUNT_WORDS = {1: "one", 2: "two", 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven"}

# The source mixes three kinds of value under "culture": peoples (Northmen),
# places (Westeros), and adjectives (Valyrian). Only the first takes "of the" —
# "of the Valyrian" is wrong. Anything unlisted falls back to standing on its
# own as an apposition, which reads correctly for places and adjectives alike.
PEOPLES = {
    "northmen", "ironborn", "free folk", "dothraki", "crannogmen",
    "sistermen", "rivermen", "valemen", "mountain clans", "andals", "first men",
    "greeks", "trojans", "achaeans", "myrmidons", "dardanians", "olympians",
}


def node_line(facts: dict) -> str:
    if _zh_facts(facts):
        return _node_line_zh(facts)

    clauses = []

    standing = _standing(facts)
    if standing:
        clauses.append(_capitalise(standing))

    life = _life(facts)
    if life:
        clauses.append(life)

    presence = _presence(facts)
    if presence:
        clauses.append(presence)

    return " ".join(f"{clause}." for clause in clauses)


def _plural_unit(unit: str) -> str:
    if unit.endswith(("s", "x", "ch", "sh")) or unit.endswith("gress"):
        return unit + "es"
    return unit + "s"


def edge_line(facts: dict) -> str:
    if _zh_facts(facts):
        return _edge_line_zh(facts)

    clauses = []

    books = facts.get("books", [])
    unit = facts.get("unit", "book")
    units = _plural_unit(unit)
    first = books[0] if books else ""
    world_size = facts.get("worldSize")
    total = world_size if world_size is not None else (facts.get("corpusSize") or 0)

    # A one-segment world already is that play or film; saying the tie appears
    # only there tells the player nothing they do not know from the world title.
    if books and not (total == 1 and len(books) == 1):
        if len(books) == 1:
            clauses.append(f"They share the page only in {first}")
        elif total and len(books) == total:
            clauses.append(f"They share the page in every {unit}, first in {first}")
        else:
            count = COUNT_WORDS.get(len(books), str(len(books)))
            clauses.append(f"They share the page in {count} {units}, first in {first}")

    shared = facts.get("sharedHouses") or facts.get("sharedAffiliations")
    if shared:
        # Stated as a fact about each of them, never as a claim about the tie.
        if facts.get("sharedHouses"):
            clauses.append(f"Both are sworn to {shared[0]}")
        else:
            affiliation = shared[0]
            article = "the " if (
                affiliation.lower() in PEOPLES or affiliation.lower().startswith("friends of")
            ) else ""
            clauses.append(f"Both belong to {article}{affiliation}")

    return " ".join(f"{clause}." for clause in clauses)


def _zh_facts(facts: dict) -> bool:
    books = facts.get("books") or []
    if not books:
        return False
    sample = books[0]
    if sample.startswith("第") and sample.endswith("回"):
        return True
    # 史記 juan titles, and any other Chinese segment label.
    return bool(re.search(r"[\u3400-\u9fff]", sample))


def _zh_unit(facts: dict) -> str:
    unit = facts.get("unit") or ""
    if unit == "juan":
        return "篇"
    if unit == "chapter" or (facts.get("books") or [""])[0].endswith("回"):
        return "回"
    return "篇"


def _node_line_zh(facts: dict) -> str:
    clauses = []
    standing = None
    if facts.get("role"):
        standing = facts["role"]
    elif facts.get("titles"):
        standing = _title(facts["titles"][0])
    elif facts.get("occupation"):
        standing = _title(facts["occupation"])
    elif facts.get("species"):
        standing = facts["species"]
    elif facts.get("homeworld"):
        standing = f"{facts['homeworld']}出身"
    if standing:
        clauses.append(standing)
    occupation = facts.get("occupation")
    if occupation and occupation not in (standing or ""):
        clauses.append(_title(occupation))
    affiliation = (facts.get("affiliations") or [None])[0]
    if affiliation and affiliation not in (standing or ""):
        clauses.append(f"屬{affiliation}")
    presence = _presence_zh(facts)
    if presence:
        clauses.append(presence)
    return "。".join(clauses) + ("。" if clauses else "")


def _edge_line_zh(facts: dict) -> str:
    books = facts.get("books", [])
    first = books[0] if books else ""
    world_size = facts.get("worldSize")
    total = world_size if world_size is not None else (facts.get("corpusSize") or 0)
    unit = _zh_unit(facts)
    clauses = []
    if books and not (total == 1 and len(books) == 1):
        if len(books) == 1:
            clauses.append(f"僅在{first}同頁")
        elif total and len(books) == total:
            clauses.append(f"每{unit}同頁，始於{first}")
        else:
            clauses.append(f"共見於{len(books)}{unit}，始於{first}")
    shared = facts.get("sharedHouses") or facts.get("sharedAffiliations")
    if shared:
        clauses.append(f"同屬{shared[0]}")
    return "。".join(clauses) + ("。" if clauses else "")


def _presence_zh(facts: dict) -> str:
    books = facts.get("books", [])
    if not books:
        return ""
    world_size = facts.get("worldSize")
    total = world_size if world_size is not None else (facts.get("corpusSize") or 0)
    unit = _zh_unit(facts)
    if total == 1 and len(books) == 1:
        return ""
    if total and len(books) == total:
        return f"{total}{unit}皆見"
    if len(books) <= 2:
        return "見於" + "、".join(books)
    return f"見於{len(books)}{unit}"


def _standing(facts: dict) -> str:
    parts = []

    title = None
    if facts.get("role"):
        title = _role_phrase(facts["role"])
    elif facts.get("titles"):
        title = _title(facts["titles"][0])
    elif facts.get("occupation"):
        title = _title(facts["occupation"])
    if title:
        parts.append(title)

    occupation = facts.get("occupation")
    if occupation and (not title or occupation.lower() not in title.lower()):
        occ = _title(occupation)
        if occ and occ.lower() not in ", ".join(parts).lower():
            parts.append(occ)

    if facts.get("culture"):
        parts.append(_culture(facts["culture"]))
    elif facts.get("species"):
        parts.append(_species(facts["species"]))

    if facts.get("homeworld"):
        parts.append(f"of {facts['homeworld']}")

    if facts.get("houses"):
        parts.append(f"sworn to {facts['houses'][0]}")
    elif facts.get("affiliations"):
        affiliation = facts["affiliations"][0]
        # Avoid "Sith, of the Sith" when occupation and affiliation repeat.
        if affiliation.lower() not in ", ".join(parts).lower():
            parts.append(f"of the {affiliation}")

    return ", ".join(parts)


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

    unit = facts.get("unit", "book")
    units = _plural_unit(unit)
    world_size = facts.get("worldSize")
    total = world_size if world_size is not None else (facts.get("corpusSize") or 0)

    # One-segment worlds: "Appears in Hamlet" restates the world title.
    if total == 1 and len(books) == 1:
        return ""

    if total and len(books) == total:
        where = f"Appears in all {COUNT_WORDS.get(total, total)} {units}"
    elif len(books) <= 2:
        where = "Appears in " + " and ".join(books)
    else:
        where = f"Appears in {COUNT_WORDS.get(len(books), len(books))} {units}"

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


def _species(species: str) -> str:
    species = species.strip()
    if not species:
        return species
    # "of the Wookiee" is wrong; species stands as an apposition.
    return species[:1].upper() + species[1:] if species else species


def _role_phrase(role: str) -> str:
    """Keep the whole Folger/identity line, including kinship."""
    text = " ".join(role.split()).strip(" .;")
    return _capitalise(text)


def _title(title: str) -> str:
    """Royal styles run to a full line on their own. The first clause carries the
    rank, which is what the reveal is for."""
    title = title.split(",")[0].strip()
    title = re.sub(r"\s+in Greek mythology$", "", title, flags=re.I)
    title = re.sub(r"^mythological\s+", "", title, flags=re.I)
    return title


def _capitalise(text: str) -> str:
    return text[:1].upper() + text[1:] if text else text


def _lower(text: str) -> str:
    """The API stores dates as 'In 283 AC', which needs lowering mid-sentence."""
    text = text.strip()
    return text[:1].lower() + text[1:] if text else text
