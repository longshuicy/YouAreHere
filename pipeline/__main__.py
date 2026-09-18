"""python -m pipeline build [--source asoiaf] [--out data/]

Idempotent and deterministic: two runs on unchanged input produce an empty diff.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .canon.normalise import (
    apply_identity_overrides,
    filter_graph,
    load_identity_table,
    split_components,
)
from .analyse import difficulty
from .emit import writer
from .enrich import anapi, facts as enrich_facts
from .sources import SOURCES

ROOT = Path(__file__).resolve().parent.parent
ALIASES = Path(__file__).resolve().parent / "aliases"


def build(names: list[str], out: Path) -> int:
    graphs = {}
    summaries = []
    prepared = []

    for name in names:
        source = SOURCES[name]
        print(f"[{name}] loading")
        graph = source.load()
        print(f"[{name}]   raw        {len(graph.nodes):>5} characters  {len(graph.edges):>5} ties")

        overrides = load_identity_table(ALIASES / f"{name}.yaml", name)

        # Enrichment runs before the identity table renames anything, so name
        # matching against external sources sees the names those sources use.
        # It still reads the table, which is where ambiguous matches are pinned.
        node_facts, edge_facts, coverage = enrich_facts.extract(graph, overrides)
        print(
            f"[{name}]   enriched   {coverage['nodesWithFacts']:>5} characters  "
            f"{coverage['edgesWithFacts']:>5} ties"
        )

        # Before filtering: the table is written against the full cast, so an id
        # that later drops out for low degree should still validate.
        if overrides:
            graph = apply_identity_overrides(graph, overrides)
            print(f"[{name}]   identity   {len(overrides):>5} entries applied from aliases/{name}.yaml")

        graph = filter_graph(
            graph,
            min_edge_weight=source.min_edge_weight,
            min_degree=source.min_degree,
            min_component_size=source.min_component_size,
        )
        print(f"[{name}]   filtered   {len(graph.nodes):>5} characters  {len(graph.edges):>5} ties")

        if source.split_components:
            worlds = split_components(
                graph,
                min_size=source.min_component_size or 1,
                name=source.name_component,
            )
            print(f"[{name}]   split      {len(worlds):>5} worlds")
        else:
            worlds = [graph]

        meta_sources = []
        if name == "asoiaf":
            meta_sources.append((anapi.ATTRIBUTION, anapi.LICENSE))

        prepared.append((name, worlds, node_facts, edge_facts, meta_sources))

    # Second pass. Difficulty cannot be judged one world at a time: the player is
    # answering *which story* first, so what makes a start hard is how many
    # characters look like it across the whole catalogue, not just at home. So
    # every world is loaded before any is written.
    all_worlds = [world for _, worlds, _, _, _ in prepared for world in worlds]
    corpus_index = difficulty.build_corpus_index(all_worlds)
    print(f"\nscoring {len(all_worlds)} worlds against {sum(corpus_index.values())} characters")

    for name, worlds, node_facts, edge_facts, meta_sources in prepared:
        for world in worlds:
            summary = writer.write_universe(world, world.id, out, corpus_index)
            graphs[world.id] = world

            meta = writer.write_metadata(
                world,
                world.id,
                node_facts,
                edge_facts,
                meta_sources,
                out,
            )

            summary["metaFile"] = meta["file"]
            summary["metaSources"] = meta["sources"]
            summaries.append(summary)

            stats = summary["startStats"]
            label = world.id if len(worlds) > 1 else name
            spread = summary["difficulty"]
            print(
                f"[{label}]".ljust(34)
                + f"{summary['nodes']:>5} characters {summary['edges']:>5} ties "
                + f"{stats['playable']:>5} starts  "
                + f"ease median {spread.get('medianEase', 0):.2f}  "
                + f"look-alikes median {spread.get('medianLookAlikes', 0)}"
            )

    summaries.sort(key=lambda s: s["id"])
    writer.write_index(summaries, out)
    writer.write_attribution(summaries, graphs, out)
    writer.write_data_license(summaries, graphs, out)

    print(f"\nwrote {out / 'index.json'}, {out / 'ATTRIBUTION.md'}, {out / 'LICENSE'}")

    restricted = [s for s in summaries if not graphs[s["source"]].provenance.license.allows_commercial_use]
    if restricted:
        print("\nnote: shipped data is NonCommercial — " + ", ".join(s["file"] for s in restricted))

    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="pipeline")
    subcommands = parser.add_subparsers(dest="command", required=True)

    build_command = subcommands.add_parser("build", help="regenerate the emitted data")
    build_command.add_argument(
        "--source",
        action="append",
        choices=sorted(SOURCES),
        default=None,
        help=(
            "build only these sources. The shared index, attribution, and licence files are "
            "rewritten from whatever is built, so a partial build produces a partial index."
        ),
    )
    build_command.add_argument("--out", type=Path, default=ROOT / "data")

    args = parser.parse_args(argv)
    if args.command == "build":
        return build(sorted(args.source or SOURCES), args.out.resolve())
    return 1


if __name__ == "__main__":
    sys.exit(main())
