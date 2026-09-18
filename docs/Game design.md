# YOU ARE HERE

A literary network puzzle. Design and technical spec.

2026-09-17 · @Chen

## Concept

**YOU ARE HERE.** You wake as an unnamed node in the character network of a novel. You are told nothing else — not the book, not your name, not the genre. You have a shape: who is adjacent to you, and who is adjacent to them.

One question in two halves: **what story are you in, and who are you?**

The title is the mall-map phrase — a dot that means nothing without the map around it. *You wake up here.* is the game's first line.

**Not:** a trivia game, a network explorer, a quiz with a graph skin, or themed per novel.

**Governing rule:** information costs, guessing is free.

## Core loop

1. **Wake** — your node, its direct neighbours, nothing named. Your own ties are already drawn at true thickness.
2. **Expand** — one hop at a time, outward from a node you choose.
3. **Infer** — shape is the evidence: hubs, bridges, leaves, closed triangles, density.
4. **Guess** — story first, then character. Available from the first frame.
5. **Reveal** — the answer, the ledger, one structural fact, then the ego network unfolds into the full named graph.

Story is answered first: it collapses the identity space, and it makes the good failure possible — right book, wrong person.

No losing. A wrong guess returns the player to the graph with the ledger unchanged.

## Waking again

> **Parked, 2026-09-18 — not built.** The reveal has one door: `WAKE SOMEWHERE ELSE`, a new stranger in a new world, with nothing carried over. The residence model below is kept as a record of the thinking, because the argument for it still holds and it is the obvious answer to the first-round problem. It is parked rather than rejected: it wants the difficulty bands to exist first, since "starts are drawn from progressively harder bands" is most of what makes staying feel different from repeating. Everything below describes a design, not the current build.

The reveal was to end with two doors, not one.

- `WAKE AGAIN HERE` — you wake as someone else in the same novel.
- `WAKE SOMEWHERE ELSE` — a shuffle: new novel, new stranger.

### What staying changes

A **residence** is a run of wakings inside one book. Within it:

- The story question disappears. The guess screen asks one thing.
- Locate is removed — there is nothing left to locate.
- Names already bought stay drawn wherever those characters appear.
- The ledger runs across the whole residence: *Third waking · 11 clues so far*.
- Starts are drawn from progressively harder bands as the residence deepens.

Shuffling clears learned names and restores both questions.

### Why this fixes the first round

The first waking is close to unsolvable without buying a name, and that is correct rather than a flaw — a reader has no way into a book they cannot name. Round one should be expected to cost a name, not designed to avoid it.

The residence is where that spend pays off. The second waking opens on a partly known map: several characters already named, a feel for the book's density, and only one question left. Clue counts fall, and the falling number is the reward.

### The arc it creates

Waking repeatedly in one novel is a better fantasy than shuffling. You are not solving a series of puzzles; you are learning one world by waking up in different lives inside it. Characters you bought in an earlier waking turn up as someone else's neighbours, which is the moment the network stops being a diagram.

**Watch for:** a residence that outlives its interest. Once the clue count per waking stops falling, the player knows the book, and the game should nudge a shuffle rather than wait to be abandoned.

## Information economy

| Action | Gives | Cost | Recorded as |
| --- | --- | --- | --- |
| Expand | one node's neighbours | 1 | clue |
| Facts | what is known of *another* character — books, titles, allegiances, dates | 2 | clue |
| Name | one neighbour's name | 3 | clue |

**Free, always:** every tie's strength, and node size, which encodes degree.

**Weigh is gone, and tie strength is free everywhere.** It was originally a purchase: your own ties drawn true, a stranger's ties bought a node at a time. In play that charged for the diagram itself — thickness is the evidence, and a graph of uniform hairlines is not a puzzle, it is a waiting room. Removing it costs less than it looks like it should, because the thing a player actually lacks is not the shape but who is standing in it.

**Facts took its slot.** It returns the discrete attributes the enrichment sidecar already holds for a character — *Ser, Westerlands, sworn to House Lannister of Casterly Rock; appears in all five books, three of them through his eyes* — without naming them. It is the middle rung the economy was missing: structure is free, a name is decisive, and a reading is the step between. It is also the most informative thing you can buy for 2, and the cost may want to rise to 3 once anyone has played a full session.

**Nothing about your own node is for sale.** Naming yourself, or reading your own facts, is just answering the question. So your node's menu carries exactly one entry — `I KNOW WHO I AM · free` — which opens the guess. The action that used to hide in the margin is now attached to the thing it is about, and the marginal link is set in the accent at a weight nothing else on the screen carries.

**Ledger.** One line in the margin: `Information used: 4 clues`. A count, not a budget — a budget implies a fail state and makes players hoard.

**There is one currency.** Locate was originally recorded as a *hint*, counted apart from clues, so a hinted run stayed distinguishable from a clean one. That was a second scoreboard nobody asked for: two numbers, neither of which was the score, and no way to compare a run against another run without comparing both. Everything costs clues, and the single number is what a player carries away.

**Locate is gone, and the world is free.** It sold the name of the world for 2 clues. But guessing is free and a wrong guess costs nothing, so a player could work the story out from a short dropdown in a few free tries — paying for what trial gives away is not a trade, it is a tax on players who did not notice. So the world is now revealed by *naming it correctly*, which costs nothing and is half of the question the guess screen already asks. Get the story right and wrong the person, and the world and its one-line introduction appear on the explore screen and stay there.

That also fixes where it lived. Every other purchase hangs off a node, in the menu, attached to the thing it concerns; Locate was the only action floating in the chrome, and it was loudest at the start, when nobody wants it yet.

**Watch for:** this makes the story half of the question nearly free once more worlds ship, since a determined player can walk the dropdown. If that starts to feel cheap, the fix is to make a wrong *story* guess cost something — not to reinstate a purchase for information that trial hands over.

**Name is the pivot.** One name usually gives the story away too, because a reader who recognises a character recognises the book. That is the design, not a leak: structure narrows the field, a name converts it to an answer, the ledger records how much structure you read before reaching for one.

**Difficulty is a property of the start, never a setting.**

| Band | In play |
| --- | --- |
| Approachable | one name settles it; 3–5 clues |
| Hard | one name leaves several candidates, and 2-hop structure separates them; 6–10 clues |

Approachable starts are served first and the game moves up as runs are finished. All costs are provisional — tune against the generator's candidate counts at M1.

## What a tie means

The player never sees the word *weight*. It is a code word and it promises a precision the data does not have.

**Player-facing vocabulary, identical in every universe.** An edge is a **tie**. A thick tie means the two **share more of the story**. The cold open carries a one-line legend: *thin — you share less of the story — thick*.

**Why the wording stays general.** Each dataset defines an edge differently — names within a fifteen-word window in ASOIAF, a shared event in 红楼梦, a shared scene in 西游记. Naming the real definition during play would tell the player which dataset they are in. So the copy says *share the story* everywhere, and the exact definition is stated only at the reveal, from the universe's provenance record: *In this story, a tie means two characters named within fifteen words of each other.*

**What a tie is not.** Not affection, not alliance, not importance. Two enemies who appear in every scene together have one of the heaviest ties in the book. Copy must never say *close*, *knows well*, or *friend* — the player will read warmth into thickness on their own, which is fine, but the game should not assert it.

**Why every tie is drawn true.** This began as an asymmetry — your own ties free, a stranger's bought — on the reasoning that your own intimacies are what amnesia leaves intact. The asymmetry read well and played badly: beyond your first ring the diagram became identical hairlines, which is to say no diagram at all. Thickness is the medium the puzzle is written in, so it is never for sale. What you pay for is *identity* — who these people are — not the shape they make, which you can always see.

## Screen states

**1 · Cold open.** Your node, its neighbours at true tie thickness, two lines of copy, `BEGIN`. No book list, no mode selector, no settings, no how-to-play — and no rules. The legend used to sit here; it moved into the key, which is reachable from every screen, because a rule printed once on a screen you pass through in four seconds is not available when it is wanted.

**2 · Exploring.** Your node centred, hollow neighbours, the ledger, the question line. Actions attach to a node on hover, never to a toolbar. Withheld: names, and the size of the graph. Tie strength is not withheld anywhere.

**3 · Guess.** The graph dims but stays visible — it is the evidence. Story is a dropdown of loaded universes. Character is a free-text field with type-ahead: suggestions begin after three characters and are drawn from **every loaded universe**, so the list never reveals how many candidates the chosen novel has. A player who half-remembers a name gets there; a player fishing learns nothing. `THIS IS ME` commits.

**4 · Wrong guess.** Graph undimmed and unchanged. Each field marked right or wrong and nothing more — no proximity, no remaining-candidate count. The rejected name struck through above a cleared field. The ledger visibly does not move.

**5 · Reveal.** In order: the answer, the ledger read back, one generated structural fact, what a tie meant in this book, then the unfolding into the full named graph with your node held in place. It ends on three exits, weighted by size: `WAKE AGAIN HERE`, `WAKE SOMEWHERE ELSE`, and the share card.

**5b · Waking again.** The same cold open, one word different — *You wake up here. Again.* The graph opens with previously bought names already in place, set in serif, and the running residence ledger in the margin.

**6 · The key.** Reachable at any time from a thin mono link in the margin: `WHAT CAN I DO`. It opens over the paper without navigating away, and lists the four actions with their costs plus the tie legend. There is no first-run tutorial and no modal — the cold open has exactly one thing to click, which teaches the only lesson a tutorial could.

**7 · Share.** After the reveal, a card the player can send. It carries their anonymised one-hop shape, their clue count, and a link to the same puzzle. It must not carry the answer — no name, no book, no labels anywhere — because the recipient is being invited to play, not told the ending.

## Visual language

An old printed book, a mathematical diagram, an archival document.

**Colour.** Paper `#F4F0E6`, ink `#16130F`, annotation grey `#6B655C`, unknown structure `#9A9287`, accent `#8C2F2A` reserved for your node. After the reveal, one book-specific accent — the only per-universe difference anywhere.

**Type.** Serif (EB Garamond) is the narrative voice: titles, copy, revealed names. Mono (IBM Plex Mono) is the analytical voice: ledger, action labels, annotations. A name arriving in serif is the register change that turns structure into a person.

| Element | Rendering |
| --- | --- |
| You | filled circle, the accent |
| Unknown | hollow circle, thin stroke |
| Expanded | hollow circle, heavier ring |
| Named | hollow circle, serif label below |
| Frontier | hollow circle at reduced opacity |
| Tie | hairline to 3.4px, scaled by strength |
| Node size | scaled by degree |

**Motion.** Edges draw outward from the parent (400ms), nodes emerge at the far end (250ms, +150ms delay), layout settles rather than jumps (600ms), names rise 4px (500ms), the reveal unfolds staggered by hop distance (2000ms). Nothing loops. Respect `prefers-reduced-motion`.

**Invariant.** All universes render identically before the reveal.

## Decisions

| Question | Settled |
| --- | --- |
| Palette | Foolscap — warm paper `#F4F0E6`, ink `#16130F`, structure `#9A9287`, oxblood `#8C2F2A`. Chosen over three alternatives. |
| Dark theme | Not now. If one is added later it is Lamplight — the same paper seen by lamp, never an inversion into terminal-dark. |
| Story field | Dropdown of loaded universes. A small public list is not a leak. |
| Character field | Free text with type-ahead after three characters, suggesting across **all** loaded universes. Solves the forgotten-spelling problem without revealing the cast size of any one novel. |
| Starting radius | One hop, and expansion moves one hop at a time. |
| Degree | Encoded as node size, free. A deliberate hint — it makes the diagram readable and rewards structural reading. |
| Playable starts | Degree ≥ 6, excluding the three highest-degree characters in each universe. Provisional; tune at M1. |
| Repeat play | Endless. No daily, no accounts, no streaks. |
| Cross-novel confusion | Keep it. Prefer structurally similar universes over maximally different ones. |
| Teaching the actions | A persistent key, not a tutorial. Costs are always printed beside each action in the node menu. |
| Sharing | A spoiler-free card after the reveal, linking to the same puzzle. |
| Continuation | After each reveal the player chooses: stay in this novel (a residence) or shuffle. Staying drops the story question, keeps names already bought, and escalates the difficulty band. |

## The companion piece

The anonymised-topology material that was cut from the game now lives in its own doc: [The topology gallery](https://claude.ai/code/artifact/38d7af6d-95bc-480d-be09-981982b87cea). Nothing in it is built until the main loop is playable and someone who is not you has solved a puzzle.
