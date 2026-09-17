"""Filtering and weight normalisation. Dataset-agnostic."""

from __future__ import annotations

from collections import defaultdict

from .types import CanonicalGraph, Edge, Node


def filter_graph(
    graph: CanonicalGraph,
    *,
    min_edge_weight: float,
    min_degree: int,
) -> CanonicalGraph:
    """Drop weak edges, then low-degree nodes, then everything outside the
    largest connected component. Dropping nodes can orphan others, so iterate
    until stable. Before-and-after counts land in provenance.filters."""

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

    component = _largest_component(nodes.keys(), _adjacency(edges))
    nodes = {nid: n for nid, n in nodes.items() if nid in component}
    edges = [e for e in edges if e.source in component and e.target in component]

    graph.provenance.filters = {
        "minEdgeWeight": min_edge_weight,
        "minDegree": min_degree,
        "largestComponentOnly": True,
        "nodesBefore": before[0],
        "nodesAfter": len(nodes),
        "edgesBefore": before[1],
        "edgesAfter": len(edges),
    }
    graph.provenance.with_modification(
        f"Dropped ties weaker than {min_edge_weight:g} and characters with fewer than "
        f"{min_degree} ties, then kept the largest connected component "
        f"({before[0]} nodes and {before[1]} ties in, {len(nodes)} and {len(edges)} out)."
    )

    return CanonicalGraph(
        id=graph.id,
        title=graph.title,
        accent=graph.accent,
        nodes=list(nodes.values()),
        edges=edges,
        provenance=graph.provenance,
    ).sorted()


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
    unknown = sorted(set(overrides) - known)
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


def _largest_component(node_ids, adjacency: dict[str, set[str]]) -> set[str]:
    unvisited = set(node_ids)
    largest: set[str] = set()
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
        if len(component) > len(largest):
            largest = component
    return largest
