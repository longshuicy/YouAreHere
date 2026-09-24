"""Inject Wikipedia sitelink fields into existing *.meta.json sidecars.

Uses enrichment (from Wikidata attribute caches) without rewriting universe
files or the catalogue index. Run after `python -m pipeline.tools.backfill_wiki`.

    python -m pipeline.tools.patch_wiki_meta
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPO = ROOT.parent
ALIASES = ROOT / "aliases"
DATA = REPO / "data"


def main() -> int:
    sys.path.insert(0, str(REPO))
    from pipeline.canon.normalise import (
        apply_identity_overrides,
        filter_graph,
        load_identity_table,
        split_components,
    )
    from pipeline.enrich import facts as enrich_facts
    from pipeline.enrich import wikidata
    from pipeline.sources import SOURCES

    names = sorted(SOURCES)
    patched = 0
    for name in names:
        source = SOURCES[name]
        print(f"[{name}] loading")
        graph = source.load()
        overrides = load_identity_table(ALIASES / f"{name}.yaml", name)
        node_facts, _, coverage = enrich_facts.extract(graph, overrides)
        print(f"[{name}]   enriched {coverage['nodesWithFacts']} with facts")

        if overrides:
            graph = apply_identity_overrides(graph, overrides)
        graph = filter_graph(
            graph,
            min_edge_weight=source.min_edge_weight,
            min_degree=source.min_degree,
            min_component_size=source.min_component_size,
        )
        if source.split_components:
            worlds = split_components(
                graph,
                min_size=source.min_component_size or 1,
                name=source.name_component,
            )
        else:
            worlds = [graph]

        work = wikidata.work_sitelink(name)
        for world in worlds:
            path = DATA / f"{world.id}.meta.json"
            if not path.exists():
                print(f"[{world.id}]   skip — no meta file")
                continue
            meta = json.loads(path.read_text(encoding="utf-8"))
            index_of = {node.id: i for i, node in enumerate(world.nodes)}
            added = 0
            cleared = 0
            for node_id, record in node_facts.items():
                if node_id not in index_of:
                    continue
                key = str(index_of[node_id])
                entry = meta.get("nodes", {}).get(key)
                if not entry:
                    wiki = record.get("wiki")
                    if not wiki:
                        continue
                    entry = meta.setdefault("nodes", {}).setdefault(key, {"facts": {}})
                wiki = record.get("wiki")
                if wiki:
                    if entry.get("wiki") != wiki or entry.get("wikiLang") != record.get("wikiLang"):
                        entry["wiki"] = wiki
                        if record.get("wikiLang"):
                            entry["wikiLang"] = record["wikiLang"]
                        else:
                            entry.pop("wikiLang", None)
                        added += 1
                elif "wiki" in entry:
                    entry.pop("wiki", None)
                    entry.pop("wikiLang", None)
                    cleared += 1

            if work and work.get("title"):
                meta["workWiki"] = work["title"]
                if work.get("lang"):
                    meta["workWikiLang"] = work["lang"]

            path.write_text(
                json.dumps(meta, ensure_ascii=False, indent=1) + "\n",
                encoding="utf-8",
            )
            print(
                f"[{world.id}]   wiki +{added}/-{cleared} characters"
                + (f" + work" if work else "")
            )
            patched += 1

    print(f"\npatched {patched} meta files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
