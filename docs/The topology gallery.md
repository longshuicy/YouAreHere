# The topology gallery

Companion piece to YOU ARE HERE. Not a game mode.

2026-09-17 · @Chen · revised 2026-09-18

Counts are deliberately absent. The corpus grows, so anything that depends on its size is stated
here as a rule and computed at load. The only figures quoted are intrinsic — properties of a single
world, which do not move when a book is added.

## What this is

A looking-at piece, not a solving piece. Every loaded world presented for comparison: what a story
looks like as a shape, and what a life looks like from inside one.

### Why it is not a game mode

The original spec had *topology only* — a hard mode with names removed entirely. It was cut because
it is unanswerable rather than hard. With no names anywhere, a player has no bridge from a shape to
a book they have read. The failure mode is silence, not frustration.

The material underneath it is still good. It just is not a question with an answer, so it becomes a
plate section rather than a puzzle.

## The four surfaces

### 1 · Fingerprint cards — the front page

One card per world, drawn identically at the same scale: degree distribution, concentration,
modularity, horizon spread. Anonymising *worlds* rather than characters is far more legible than a
wall of ego networks, needs nothing hidden, and the page extends itself as books are added.

This replaces the character grid from the earlier draft, which had no ordering and would have read
as wallpaper.

### 2 · Horizon — a panel on each card

For each character, how much the second ring multiplies the first: you know eight people, you reach
forty. It measures how much of the story is invisible from where you stand, which is the game's
premise stated as a number.

Protagonists sit at 1.0 — they already see everyone. The top of every list is a functionary who
touches the plot once:

```
Romeo and Juliet         Apothecary  knows 2 → reaches 19   9.5
Hamlet                   Reynaldo    knows 2 → reaches 14   7.0
The Taming of the Shrew  Phillip     knows 8 → reaches 17   2.1   (tied with two other servants)
```

The Apothecary sells Romeo poison in one scene and the whole play stands behind them. *Shrew*'s
flat top is the metric correctly reporting that the play has no outsiders.

Do not plot raw two-hop reach: it saturates — in most worlds nearly everyone reaches nearly
everyone — and only re-draws cast size. Do not plot the world average either; it tracks cast size
almost perfectly.

The card's number is the **highest gain over the median**: how far the furthest character stands
from a typical one. This was chosen by measuring the candidates rather than by taste, and the
obvious choice loses. A 90th-to-10th-percentile spread fails the exact case the metric exists for —
it scores *Romeo and Juliet* at 2.05 and *The Taming of the Shrew* at 1.91, when the whole
difference between those two plays is that one has an Apothecary and the other has nobody outside
the story at all. Percentiles discard the outlier, and the outlier is the finding. Raw maximum
fails the other way, correlating 0.95 with the log of cast size. Against the median the two plays
separate 5.0 to 1.4, and *King Lear* still outranks *A Song of Ice and Fire* — which a raw maximum
can never do.

Three layers: a strip of one tick per character on a shared log axis, identical on every card; that
ratio as the card's single number; and on click, a per-character step line of cumulative reach at
each hop. The Apothecary's is a cliff, Romeo's is flat from the first step.

### 3 · The character index

One search box over every character in every world, each row carrying its metrics, with facets as
filters. The index the earlier draft wanted, made useful rather than dutiful.

What it may honestly do depends on coverage, which it computes rather than assumes. The rule:

- **Universal facets** — present in every world. Safe to filter, sort and rank across the corpus.
- **Broad facets** — present in many worlds but a minority of characters. Filterable everywhere;
  rankable only with the gap shown, since absence is not evidence.
- **Single-world facets** — houses, cultures, births and deaths, points of view. These make a room
  inside one world. They are never a claim about the corpus, however tempting the chart.

A facet moves between tiers as books arrive, so the tier is computed at load and the interface
reads it off. Today only one demographic facet is near-universal; that will change, and nothing
should be written that assumes which one it is.

### 4 · Rarity

The remainder of the cross-universe look-alike idea, which does not survive as a leaderboard. The
difficulty signature is coarse by design — a degree band and two capped neighbour counts — so it
has far fewer distinct buckets than characters, and the crowded middle is a many-way tie for
generic. Ranking by *most* look-alikes ranks nothing.

The rare end is the exhibit: the few characters whose shape is unique against the whole corpus.
That list is short, it is worth looking at, and it is entirely corpus-relative — every addition
rewrites it. That is the point of the piece, not a defect.

Real *pairings* — two neighbourhoods from different books that genuinely resemble each other —
need a finer signature than the game computes. That is the one place here that requires new
pipeline work.

## Metrics, and what each actually measures

| metric | measures | blind to |
|---|---|---|
| Concentration | how much of the story a few people carry; star system against ensemble | who. A two-hander and a tyranny score alike. Measured as a Gini of weighted degree rather than a top-decile share, because "the top 10%" is one and a bit characters in a twelve-hander. |
| Modularity | how cleanly the cast splits into camps that mostly talk among themselves | small factions, swallowed by big ones at the resolution limit |
| Betweenness | who stands between others: the go-between, the messenger | that co-appearance is not information flow. Sharing a scene is not carrying a message. |
| Plain-against-weighted rank gap | who meets many people once, against who is actually present throughout | nothing new — the Shemaiah/Azariah observation in `_prominence`, promoted to a number |
| Clustering | whether your circle knows each other; household against hub-and-spoke | small neighbourhoods, where it swings wildly. Needs a degree floor. |
| Assortativity | whether the prominent attach to the prominent or to the minor | bimodal casts, hidden inside one number |
| Articulation points | who is load-bearing — remove them and the story falls into pieces | the edge-weight filter. Move the threshold and the answer moves. |
| k-core | the dense inner ring against the periphery; a principled definition of furniture | fine distinctions. Integer-valued, so it is coarse in small plays. |
| Horizon | how much of the story is invisible from where a character stands | everyone but the outermost character, who decides the figure alone; and degree-1 characters, where one tie makes their own gain arbitrary |

Every metric that ships must carry its own version of this line. A number without a stated blind
spot reads as authority it has not earned.

## Live, not baked

Metrics split in two, and the split decides where they run.

**Intrinsic** — everything in the table above. Properties of one graph. Adding a book never changes
them.

**Relative** — rarity, look-alikes, percentiles, anything phrased as a share of the corpus. Every
one of them changes when a book is added.

The game already has this problem. `build()` is a deliberate two-pass because `corpus_index` spans
every world, which means every baked `ease` goes stale the moment a book is added unless everything
is rebuilt — and `--source X` silently scores against a corpus of one.

So the gallery computes at load, in the client, and stores nothing. Nodes and edges ship; prominence
and signature derive from them in about fifteen lines. A corpus this size is nothing in a browser.
Adding a book then costs the gallery no work at all — the world appears and every figure re-derives
against the new whole. Nothing in the interface may hardcode a count, a total, or a list of worlds.

Two notes. Community detection must be seeded or use deterministic tie-breaking, or it breaks the
build's promise that two runs on unchanged input produce an empty diff. Label propagation was tried
first and is not usable at all: a small play's co-appearance graph is dense enough that it collapses
the whole cast into one community, and it reported *Romeo and Juliet* as undivided — the single case
the metric exists to catch. Weighted Louvain, visited in index order with ties going to the lower
community, finds the two households. And the metadata files are
dominated by quoted lines the gallery has no use for; it wants its own payload — names, facts,
metrics, no layout coordinates, no lines.

Withholding `prominence` from the shipped payload does not really withhold it, since the edges it
derives from ship anyway. That guards against casual curiosity, not extraction. Worth knowing, not
worth changing.

## Where it sits

Offered from the cold open and from the reveal, in the margin, and never as a way to avoid playing.

This is a relaxation of the original rule, which put it strictly behind a finished run. The argument
for the gate still stands — reading a page of anonymous worlds before you have inhabited one teaches
you to read them as data, and the game works because you read your own as a life first. It lost to
a plainer one: a companion piece nobody can find is not a companion to anything, and a door in the
margin is not an invitation to skip the game.

### Preconditions

1. The main loop is playable end to end on real data.
2. Someone who is not you has solved a puzzle without being told how.
3. At least three universes are loaded. Long since satisfied.

### Visual rules it inherits

Same paper, same two typefaces, same node and edge treatment. Ticks and hairlines on a shared axis
are already the vocabulary, so the three horizon layers introduce nothing new. Nothing is boxed.

The one thing it may do that the game may not: show several universes at once, since by this point
the player has been told which is which.

It has no ledger, no cost, no score, and no correct answer. If a shape here starts wanting a right
answer, it belongs in the game instead.

## Open questions

**Is there a thesis, or only an instrument?** Most of the corpus is Shakespeare — one hand, thirty
years, uniform extraction. If genre is recoverable from topology alone, that is the argument the
gallery is missing, and it costs one hand-labelled table to test. The claim weakens as
non-Shakespeare worlds arrive, which is an argument for testing it soon.

**Does the index compete with the game?** A searchable table of every character is close to the
centrality dashboard the game deliberately refuses. Behind the reveal it is defensible; it should
still read as an index in a book rather than as analytics.

**What is a card's fourth panel?** Concentration, modularity and horizon fill three. Betweenness is
the obvious fourth, but it needs a defensible reading — the top-betweenness character in every
world may turn out to be the same kind of person, which would be worth a room of its own.

**Does it ever hand back to the game?** Clicking a shape and waking up as that character is an
obvious move. It also leaks the answer space. Probably no.
