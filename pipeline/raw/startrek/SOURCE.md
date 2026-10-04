# Source: Memory Alpha (Fandom)

Built by the shared Fandom engine (`pipeline/ingest/fandom.py`, `STAR_TREK`). The
method — paragraph co-linking in character articles — is described in full in
`pipeline/raw/stormlight/SOURCE.md`; this file covers what differs.

| Part | Source | Terms |
|---|---|---|
| Character articles (wikitext) | [Memory Alpha](https://memory-alpha.fandom.com/), via the MediaWiki API | [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) ([Memory Alpha:Copyrights](https://memory-alpha.fandom.com/wiki/Memory_Alpha:Copyrights)) |
| Episode → series lookup | `Module:EpisodeData/A` on the same wiki, cached as `codes.json` | CC BY-NC 4.0 |
| Reveal attributes (rank, occupation, species, birth year, homeworld, affiliations) | The same articles' `{{sidebar individual}}` boxes | Facts; no licence |
| Gender, and Wikipedia links | Wikidata items carrying a Fandom article ID (P6262), cached as `wikidata-fandom.json` and `wikidata-attributes.json` | CC0 |

## Licence consequence

Memory Alpha is the one Fandom wiki here that is not CC BY-SA: its text is
**CC BY-NC 4.0**. NonCommercial, but not ShareAlike. `startrek.json` and
`startrek.meta.json` ship under CC BY-NC 4.0 in their own files, beside the CC BY-SA
Fandom worlds and never mixed with them; `/data` is licensed per world for exactly
this. Like ASOIAF, Shakespeare and Pride and Prejudice, it keeps the game
non-commercial for as long as it ships.

Memory Alpha's copyright page also extends Fandom's Commercial Use Waiver to
advertisements only; nothing here relies on it.

## The cast: the prime timeline

Every article that carries the `{{sidebar individual}}` box, or `{{sidebar
hologram}}` for the Doctor, Vic Fontaine and their kind — Memory Alpha has no
characters category; the box is what marks an individual. Mirror-universe
(`Kira Nerys (mirror)`) and Kelvin-timeline (`Spock (alternate reality)`)
counterparts are separate articles and are left out, so each character is one
node. A link to a counterpart therefore ties nobody.

### Trimmed harder than the other Fandom worlds

Memory Alpha gives nearly every named one-off an article (the median is about a
paragraph), across some 900 episodes, so the cast runs to ~4,400 and the usual
Fandom floor — one shared paragraph, two ties — kept 3,600 of them, most seen in a
single episode. `sources.py` sets this world's floor at **three shared paragraphs
per tie and three ties per character**, which keeps 756: the main and recurring
casts of every series. Well-known one-episode guests go with the rest (Admiral
Leyton, Krall); their ties are one paragraph each.

The wiki is canon-only, so there are no novel or game sections to skip. The
`Appendices` block (appearances, background information, apocrypha, external links),
`Memorable quotes` and `Chronology` are skipped, and `{{bginfo}}` production notes
are templates and never read.

## Segments: series

One world across the franchise, with each series as a segment, in order of first
broadcast: *The Original Series*, *The Animated Series*, the films (all of them, as
one segment), *The Next Generation*, *Deep Space Nine*, *Voyager*, *Enterprise*,
*Discovery*, *Picard*, *Lower Decks*, *Prodigy*, *Strange New Worlds* and *Starfleet
Academy*. Labels drop the "Star Trek:" prefix, as Harry Potter's drop the series
name, so a fact bought before naming does not say the franchise.

A tie's series are read from the citations in the paragraphs behind it:
`{{DS9|Emissary}}` names its series; `{{e|A Time to Stand}}` names only the episode,
and the series comes from the wiki's own lookup, `Module:EpisodeData/A`;
`{{film|2}}` is the films.

Each article's Appearances list (`* {{s|DIS}}` for a whole series, or an entry per
episode) says which series a character is really in, leaving out entries flagged as
archive footage, pictures, voices or holograms (`{{small|(archive footage)}}`). A
cited series is kept only if every character on the tie who has such a list appears
in it: a paragraph of Spock's article citing *The Original Series* beside a mention
of Picard does not put Picard in it. A tie with no citation takes the series both
characters appear in. Only about one article in nine has the list; the main and
recurring cast do.

Short Treks, Very Short Treks, Scouts and Fables and Folklore have no segment. A
paragraph citing only them still ties its characters; the tie just names no series.

## Link templates

Memory Alpha links many characters through a template rather than `[[...]]`:
`{{dis|Daniels|Crewman}}` renders as a link to `Daniels (Crewman)`, and
`{{USS|Enterprise|NCC-1701-D}}` as one to the ship. Both are read as the links they
render, which adds the ties they carry (about 1,600 links to cast members) and
lets a sidebar value like `{{dis|Vulcan|planet}}` read as "Vulcan".

## Reveal facts

- **Rank, occupation, species, affiliations** from the sidebar, as for every Fandom
  world.
- **Birth year and homeworld** from `born`: `July 13, 2305, <br> La Barre, France,
  Earth` gives "In 2305" and Earth. Only a bare year or century counts — "After
  2376" is the wiki hedging. The homeworld is the last place named; a starship is
  not one, and Earth is dropped as saying nothing about a Human officer. `died` is
  not read: resurrections and time travel make it unreliable (Data "died" in 1893).
- **Gender**, which the sidebar has no field for. From Wikidata where an item
  carries the character's Memory Alpha article ID and its label is the character's
  name; otherwise from the pronouns of the article's first three paragraphs, which
  are about their subject, when one set outnumbers the other three to one and
  appears at least three times. Anyone else is left without one.

## Retrieving the raw files

- `pages.json` — `{title: wikitext}` for every article using `Template:Sidebar individual` or `Template:Sidebar hologram`
- `redirects.json` — `{redirect title: character title}`
- `listings.json` — `{template: [titles]}`, the cast listing
- `codes.json` — `{"E": {episode title: series code}}`

Delete any of them to re-fetch: roughly 5,250 articles, a few hundred API requests
at one a second.

## Known gaps

- **Gender is inferred for most of the cast.** Pronoun counting is a reading, not a
  field; it is left blank rather than guessed when the opening is mixed.
- **Ranks are the latest held.** The sidebar usually records only the final rank,
  so Picard, Janeway and Burnham read as admirals. Where it lists several, line
  ranks (Captain, Commander, …) are preferred.
- **Holograms and duplicates are kept** when they have their own article with a
  sidebar (the EMH is a character; so are several of Data's relatives).
