"""JSON writers.

Two rules are enforced here rather than trusted to reviewers: a universe cannot
be written without complete attribution, and no name may reach index.json.
"""

from __future__ import annotations

import json
from pathlib import Path

from ..analyse import difficulty, layout, starts
from ..canon.normalise import weight_ranks
from ..canon.types import CanonicalGraph
from ..enrich import describe

PIPELINE_VERSION = "0.1.0-thin"

# Resolution of the per-world difficulty histogram in the boot payload.
EASE_BUCKETS = 10

REQUIRED_ATTRIBUTION = ("title", "creator", "source_url", "retrieved")


def write_universe(graph: CanonicalGraph, uid: str, out: Path, corpus_index: dict) -> dict:
    _require_attribution(graph)

    positions = layout.compute(graph)
    ranks = weight_ranks(graph)
    playable, start_stats = starts.select(graph)
    scores = difficulty.score(graph, playable, corpus_index)

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

    # The score travels; the signals behind it do not. `lookAlikes` and
    # `prominence` would hand a curious player a far sharper hint — "you have no
    # look-alikes anywhere" narrows the field much further than a position on a
    # scale does.
    #
    # `ease` itself is shipped because the client slides along it, and that costs
    # nothing it was protecting: a player who sets the slider already knows
    # roughly how findable the start they are about to get is, because that is
    # exactly what they just asked for.
    puzzles = [
        {
            "id": f"{uid}-p{index_of[node_id]:04d}",
            "you": index_of[node_id],
            "startRadius": 1,
            "ease": scores[node_id]["ease"],
        }
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
        "playable": _ease_spread(puzzles),
        "license": graph.provenance.license.spdx,
        "creditLine": graph.provenance.attribution.credit_line(graph.provenance.license),
        "startStats": start_stats,
        "difficulty": _difficulty_summary(scores),
    }


def _difficulty_summary(scores: dict) -> dict:
    """Build-time only: the spread behind the scores, for sanity at the console."""
    if not scores:
        return {"starts": 0}
    eases = sorted(s["ease"] for s in scores.values())
    twins = sorted(s["lookAlikes"] for s in scores.values())
    mid = len(eases) // 2
    return {
        "starts": len(eases),
        "medianEase": eases[mid],
        "medianLookAlikes": twins[mid],
        "maxLookAlikes": twins[-1],
    }


def _ease_spread(puzzles: list[dict]) -> dict:
    """How this universe's starts are spread along the difficulty scale.

    The boot payload needs this and nothing else about puzzles. The client picks
    which world to fetch before it has fetched any, and it picks by where the
    player has set the slider — so it has to know, per world, how many starts sit
    near that position. A world whose every start is at the far end should not be
    offered to someone asking for the near end.

    Deliberately a histogram rather than two named bands. The score is
    continuous; cutting it in two and shipping the halves would put a boundary
    where the measurement has none, and the client would then be sliding along a
    scale whose summary disagreed with it. The bucket edges here are only a
    resolution, not a claim that anything changes at them.
    """
    histogram = [0] * EASE_BUCKETS
    for puzzle in puzzles:
        slot = min(EASE_BUCKETS - 1, int(puzzle["ease"] * EASE_BUCKETS))
        histogram[max(0, slot)] += 1
    return {"total": len(puzzles), "histogram": histogram}


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
        "easeBuckets": EASE_BUCKETS,
        "universes": [
            {
                "id": s["id"],
                "file": s["file"],
                # The world's name, so the client can offer the list of stories
                # before it has fetched any of them. Safe for the same reason the
                # ids are: the guess screen shows this list anyway.
                "title": s["title"],
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
    scores: dict[str, dict] | None = None,
    work_wiki: dict[str, str] | None = None,
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
    world_size = len(graph.segment_labels) if graph.segment_labels else 0
    allowed_labels = (
        set(graph.segment_labels.values()) | set(graph.segment_labels) if graph.segment_labels else set()
    )

    scores = scores or {}

    nodes = {}
    for node_id, record in sorted(node_facts.items()):
        if node_id not in index_of:
            continue  # dropped by filtering
        view = _world_view(record, world_size, allowed_labels)
        # Wikipedia sitelinks are not facts for the composed line; lift them off.
        wiki = view.pop("wiki", None)
        wiki_lang = view.pop("wikiLang", None)
        line = describe.node_line(view)
        shipped = {k: v for k, v in view.items() if k != "worldSize"}
        entry = {"facts": shipped}
        if line:
            entry["line"] = line
        if wiki:
            entry["wiki"] = wiki
            if wiki_lang:
                entry["wikiLang"] = wiki_lang
        # The signals behind the difficulty score. They are withheld from the
        # universe file, where they would be a far sharper hint than `ease` --
        # "you have no look-alikes anywhere" narrows the field enormously -- but
        # this file is the reveal's, and by then the narrowing is the point:
        # `lookAlikes` is the game's own thesis said back to the player, and it
        # is already computed.
        # Only `lookAlikes`, because only `lookAlikes` needs to be built. It
        # counts structural twins *in other novels*, and a client able to work
        # that out would be one that had downloaded every novel. `prominence`
        # and `company` shipped alongside it for a while on no better reasoning
        # than that they sat next to it in the score; both are weighted degree
        # over the one universe the client already holds, and it already holds
        # every tie weight because it draws thickness with them. Sending the
        # answer as well was fifty kilobytes of the same number twice, and a
        # second definition to keep in step with this one.
        # `nearest` travels with it, and is the other half of the same thesis.
        # The count says how many people wear this shape; it cannot say who,
        # because a bucket has no inside order. The name comes from a distance
        # instead, and it is the one reading at the reveal that needs the whole
        # catalogue rather than the book in hand — which is exactly the test for
        # what belongs in this file.
        signals = scores.get(node_id)
        if signals:
            entry["signals"] = {"lookAlikes": signals["lookAlikes"]}
            if signals.get("nearest"):
                entry["signals"]["nearest"] = signals["nearest"]
        nodes[str(index_of[node_id])] = entry

    edges = {}
    for (source, target_id), record in sorted(edge_facts.items()):
        if source not in index_of or target_id not in index_of:
            continue
        key = f"{index_of[source]}-{index_of[target_id]}"
        view = _world_view(record, world_size, allowed_labels)
        line = describe.edge_line(view)
        shipped = {k: v for k, v in view.items() if k != "worldSize"}
        entry = {"facts": shipped}
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
    if work_wiki and work_wiki.get("title"):
        metadata["workWiki"] = work_wiki["title"]
        if work_wiki.get("lang"):
            metadata["workWikiLang"] = work_wiki["lang"]

    out.mkdir(parents=True, exist_ok=True)
    _write_json(out / f"{uid}.meta.json", metadata)

    return {
        "file": f"{uid}.meta.json",
        "nodes": len(nodes),
        "edges": len(edges),
        "sources": list(sources),
    }


def _world_view(record: dict, world_size: int, allowed_labels: set[str]) -> dict:
    """Facts as seen from one emitted world.

    Enrichment runs on the pre-split corpus, so Shakespeare characters carry a
    corpusSize of 37. Presence lines must reason about this world's segments —
    otherwise every Hamlet line reads "Appears in Hamlet."
    """
    view = dict(record)
    if world_size:
        view["worldSize"] = world_size
    books = view.get("books") or []
    if books and allowed_labels:
        filtered = [b for b in books if b in allowed_labels]
        if filtered:
            view["books"] = filtered
    return view


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

    # One section per source, not per file. A corpus that splits into 28 worlds
    # owes its creator one credit, stated once and listing everything it covers;
    # repeating an identical block 28 times satisfies the licence but buries the
    # other sources between the copies.
    for group in _group_by_credit(summaries, graphs):
        graph = graphs[group[0]["source"]]
        attribution = graph.provenance.attribution
        license = graph.provenance.license

        lines += [
            f"## {_group_heading(group, graphs)}",
            "",
            _shipped_as(group),
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

        for meta_attribution, meta_license in group[0].get("metaSources", ()):
            lines += [
                f"### Reveal-screen enrichment — {meta_attribution.title}",
                "",
                f"*Shipped separately as {_meta_files(group)}, loaded only at the reveal.*",
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


def _group_by_credit(summaries: list[dict], graphs: dict) -> list[list[dict]]:
    """Summaries that owe the same credit, in the order their sources first appear."""
    groups: dict[tuple, list[dict]] = {}
    for summary in summaries:
        provenance = graphs[summary["source"]].provenance
        key = (
            provenance.attribution.title,
            provenance.attribution.creator,
            provenance.attribution.source_url,
            provenance.license.spdx,
            provenance.attribution.modifications,
        )
        groups.setdefault(key, []).append(summary)
    return list(groups.values())


def _group_heading(group: list[dict], graphs: dict) -> str:
    if len(group) == 1:
        return graphs[group[0]["source"]].title
    return graphs[group[0]["source"]].provenance.attribution.title


def _shipped_as(group: list[dict]) -> str:
    if len(group) == 1:
        summary = group[0]
        return (
            f"*Shipped as `{summary['file']}` — {summary['nodes']} characters, "
            f"{summary['edges']} ties.*"
        )
    nodes = sum(s["nodes"] for s in group)
    edges = sum(s["edges"] for s in group)
    listing = ", ".join(f"`{s['file']}` ({s['nodes']}/{s['edges']})" for s in group)
    return (
        f"*Shipped as {len(group)} worlds — {nodes} characters and {edges} ties in total, "
        f"as `file` (characters/ties): {listing}.*"
    )


def _meta_files(group: list[dict]) -> str:
    if len(group) == 1:
        return f"`{group[0]['metaFile']}`"
    return f"{len(group)} `.meta.json` sidecars, one per world"


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
    """Book titles in the boot payload are fine; a cast list is not.

    A title is allowed to contain a character's name, because half of literature
    is named after its protagonist: `shakespeare-hamlet` cannot be written
    without writing "Hamlet", and no secret is kept by refusing to. The guess
    screen already lists the worlds, so the boot payload may too. What it may
    never carry is a name it has no title-shaped reason to carry — that would
    hand over a cast list, and with it the size of the field the player is
    choosing from.

    So the universe identifiers are removed from the payload before it is
    scanned, and any character name still standing in what remains is a leak.
    """
    serialised = json.dumps(index, ensure_ascii=False).lower()
    # Longest first: `shakespeare-rome` is a prefix of
    # `shakespeare-romeo-and-juliet`, and removing the short one first would
    # leave "juliet" standing in the remains of the long one.
    identifiers = [u["id"] for u in index["universes"]] + [u["title"] for u in index["universes"]]
    for identifier in sorted(identifiers, key=len, reverse=True):
        serialised = serialised.replace(identifier.lower(), " ")

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
