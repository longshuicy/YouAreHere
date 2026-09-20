"""Filtering, splitting, and weight normalisation. Dataset-agnostic."""

from __future__ import annotations

import copy
from collections import defaultdict

from .types import CanonicalGraph, Edge, Node


def filter_graph(
    graph: CanonicalGraph,
    *,
    min_edge_weight: float,
    min_degree: int,
    min_component_size: int | None = None,
) -> CanonicalGraph:
    """Drop weak edges, then low-degree nodes. Then either keep only the largest
    connected component (the default — noisy projections leave a spray of pairs)
    or keep every component of at least `min_component_size`. A merged drama
    corpus is many plays sharing few characters; the largest-component rule
    would throw away Hamlet to save the history cycle."""

    before = (len(graph.nodes), len(graph.edges))

    nodes = {n.id: n for n in graph.nodes}
    edges = [e for e in graph.edges if e.weight >= min_edge_weight]

    while True:
        adjacency = _adjacency(edges)
        survivors = {nid for nid in nodes if len(adjacency[nid]) >= min_degree}
        if survivors == set(nodes):
            break
        nodes = {nid: n for nid, n in nodes.items() if nid in survivors}
        edges = [e for e in edges if e.source in survivors and e.target in survivors]

    adjacency = _adjacency(edges)
    if min_component_size is None:
        keep = _largest_component(nodes.keys(), adjacency)
        largest_only = True
    else:
        keep = set()
        for component in _components(nodes.keys(), adjacency):
            if len(component) >= min_component_size:
                keep |= component
        largest_only = False

    nodes = {nid: n for nid, n in nodes.items() if nid in keep}
    edges = [e for e in edges if e.source in keep and e.target in keep]

    graph.provenance.filters = {
        "minEdgeWeight": min_edge_weight,
        "minDegree": min_degree,
        "largestComponentOnly": largest_only,
        "minComponentSize": min_component_size,
        "nodesBefore": before[0],
        "nodesAfter": len(nodes),
        "edgesBefore": before[1],
        "edgesAfter": len(edges),
    }
    if largest_only:
        kept = "then kept the largest connected component"
    else:
        kept = f"then kept every component of at least {min_component_size} characters"
    graph.provenance.with_modification(
        f"Dropped ties weaker than {min_edge_weight:g} and characters with fewer than "
        f"{min_degree} ties, {kept} "
        f"({before[0]} nodes and {before[1]} ties in, {len(nodes)} and {len(edges)} out)."
    )

    return CanonicalGraph(
        id=graph.id,
        title=graph.title,
        accent=graph.accent,
        nodes=list(nodes.values()),
        edges=edges,
        provenance=graph.provenance,
        segment_labels=dict(graph.segment_labels),
    ).sorted()


def split_components(
    graph: CanonicalGraph,
    *,
    min_size: int,
    name,
) -> list[CanonicalGraph]:
    """Break a graph into one universe per connected component.

    Some corpora are not one world. A merged drama corpus is the clear case: the
    cast of Hamlet and the cast of Macbeth share nobody, so a player waking in
    one can never reach the other, and presenting them as a single universe makes
    the story question unanswerable in the wrong way — the shape in front of the
    player is a play, but the answer they are asked for is the whole corpus.
    Every component is separately connected, so each is a world in its own right.

    This is deliberately not a split by *source unit*. Where the units genuinely
    interlock — the English histories share a monarchy, the Roman plays share
    Antony — the component keeps them together, which is the right answer and the
    one a per-play split would destroy.

    `name(node_ids, segments) -> (slug, title)` supplies the identity of each
    world, because only the adapter knows what its segments mean. `slug` is
    appended to the parent id, so Hamlet ships as `shakespeare-hamlet` and stays
    traceable to the corpus it came from.
    """
    adjacency = _adjacency(graph.edges)
    nodes_by_id = {node.id: node for node in graph.nodes}

    components = [c for c in _components(nodes_by_id, adjacency) if len(c) >= min_size]
    components.sort(key=lambda c: (-len(c), min(c)))

    edges_by_component: dict[int, list[Edge]] = defaultdict(list)
    index_of = {node_id: i for i, component in enumerate(components) for node_id in component}
    for edge in graph.edges:
        if edge.source in index_of:
            edges_by_component[index_of[edge.source]].append(edge)

    worlds = []
    slugs: set[str] = set()
    for i, component in enumerate(components):
        edges = edges_by_component[i]
        segments = {segment for edge in edges for segment in edge.segments}
        slug, title = name(component, segments)
        if slug in slugs:
            raise ValueError(
                f"{graph.id}: two components both want the slug '{slug}'. Component naming must "
                f"be injective or the universes overwrite each other's files."
            )
        slugs.add(slug)

        # Worded without this world's own numbers on purpose: every world from a
        # corpus then carries an identical list of changes, which is what lets
        # the credit file state the source once rather than 28 times. The
        # per-world counts are already in `filters` and in the emitted universe.
        provenance = copy.deepcopy(graph.provenance)
        provenance.with_modification(
            f"Split the corpus into one universe per connected component of at least "
            f"{min_size} characters, shipping each of the {len(components)} resulting worlds "
            f"as its own file, since no character links one to another."
        )

        worlds.append(
            CanonicalGraph(
                id=f"{graph.id}-{slug}",
                title=title,
                accent=graph.accent,
                nodes=_drop_redundant_qualifiers([nodes_by_id[node_id] for node_id in component]),
                edges=edges,
                provenance=provenance,
                segment_labels={s: l for s, l in graph.segment_labels.items() if s in segments},
            ).sorted()
        )

    return worlds


def _drop_redundant_qualifiers(nodes: list[Node]) -> list[Node]:
    """Remove a trailing "(Something)" once it is no longer telling anyone apart.

    A merged corpus has to qualify its repeats — there is a Duke of Buckingham in
    both Richard III and Henry VIII — but the qualifier exists to separate names
    that now live in different universes. Left in place it reads as a label on
    the answer: a player guessing "Hamlet (Hamlet)" has been handed the world.

    Only stripped when the bare name is unique in this world, so the repeats that
    survive the split together keep what separates them.
    """
    stems = defaultdict(int)
    for node in nodes:
        stems[_stem(node.name)] += 1

    simplified = []
    for node in nodes:
        stem = _stem(node.name)
        if stem != node.name and stems[stem] == 1:
            aliases = tuple(a for a in node.aliases if a != stem)
            node = Node(id=node.id, name=stem, aliases=aliases, work=node.work, metadata=node.metadata)
        simplified.append(node)
    return simplified


def _stem(name: str) -> str:
    if name.endswith(")") and " (" in name:
        return name[: name.rindex(" (")]
    return name


def weight_ranks(graph: CanonicalGraph) -> dict[tuple[str, str], tuple[float, float]]:
    """Weights are not comparable across datasets, so thickness keys off rank
    rather than raw weight: a thick tie means strong *relative to this
    character's other ties*.

    An edge therefore has two ranks, one per endpoint, and the renderer uses
    whichever endpoint the player is looking out from. Returns 0.0 (this node's
    weakest tie) to 1.0 (its strongest), keyed by the edge's canonical key.
    """
    incident: dict[str, list[Edge]] = defaultdict(list)
    for edge in graph.edges:
        incident[edge.source].append(edge)
        incident[edge.target].append(edge)

    rank_at: dict[str, dict[tuple[str, str], float]] = {}
    for node_id, node_edges in incident.items():
        ordered = sorted(node_edges, key=lambda e: (e.weight, e.key))
        span = len(ordered) - 1
        rank_at[node_id] = {
            edge.key: (i / span if span else 1.0) for i, edge in enumerate(ordered)
        }

    return {
        edge.key: (rank_at[edge.source][edge.key], rank_at[edge.target][edge.key])
        for edge in graph.edges
    }


def degrees(graph: CanonicalGraph) -> dict[str, int]:
    adjacency = _adjacency(graph.edges)
    return {n.id: len(adjacency[n.id]) for n in graph.nodes}


def apply_identity_overrides(graph: CanonicalGraph, overrides: dict[str, dict]) -> CanonicalGraph:
    """Fold the hand-maintained identity table into the adapter's output.

    Unknown ids raise rather than being skipped. A silently ignored typo is the
    worst outcome here: the entry looks applied, the character keeps whatever the
    adapter guessed, and nobody finds out until a player cannot name someone.
    """
    known = {node.id for node in graph.nodes}
    mutating = {
        key
        for key, override in overrides.items()
        if any(field in override for field in ("name", "aliases", "qualifier", "wikidata", "api", "wikidataSearch"))
    }
    unknown = sorted(set(mutating) - known)
    if unknown:
        raise ValueError(
            f"{graph.id}: alias table names {len(unknown)} id(s) that are not in the graph: "
            f"{', '.join(unknown[:5])}{' ...' if len(unknown) > 5 else ''}. "
            f"Note that filtering runs after this, so an id dropped for low degree still belongs here."
        )

    nodes = []
    for node in graph.nodes:
        override = overrides.get(node.id)
        if not override:
            nodes.append(node)
            continue

        aliases = list(node.aliases)
        for alias in override.get("aliases", ()):
            if alias not in aliases:
                aliases.append(alias)

        metadata = dict(node.metadata)
        if override.get("qualifier"):
            metadata["qualifier"] = override["qualifier"]

        nodes.append(
            Node(
                id=node.id,
                name=override.get("name", node.name),
                aliases=tuple(aliases),
                work=node.work,
                metadata=metadata,
            )
        )

    graph.provenance.with_modification(
        f"Applied a hand-maintained identity table covering {len(overrides)} characters: "
        f"display names, nicknames for the guess field, and disambiguators."
    )

    return CanonicalGraph(
        id=graph.id,
        title=graph.title,
        accent=graph.accent,
        nodes=nodes,
        edges=graph.edges,
        provenance=graph.provenance,
        segment_labels=dict(graph.segment_labels),
    ).sorted()


def load_identity_table(path, work: str) -> dict[str, dict]:
    """Read one universe's section from a YAML identity table.

    Duplicate keys are rejected. YAML's default behaviour is to keep the last
    occurrence and say nothing, which in a hand-maintained file that grows by
    section is a trap: a character listed once for a nickname and again for a
    source pin silently loses whichever came first.
    """
    import yaml

    if not path.exists():
        return {}

    class StrictLoader(yaml.SafeLoader):
        pass

    def no_duplicates(loader, node, deep=False):
        seen = set()
        for key_node, _ in node.value:
            key = loader.construct_object(key_node, deep=deep)
            if key in seen:
                raise ValueError(f"{path.name}: '{key}' is defined more than once. Merge the entries.")
            seen.add(key)
        return yaml.SafeLoader.construct_mapping(loader, node, deep)

    StrictLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, no_duplicates)

    table = yaml.load(path.read_text(encoding="utf-8"), Loader=StrictLoader) or {}
    return table.get(work) or {}


def _adjacency(edges: list[Edge]) -> dict[str, set[str]]:
    adjacency: dict[str, set[str]] = defaultdict(set)
    for edge in edges:
        adjacency[edge.source].add(edge.target)
        adjacency[edge.target].add(edge.source)
    return adjacency


def _components(node_ids, adjacency: dict[str, set[str]]) -> list[set[str]]:
    unvisited = set(node_ids)
    found = []
    while unvisited:
        seed = min(unvisited)
        component = {seed}
        frontier = [seed]
        while frontier:
            current = frontier.pop()
            for neighbour in adjacency[current]:
                if neighbour not in component:
                    component.add(neighbour)
                    frontier.append(neighbour)
        unvisited -= component
        found.append(component)
    return found


def _largest_component(node_ids, adjacency: dict[str, set[str]]) -> set[str]:
    parts = _components(node_ids, adjacency)
    return max(parts, key=len) if parts else set()
