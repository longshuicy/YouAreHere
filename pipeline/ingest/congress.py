"""U.S. Congress cosponsorship — projected bill networks.

Structured hypergraph from Fowler via Benson et al. (Figshare / Cornell). Two
legislators are tied when they appear together on the same bill (sponsor or
cosponsor). See raw/congress/SOURCE.md.
"""

from __future__ import annotations

import dataclasses
import json
import re
from collections import defaultdict
from pathlib import Path

from ..canon.licenses import CC_BY_4_0
from ..canon.types import Attribution, CanonicalGraph, Edge, Node, Provenance
import urllib.request

RAW = Path(__file__).resolve().parent.parent / "raw" / "congress"
REMOTE = "https://ndownloader.figshare.com/files/38101161"

# Cap cosponsor lists the same way the restricted Cornell release does — a
# bill with hundreds of names is a roll-call of the chamber, not a clique.
MAX_BILL_SIZE = 25


def _fetch_figshare(url: str, dest: Path) -> None:
    """Figshare's CDN 403s a bare urllib fetch; a browser-like Referer is enough."""
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0",
            "Referer": "https://figshare.com/articles/dataset/congress-bills/21502551",
        },
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(response.read())


ATTRIBUTION = Attribution(
    title="congress-bills (U.S. Congress cosponsorship)",
    creator="Austin R. Benson et al.; derived from James H. Fowler",
    creator_url="https://www.cs.cornell.edu/~arb/data/congress-bills/",
    source_url="https://doi.org/10.6084/m9.figshare.21502551",
    project_url="https://www.cs.cornell.edu/~arb/data/congress-bills/",
    citation=(
        "A. R. Benson, R. Abebe, M. T. Schaub, A. Jadbabaie, and J. Kleinberg, "
        "“Simplicial closure and higher-order link prediction,” PNAS, 2018. "
        "Derived from J. H. Fowler, “Connecting the Congress,” Political Analysis, 2006."
    ),
    citation_doi="10.6084/m9.figshare.21502551",
    retrieved="2026-09-18",
    modifications=(
        "Projected each bill's sponsor/cosponsor set into pairwise ties, summing "
        "shared bills across the 93rd–108th Congresses.",
        "Dropped single-sponsor bills and bills with more than 25 names.",
        "Kept only legislators whose labels include a given name (dropped "
        "surname-only ALL-CAPS stubs).",
        "Parsed display names from `Last, First [ST-N]` labels.",
    ),
)


def load() -> CanonicalGraph:
    path = RAW / "congress-bills.json"
    if not path.exists():
        _fetch_figshare(REMOTE, path)

    payload = json.loads(path.read_text(encoding="utf-8"))
    node_data = payload["node-data"]
    edge_dict = payload["edge-dict"]
    edge_meta = payload["edge-data"]

    kept_nodes = {
        nid: _display_name(info["name"])
        for nid, info in node_data.items()
        if _usable_label(info["name"])
    }

    weights: dict[tuple[str, str], float] = defaultdict(float)
    segments: dict[tuple[str, str], set[str]] = defaultdict(set)
    labels: dict[str, str] = {}

    for edge_id, members in edge_dict.items():
        if not (2 <= len(members) <= MAX_BILL_SIZE):
            continue
        named = sorted({nid for nid in members if nid in kept_nodes}, key=lambda x: int(x))
        if len(named) < 2:
            continue
        timestamp = (edge_meta.get(edge_id) or {}).get("timestamp") or ""
        congress = _congress_number(timestamp)
        if congress is None:
            continue
        segment = str(congress)
        labels[segment] = _congress_label(congress)
        for i, source in enumerate(named):
            for target in named[i + 1 :]:
                key = (source, target) if source <= target else (target, source)
                weights[key] += 1
                segments[key].add(segment)

    present = {nid for pair in weights for nid in pair}
    order = {seg: i for i, seg in enumerate(sorted(labels, key=int))}

    nodes = [
        Node(
            id=nid,
            name=kept_nodes[nid][0],
            aliases=kept_nodes[nid][1],
            work="congress",
        )
        for nid in sorted(present, key=lambda x: int(x))
    ]
    edges = [
        Edge(
            source=source,
            target=target,
            weight=weights[(source, target)],
            type="cosponsorship",
            segments=tuple(sorted(segments[(source, target)], key=order.__getitem__)),
        )
        for source, target in sorted(weights, key=lambda pair: (int(pair[0]), int(pair[1])))
    ]

    provenance = Provenance(
        dataset="fowler-benson-congress-bills-v1",
        edge_definition="legislators who appear together as sponsor or cosponsor on the same bill",
        source_unit="congress",
        weight_semantics=(
            f"count of shared bills of size 2–{MAX_BILL_SIZE}, across the "
            f"{min(order)}–{max(order)} Congresses"
        ),
        attribution=dataclasses.replace(ATTRIBUTION),
        license=CC_BY_4_0,
    )

    return CanonicalGraph(
        id="congress",
        title="U.S. Congress",
        accent="#1B4F72",
        nodes=nodes,
        edges=edges,
        provenance=provenance,
        segment_labels={seg: labels[seg] for seg in sorted(labels, key=int)},
    ).sorted()


def _usable_label(raw: str) -> bool:
    """Surname-only ALL-CAPS stubs are not a name a player can type."""
    if "," not in raw:
        return False
    if raw.isupper():
        return False
    return True


def _display_name(raw: str) -> tuple[str, tuple[str, ...]]:
    """`Clinton, Hillary Rodham [NY]` → Hillary Clinton; alias Hillary Rodham Clinton."""
    aliases: list[str] = []
    text = re.sub(r"\s*\[.*?\]\s*$", "", raw).strip()

    suffix = ""
    for token in ("Jr.", "Jr", "Sr.", "Sr", "II", "III", "IV"):
        pattern = rf",?\s*{re.escape(token)}$"
        if re.search(pattern, text):
            text = re.sub(pattern, "", text).rstrip(" ,")
            if token in ("Jr", "Jr."):
                suffix = "Jr."
            elif token in ("Sr", "Sr."):
                suffix = "Sr."
            else:
                suffix = token
            break

    if "," not in text:
        primary = text.title() if text.isupper() else text
        if suffix:
            primary = f"{primary} {suffix}"
        return primary, ()

    last, _, rest = text.partition(",")
    last, rest = last.strip().rstrip(","), rest.strip().strip(",")

    # Surname field may still carry Jr. ("Biden Jr., Joseph R.")
    for token in ("Jr.", "Jr", "Sr.", "Sr"):
        if last.endswith(" " + token) or last == token:
            last = last[: -len(token)].rstrip()
            suffix = "Jr." if token.startswith("Jr") else "Sr."
            break

    given_parts = [p for p in rest.replace(",", " ").split() if p]
    if not given_parts:
        primary = last
    else:
        given = given_parts[0]
        primary = f"{given} {last}"
        if len(given_parts) > 1:
            aliases.append(f"{' '.join(given_parts)} {last}")

    if suffix:
        primary = f"{primary} {suffix}"
        aliases = [f"{a} {suffix}" for a in aliases]

    if primary.startswith("Joseph "):
        short = "Joe " + primary[len("Joseph ") :]
        aliases.append(short)
        if short.endswith(" Jr."):
            aliases.append(short[: -len(" Jr.")])
    if primary.startswith("William "):
        aliases.append("Bill " + primary[len("William ") :])
    if primary.startswith("Robert "):
        aliases.append("Bob " + primary[len("Robert ") :])
    if primary == "Edward Kennedy":
        aliases.append("Ted Kennedy")

    return primary, tuple(dict.fromkeys(a for a in aliases if a and a != primary))


def _congress_number(timestamp: str) -> int | None:
    """Map an ISO date to a Congress number (odd years open a new Congress)."""
    if len(timestamp) < 4 or not timestamp[:4].isdigit():
        return None
    year = int(timestamp[:4])
    base = year if year % 2 == 1 else year - 1
    return (base - 1789) // 2 + 1


def _congress_label(number: int) -> str:
    return f"{_ordinal(number)} Congress"


def _ordinal(n: int) -> str:
    if 10 <= (n % 100) <= 20:
        suffix = "th"
    else:
        suffix = {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"
