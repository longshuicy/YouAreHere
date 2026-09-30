# Source: The Stormlight Archive Wiki (Fandom)

The first Cosmere world. No ready-made character network for the Stormlight Archive
exists under a usable licence, so the graph is built here from the fan wiki's
character articles.

| Part | Source | Terms |
|---|---|---|
| Character articles (wikitext) | [Stormlight Archive Wiki](https://stormlightarchive.fandom.com/wiki/Category:Characters), via the MediaWiki API | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) ([Fandom licensing](https://www.fandom.com/licensing)) |
| Reveal attributes (gender, nationality) | The same articles' infoboxes | Facts; no licence |

## Licence consequence

CC BY-SA is ShareAlike, so `stormlight.json` and `stormlight.meta.json` are an
adaptation and ship under CC BY-SA 3.0 — beside, never inside, the CC BY-NC-SA
ASOIAF world. `/data` is licensed per world for exactly this reason; see
`LICENSING.md`. Nothing from this source may be folded into another world, and the
emitter's `can_merge_into()` check refuses it.

No article text is shipped. The universe file carries names, aliases and ties; the
sidecar's lines are composed from discrete facts, as for every other world.

## Edge definition

A tie is **two characters linked from the same paragraph of a character article**.
An article's subject counts as present in every paragraph of their own article, so
Kaladin's article linking Syl ties Kaladin to Syl, and a paragraph there linking
both Teft and Rock also ties Teft to Rock. Weight is the number of such paragraphs
across all character articles.

This is a wiki's view of the books, not the books' text: it follows what editors
chose to link, and a link is usually made only on first mention. It is recorded in
provenance as its own definition and should not be read as comparable to a
sentence-window graph.

Details:

- The infobox counts as one unit per field (so `family = [[Lirin]] (father), …`
  ties Kaladin to Lirin).
- Non-narrative sections are skipped: gallery, fan art, references, notes, trivia,
  quotes, external links, see also.
- Tables, templates and file lines are skipped; quotation templates carry book text
  and are never read.
- A tie's books are the `{{Ref|<book>|c|<chapter>}}` citations in the paragraphs
  behind it (`twok`, `wor`, `ed`, `ob`, `ds`, `row`, `wat`). A tie from uncited
  paragraphs has no book.
- Links are resolved through redirects. Category members that are themselves
  redirects (`Wit` → `Hoid`) are aliases, not characters.
- Aliases come from the infobox `aliases` field and from redirect titles. Possessive
  descriptions ("Eshonai's mother") and section redirects ("Dalinar visions") are
  not aliases; a form claimed by two characters is dropped from both.

## Retrieving the raw files

The adapter fetches on first build and caches here:

- `pages.json` — `{title: wikitext}` for every article in `Category:Characters`
- `redirects.json` — `{redirect title: character title}`

Delete either to re-fetch. The fetch is ~35 API requests, one per second, with the
pipeline's identifying User-Agent. Only `api.php` is used; the HTML site sits behind
a bot challenge and is not scraped.

## Known gaps

- **Personas are separate people.** Veil (and Radiant) have their own articles, so
  they are nodes apart from Shallan. The identity table (`aliases/stormlight.yaml`,
  not yet written) is where a merge would go, if one is wanted.
- **Unnamed characters survive** when they are well linked: "Lift's Mother",
  "Roshone's Guard Captain". They are characters in the wiki's sense and are kept.
- **Wind and Truth** is barely cited yet, so few ties carry it as a book.
- **Only Roshar.** This wiki covers the Stormlight Archive. The rest of the Cosmere
  (Mistborn, Elantris, Warbreaker, …) is better covered by the Coppermind, whose
  `robots.txt` disallows its API; that needs the admins' permission or a dump.
