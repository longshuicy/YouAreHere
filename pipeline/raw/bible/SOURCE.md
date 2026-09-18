# Source: Bible — built here, not taken

The graph is assembled by `pipeline/ingest/bible.py` from two sources that carry no
licence problem, because no ready-made Bible graph was usable.

| Candidate | Problem |
|---|---|
| KONECT / Moreno `bible_nouns` | Mixes people *and* places as nodes. A waking as "Jerusalem" is not a character puzzle. No clear licence. |
| Theographic / MetaV / Gnosis | People tables and relations, but **CC BY-SA**. ShareAlike cannot be folded into the CC BY-NC-SA ASOIAF graphs already in `/data` — the result would have no valid licence. |
| Grandjean Gospel networks | Pericope co-appearance, the right edge definition, no published edge list under a stated licence. |

## What is built instead

| Part | Source | Terms |
|---|---|---|
| Text | King James Version, 1769 Blayney revision, via [scrollmapper/bible_databases](https://github.com/scrollmapper/bible_databases) | Public domain |
| Who is a person | [Wikidata](https://query.wikidata.org/) biblical figures, queried by SPARQL | CC0 1.0 |

A tie is **two people named in the same verse**. Places are never nodes, because the
node list comes from Wikidata's people rather than from capitalised words in the text.

Cached here: `kjv.json` and `wikidata-figures.json`. Delete either to re-fetch.

## The part that needs watching

Deciding which capitalised word is a person is the whole difficulty, and the adapter
makes three judgements about it that can be wrong:

1. **Shared names.** There are eight Abijahs. A name is given to its best-known
   claimant when that figure is clearly ahead, and dropped when nobody is — which is
   why **John** is absent, the Baptist and the Apostle being too close to separate.
2. **Nicknames never outrank names.** Without this rule "Miriam" resolved to Mary the
   mother of Jesus, and Moses' sister lost her verses to the New Testament.
3. **Eponyms.** The real trap, and it comes through the *text*, not the node list.
   "Israel" appears 2,576 times against "Jacob"'s 377, almost all of it the nation;
   left alone it made Jacob the graph's largest hub on the strength of verses he is
   not in. The twelve sons of Jacob are matched inside Genesis, where they are people,
   and blocked outside it, where they are territories. Towns that are also names —
   Hebron, Shiloh, Shechem — are blocked outright; see `EPONYMS` for how each was
   judged.

If a later change makes a place a hub again, that is this list going stale, not the
edge definition failing.
