"""Pride and Prejudice — chapter co-occurrence (Nation, Genre & Gender / UCD).

People only: collective nodes and annotation stubs are dropped.
See raw/pride/SOURCE.md.
"""

from __future__ import annotations

import dataclasses
import re
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from collections import defaultdict
from io import BytesIO
from pathlib import Path

from ..canon.licenses import CC_BY_NC_4_0
from ..canon.types import Attribution, CanonicalGraph, Edge, Node, Provenance

RAW = Path(__file__).resolve().parent.parent / "raw" / "pride"
ZIP_URL = "http://www.nggprojectucd.ie/data/files/ngg-pride_prejudice.zip"
INNER = "pride_prejudice"

# Annotation stubs and collectives that are not a person a player can name.
DROP_IDS = {
    "general 1",
    "all the servants",
    "all their other neighbours",
    "darcy's servants",
    "darcy's tenants",
    "miss king's grandfather",
}

# Attribute tokens that are kinship or marital status, not a standing role.
KINSHIP = {
    "daughter",
    "son",
    "sister",
    "brother",
    "wife",
    "husband",
    "father",
    "mother",
    "cousin",
    "aunt",
    "uncle",
    "nephew",
    "niece",
    "child",
    "widow",
    "widower",
    "unmarried/married",
    "employer",
}

ATTRIBUTION = Attribution(
    title="Pride and Prejudice character networks (Nation, Genre & Gender)",
    creator="Gerardine Meaney, Derek Greene, Karen Wade, Maria Mulvany, Siobhan Grayson, Jennie Rothwell",
    creator_url="http://www.nggprojectucd.ie/",
    source_url="http://www.nggprojectucd.ie/data/index.html",
    project_url="http://www.nggprojectucd.ie/",
    citation=(
        "G. Meaney, D. Greene, K. Wade, et al., Nation, Genre & Gender project, "
        "University College Dublin. Pride and Prejudice annotated character networks."
    ),
    retrieved="2026-09-24",
    modifications=(
        "Merged 61 per-chapter GEXF networks into one graph, summing tie weights "
        "and recording chapter segments.",
        "Dropped collective nodes and annotation stubs (General 1, all the servants, …).",
        "Applied dictionary aliases; normalised gender from the attributes table.",
    ),
)


def load() -> CanonicalGraph:
    root = _ensure_raw()
    people = _people(root / "dictionary.txt", root / "attributes.txt")

    weights: dict[tuple[str, str], float] = defaultdict(float)
    segments: dict[tuple[str, str], set[str]] = defaultdict(set)
    labels: dict[str, str] = {}

    for path in sorted((root / "networks").glob("chapter_*.gexf")):
        match = re.fullmatch(r"chapter_(\d+)", path.stem)
        if not match:
            continue
        number = int(match.group(1))
        segment = f"ch{number:02d}"
        labels[segment] = f"Chapter {number}"
        for source, target, weight in _gexf_edges(path):
            if source not in people or target not in people:
                continue
            a, b = (source, target) if source <= target else (target, source)
            weights[(a, b)] += weight
            segments[(a, b)].add(segment)

    present = {nid for pair in weights for nid in pair}
    order = {seg: i for i, seg in enumerate(sorted(labels, key=lambda s: int(s[2:])))}

    nodes = [
        Node(
            id=_node_id(nid),
            name=people[nid]["name"],
            aliases=tuple(people[nid]["aliases"]),
            work="pride",
            metadata={
                "gender": people[nid]["gender"],
                "role": people[nid]["role"],
            },
        )
        for nid in sorted(present)
    ]
    # Remap edge endpoints to slug ids.
    id_map = {nid: _node_id(nid) for nid in present}
    edges = [
        Edge(
            source=id_map[source],
            target=id_map[target],
            weight=weights[(source, target)],
            type="cooccurrence",
            segments=tuple(sorted(segments[(source, target)], key=order.__getitem__)),
        )
        for source, target in sorted(weights)
    ]

    provenance = Provenance(
        dataset="ngg-pride-and-prejudice-v1",
        edge_definition="characters who co-occur in the same chapter",
        source_unit="chapter",
        weight_semantics="count of shared chapters, across all 61 chapters",
        attribution=dataclasses.replace(ATTRIBUTION),
        license=CC_BY_NC_4_0,
    )

    return CanonicalGraph(
        id="pride",
        title="Pride and Prejudice",
        accent="#6B4E3D",
        nodes=nodes,
        edges=edges,
        provenance=provenance,
        segment_labels={seg: labels[seg] for seg in sorted(labels, key=order.__getitem__)},
    ).sorted()


def _ensure_raw() -> Path:
    root = RAW / INNER
    networks = root / "networks"
    if networks.is_dir() and any(networks.glob("chapter_*.gexf")):
        return root

    RAW.mkdir(parents=True, exist_ok=True)
    print(f"  fetching {ZIP_URL} ...", flush=True)
    request = urllib.request.Request(ZIP_URL, headers={"User-Agent": "YouAreHere-pipeline/0.1"})
    with urllib.request.urlopen(request, timeout=120) as response:
        payload = response.read()
    with zipfile.ZipFile(BytesIO(payload)) as archive:
        archive.extractall(RAW)
    if not networks.is_dir():
        raise FileNotFoundError(f"Pride and Prejudice zip unpacked but {networks} is missing.")
    return root


def _node_id(raw: str) -> str:
    return re.sub(r"_+", "_", re.sub(r"[^a-z0-9]+", "_", raw.lower())).strip("_")


def _people(dictionary: Path, attributes: Path) -> dict[str, dict]:
    attrs = _attributes(attributes)
    people: dict[str, dict] = {}
    with dictionary.open(encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line or ":" not in line:
                continue
            key, _, rest = line.partition(":")
            key = key.strip().lower()
            if not key or key in DROP_IDS:
                continue
            attr_tokens = attrs.get(key, [])
            if "collective" in attr_tokens:
                continue
            if key.startswith("all "):
                continue

            forms = [p.strip() for p in rest.split(",") if p.strip()]
            display = _title_case(forms[0] if forms else key)
            aliases = []
            for form in forms[1:]:
                if _descriptive_alias(form):
                    continue
                alias = _title_case(form)
                if alias and alias != display and alias not in aliases:
                    aliases.append(alias)

            gender_raw = next((t for t in attr_tokens if t in ("male", "female")), "")
            gender = {"male": "Male", "female": "Female"}.get(gender_raw, "")
            role = _role_from_attrs(attr_tokens)

            people[key] = {
                "name": display,
                "aliases": aliases,
                "gender": gender,
                "role": role,
            }
    return people


def _attributes(path: Path) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line or ":" not in line:
                continue
            key, _, rest = line.partition(":")
            tokens = [t.strip().lower() for t in rest.split(",") if t.strip()]
            out[key.strip().lower()] = tokens
    return out


def _role_from_attrs(tokens: list[str]) -> str:
    """Pick a standing role that is not merely kinship or nationality."""
    skip = KINSHIP | {"male", "female", "english", "?", "collective"}
    for token in tokens:
        if token in skip:
            continue
        # Prefer concrete stations.
        if token in {
            "clergyman",
            "officer",
            "colonel",
            "captain",
            "solicitor",
            "apothecary",
            "housekeeper",
            "steward",
            "servant",
            "governess",
            "ladies' companion",
            "aristocrat",
            "landowner",
            "gentleman",
            "soldier",
            "private",
            "tenant",
            "attorney",
        }:
            return token
    for token in tokens:
        if token not in skip:
            return token
    return ""


def _descriptive_alias(form: str) -> bool:
    """Skip dictionary glosses that are descriptions, not names a player types."""
    text = form.strip().lower()
    if len(text) > 40:
        return True
    if text.startswith(
        ("a ", "an ", "one of ", "the late ", "the present ", "the eldest ", "my ", "your ")
    ):
        # Keep short title-like forms: "the late mr. darcy" is useful; long ones are not.
        if len(text) > 28:
            return True
    return False


def _title_case(name: str) -> str:
    """Title-case a dictionary form, keeping Mr./Mrs./Miss and small words."""
    name = name.strip()
    if not name:
        return name
    small = {"a", "an", "the", "of", "and", "de"}
    parts = []
    for i, word in enumerate(name.split()):
        lower = word.lower()
        if lower in {"mr.", "mrs.", "miss", "ms.", "dr.", "sir", "lady", "lord", "colonel", "captain"}:
            if lower.endswith("."):
                parts.append(lower[:-1].title() + ".")
            else:
                parts.append(lower.title())
        elif "-" in word:
            parts.append("-".join(p.title() for p in word.split("-")))
        elif i > 0 and lower in small:
            parts.append(lower)
        else:
            parts.append(word.title())
    return " ".join(parts)


def _gexf_edges(path: Path) -> list[tuple[str, str, float]]:
    root = ET.parse(path).getroot()

    def local(tag: str) -> str:
        return tag.split("}")[-1]

    edges: list[tuple[str, str, float]] = []
    for el in root.iter():
        if local(el.tag) != "edge":
            continue
        source = (el.get("source") or "").strip().lower()
        target = (el.get("target") or "").strip().lower()
        if not source or not target or source == target:
            continue
        try:
            weight = float(el.get("weight") or 1)
        except ValueError:
            weight = 1.0
        edges.append((source, target, weight))
    return edges
