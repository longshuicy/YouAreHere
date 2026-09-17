# The topology gallery

Companion piece to YOU ARE HERE. Not a game mode.

2026-09-17 · @Chen

## What this is

A looking-at piece, not a solving piece. Anonymised character neighbourhoods presented for comparison: what a life looks like as a shape, and how often two unrelated novels produce the same one.

### Why it is not a game mode

The original spec had *topology only* — a hard mode with names removed entirely. It was cut because it is unanswerable rather than hard. With no names anywhere, a player has no bridge from a shape to a book they have read; you would be asking them to recall the degree sequence of a novel, which nobody carries. The failure mode is silence, not frustration.

The material underneath it is still good. Stripping names off an ego network is genuinely interesting to look at — it just is not a question with an answer. So it becomes a plate section rather than a puzzle.

## Three shapes

Not exclusive — the third could be the index behind the first two.

### 1 · The gallery

A grid of anonymous one-hop diagrams, drawn identically, at the same scale. Click one and it names itself. Browsing rather than solving.

Good for: the flat surprise of seeing that the shapes are not sorted by novel. Cheapest to build. Risk: without an ordering it is wallpaper. Needs a reason for the sequence — by degree, by clustering, by how unusual.

### 2 · The pairing

Two ego networks side by side from different novels, chosen because they resemble each other. Revealed together.

Good for: the single strongest thing this data has to say — that a Qing-dynasty household and a Westerosi court can produce the same local shape. This is the piece with an argument in it. Risk: it needs the resemblance to be real. A weak pairing reads as a coincidence rather than a finding, so the matching threshold has to be strict and the pairs curated.

### 3 · The structural index

Every character in every loaded universe, ordered by how unusual their neighbourhood is against the whole corpus. The two extremes are the interesting entries: the people whose shape is unique, and the people whose shape is everyone's.

Good for: it is a real reference, and it doubles as the tool for tuning puzzle difficulty. Risk: closest to the centrality dashboard the game deliberately refuses. It should read as an index in a book, not as analytics.

### The pick, if one is needed now

The pairing. It is the only one of the three that says something rather than shows something, and it is the one a person would send to someone else.

## What the pipeline already gives it

Everything, essentially. The puzzle generator computes a structural signature for every character and compares signatures across all loaded universes. That is precisely the gallery's data.

Already emitted:

- structural signature per character — degree, neighbour degree sequence, tie-strength ranks, triangles, clustering, 2-hop size
- candidate counts at each level of evidence
- cross-universe ambiguity, which is the pairing's matching score
- full-graph layout coordinates

Still needed, and it is small:

- a ranked list of the closest cross-universe pairs, thresholded, for the pairing
- a canonical ego layout per character, so a gallery grid renders identically to the game and to itself between visits
- a corpus-wide percentile for how unusual each signature is, for the index

The spec says to keep the full signature table even for characters that are not playable. This is why.

## Where it sits

Behind the reveal, never before it. It does not appear in the interface until someone has completed at least one run, and it is never offered as an alternative to playing.

The reason is not gating for its own sake. Seeing thirty anonymous neighbourhoods before you have inhabited one teaches you to read them as data. The game works because you read your own as a life first.

### Preconditions

Nothing here is built until all of these hold:

1. The main loop is playable end to end on real data.
2. Someone who is not you has solved a puzzle without being told how.
3. At least three universes are loaded — with one, there is nothing to compare across.

### Visual rules it inherits

Same paper, same two typefaces, same node and edge treatment. The one thing it may do that the game may not: show several universes on screen at once, since by this point the player has already been told which is which.

It has no ledger, no cost, no score, and no correct answer. If a shape in the gallery starts wanting a right answer, it belongs in the game instead.

## Open questions

**Which of the three, or all of them?** The pairing has the most to say; the index is the most useful; the gallery is the cheapest.

**What counts as a resemblance?** The matching threshold decides whether the pairings feel like a finding or a coincidence. This needs a human looking at the top fifty candidate pairs and saying which ones land.

**Does it need the whole corpus or a curated selection?** Every character is honest but mostly boring. A curated hundred would be better to look at and worse as a claim.

**Is it a page or a mode?** A static page generated at build time is almost free. An interactive surface inside the game is not, and starts competing with the game for attention.

**Does it ever hand back to the game?** Clicking a shape in the gallery and waking up as that character is an obvious move. It is also a way to leak difficulty information into the game, since the gallery shows you the answer space. Probably no.
