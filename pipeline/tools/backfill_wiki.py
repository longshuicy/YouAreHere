"""Backfill Wikipedia sitelinks into Wikidata attribute caches, then rebuild.

Run from the repo root:

    python -m pipeline.tools.backfill_wiki

Then rebuild so meta sidecars pick up the new fields:

    python -m pipeline build
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "raw"

# Smallest caches first so a rate-limit abort still leaves useful progress.
CACHES: list[tuple[str, str, tuple[str, ...]]] = [
    ("lesmiserables", "wikidata-attributes.json", ("en",)),
    ("friends", "wikidata-attributes.json", ("en",)),
    ("pride", "wikidata-attributes.json", ("en",)),
    ("odyssey", "wikidata-attributes.json", ("en",)),
    ("lotr", "wikidata-attributes.json", ("en",)),
    ("starwars", "wikidata-attributes.json", ("en",)),
    ("civilwar", "wikidata-attributes.json", ("en",)),
    ("asoiaf", "wikidata-attributes.json", ("en",)),
    ("iliad", "wikidata-attributes.json", ("en",)),
    ("xiyouji", "wikidata-attributes-zh.json", ("zh-hant", "zh", "zh-hans")),
    ("shiji", "wikidata-attributes-zh.json", ("zh-hant", "zh", "zh-hans")),
    ("shuihuzhuan", "wikidata-attributes-zh.json", ("zh-hant", "zh", "zh-hans")),
    ("shakespeare", "wikidata-attributes.json", ("en",)),
    ("hongloumeng", "wikidata-attributes-zh.json", ("zh-hant", "zh", "zh-hans")),
    ("hongloumeng", "wikidata-attributes.json", ("en",)),
    ("bible", "wikidata-attributes.json", ("en",)),
    ("sanguoyanyi", "wikidata-attributes-zh.json", ("zh-hant", "zh", "zh-hans")),
]


def main() -> int:
    sys.path.insert(0, str(ROOT.parent))
    from pipeline.enrich import wikidata

    total = 0
    for source, cache_name, languages in CACHES:
        n = wikidata.backfill_sitelinks(
            cache_name=cache_name,
            cache_dir=RAW / source,
            languages=languages,
        )
        if n:
            print(f"  {source}/{cache_name}: updated {n}")
            total += n
        else:
            print(f"  {source}/{cache_name}: already complete")

    for source in sorted(wikidata.WORK_PAGES):
        link = wikidata.work_sitelink(source)
        if link:
            print(f"  work {source}: {link['lang']}.wikipedia.org/wiki/{link['title']}")
        else:
            print(f"  work {source}: no sitelink")

    print(f"\ndone — {total} character sitelinks filled")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
