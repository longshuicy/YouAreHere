"""An API of Ice and Fire — factual attributes for ASOIAF characters.

<https://anapioficeandfire.com>, maintained by Joakim Skoog. Free and
unauthenticated, rate-limited at 20,000 requests per IP per day.

Only discrete attributes are taken from here — culture, titles, house
allegiance, birth and death, point-of-view status. No prose. That line matters:
facts are not copyrightable and so merge into the CC BY-NC-SA graph without
inheriting terms, whereas a sentence written by someone else is expression and
would drag its licence along with it.

Responses are cached under raw/ so the build stays offline and deterministic.
"""

from __future__ import annotations

import json
import time
import urllib.request
from pathlib import Path

from ..canon.licenses import FACTUAL
from ..canon.types import Attribution

RAW = Path(__file__).resolve().parent.parent / "raw" / "asoiaf"
BASE = "https://anapioficeandfire.com/api"
USER_AGENT = "YouAreHere-pipeline/0.1 (reveal-screen enrichment)"

ATTRIBUTION = Attribution(
    title="An API of Ice and Fire",
    creator="Joakim Skoog",
    creator_url="https://github.com/joakimskoog/AnApiOfIceAndFire",
    source_url="https://anapioficeandfire.com",
    retrieved="2026-09-17",
    modifications=(
        "Extracted discrete character attributes only; no prose was copied.",
        "Resolved house allegiance URLs to house names.",
        "Composed original one-line descriptions from those attributes.",
    ),
)

LICENSE = FACTUAL


def characters() -> list[dict]:
    return _cached("characters")


def houses() -> list[dict]:
    return _cached("houses")


def house_names() -> dict[str, str]:
    """Allegiances arrive as URLs; the reveal wants 'House Stark of Winterfell'."""
    return {house["url"]: house["name"] for house in houses() if house.get("name")}


def _cached(resource: str, page_size: int = 50) -> list[dict]:
    path = RAW / f"anapioficeandfire-{resource}.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))

    print(f"  fetching {resource} from {BASE} ...")
    records, page = [], 1
    while True:
        request = urllib.request.Request(
            f"{BASE}/{resource}?page={page}&pageSize={page_size}",
            headers={"User-Agent": USER_AGENT},  # the service 403s the default agent
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            batch = json.loads(response.read().decode("utf-8"))
        if not batch:
            break
        records.extend(batch)
        page += 1
        time.sleep(0.1)

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(records, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"  cached {len(records)} {resource}")
    return records
