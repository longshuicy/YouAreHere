"""JSON writers.

Two rules are enforced here rather than trusted to reviewers: a universe cannot
be written without complete attribution, and no name may reach index.json.
"""

from __future__ import annotations

import json
from pathlib import Path

from ..analyse import layout, starts
from ..canon.normalise import weight_ranks
from ..canon.types import CanonicalGraph
from ..enrich import describe

PIPELINE_VERSION = "0.1.0-thin"

REQUIRED_ATTRIBUTION = ("title", "creator", "source_url", "retrieved")


def write_universe(graph: CanonicalGraph, uid: str, out: Path) -> dict:
    _require_attribution(graph)

    positions = layout.compute(graph)
    ranks = weight_ranks(graph)
    playable, start_stats = starts.select(graph)

    graph.provenance.with_modification(
        "Added a normalised rank per tie endpoint so thickness reads relative to each "
        "character's own ties rather than raw counts."
    )
    graph.provenance.with_modification(
        "Computed a force-directed layout for the full graph, used by the reveal animation."
    )

    index_of = {node.id: i for i, node in enumerate(graph.nodes)}

    nodes = []
    for node in graph.nodes:
        x, y = positions[node.id]
        record = {"i": index_of[node.id], "n": node.name, "x": x, "y": y}
        if node.aliases:
            record["a"] = list(node.aliases)
        nodes.append(record)

    edges = [
        [
            index_of[edge.source],
            index_of[edge.target],
            edge.weight,
            round(ranks[edge.key][0], 3),
            round(ranks[edge.key][1], 3),
        ]
        for edge in graph.edges
    ]

    puzzles = [
        {"id": f"{uid}-p{index_of[node_id]:04d}", "you": index_of[node_id], "startRadius": 1}
        for node_id in playable
    ]

    universe = {
        "id": uid,
        "title": graph.title,
        "accent": graph.accent,
        "nodes": nodes,
        "edges": edges,
        "playable": [index_of[node_id] for node_id in playable],
        "puzzles": puzzles,
        "provenance": _provenance_json(graph),
    }

    out.mkdir(parents=True, exist_ok=True)
    _write_json(out / f"{uid}.json", universe)

    return {
        "id": uid,
        "file": f"{uid}.json",
        "source": graph.id,
        "title": graph.title,
        "nodes": len(nodes),
        "edges": len(edges),
        "characterNames": [node.name for node in graph.nodes],
        "playable": _band_counts(puzzles),
        "license": graph.provenance.license.spdx,
        "creditLine": graph.provenance.attribution.credit_line(graph.provenance.license),
        "startStats": start_stats,
    }


def _band_counts(puzzles: list[dict]) -> dict:
    """How many starts of each band a universe holds.

    This is the only puzzle-shaped thing the boot payload needs. The game serves
    approachable starts first, so it has to choose which universe to fetch before
    it has fetched any — and a per-puzzle manifest would put the entire catalogue
    in front of the first frame to answer a question these counts answer.

    Bands are absent until difficulty is measured, so everything currently lands
    in `unbanded`; the tally starts reporting real bands the moment puzzle records
    carry them, with no change here.
    """
    counts = {"total": len(puzzles)}
    for puzzle in puzzles:
        key = puzzle.get("band") or "unbanded"
        counts[key] = counts.get(key, 0) + 1
    return counts


def write_index(summaries: list[dict], out: Path) -> None:
    """Loaded at boot.

    Universes are listed under their own names, so this does say which books are
    loaded. That is not a secret: the guess screen shows the same list in its
    story dropdown.

    What must not appear here is any character name, because the type-ahead
    deliberately draws from every universe so the player cannot learn how large
    one book's cast is. A cast list in the boot payload would give that away.

    It carries no puzzle list either. A puzzle is addressable as a universe plus
    a node index, so the client resolves `asoiaf-p0137` by fetching `asoiaf` and
    reading its own puzzle records; enumerating them here would only grow the
    boot payload with every universe added.
    """
    index = {
        "pipelineVersion": PIPELINE_VERSION,
        "banded": bool(summaries) and all(s["playable"].get("unbanded", 0) == 0 for s in summaries),
        "universes": [
            {
                "id": s["id"],
                "file": s["file"],
                "nodes": s["nodes"],
                "edges": s["edges"],
                "playable": s["playable"],
            }
            for s in summaries
        ],
    }

    _assert_no_character_names(index, summaries)
    _write_json(out / "index.json", index)


def write_metadata(
    graph: CanonicalGraph,
    uid: str,
    node_facts: dict,
    edge_facts: dict,
    sources: list[tuple],
    out: Path,
) -> dict:
    """Reveal-only enrichment, written to its own file.

    Separate from the universe file for two reasons. It is fetched only when the
    reveal fires, so a session that ends in a wrong guess never pays for it. And
    it keeps differently-licensed material in a separate artifact: a file mixing
    this with the graph would be a single adaptation needing one combined
    licence, which for some source pairings does not exist.
    """
    target = graph.provenance.license
    for attribution, license in sources:
        if not license.can_merge_into(target):
            raise ValueError(
                f"{graph.id}: '{attribution.title}' is {license.spdx}, which cannot be combined "
                f"into {target.spdx} data. ShareAlike forbids adding restrictions, so the result "
                f"would have no valid licence. Drop the source or find a permissive equivalent."
            )

    index_of = {node.id: i for i, node in enumerate(graph.nodes)}

    nodes = {}
    for node_id, record in sorted(node_facts.items()):
        if node_id not in index_of:
            continue  # dropped by filtering
        line = describe.node_line(record)
        entry = {"facts": record}
        if line:
            entry["line"] = line
        nodes[str(index_of[node_id])] = entry

    edges = {}
    for (source, target_id), record in sorted(edge_facts.items()):
        if source not in index_of or target_id not in index_of:
            continue
        key = f"{index_of[source]}-{index_of[target_id]}"
        line = describe.edge_line(record)
        entry = {"facts": record}
        if line:
            entry["line"] = line
        edges[key] = entry

    metadata = {
        "id": uid,
        "revealOnly": True,
        "nodes": nodes,
        "edges": edges,
        "sources": [
            {
                "title": attribution.title,
                "creator": attribution.creator,
                "url": attribution.source_url,
                "license": license.spdx,
                "licenseUrl": license.url,
                "modifications": list(attribution.modifications),
            }
            for attribution, license in sources
        ],
    }

    out.mkdir(parents=True, exist_ok=True)
    _write_json(out / f"{uid}.meta.json", metadata)

    return {
        "file": f"{uid}.meta.json",
        "nodes": len(nodes),
        "edges": len(edges),
        "sources": list(sources),
    }


def write_attribution(summaries: list[dict], graphs: dict[str, CanonicalGraph], out: Path) -> None:
    """Credit and licence terms, travelling with the data they describe.

    Not fetched by the app, so it can name the books freely.
    """
    share_alike = sorted(
        {graphs[s["source"]].provenance.license.spdx
         for s in summaries
         if graphs[s["source"]].provenance.license.share_alike}
    )
    noncommercial = sorted(
        {graphs[s["source"]].provenance.license.spdx
         for s in summaries
         if not graphs[s["source"]].provenance.license.allows_commercial_use}
    )

    lines = [
        "# Attribution",
        "",
        "Generated by `python -m pipeline build`. Do not edit by hand.",
        "",
        "The graphs in this directory are adaptations of third-party datasets. Each is credited",
        "below with its licence and a statement of what was changed, as those licences require.",
        "",
    ]

    for summary in summaries:
        graph = graphs[summary["source"]]
        attribution = graph.provenance.attribution
        license = graph.provenance.license

        lines += [
            f"## {graph.title}",
            "",
            f"*Shipped as `{summary['file']}` — {summary['nodes']} characters, {summary['edges']} ties.*",
            "",
            f"\"{attribution.title}\" by **{attribution.creator}**"
            + (f" (<{attribution.creator_url}>)" if attribution.creator_url else ""),
            "",
            f"- Source: <{attribution.source_url}>",
        ]
        if attribution.project_url:
            lines.append(f"- Project: <{attribution.project_url}>")
        lines.append(f"- Licence: [{license.name}]({license.url}) (`{license.spdx}`)")
        if attribution.retrieved:
            lines.append(f"- Retrieved: {attribution.retrieved}")
        if attribution.citation:
            citation = attribution.citation
            if attribution.citation_doi:
                citation += f" DOI: [{attribution.citation_doi}](https://doi.org/{attribution.citation_doi})"
            lines.append(f"- Cite as: {citation}")

        lines += ["", "Changes made to the original data:", ""]
        lines += [f"{i}. {change}" for i, change in enumerate(attribution.modifications, 1)]
        lines.append("")

        for meta_attribution, meta_license in summary.get("metaSources", ()):
            lines += [
                f"### Reveal-screen enrichment — {meta_attribution.title}",
                "",
                f"*Shipped separately as `{summary['metaFile']}`, loaded only at the reveal.*",
                "",
                f"by **{meta_attribution.creator}**"
                + (f" (<{meta_attribution.creator_url}>)" if meta_attribution.creator_url else ""),
                "",
                f"- Source: <{meta_attribution.source_url}>",
                f"- Terms: {meta_license.name} (`{meta_license.spdx}`)",
            ]
            if meta_attribution.retrieved:
                lines.append(f"- Retrieved: {meta_attribution.retrieved}")
            lines += ["", "Used as follows:", ""]
            lines += [f"{i}. {change}" for i, change in enumerate(meta_attribution.modifications, 1)]
            lines.append("")

    lines += ["## What these terms require of this project", ""]
    if share_alike:
        lines += [
            f"**ShareAlike** ({', '.join(share_alike)}). The files in this directory are adaptations of",
            "ShareAlike-licensed data and are distributed under the same terms — see `LICENSE` here,",
            "which governs `/data` specifically and not the application source code.",
            "",
        ]
    if noncommercial:
        lines += [
            f"**NonCommercial** ({', '.join(noncommercial)}). While these datasets ship, the game may not",
            "be put to commercial use. Removing or replacing them is what lifts that restriction.",
            "",
        ]

    out.mkdir(parents=True, exist_ok=True)
    (out / "ATTRIBUTION.md").write_text("\n".join(lines), encoding="utf-8")


def write_data_license(summaries: list[dict], graphs: dict[str, CanonicalGraph], out: Path) -> None:
    """The emitted graphs inherit the most restrictive terms among their sources."""
    licenses = {graphs[s["source"]].provenance.license.spdx: graphs[s["source"]].provenance.license
                for s in summaries}
    effective = sorted(
        licenses.values(),
        key=lambda lic: (lic.allows_commercial_use, not lic.share_alike, lic.spdx),
    )[0]

    body = [
        "Licence for the contents of /data",
        "=" * 33,
        "",
        "These files are adaptations of third-party datasets and are NOT covered by the",
        "licence of the application source code. See ATTRIBUTION.md in this directory for",
        "the credit, citation, and list of changes each source requires.",
        "",
        f"Effective licence: {effective.name} ({effective.spdx})",
        f"Full terms: {effective.url}",
        "",
        effective.deed_summary,
        "",
    ]
    if len(licenses) > 1:
        body += [
            "Sources ship under more than one licence; the most restrictive is applied above.",
            "Per-source terms:",
            "",
        ]
        for summary in summaries:
            license = graphs[summary["source"]].provenance.license
            body.append(f"  {summary['file']}  {license.spdx}  {license.url}")
        body.append("")

    out.mkdir(parents=True, exist_ok=True)
    (out / "LICENSE").write_text("\n".join(body), encoding="utf-8")


def _provenance_json(graph: CanonicalGraph) -> dict:
    provenance = graph.provenance
    attribution = provenance.attribution
    license = provenance.license
    return {
        "dataset": provenance.dataset,
        "edgeDefinition": provenance.edge_definition,
        "sourceUnit": provenance.source_unit,
        "weightSemantics": provenance.weight_semantics,
        "filters": provenance.filters,
        "license": {
            "name": license.name,
            "spdx": license.spdx,
            "url": license.url,
            "allowsCommercialUse": license.allows_commercial_use,
            "shareAlike": license.share_alike,
        },
        "attribution": {
            "title": attribution.title,
            "creator": attribution.creator,
            "creatorUrl": attribution.creator_url,
            "sourceUrl": attribution.source_url,
            "projectUrl": attribution.project_url,
            "citation": attribution.citation,
            "citationDoi": attribution.citation_doi,
            "retrieved": attribution.retrieved,
            "modifications": list(attribution.modifications),
        },
        "creditLine": attribution.credit_line(license),
    }


def _require_attribution(graph: CanonicalGraph) -> None:
    attribution = graph.provenance.attribution
    missing = [field for field in REQUIRED_ATTRIBUTION if not getattr(attribution, field)]
    if missing:
        raise ValueError(
            f"{graph.id}: cannot emit a universe without attribution. Missing: {', '.join(missing)}. "
            f"Fill these in the adapter's Provenance before building."
        )
    if not graph.provenance.license.url:
        raise ValueError(
            f"{graph.id}: licence terms are unresolved. Establish them before shipping this source — "
            f"see pipeline/canon/licenses.py."
        )
    if not attribution.modifications:
        raise ValueError(
            f"{graph.id}: attribution must state that changes were made, and none are recorded."
        )


def _assert_no_character_names(index: dict, summaries: list[dict]) -> None:
    """Book titles in the boot payload are fine; a cast list is not."""
    serialised = json.dumps(index, ensure_ascii=False).lower()
    for summary in summaries:
        for name in summary["characterNames"]:
            if len(name) > 3 and name.lower() in serialised:
                raise ValueError(
                    f"index.json leaks the character name '{name}'. The boot payload must not "
                    f"reveal any universe's cast."
                )


def _write_json(path: Path, payload) -> None:
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=1, sort_keys=False) + "\n",
        encoding="utf-8",
    )
