"""Musical Meetups Knowledge Graph (MMKG) — Polifonia / Open University.

Two people are tied when a biography meetup lists them both as participants.
Only the published `sample_1k_meetups_triples` TTLs carry `mtp:hasParticipant`
(the bulk `meetups_triples` files are subject/time stubs without co-casts).

Places and other NER false persons are dropped; confidence < 0.95 is dropped;
the giant component is kept. Decades 1750–1950 become segments.

See raw/mmkg/SOURCE.md.
"""

from __future__ import annotations

import dataclasses
import json
import re
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

from ..canon.licenses import CC_BY_4_0
from ..canon.types import Attribution, CanonicalGraph, Edge, Node, Provenance
from .fetch import get, get_json

RAW = Path(__file__).resolve().parent.parent / "raw" / "mmkg"
SAMPLE_DIR = RAW / "sample_1k_meetups_triples"
BIOS_PATH = RAW / "list-of-biographies.csv"
GITHUB = "https://api.github.com/repos/polifonia-project/meetups-knowledge-graph/contents"
RAW_GITHUB = "https://raw.githubusercontent.com/polifonia-project/meetups-knowledge-graph/main"

MIN_CONFIDENCE = 0.95
YEAR_LO, YEAR_HI = 1750, 1950

# Slugs that survive Person typing but are not people a player can name.
DENY_SLUG = re.compile(
    r"(?i)^(United_|Kingdom_of_|Republic_of_|Empire_of_|Duchy_|County_of_|"
    r"Bass_|Guitar|Piano|Violin|Drums|Orchestra|Symphony|Conservator|"
    r"Purple_|England|Scotland|Wales|Ireland|France|Germany|Italy|Spain|"
    r"Russia|Europe|America|London|Paris|Vienna|Berlin|Rome|New_York|"
    r"World_War|Academy|University|College|Theatre|Theater|Church_|Cathedral_|"
    r"Museum|Library|Hospital|Hotel|Street|Avenue|River_|Lake_|Mount_|Island_|"
    r"Saint_Stephen$|Fellow$|Doctor$|Professor$|King$|Queen$|Pope$)"
)

ATTRIBUTION = Attribution(
    title="Musical Meetups Knowledge Graph (MMKG)",
    creator="Alba Morales Tirado, Enrico Daga, Jason Carvalho, Paul Mulholland (Polifonia / The Open University)",
    creator_url="https://github.com/polifonia-project/meetups-knowledge-graph",
    source_url="https://doi.org/10.5281/zenodo.7924618",
    project_url="https://github.com/polifonia-project/meetups-knowledge-graph",
    citation=(
        "A. Morales Tirado, J. Carvalho, P. Mulholland, E. Daga, "
        "“Musical Meetups: a Knowledge Graph approach for Historical Social "
        "Network Analysis,” Polifonia MEETUPS Knowledge Graph, "
        "doi:10.5281/zenodo.7924618."
    ),
    citation_doi="10.5281/zenodo.7924618",
    retrieved="2026-09-25",
    modifications=(),
)


def load() -> CanonicalGraph:
    _ensure_raw()
    bios = _biography_uris()
    people_meta: dict[str, dict] = {}
    weights: dict[tuple[str, str], float] = defaultdict(float)
    segments: dict[tuple[str, str], set[str]] = defaultdict(set)

    for path in sorted(SAMPLE_DIR.glob("*.ttl")):
        text = path.read_text(encoding="utf-8", errors="replace")
        typed_people, places, labels, meetups, years = _parse_ttl(text)
        for conf, participants, time_ids in meetups:
            if conf < MIN_CONFIDENCE:
                continue
            cast = sorted(
                {
                    u
                    for u in participants
                    if _keep_person(u, typed_people, places)
                }
            )
            if len(cast) < 2:
                continue
            if not any(u in bios for u in cast):
                continue
            decade = _decade(time_ids, years)
            for i, a in enumerate(cast):
                people_meta.setdefault(
                    a,
                    {
                        "name": labels.get(a) or _display_from_uri(a),
                        "bio": a in bios,
                    },
                )
                if a in labels:
                    people_meta[a]["name"] = labels[a]
                for b in cast[i + 1 :]:
                    key = (a, b)
                    weights[key] += 1.0
                    if decade:
                        segments[key].add(decade)

    if not weights:
        raise RuntimeError("MMKG sample produced no co-participation edges.")

    # Giant component, then drop degree-1 pendants after the cut.
    present = {n for pair in weights for n in pair}
    giant = _giant_component(present, weights)
    weights = {
        pair: w for pair, w in weights.items() if pair[0] in giant and pair[1] in giant
    }
    deg = Counter()
    for a, b in weights:
        deg[a] += 1
        deg[b] += 1
    keep = {n for n, d in deg.items() if d >= 2}
    weights = {pair: w for pair, w in weights.items() if pair[0] in keep and pair[1] in keep}
    keep = {n for pair in weights for n in pair}

    qids = _resolve_dbpedia_qids(sorted(keep))

    decade_labels = sorted({seg for segs in segments.values() for seg in segs})
    order = {seg: i for i, seg in enumerate(decade_labels)}

    nodes = []
    for uri in sorted(keep):
        meta = {"dbpedia": uri, "biographySubject": bool(people_meta[uri].get("bio"))}
        if qids.get(uri):
            meta["wikidata"] = qids[uri]
        nodes.append(
            Node(
                id=_node_id(uri),
                name=people_meta[uri]["name"],
                work="mmkg",
                metadata=meta,
            )
        )
    id_map = {uri: _node_id(uri) for uri in keep}
    edges = [
        Edge(
            source=id_map[a],
            target=id_map[b],
            weight=weights[(a, b)],
            type="cooccurrence",
            segments=tuple(
                sorted(segments.get((a, b), ()), key=lambda s: order.get(s, 0))
            ),
        )
        for a, b in sorted(weights)
    ]

    mods = (
        "Parsed sample_1k_meetups_triples TTLs (the only release slice with "
        "mtp:hasParticipant co-casts; bulk meetups_triples are subject/time stubs).",
        f"Kept meetups with confidence ≥ {MIN_CONFIDENCE}, ≥2 Person-typed "
        "participants, and at least one biography-list musician.",
        "Dropped places and denylisted false persons; kept the giant component "
        f"with degree ≥ 2; decades {YEAR_LO}–{YEAR_HI} as segments.",
        "Resolved DBpedia resource titles to Wikidata QIDs via Wikipedia pageprops.",
    )
    provenance = Provenance(
        dataset="polifonia-mmkg-sample-1k",
        edge_definition="people named together as participants in a biography meetup",
        source_unit="decade",
        weight_semantics="count of shared meetups across the sample corpus",
        attribution=dataclasses.replace(ATTRIBUTION, modifications=mods),
        license=CC_BY_4_0,
    )

    return CanonicalGraph(
        id="mmkg",
        title="Musical Meetups",
        accent="#4A6670",
        nodes=nodes,
        edges=edges,
        provenance=provenance,
        segment_labels={seg: seg for seg in decade_labels},
    ).sorted()


def _ensure_raw() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    if not BIOS_PATH.exists():
        print(f"  fetching MMKG biography list ...", flush=True)
        get(f"{RAW_GITHUB}/data/list-of-biographies.csv", dest=BIOS_PATH)
    if SAMPLE_DIR.is_dir() and any(SAMPLE_DIR.glob("*.ttl")):
        return

    print("  fetching MMKG sample_1k_meetups_triples ...", flush=True)
    SAMPLE_DIR.mkdir(parents=True, exist_ok=True)
    listing = get_json(f"{GITHUB}/data/sample_1k_meetups_triples")
    for item in listing:
        if item.get("type") != "file" or not item["name"].endswith(".ttl"):
            continue
        dest = SAMPLE_DIR / item["name"]
        if dest.exists() and dest.stat().st_size > 0:
            continue
        get(item["download_url"], dest=dest)


def _biography_uris() -> set[str]:
    uris: set[str] = set()
    with BIOS_PATH.open(encoding="utf-8") as handle:
        for line in handle:
            uri = line.strip().split(",")[0]
            if uri.startswith("http://dbpedia.org/resource/"):
                uris.add(uri)
    return uris


def _parse_ttl(text: str) -> tuple[set[str], set[str], dict[str, str], list, dict[str, int]]:
    people: set[str] = set()
    places: set[str] = set()
    labels: dict[str, str] = {}

    for match in re.finditer(
        r"<(http://dbpedia\.org/resource/[^>]+)>\s*((?:.|\n)*?)(?=\n<http://|\nmeetup:|\Z)",
        text,
    ):
        uri, block = match.group(1), match.group(2)
        if "core:Place" in block or "mtp:Location" in block:
            places.add(uri)
        if "core:Person" in block:
            people.add(uri)
        label = re.search(r'rdfs:label\s+"([^"]+)"', block)
        if label:
            labels[uri] = label.group(1)

    years: dict[str, int] = {}
    for match in re.finditer(
        r"meetup:([a-f0-9]+)\s*((?:.|\n)*?)(?=\nmeetup:|\n<http://|\Z)",
        text,
    ):
        tid, block = match.group(1), match.group(2)
        beginning = re.search(r'time:hasBeginning\s+"(\d{4})', block)
        if beginning:
            years[tid] = int(beginning.group(1))

    meetups: list[tuple[float, list[str], list[str]]] = []
    for match in re.finditer(
        r"<(http://w3id\.org/polifonia/pilot/meetups/[^>]+)>\s*"
        r"((?:.|\n)*?)(?=\n<(?:http://w3id\.org/polifonia/pilot/meetups/|http://dbpedia)|\nmeetup:\w|\Z)",
        text,
    ):
        block = match.group(2)
        if "mtp:Meetup" not in block or "mtp:hasParticipant" not in block:
            continue
        conf_m = re.search(r'mtp:hasConfidence\s+"([0-9.]+)"', block)
        conf = float(conf_m.group(1)) if conf_m else 0.0
        part_m = re.search(r"mtp:hasParticipant\s+([^;]+);", block)
        if not part_m:
            continue
        participants = re.findall(
            r"<(http://dbpedia\.org/resource/[^>]+)>", part_m.group(1)
        )
        happens = re.search(r"mtp:happensAt\s+([^;]+);", block)
        time_ids = (
            re.findall(r"meetup:([a-f0-9]+)", happens.group(1)) if happens else []
        )
        meetups.append((conf, participants, time_ids))

    return people, places, labels, meetups, years


def _keep_person(uri: str, people: set[str], places: set[str]) -> bool:
    if uri in places or uri not in people:
        return False
    slug = uri.rsplit("/", 1)[-1]
    if DENY_SLUG.search(slug):
        return False
    return True


def _decade(time_ids: list[str], years: dict[str, int]) -> str | None:
    for tid in time_ids:
        year = years.get(tid)
        if year is not None and YEAR_LO <= year <= YEAR_HI:
            return f"{(year // 10) * 10}s"
    return None


def _giant_component(
    nodes: set[str], weights: dict[tuple[str, str], float]
) -> set[str]:
    adj: dict[str, set[str]] = defaultdict(set)
    for a, b in weights:
        adj[a].add(b)
        adj[b].add(a)
    seen: set[str] = set()
    best: set[str] = set()
    for start in nodes:
        if start in seen:
            continue
        stack = [start]
        seen.add(start)
        component = {start}
        while stack:
            node = stack.pop()
            for nbr in adj[node]:
                if nbr not in seen:
                    seen.add(nbr)
                    stack.append(nbr)
                    component.add(nbr)
        if len(component) > len(best):
            best = component
    return best


def _resolve_dbpedia_qids(uris: list[str]) -> dict[str, str]:
    """Map DBpedia URIs → Wikidata QIDs from MMKG N-Quads (cached), then API."""
    import time

    cache_path = RAW / "dbpedia-qid-map.json"
    cached: dict[str, str] = {}
    if cache_path.exists():
        cached = json.loads(cache_path.read_text(encoding="utf-8"))

    # Prefer offline N-Quads shipped beside the sample TTLs.
    quads_dir = RAW / "meetups_quads"
    if quads_dir.is_dir():
        pat = re.compile(
            r"<(http://dbpedia\.org/resource/[^>]+)>\s+"
            r"<[^>]*hasWikidataEntity>\s+"
            r"<http://www\.wikidata\.org/entity/(Q\d+)>"
        )
        for path in quads_dir.glob("*.nq"):
            text = path.read_text(encoding="utf-8", errors="replace")
            for uri, qid in pat.findall(text):
                cached.setdefault(uri, qid)
        cache_path.write_text(
            json.dumps(cached, ensure_ascii=False, indent=1, sort_keys=True),
            encoding="utf-8",
        )

    missing = [uri for uri in uris if not cached.get(uri)]
    if not missing:
        return {uri: cached[uri] for uri in uris if cached.get(uri)}

    print(f"  resolving {len(missing)} remaining DBpedia titles via Wikidata API ...", flush=True)
    titles = [uri.rsplit("/", 1)[-1] for uri in missing]
    for start in range(0, len(titles), 40):
        batch_uris = missing[start : start + 40]
        batch_titles = titles[start : start + 40]
        query = urllib.parse.urlencode(
            {
                "action": "wbgetentities",
                "sites": "enwiki",
                "titles": "|".join(batch_titles),
                "props": "info",
                "format": "json",
            }
        )
        request = urllib.request.Request(
            f"https://www.wikidata.org/w/api.php?{query}",
            headers={"User-Agent": "YouAreHere-pipeline/0.1 (literary network puzzle)"},
        )
        payload = None
        for attempt in range(8):
            try:
                with urllib.request.urlopen(request, timeout=90) as response:
                    payload = json.loads(response.read().decode("utf-8"))
                break
            except urllib.error.HTTPError as exc:
                if exc.code not in (429, 503) or attempt == 7:
                    print(f"    giving up on batch at {start}: {exc}", flush=True)
                    payload = None
                    break
                wait = min(90, 5 * (2 ** attempt))
                print(f"    rate-limited; sleep {wait}s", flush=True)
                time.sleep(wait)
        if not payload:
            for uri in batch_uris:
                cached.setdefault(uri, "")
            continue

        title_to_uri = {t: u for t, u in zip(batch_titles, batch_uris)}
        title_to_uri.update({t.replace("_", " "): u for t, u in zip(batch_titles, batch_uris)})
        for qid, entity in (payload.get("entities") or {}).items():
            if not re.fullmatch(r"Q\d+", qid) or "missing" in entity:
                continue
            title = entity.get("title") or ""
            uri = title_to_uri.get(title) or title_to_uri.get(title.replace(" ", "_"))
            if uri:
                cached[uri] = qid
        for uri in batch_uris:
            cached.setdefault(uri, "")
        cache_path.write_text(
            json.dumps(cached, ensure_ascii=False, indent=1, sort_keys=True),
            encoding="utf-8",
        )
        time.sleep(2.0)

    return {uri: qid for uri, qid in ((u, cached.get(u) or "") for u in uris) if qid}


def _display_from_uri(uri: str) -> str:
    return uri.rsplit("/", 1)[-1].replace("_", " ")


def _node_id(uri: str) -> str:
    slug = uri.rsplit("/", 1)[-1]
    return re.sub(r"_+", "_", re.sub(r"[^a-z0-9]+", "_", slug.lower())).strip("_")
