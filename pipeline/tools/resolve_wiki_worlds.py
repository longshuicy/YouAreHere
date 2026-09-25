"""Resolve Wikidata QIDs for ASOIAF / Civil War, fetch attributes, patch meta.

    python -m pipeline.tools.resolve_wiki_worlds asoiaf civilwar
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPO = ROOT.parent
ALIASES = ROOT / "aliases"
DATA = REPO / "data"


def patch_world(name: str) -> None:
    sys.path.insert(0, str(REPO))
    from pipeline.canon.normalise import (
        apply_identity_overrides,
        filter_graph,
        load_identity_table,
    )
    from pipeline.enrich import facts as enrich_facts
    from pipeline.enrich import wikidata
    from pipeline.sources import SOURCES

    source = SOURCES[name]
    print(f"[{name}] loading")
    graph = source.load()
    overrides = {}
    alias = ALIASES / f"{name}.yaml"
    if alias.exists():
        overrides = load_identity_table(alias, name)

    node_facts, _, coverage = enrich_facts.extract(graph, overrides)
    with_wiki = sum(1 for r in node_facts.values() if r.get("wiki"))
    print(f"[{name}]   enriched {coverage['nodesWithFacts']} (wiki in facts: {with_wiki})")

    if overrides:
        graph = apply_identity_overrides(graph, overrides)
    graph = filter_graph(
        graph,
        min_edge_weight=source.min_edge_weight,
        min_degree=source.min_degree,
        min_component_size=source.min_component_size,
    )

    path = DATA / f"{name}.meta.json"
    meta = json.loads(path.read_text(encoding="utf-8"))
    index_of = {n.id: i for i, n in enumerate(graph.nodes)}
    added = cleared = 0
    for node_id, record in node_facts.items():
        if node_id not in index_of:
            continue
        key = str(index_of[node_id])
        entry = meta.get("nodes", {}).get(key)
        wiki = record.get("wiki")
        if wiki:
            if not entry:
                entry = meta.setdefault("nodes", {}).setdefault(key, {"facts": {}})
            if entry.get("wiki") != wiki or entry.get("wikiLang") != record.get("wikiLang"):
                entry["wiki"] = wiki
                if record.get("wikiLang"):
                    entry["wikiLang"] = record["wikiLang"]
                added += 1
        elif entry and "wiki" in entry:
            entry.pop("wiki", None)
            entry.pop("wikiLang", None)
            cleared += 1

    work = wikidata.work_sitelink(name, universe_id=name)
    if work and work.get("title"):
        meta["workWiki"] = work["title"]
        if work.get("lang"):
            meta["workWikiLang"] = work["lang"]

    path.write_text(json.dumps(meta, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    total = sum(1 for n in meta["nodes"].values() if n.get("wiki"))
    print(f"[{name}]   wiki +{added}/-{cleared}; {total}/{len(meta['nodes'])} characters + work={bool(work)}")


def main(argv: list[str] | None = None) -> int:
    names = argv or sys.argv[1:]
    if not names:
        names = ["civilwar", "asoiaf"]
    for name in names:
        patch_world(name)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
