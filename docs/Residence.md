# Residence

A beta mode for YOU ARE HERE: stay in one world and start again as somebody else until every character is named.

2026-09-23 · @Chen · **Status: built (beta).** Supersedes the parked residence sketch in [Game design](./Game%20design.md).

## Concept

A **residence** is a run of starts inside one world. Each start is an ordinary round — expand, infer, guess, reveal — but nothing you learned is thrown away when it ends. The residence closes when every node in the world carries a name.

One-off play is unchanged and remains the default. A residence is what you choose at a reveal instead of leaving.

## The loop

1. Solve a start as normal. **The reveal fires in full** — the answer, the ledger, the readings, what a tie meant. Nothing is withheld to protect the mode.
2. Both ways on live in the top bar, beside the wordmark, on every screen but the cold open and CHOOSE A WORLD: `SOMEWHERE ELSE` (a new stranger, anywhere) and `STAY IN <WORLD>` (somebody else here, keeping the map). Until the world is known the second reads `STAY HERE` — printing the title would answer half the question — and only draws another stranger in the same unnamed world; there is no map yet to keep.
3. Starting in the world re-roots the graph on a new node in it, with everything learned already on the paper, and **goes straight into play** — the world is settled, so the cold open has nothing left to ask. `SOMEWHERE ELSE` still opens on the cold open: a new world is a new first waking, with its scale and chooser.
4. Repeat until no unnamed node is left.

You may leave at any time, from any screen. **Leaving pauses the map; it does not end it.** Each world keeps its own map, and choosing that world again — from `CHOOSE A WORLD`, or `STAY IN <WORLD>` after a one-off round there — resumes where you left off. A refresh lands back in the world you were living in.

Leaving mid-start keeps what that start bought: its names go on the map and its clues onto the residence ledger, but it is not counted as a start and the person is not added to your former selves — you never found out who you were. A start only counts toward a world's map once the world is known; an unnamed world never appears on the shelf, because the shelf prints its title.

> **Amended 2026-09-23.** `AGAIN IN <WORLD>` was shown on reveals only, and staying returned to the cold open. Both links are now on every screen except the cold open and the chooser, and staying skips the cold open.

> **Amended 2026-09-23.** This said leaving ends the residence and that a shelf of half-mapped worlds was a different game. Once progress was shown per world — on the chooser, the gallery and the reveal — a map that vanished on leaving made those figures a record of nothing. The shelf is kept.

## The network stays folded

On every world, the reveal's network shows only the names the player has earned, plus their own. There is no door to unfold the rest: a line set over the foot of the diagram says that everyone else stays unnamed until found. The one exception is the closing screen, where every name has been found.

Of the earned names, only the people you have been — this start and your former selves — are printed on the diagram. The rest name themselves on hover: a whole map of earned names at once is a wall of text.

The ties are another matter. Every tie the player has drawn — this start and the map's earlier ones — is drawn on the reveal's network in the accent, named or not, so the extent of the map reads at a glance. On a finished world every tie is coloured, including ties between people named without ever being opened.

## Earlier map on the play screen

Only this start's own walk is in full ink — frontier included, so your ring is never muted: `you`, your ring, and whoever this start's expansions opened onto. Everything carried from earlier starts is on the paper at 10% — the player should see that part of the world is done — and comes up to full ink once this start reaches it. A new start need not touch the earlier map at all; when no drawn tie joins them, the earlier map is set on a ring outside everything reachable.

The argument for folding is not that a player could memorise a large graph — on a hundred nodes the unfold is a texture, not a lookup table. It is that on an XS world (a dozen characters) it is readable in ten seconds, and folding is the only thing standing between those worlds and a residence with no puzzle in it.

> **Superseded 2026-09-23.** An explicit `UNFOLD THE WHOLE WORLD — this ends the residence` door was built and removed. The note on the diagram does the same work without offering a way to spoil the mode.

## What the reveal names

The reveal's prose still names people — your ties, your nearest double, your community —
but those names are not written onto the paper. Only a name the player bought or claimed
(or the person they found themselves to be) counts as named for the residence. The
reading is a reading; the map is what they earned.

## What carries, what resets

| Carried | Reset each start |
| --- | --- |
| `named`, `recognised`, `facts` | `hop`, `parent` (the layout re-roots on the new node) |
| `visible`, `expanded` | `phase`, `lastGuess`, `lastClaim`, `guesses` |
| the residence ledger | — |
| former selves (new set: nodes you have been) | — |

After the first start the world is known, so `worldChosen` is effectively true for the rest of the residence: the guess screen asks one thing, and `story` is not for sale.

Note `graph/layout.ts` holds a placement registry with a rule that a placed node keeps its position. Re-rooting on a new node inside the same world is the case that rule was not written for — check it before trusting it.

## Picking the next start

Candidates are **every node not already named**. A node that is merely visible is still a candidate: beginning with your ties already drawn is a different and easier puzzle, not an absent one, and it is the natural late-residence ramp.

**The playable gate is lifted after the first start.** Ordinary play restricts starts to degree ≥ 6, excluding each world's three highest-degree characters (`layout.ts:68` — you never start as anyone the reader had heard of). Both reasons are about a cold, unknown world: a leaf has no shape to reason from, and a hub gives the book away in one frame. Inside a residence neither survives — the world is known and most of the map is drawn, so a leaf is a fine puzzle and a hub is merely an easy one. The first start of a residence is an ordinary cold open and keeps the gate; every start after it ignores it.

This is not about scarcity — small worlds have plenty of playable starts (Othello 11 of 12, Hamlet 15 of 18; Pericles at 5 of 21 is the outlier). It is about the endgame: the gate's excluded nodes still have to be *named* for the residence to close, and if the last unnamed nodes are all unplayable the mode stalls with a goal it cannot offer a start toward.

One consequence for implementation: `universe.puzzles` only carries the playable starts, so an unplayable node has no `ease` score. Either score it at pick time or treat it as bottom-of-band.

Walk `ease` descending as the residence deepens, but **sample within the band rather than taking the argmax** — a strict sort makes every residence in a world identical. Prefer nodes two or three hops from known territory: one expansion should touch a face you recognise without handing over the answer.

Two pressures work against each other here — falling `ease` makes starts harder, the carried map makes everything easier. That is the arc, and it is safe now in a way it was not when this idea was parked, because the residence has an end and cannot outlive its interest.

## Elimination, and what may be shown

The mechanic the mode runs on: **you cannot be anyone you have already named.** Every start permanently shrinks the identity space. This is a different game from a single round — deduction by elimination across a world, rather than inference from one ego shape.

Progress may therefore be stated: *19 of 31 named*. This does not break the rule that the remaining-candidate count is withheld, because the first reveal already prints the cast size (*You uncovered 12 of 31 people*). Once a world is solved, its size is not a secret.

## The last node

When one unnamed node remains, the player is provably that person. Write it as a beat rather than leaving it a shrug: the guess is free, and the closing screen is the whole world named, with your former selves marked through it. That screen is the artifact of the mode, and it is why the goal is *every node named* rather than *every node visible*.

## Scoring

The ledger walks the starts: *Fourth start · 19 clues*. The residence total is the sum of each start's `clueTotal` (each already floors at zero; sum the floored values, do not floor the sum), plus whatever was spent in starts left unfinished.

The number this produces — **clues to map a whole world** — is a different thing to compare than a single round's count, and is the mode's reason to exist as a score.

## Persistence

A one-off round dying on a refresh is acceptable; a residence of four to eight starts, plausibly across sittings, is not.

`localStorage` holds one map per world — `named`, `recognised`, `facts`, `visible`, `expanded`, former selves, the walking ledger — under `you-are-here-residences`, and the world currently being lived in under `you-are-here-active-world`. Do **not** address the current start in the URL: `engine/route.ts` refuses that deliberately, and the residence is what you have learned, not where you are standing.

## Progress

A world's map is shown wherever the world is: `7 of 18 named`, or `Finished`, with starts and clues so far. A finished map's figure is final — *39 clues in total* — because rounds played in a finished world afterwards are one-offs and do not add to it.

- **Choose a world.** The size label stays; between the title and the size, a run of ticks fills by the share of a mapped world named, like leader dots in an index — a share rather than a count. A hairline under the row and a wash behind it were both tried; the first read as a divider. A third filing, `PROGRESS`, lays the worlds out in three fixed columns — *Not started*, *In progress* (furthest along first), *Finished* — which stay in place even when one is empty.
- **Gallery.** A line under each mapped world's card, and three figures in its detail: your map, starts, clues.
- **Reveal.** The tally ends on the start number and names found — or *Your map* when a one-off round lands in a world with a paused map.

## Scope for the beta

Offered on every world, so a world reached from `CHOOSE A WORLD` behaves exactly like one reached at random. On a play of twenty characters that is four to eight starts; on a 726-character world, *every node named* is a very long goal.

> **Amended 2026-09-23.** The beta first limited the mode to worlds of thirty characters or fewer, on the reasoning that a goal nobody reaches is worse than no mode. In play that read as the mode being broken on any larger world. The limit is lifted; a territory goal — one community fully named — remains the likely answer if large worlds prove unfinishable.

## Screens

**Second start onward.** Straight into the explore screen, carried names already in place, the walking ledger in the margin. The cold open's *Again* variant is only seen when a refresh or the chooser resumes a paused map.

**Every screen but the cold open and the chooser.** `SOMEWHERE ELSE` and `STAY IN <WORLD>` beside the wordmark. Both of those are already a way in, and a second pair of exits there is noise.

**Reveal.** Unchanged, plus the folded network and its note, and the map's progress in the tally.

**Closing.** The full world named, former selves marked, the residence total.

## Still open

- The visual mark for a former self — it should read as *you were here*, not as another bought name.
- Final copy for the note on the folded network.
- The gallery's character pages still show every name in a world, including one being mapped.
- Whether a residence nudges the player to leave when the per-start clue count stops falling, as the parked note worried, or trusts the terminal condition to do it.
