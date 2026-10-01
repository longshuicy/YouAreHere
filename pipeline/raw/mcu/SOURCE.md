# Source: Marvel Cinematic Universe Wiki (Fandom)

Built by the shared Fandom engine (`pipeline/ingest/fandom.py`, `MCU`). The method —
paragraph co-linking in character articles — is described in full in
`pipeline/raw/stormlight/SOURCE.md`; this file covers what differs.

| Part | Source | Terms |
|---|---|---|
| Character articles (wikitext) | [Marvel Cinematic Universe Wiki](https://marvelcinematicuniverse.fandom.com/), via the MediaWiki API | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) |
| Reveal attributes (gender, title, citizenship, species, affiliations) | The same articles' infoboxes; coded values (`{{Affiliation|SHD2}}`) expanded from the wiki's Lua data modules, cached as `codes.json` | Facts; no licence |
| Wikipedia links | Wikidata items carrying a Fandom article ID (P6262), cached as `wikidata-fandom.json` | CC0 |

Ships under CC BY-SA 3.0, in its own files.

## The cast: the Infinity Saga

The union of the "`<Film>` Characters" categories of the 23 films from *Iron Man*
(2008) to *Spider-Man: Far From Home* (2019). The television series and later phases
are out, which keeps the world one story with one ending. The main Marvel Database
wiki was not used: it covers every comics universe (~280,000 articles) and has no
single world to scope to.

## Segments

The 23 films. The wiki's citations do not name films, so a tie takes the films both
characters appear in. That is weaker than "together in this film", and it is recorded
as such in the attribution.

## Names

Articles are titled by whichever name the films lean on — "Iron Man" but "Steve
Rogers" — so the infobox `real name` is taken as an alias alongside redirects, and
"Tony Stark" still finds Iron Man.

## Known gaps

- The articles are very long (Tony Stark's is ~490 KB) and dense with links, so the
  graph is dense: 630 characters and ~6,400 ties after filtering.
- Characters whose later appearances are in the television series still carry those
  paragraphs; their links only count when both ends are film characters.
