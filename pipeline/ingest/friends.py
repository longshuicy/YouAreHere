"""Friends — scene co-occurrence from Michelle Edwards' edge lists.

Per-episode CSVs on Figshare (CC BY 4.0). Two people are tied when they speak
in the same scene; the weight is how many scenes they share. See raw/friends/SOURCE.md.
"""

from __future__ import annotations

import csv
import dataclasses
import json
import re
import time
import urllib.request
from collections import defaultdict
from pathlib import Path

from ..canon.licenses import CC_BY_4_0
from ..canon.types import Attribution, CanonicalGraph, Edge, Node, Provenance

RAW = Path(__file__).resolve().parent.parent / "raw" / "friends"
FIGSHARE_ARTICLE = "https://api.figshare.com/v2/articles/7413593"
REFERER = "https://adelaide.figshare.com/articles/dataset/Friends_edge_lists/7413593"

# Role words and unnamed walk-ons — not a waking.
GENERIC = {
    "waitress",
    "waiter",
    "customer",
    "guy",
    "girl",
    "man",
    "woman",
    "doctor",
    "nurse",
    "fireman",
    "policeman",
    "cop",
    "teacher",
    "student",
    "passenger",
    "actor",
    "actress",
    "director",
    "producer",
    "announcer",
    "clerk",
    "receptionist",
    "bartender",
    "cabdriver",
    "taxi",
    "driver",
    "boss",
    "interviewer",
    "fan",
    "kids",
    "kid",
    "baby",
    "everybody",
    "all",
}

ATTRIBUTION = Attribution(
    title="Friends edge lists",
    creator="Michelle Edwards",
    creator_url="https://adelaide.figshare.com/articles/dataset/Friends_edge_lists/7413593",
    source_url="https://doi.org/10.25909/5c05c2ed862ec",
    project_url="https://adelaide.figshare.com/articles/dataset/Friends_edge_lists/7413593",
    citation=(
        "M. Edwards, “Friends edge lists,” The University of Adelaide, 2018. "
        "DOI: 10.25909/5c05c2ed862ec."
    ),
    citation_doi="10.25909/5c05c2ed862ec",
    retrieved="2026-09-18",
    modifications=(
        "Merged per-episode scene co-occurrence edge lists into one graph, summing "
        "weights across all ten seasons.",
        "Dropped self-loops and generic role labels (waitress, customer, …).",
        "Title-cased display names from the dataset's lowercase identifiers.",
    ),
)


def load() -> CanonicalGraph:
    _ensure_raw()

    weights: dict[tuple[str, str], float] = defaultdict(float)
    segments: dict[tuple[str, str], set[str]] = defaultdict(set)
    names: dict[str, str] = {}
    labels: dict[str, str] = {}

    for path in sorted(RAW.glob("edges_*.csv")):
        match = re.fullmatch(r"edges_(\d{2})(\d{2})\.csv", path.name)
        if not match:
            continue
        season = match.group(1)
        segment = season.lstrip("0") or "0"
        labels[segment] = f"Season {int(season)}"

        with path.open(encoding="utf-8", newline="") as handle:
            for row in csv.DictReader(handle):
                source = (row.get("Source") or row.get("source") or "").strip().lower()
                target = (row.get("Target") or row.get("target") or "").strip().lower()
                weight = float(row.get("Weight") or row.get("weight") or 0)
                if not source or not target or source == target:
                    continue
                if source in GENERIC or target in GENERIC:
                    continue
                a, b = (source, target) if source <= target else (target, source)
                names.setdefault(a, _display(a))
                names.setdefault(b, _display(b))
                key = (a, b)
                weights[key] += weight
                segments[key].add(segment)

    if not weights:
        raise ValueError("friends: no edges found; see raw/friends/SOURCE.md")

    order = {seg: i for i, seg in enumerate(sorted(labels, key=int))}
    present = {nid for pair in weights for nid in pair}
    nodes = [
        Node(id=nid, name=names[nid], work="friends")
        for nid in sorted(present)
    ]
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
        dataset="edwards-friends-scene-v1",
        edge_definition="characters who speak in the same scene",
        source_unit="season",
        weight_semantics="count of shared scenes, summed across all ten seasons",
        attribution=dataclasses.replace(ATTRIBUTION),
        license=CC_BY_4_0,
    )

    return CanonicalGraph(
        id="friends",
        title="Friends",
        accent="#4A6FA5",
        nodes=nodes,
        edges=edges,
        provenance=provenance,
        segment_labels={seg: labels[seg] for seg in sorted(labels, key=int)},
    ).sorted()


def _display(raw: str) -> str:
    return " ".join(part.capitalize() for part in raw.replace("_", " ").split())


def _ensure_raw() -> None:
    existing = list(RAW.glob("edges_*.csv"))
    if len(existing) >= 200:
        return
    RAW.mkdir(parents=True, exist_ok=True)
    print("  fetching Friends edge lists from Figshare ...", flush=True)
    manifest = _api(FIGSHARE_ARTICLE)
    files = manifest.get("files") or []
    for i, entry in enumerate(files, 1):
        name = entry.get("name") or ""
        if not re.fullmatch(r"edges_\d{4}\.csv", name):
            continue
        dest = RAW / name
        if dest.exists() and dest.stat().st_size > 0:
            continue
        url = entry.get("download_url") or ""
        if not url:
            continue
        _download(url, dest)
        if i % 25 == 0:
            print(f"    {i}/{len(files)}", flush=True)
            time.sleep(0.3)
    # Cache the article metadata for offline attribution checks.
    (RAW / "figshare-article.json").write_text(
        json.dumps(
            {
                "id": manifest.get("id"),
                "doi": manifest.get("doi"),
                "license": manifest.get("license"),
                "title": manifest.get("title"),
                "files": len(files),
            },
            indent=1,
        ),
        encoding="utf-8",
    )
    print(f"  cached {len(list(RAW.glob('edges_*.csv')))} episode edge lists", flush=True)


def _api(url: str) -> dict:
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))


def _download(url: str, dest: Path) -> None:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0", "Referer": REFERER},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        dest.write_bytes(response.read())
