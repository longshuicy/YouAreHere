# Source: Harry Potter Wiki (Fandom)

Built by the shared Fandom engine (`pipeline/ingest/fandom.py`, `HARRY_POTTER`). The
method — paragraph co-linking in character articles — is described in full in
`pipeline/raw/stormlight/SOURCE.md`; this file covers what differs.

| Part | Source | Terms |
|---|---|---|
| Character articles (wikitext) | [Harry Potter Wiki](https://harrypotter.fandom.com/), via the MediaWiki API | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) |
| Reveal attributes (gender, title or job, house, blood status, nationality, species, allegiances) | The same articles' infoboxes | Facts; no licence |
| Wikipedia links | Wikidata items carrying a Fandom article ID (P6262), cached as `wikidata-fandom.json` | CC0 |

Ships under CC BY-SA 3.0, in its own files.

## The cast: the seven novels only

The wiki has no character category. Its articles instead end with an
`==Appearances==` list of work templates, and that list is what scopes the world:

- A character is in the cast if the article has an `{{Individual infobox}}` and an
  Appearances entry for one of the novels: `{{PS}}`, `{{COS}}`, `{{POA}}`, `{{GOF}}`,
  `{{OOTP}}`, `{{HBP}}`, `{{DH}}`.
- A bare template is the book. `{{PS|F}}` is the film and `{{PS|G}}` the game; those
  do not count. An entry flagged `{{Mention}}` is a name dropped, not an appearance.
- Candidates are every article embedding one of those seven templates, about 5,000
  pages; roughly 490 pass.

Films, games, Fantastic Beasts, Cursed Child and Hogwarts Legacy characters are
therefore out unless they also appear in a novel.

## Segments

Ties take their books from book citations in the paragraphs behind them
(`{{DH|B|E}}`, `{{PS}}`), and otherwise from the novels both characters appear in.
Paragraphs citing only another canon (Cursed Child, the films, the games) are
skipped.

## Known gaps

- Articles cover every canon at once, so a paragraph about a film scene can still tie
  two book characters. Skipping "Behind the scenes" removes most of it.
- Redirect titles include misspellings ("Dumbeldore") and epithets; both become
  aliases. They help the type-ahead and do no harm.
- Fetching takes about seven minutes at one request per second.
