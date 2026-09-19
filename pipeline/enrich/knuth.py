"""Discrete facts from Knuth's GraphBase character glosses.

homer.dat and jean.dat are public domain. The glosses themselves are not copied
into the sidecar — only camp, occupation, title, and species tokens parsed from
them. Composed prose lives in describe.py.
"""

from __future__ import annotations

import re

from ..canon.licenses import PUBLIC_DOMAIN
from ..canon.types import Attribution

ATTRIBUTION = Attribution(
    title="Stanford GraphBase character glosses",
    creator="Donald E. Knuth, Stanford GraphBase",
    creator_url="https://www-cs-faculty.stanford.edu/~knuth/sgb.html",
    source_url="https://www-cs-faculty.stanford.edu/~knuth/sgb.html",
    retrieved="2026-09-18",
    modifications=(
        "Parsed discrete camp, occupation, title, and species tokens from the "
        "public-domain character glosses in homer.dat and jean.dat. No gloss prose is copied.",
    ),
)

LICENSE = PUBLIC_DOMAIN

TROJAN = (
    "trojan",
    "dardanians",
    "dardanian",
    "lycian",
    "roots for trojans",
    "king of troy",
    "queen of troy",
)
GREEK = (
    "greek",
    "achaean",
    "argive",
    "myrmidon",
    "favors greeks",
    "leader of greek",
)

ILIAD_OCCUPATIONS = (
    "lady in waiting",
    "shipbuilder",
    "charioteer",
    "commander",
    "soothsayer",
    "lieutenant",
    "councilor",
    "councillor",
    "herald",
    "priest",
    "prophet",
    "archer",
)

LESMIS_OCCUPATIONS = (
    ("police officer", "police officer"),
    ("prioress", "prioress"),
    ("gravedigger", "gravedigger"),
    ("housekeeper", "housekeeper"),
    ("landlady", "landlady"),
    ("innkeeper", "innkeeper"),
    ("road mender", "road mender"),
    ("parisian student", "student"),
    ("former convict", "convict"),
    ("convict", "convict"),
    ("bandit", "bandit"),
    ("thief of", "thief"),
    ("accused thief", None),
    ("notorious criminal", "criminal"),
    ("saintly nun", "nun"),
    ("stout nun", "nun"),
    (" nun ", "nun"),
    ("baker", "baker"),
    ("notary", "notary"),
    ("retired merchant", "merchant"),
    ("servant", "servant"),
    (" maid ", "maid"),
    ("urchin", "urchin"),
    ("soldier", "soldier"),
    ("judge", "judge"),
    ("explorer", "explorer"),
)

TITLE = re.compile(
    r"\b((?:high )?king|queen|prince|princess|bishop|emperor|empress|"
    r"marquis|marquise|count|countess|baroness|prioress)\s+of\s+([^,]+)",
    re.I,
)


def from_node(source: str, node) -> dict:
    gloss = (node.metadata or {}).get("graphbase") or ""
    if not gloss:
        return {}
    if source == "iliad":
        return _iliad(gloss)
    if source == "lesmiserables":
        return _lesmis(gloss)
    return {}


def _iliad(gloss: str) -> dict:
    text = gloss.lower()
    record: dict = {}

    trojan = any(token in text for token in TROJAN)
    greek = any(token in text for token in GREEK)
    if trojan and not greek:
        record["affiliations"] = ["Trojans"]
    elif greek and not trojan:
        record["affiliations"] = ["Greeks"]

    if "nymph" in text:
        record["species"] = "nymph"
    elif "centaur" in text:
        record["species"] = "centaur"
    elif "goddess" in text:
        record["species"] = "goddess"
    elif re.search(r"\bgod of\b", text) or re.search(r"(?:^|,\s)god\b", text):
        record["species"] = "god"
    elif "giant" in text:
        record["species"] = "giant"
    elif "monster" in text:
        record["species"] = "monster"

    title = _title(gloss)
    if title:
        record["titles"] = [title]

    if "titles" not in record:
        for occupation in ILIAD_OCCUPATIONS:
            if occupation in text:
                record["occupation"] = occupation
                break

    return record


def _lesmis(gloss: str) -> dict:
    text = f" {gloss.lower()} "
    record: dict = {}

    if "friends of the abc" in text:
        record["affiliations"] = ["Friends of the ABC"]

    title = _title(gloss)
    if title:
        record["titles"] = [title]
        return record

    if re.search(r"keeper of .*(inn|chophouse)", text):
        record["occupation"] = "innkeeper"
        return record

    for needle, occupation in LESMIS_OCCUPATIONS:
        if needle in text:
            if occupation:
                record["occupation"] = occupation
            break

    return record


def _title(gloss: str) -> str | None:
    match = TITLE.search(gloss)
    if not match:
        return None
    rank = match.group(1).lower()
    place = match.group(2).strip()
    # Drop redacted place-names that are just the novel's "D--" / "M--".
    if re.fullmatch(r"[A-Z]--", place):
        return rank
    return f"{rank} of {place}"
