# Source: Bible — not ingested yet

The King James text is public domain. Ready-made *graphs* of it are not merge-safe
with `/data` as it stands.

| Candidate | Problem |
|---|---|
| KONECT / Moreno `bible_nouns` | Mixes people *and* places as nodes. A waking as "Jerusalem" is not a character puzzle. No clear licence. |
| Theographic / MetaV / Gnosis | People tables and relations, but **CC BY-SA**. ShareAlike cannot be folded into the CC BY-NC-SA ASOIAF graphs already in `/data` — the result would have no valid licence. |
| Grandjean Gospel networks | Pericope co-appearance, the right edge definition, no published edge list under a stated licence. |

The path that *would* ship: build the graph ourselves from the 1769 KJV (public
domain) plus Wikidata biblical-figure labels (CC0), tying two people when they
are named in the same verse, and keep places out. That adapter is not written
yet. Do not copy BY-SA people tables into this directory in the meantime.
