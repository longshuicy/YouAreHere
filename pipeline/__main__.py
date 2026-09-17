"""python -m pipeline build [--source asoiaf] [--out data/]

Idempotent and deterministic: two runs on unchanged input produce an empty diff.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .canon.normalise import apply_identity_overrides, filter_graph, load_identity_table
from .emit import writer
from .enrich import anapi, facts as enrich_facts
from .sources import SOURCES

ROOT = Path(__file__).resolve().parent.parent
ALIASES = Path(__file__).resolve().parent / "aliases"


def build(names: list[str], out: Path) -> int:
    graphs = {}
    summaries = []

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
        )
        print(f"[{name}]   filtered   {len(graph.nodes):>5} characters  {len(graph.edges):>5} ties")

        summary = writer.write_universe(graph, source.name, out)
        graphs[name] = graph

        meta = writer.write_metadata(
            graph,
            source.name,
            node_facts,
            edge_facts,
            [(anapi.ATTRIBUTION, anapi.LICENSE)],
            out,
        )
        print(f"[{name}]   reveal     {meta['nodes']:>5} characters  {meta['edges']:>5} ties -> {meta['file']}")

        summary["metaFile"] = meta["file"]
        summary["metaSources"] = meta["sources"]
        summaries.append(summary)

        stats = summary["startStats"]
        print(f"[{name}]   playable   {stats['playable']:>5} starts     rejected {stats['rejected']}")
        print(f"[{name}]   licence    {summary['license']}")
        print(f"[{name}]   wrote      {out / summary['file']}")

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
