"""U.S. legislator attributes from congress-legislators (CC0).

Party, chamber, state, and gender — discrete fields only. Matched by unique
display name against the historical + current rosters.
"""

from __future__ import annotations

import json
import re
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

from ..canon.licenses import CC0_1_0
from ..canon.types import Attribution

RAW = Path(__file__).resolve().parent.parent / "raw" / "congress"
CURRENT = "https://unitedstates.github.io/congress-legislators/legislators-current.json"
HISTORICAL = "https://unitedstates.github.io/congress-legislators/legislators-historical.json"

# Our cosponsorship window is roughly the 93rd–108th Congresses.
TERM_START = "1973-01-01"
TERM_END = "2005-01-03"

ATTRIBUTION = Attribution(
    title="congress-legislators",
    creator="the @unitedstates project",
    creator_url="https://github.com/unitedstates/congress-legislators",
    source_url="https://github.com/unitedstates/congress-legislators",
    retrieved="2026-09-18",
    modifications=(
        "Extracted discrete attributes only (party, chamber, state, gender) for "
        "legislators matched by unique name; no biographical prose.",
    ),
)

LICENSE = CC0_1_0

STATES = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas",
    "CA": "California", "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware",
    "FL": "Florida", "GA": "Georgia", "HI": "Hawaii", "ID": "Idaho",
    "IL": "Illinois", "IN": "Indiana", "IA": "Iowa", "KS": "Kansas",
    "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland",
    "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi",
    "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada",
    "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico", "NY": "New York",
    "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma",
    "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina",
    "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah",
    "VT": "Vermont", "VA": "Virginia", "WA": "Washington", "WV": "West Virginia",
    "WI": "Wisconsin", "WY": "Wyoming", "DC": "District of Columbia",
    "PR": "Puerto Rico", "VI": "Virgin Islands", "GU": "Guam", "AS": "American Samoa",
    "MP": "Northern Mariana Islands",
}

PARTY = {
    "Democrat": "Democratic Party",
    "Republican": "Republican Party",
    "Independent": "Independent",
    "Independent Democrat": "Independent",
    "Libertarian": "Libertarian Party",
}

CHAMBER = {"sen": "Senator", "rep": "Representative", "ter": "Delegate"}

# Given-name shortenings the Fowler labels and players both use.
NICKNAMES = {
    "newton": "newt",
    "william": "bill",
    "robert": "bob",
    "joseph": "joe",
    "edward": "ted",
    "richard": "dick",
    "timothy": "tim",
    "thomas": "tom",
    "james": "jim",
    "john": "jack",
    "michael": "mike",
    "stephen": "steve",
    "steven": "steve",
    "frederick": "fred",
    "charles": "chuck",
    "christopher": "chris",
    "anthony": "tony",
    "benjamin": "ben",
    "samuel": "sam",
    "daniel": "dan",
    "donald": "don",
    "ronald": "ron",
    "lawrence": "larry",
    "albert": "al",
    "alfred": "al",
    "gerald": "jerry",
    "walter": "walt",
    "vincent": "vince",
    "herbert": "herb",
    "randolph": "randy",
    "mary": "mary",
}


def attributes_for(nodes) -> dict[str, dict]:
    """Return {node_id: {gender, role, affiliations, homeworld}} for unique matches."""
    roster = _roster()
    by_form: dict[str, set[str]] = defaultdict(set)
    records: dict[str, dict] = {}

    for person in roster:
        key = person["id"]
        records[key] = person
        for form in person["forms"]:
            by_form[form].add(key)

    unique = {form: next(iter(ids)) for form, ids in by_form.items() if len(ids) == 1}

    matched: dict[str, dict] = {}
    for node in nodes:
        hits: set[str] = set()
        for form in (node.name, *node.aliases):
            key = _norm(form)
            if key in unique:
                hits.add(unique[key])
        if len(hits) != 1:
            continue
        person = records[next(iter(hits))]
        attrs = _attrs(person)
        if attrs:
            matched[node.id] = attrs
    return matched


def apply_to_record(record: dict, attrs: dict) -> None:
    if attrs.get("gender") and "gender" not in record:
        record["gender"] = attrs["gender"]
    if attrs.get("role") and not record.get("role") and not record.get("titles") and not record.get("occupation"):
        record["role"] = attrs["role"]
    if attrs.get("affiliations") and "affiliations" not in record and "houses" not in record:
        record["affiliations"] = list(attrs["affiliations"])
    if attrs.get("homeworld") and "homeworld" not in record:
        record["homeworld"] = attrs["homeworld"]


def _roster() -> list[dict]:
    people = []
    for name, url in (
        ("legislators-historical.json", HISTORICAL),
        ("legislators-current.json", CURRENT),
    ):
        path = RAW / name
        if not path.exists():
            print(f"  fetching {name} ...", flush=True)
            _download(url, path)
        people.extend(json.loads(path.read_text(encoding="utf-8")))

    out = []
    for person in people:
        terms = [
            term
            for term in (person.get("terms") or [])
            if _overlaps(term.get("start"), term.get("end"))
        ]
        if not terms:
            continue
        forms = _name_forms(person)
        if not forms:
            continue
        bio = person.get("bio") or {}
        gender = {"M": "Male", "F": "Female"}.get(bio.get("gender") or "")
        out.append(
            {
                "id": (person.get("id") or {}).get("bioguide")
                or (person.get("id") or {}).get("govtrack")
                or forms[0],
                "forms": forms,
                "gender": gender,
                "terms": terms,
            }
        )
    return out


def _attrs(person: dict) -> dict:
    terms = person["terms"]
    # Prefer the latest term in our window for chamber/state/party.
    latest = max(terms, key=lambda t: t.get("start") or "")
    parties = Counter(
        PARTY.get(term.get("party") or "", term.get("party") or "")
        for term in terms
        if term.get("party")
    )
    party = parties.most_common(1)[0][0] if parties else None
    role = CHAMBER.get(latest.get("type") or "")
    # If they served in both chambers, say so via the latest role only — the
    # standing line wants one office.
    state = STATES.get(latest.get("state") or "", latest.get("state"))
    record: dict = {}
    if person.get("gender"):
        record["gender"] = person["gender"]
    if role:
        record["role"] = role
    if party:
        # "of the Independent" reads wrong; leave Independents without a party clause.
        if party != "Independent":
            record["affiliations"] = [party]
    if state:
        record["homeworld"] = state
    return record


def _name_forms(person: dict) -> list[str]:
    name = person.get("name") or {}
    forms = []
    official = name.get("official_full") or ""
    first = name.get("first") or ""
    last = name.get("last") or ""
    nickname = name.get("nickname") or ""
    suffix = (name.get("suffix") or "").strip()
    if official:
        forms.append(official)
    if first and last:
        forms.append(f"{first} {last}")
        if suffix:
            forms.append(f"{first} {last} {suffix}")
            forms.append(f"{first} {last} Jr.")
    if nickname and last:
        forms.append(f"{nickname} {last}")
        if suffix:
            forms.append(f"{nickname} {last} {suffix}")
    nick = NICKNAMES.get(first.lower())
    if nick and last:
        forms.append(f"{nick} {last}")
        if suffix:
            forms.append(f"{nick} {last} {suffix}")
            forms.append(f"{nick} {last} Jr.")
    if first == "Edward" and last == "Kennedy":
        forms.append("Ted Kennedy")
    return list(dict.fromkeys(_norm(f) for f in forms if f and _norm(f)))


def _norm(name: str) -> str:
    text = name.strip().lower()
    text = text.replace("é", "e").replace("è", "e").replace("á", "a")
    text = re.sub(r"\b(jr|sr)\.?$", "", text)
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return " ".join(text.split())


def _overlaps(start: str | None, end: str | None) -> bool:
    if not start:
        return False
    # Inclusive overlap with [TERM_START, TERM_END).
    if start >= TERM_END:
        return False
    if end and end <= TERM_START:
        return False
    return True


def _download(url: str, dest: Path) -> None:
    request = urllib.request.Request(url, headers={"User-Agent": "YouAreHere-pipeline/0.1"})
    with urllib.request.urlopen(request, timeout=120) as response:
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(response.read())
