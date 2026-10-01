# Source: Witcher Wiki (Fandom)

Built by the shared Fandom engine (`pipeline/ingest/fandom.py`, `WITCHER`). The
method — paragraph co-linking in character articles — is described in full in
`pipeline/raw/stormlight/SOURCE.md`; this file covers what differs.

| Part | Source | Terms |
|---|---|---|
| Character articles (wikitext) | [Witcher Wiki](https://witcher.fandom.com/), via the MediaWiki API | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) |
| Reveal attributes (gender, rank, profession, nationality, race, affiliations) | The same articles' infoboxes | Facts; no licence |
| Wikipedia links | Wikidata items carrying a Fandom article ID (P6262), cached as `wikidata-fandom.json` | CC0 |

Ships under CC BY-SA 3.0, in its own files.

## The cast: Sapkowski's saga

The union of the per-book character categories of the eight books: *The Last Wish*,
*Sword of Destiny*, *Blood of Elves*, *Time of Contempt*, *Baptism of Fire*, *The
Tower of the Swallow*, *The Lady of the Lake* and *Season of Storms*. Game-only and
Netflix-only characters are out.

## Segments

Ties take their books from the book citation templates in the paragraphs behind them
(`{{TLW}}`, `{{SoD}}`, `{{BoE}}`, `{{ToC}}`, `{{BoF}}`, `{{TTotS}}`, `{{TLotL}}`,
`{{SoS}}`), and otherwise from the books both characters appear in.

## Other canons

Articles give each game its own section, titled with a template (`== {{tw3}} ==`,
`=== {{BaW}} ===`); those sections are skipped. Paragraphs citing only a game or the
Netflix series are skipped too.
