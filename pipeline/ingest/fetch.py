"""Tiny HTTP helper. Several sources 403 the default urllib agent."""

from __future__ import annotations

import json
import urllib.request
from pathlib import Path

USER_AGENT = "YouAreHere-pipeline/0.1 (literary network puzzle; local build)"


def get(url: str, dest: Path | None = None) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=60) as response:
        payload = response.read()
    if dest is not None:
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(payload)
    return payload


def get_json(url: str):
    return json.loads(get(url).decode("utf-8"))


def get_text(url: str) -> str:
    return get(url).decode("utf-8")
