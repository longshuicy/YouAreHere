# Data and puzzle pipeline

## Pipeline overview

```
raw dataset
    ↓  ingest/<source>.py
canonical graph        nodes, edges, provenance
    ↓  canon/
normalise · resolve aliases · filter
    ↓  analyse/
NetworkX: signatures, candidate counts, layout
    ↓  emit/
/data/*.json           committed to the repo
```

Everything above the last line runs on your machine. The browser receives finished JSON and does no analysis at all.

### Why offline

Three reasons, in order of importance. The expensive step — computing, for every character, how many other characters share its structural signature — is O(n²) over signature comparisons and is precisely the thing that must never run at load. Difficulty needs to be known *before* a puzzle is served, so the game can pick a start that is solvable. And a committed data directory means a change in difficulty shows up as a reviewable diff rather than as a mysteriously different game.

### Running it

A single command regenerates everything:

```
python -m pipeline build --source asoiaf --out data/
```

It should be idempotent and deterministic. Fix the random seed for layout, sort everything before writing, and the diff between two runs on unchanged input should be empty. This is worth enforcing in CI even though the pipeline itself does not run there.

## Canonical schema

Every adapter produces this shape and nothing else. The analysis layer should never know which dataset it is looking at.

### Node

```json
{
  "id": "jon_snow",
  "name": "Jon Snow",
  "aliases": ["Jon", "Lord Snow", "The Bastard of Winterfell"],
  "work": "asoiaf",
  "metadata": {}
}
```

`work` and `metadata` are fields on the internal canonical `Node` dataclass (`pipeline/canon/types.py`), useful during ingest and analysis. They are **not** serialized into the emitted universe file — the app never receives them. What reaches the client is only `i` (index), `n` (name), `x`/`y` (layout), and `a` (aliases, omitted when empty); see "Universe file" below for the emitted shape.

### Edge

```json
{
  "source": "jon_snow",
  "target": "samwell_tarly",
  "weight": 31,
  "type": "cooccurrence",
  "segments": ["agot", "asos", "adwd"]
}
```

### Provenance, per universe

```json
{
  "dataset": "beveridge-asoiaf-v1",
  "edgeDefinition": "characters named within 15 words of each other",
  "sourceUnit": "book",
  "weightSemantics": "count of qualifying co-occurrences",
  "retrieved": "2026-09-01",
  "license": "..."
}
```

Provenance is not bureaucracy. Different literary datasets mean different things by an edge — a 15-word text window, co-appearance in a scene, a hand-annotated relationship — and those produce structurally different graphs. A window-based graph is dense and noisy; a scene-based graph is sparser and blockier. If you mix them without recording which is which, cross-novel difficulty becomes incomparable and you will not know why one universe feels wrong.

### Normalisation

Weights are not comparable across sources, so the canon layer stores both the raw weight and a normalised rank.

> **Superseded 2026-09-18.** This read *"the renderer should key edge thickness off the rank, so a thick edge means strong relative to this character's other ties — which is the only reading that survives across datasets."* In play that flattened the diagram: ranking per endpoint gives every node the same ladder, so hubs and leaves drew alike and thickness told the player nothing about the book. The renderer keys off the raw weight, normalised logarithmically against the heaviest tie in that world. The cross-dataset problem is solved by normalising *within* a world rather than by ranking within a character. The ranks are still emitted and are still correct; nothing reads them today.

### Aliases

The hard problem is not NLP, it is identity. Every ingest needs an explicit alias table:

```
悟空 · 孙悟空 · 孙行者 · 行者 · 美猴王 · 齐天大圣  →  SUN_WUKONG
```

For pre-built datasets this is mostly done. For any text you process yourself it is the entire job, and it should be a hand-maintained YAML file in the repo, not an inferred mapping. Unresolved aliases split one character into several nodes, which silently corrupts every signature downstream.

## Adapters

One file per source, one contract, no exceptions.

```
pipeline/ingest/
  asoiaf.py          edge list CSV
  hongloumeng.py     sentence co-occurrence from the PD text
  xiyouji.py         same construction as 紅樓夢
  sanguoyanyi.py     same construction as 紅樓夢
  shuihuzhuan.py     same construction as 紅樓夢
  iliad.py           Knuth GraphBase encounter file
  lesmiserables.py   Knuth GraphBase encounter file
  odyssey.py         Gutenberg prose + Wikidata
```

Each exposes:

```python
def load() -> CanonicalGraph:
    """Raw files in, canonical nodes + edges + provenance out.
    No filtering, no analysis, no opinions about difficulty."""
```

### Two shapes of source

The sources fall into two families that actually ship, and a third that does not.

**Edge lists** (ASOIAF) arrive as source, target, weight. Nearly nothing to do: map names to ids, apply the alias table, sum weights across books if you want a single graph or keep them segmented if you want per-book universes.

**Built from text** (Bible, 紅樓夢). A public-domain text plus a Wikidata person list. Two people are tied when the same unit names both — a verse, a sentence. The PKU dumps for 紅樓夢 and 西游记 were this project's intended bipartite-matrix family, but they have no licence and are not shipped.

If a licensed matrix ever arrives, project to a character-character graph where the weight is the number of shared units:

```python
W = M @ M.T          # M: characters × events, boolean
np.fill_diagonal(W, 0)
```

### Filtering

Both projections produce heavy tails: characters appearing in a single scene, edges of weight 1 between people who were once in a crowd together. These wreck the puzzle — a node with one weight-1 edge is unsolvable and also uninteresting.

Apply, in this order, with the thresholds recorded in provenance:

1. Drop edges below a minimum weight (dataset-specific; start at 2 for matrix projections, 1 for ASOIAF).
2. Drop nodes below a minimum degree (start at 2).
3. Keep the largest connected component only.
4. Re-check: dropping nodes can orphan others, so iterate until stable.

Record the before-and-after node and edge counts for every universe. A universe that loses 70% of its nodes to filtering needs a look before it goes in the game.

## Puzzle generation

This is the part that makes the game a real object rather than a graph viewer. Difficulty is not authored — it is measured.

### Structural signature

For every character, compute a signature from anonymised local structure:

```python
signature(v) = {
  'degree':        G.degree(v),
  'neighborDegs':  sorted(G.degree(u) for u in G[v]),
  'weightRanks':   ranks of edge weights at v,
  'triangles':     nx.triangles(G, v),
  'clustering':    nx.clustering(G, v),
  'radius2Size':   len(nx.ego_graph(G, v, 2)),
  'radius2Degs':   sorted degree sequence at radius 2,
}
```

Every field is something the player can observe without any name. That is the design rule for this dict: if a field is not purchasable in the game, it does not belong in the signature.

### Candidate counts

For each character and each level of evidence, count how many characters — **across all loaded universes, not just their own** — share that signature within tolerance:

```json
{
  "character": "jon_snow",
  "candidateCounts": {
    "degree": 13,
    "radius1": 5,
    "radius1Weighted": 3,
    "radius2": 1
  },
  "minimumIdentification": { "mode": "radius2", "cost": 4 },
  "crossUniverseAmbiguity": 2
}
```

The cross-universe count is the important one and it is easy to forget. The player is answering *which story* first, so what matters is how many characters in **other** novels look like this one. A character who is unique in ASOIAF but has three structural twins in 红楼梦 is a wonderful puzzle. That number is the difficulty.

### Tolerance

Exact signature matching will find almost no collisions, which would make every puzzle look trivially unique on paper while feeling ambiguous in play. Compare with tolerance — degree within ±1, neighbour degree sequences by earth-mover distance or a simple binned comparison. Tune the tolerance until the generator's difficulty estimates match how hard puzzles actually feel; this calibration pass is worth doing once, properly.

### Selecting playable starts

Not every node is a puzzle. Emit a `playable` list filtered by:

- degree of at least 6 — enough adjacency to explore from
- degree of at most about 40 — a *drawing* limit, not a difficulty one: the opening frame puts every neighbour on a single ring, which runs out of room past roughly forty
- `minimumIdentification.cost` between 3 and 8 — solvable, not instant
- reachable within 3 hops of a fair share of the world — a flat 20 where the world is big enough to mean it, a proportion of the world where it is not, since a play with a cast of twelve cannot put 20 characters within reach of anyone

Protagonists and hubs are **not** excluded, though they once were. The rule was that a
recognisable shape gives its book away; in practice it meant the recognisable characters
were the only ones a player could never be, and every waking landed on a minor character.
Recognising yourself quickly is the approachable end of the range, which is a band to be
served deliberately, not a leak to be filtered out.

Then band them into *approachable* and *hard* on `minimumIdentification.cost` and `crossUniverseAmbiguity`. The generator also emits, for each playable character, the count of candidates remaining once one neighbour is named — that number is what separates the two bands in practice, because naming is where the puzzle turns.

Keep the full signature table even for characters that are not playable. It is the raw material for the gallery idea parked at the end of the game design tab, and it costs nothing to emit.

## Emitted artifacts

### index.json

Loaded at boot. Universes ship under their own names, which is not a secret — the guess screen lists the same set in its story dropdown. It contains no character names.

```json
{
  "pipelineVersion": "0.1.0-thin",
  "banded": true,
  "universes": [
    { "id": "asoiaf", "file": "asoiaf.json", "nodes": 592, "edges": 2619,
      "playable": { "total": 169, "approachable": 88, "hard": 81 } }
  ]
}
```

**Current state of the committed data.** Difficulty scoring (candidate counts, cross-universe ambiguity) has not been run yet, so `banded` is presently `false` and every universe's `playable` object looks like `{ "total": 169, "unbanded": 169 }` instead of the `approachable`/`hard` split shown above. The app is written to degrade gracefully in this state — when `unbanded` is the only count present, it treats the whole playable pool as one band. Both shapes are valid; a consuming client should check for `approachable`/`hard` first and fall back to treating `unbanded` as the entire pool.

**There is no puzzle manifest.** Enumerating every puzzle here would put the whole catalogue in front of the first frame, and each entry would say nothing a universe file does not already say. The one thing the boot payload genuinely needs is band availability: the game serves approachable starts first, so it must choose which universe to fetch before it has fetched any, and without counts it would have to download a universe to discover whether it holds a suitable start.

A puzzle is addressable as a universe plus a node index, so a share link carries `asoiaf-p0137` and the client fetches `asoiaf.json` and reads the record from there.

### Universe file

```json
{
  "id": "asoiaf",
  "title": "A Song of Ice and Fire",
  "accent": "#7a2e2e",
  "nodes": [{ "i": 0, "n": "Jon Snow", "a": ["Lord Snow"], "x": 412.3, "y": -88.1 }],
  "edges": [[0, 17, 31, 0.94, 0.62], [0, 42, 8, 0.31, 0.88]],
  "playable": [12, 44, 137],
  "puzzles": [],
  "provenance": { }
}
```

Edges are index tuples rather than objects with string keys. On a 3,000-edge graph that is the difference between a comfortable file and an awkward one. After source, target, and raw weight come the two normalised ranks — the tie's strength relative to the source's other ties, then relative to the target's. These are no longer what thickness is drawn from; see the note above. `a` holds aliases and is omitted when empty; the type-ahead matches against them so a half-remembered nickname still lands. The `x`/`y` are the precomputed full-graph layout used by the reveal animation.

### Puzzle records

Inline in the universe file, since they are only useful once that file is loaded:

```json
{
  "id": "asoiaf-p0137",
  "you": 137,
  "startRadius": 1,
  "band": "approachable",
  "reveal": {
    "line": "Only 2 characters across these stories share your one-hop shape.",
    "stat": { "kind": "crossUniverseAmbiguity", "value": 2 }
  }
}
```

**Current state of the committed data.** The difficulty-scoring stage that computes `band` and `reveal` has not been run yet, so today's `asoiaf.json` puzzle records carry only `id`, `you`, and `startRadius` — both `band` and `reveal` are absent. The app treats both fields as optional: with no `band` it falls back to `'unbanded'`, and with no `reveal` the Reveal screen simply omits the structural-fact line rather than showing a blank or placeholder. Both fields are expected to appear automatically once that pipeline stage runs, with no client change required.

**Why these cannot be assembled in the browser.** Which node you wake as is trivially live-computable and needs no build step. Difficulty is not: `crossUniverseAmbiguity` counts structural twins *in other novels*, and the client holds exactly one universe by design. A client able to measure difficulty would be one that had downloaded every book, which costs bandwidth and puts every answer in memory. The reveal's cross-catalogue signals follow the same logic: `lookAlikes` is counted at build time and ships as a number, because the count it comes from cannot be reconstructed without the whole catalogue.

> **Superseded 2026-09-18 — never built.** This described the reveal line as *"generated from the candidate counts with a small set of templates chosen by which statistic is most striking for that character"*, written at build time onto `puzzle.reveal`. No such record was ever emitted: zero of 1,357 puzzles carried one, so the slot sat behind a null check in the reveal screen and was never once seen. The record and the type that described it have been removed.
>
> The readings are composed in the browser instead, from the one universe already loaded. The argument above still holds for the part that genuinely needs the catalogue — a client able to count a start's structural twins *in other novels* would be a client that had downloaded every novel — which is why `lookAlikes` is still counted at build time and shipped as a single number on the reveal-only sidecar, alongside `prominence` and `company`. Nothing else the reveal says needs more than the book in hand, and computing it at runtime is what lets the 26 worlds with no enrichment have anything said about them at all.

### Reveal-only enrichment

A sidecar, `<universe>.meta.json`. It holds a one-line description per character and per tie, plus the structured facts those lines were built from, so the app can render its own phrasing.

**It is no longer reveal-only.** The `Facts` action buys a character's line mid-session, so the client fetches this file the first time facts are bought, or when the reveal fires, whichever comes first — and then keeps it. The name is now a slight misnomer; the file's contents are unchanged.

It is still separate from the universe file for two reasons, neither of them spoiler-prevention — the universe file already holds every name. The first is weight: a session that never buys facts and ends in a wrong guess never pays for it. The second is licensing, and it is the one with teeth.

**Sources must be merge-safe.** Enrichment material is combined with graph data that is CC BY-NC-SA, and ShareAlike forbids adding restrictions — so a CC BY-SA *work* cannot be folded into `/data`, because the result would need to be NonCommercial and not-NonCommercial at once. `License.can_merge_into()` encodes this and the emitter refuses any source that fails it.

**CC BY-SA may be read, not copied.** Sources such as Wikipedia, Wookieepedia, and A Wiki of Ice and Fire may be consulted for factual research, but CC BY-SA text, descriptions, or other expressive material must not be copied or adapted into `/data`. Enrichment must consist of independently encoded discrete facts. Generated prose is composed from those facts, not paraphrased from source prose. That is why descriptions are *composed here from discrete facts* rather than copied: facts carry no licence, sentences do. The trap is copying expression, not learning a fact.

For the same reason there are no quotations from the novels. A database of them is systematic reproduction of a living author's text, which is not what fair use covers, and the reveal loses nothing without it.

**Ties get facts, not readings.** `Edge.segments` already records which books a tie appears in, so *first shared the page in A Storm of Swords* costs nothing and comes from data already shipped. Shared allegiance is stated as a fact about each character rather than a claim about the tie, because two men sworn to the same house may be enemies — the rule that a tie is not affection or alliance holds after the reveal too.

**Matching is refused rather than guessed.** Where a display name is ambiguous in the source — there are genuinely two Daenerys Targaryens — enrichment is skipped unless the identity table pins an exact record with its `api` key. The same table handles characters the source files elsewhere: Hodor is listed under Walder.

### Validation

Emit and validate against a JSON Schema shared with the TypeScript types — generate the TS types from the schema so they cannot drift. Then assert, in the emitter: no puzzle references a node outside its universe, every universe is connected, every playable node meets the band criteria, and no character name appears anywhere in `index.json`. That last check is the one that will catch a real spoiler bug one day — book titles in the boot payload are fine, a cast list is not.

## Sources

Dataset details below are as recorded in the original notes; confirm shape, size and licence at ingest rather than trusting this table. Each adapter should print its actual node and edge counts so a mismatch surfaces immediately.

| Source | Shape | Status | Notes |
| --- | --- | --- | --- |
| ASOIAF (Beveridge) | Edge list with weights | Shipped | CC BY-NC-SA 4.0. Five books as segments. |
| Star Wars (Gabasova) | Per-episode scene-speech JSON | Shipped | CC BY 3.0. Episodes I–VII as segments. |
| Shakespeare (DraCor / Folger) | 37 plays, scene co-presence | Shipped | CC BY-NC 3.0. Merged; unnamed crowds dropped. |
| Bible | Verse co-occurrence from the KJV | Shipped | Built here. Ready-made graphs are BY-SA or mix people with places. |
| 紅樓夢 | Sentence co-occurrence from the PD text | Shipped | Gutenberg #24264 + Wikidata. PKU matrix has no licence; see `pipeline/raw/hongloumeng/SOURCE.md`. |
| The Iliad | Chapter encounters (Knuth GraphBase) | Shipped | Public domain `homer.dat`. |
| The Odyssey | Sentence co-occurrence from Butcher & Lang | Shipped | Gutenberg #1728 + Wikidata. |
| Les Misérables | Chapter encounters (Knuth GraphBase) | Shipped | Public domain `jean.dat`. |
| 三國演義 | Sentence co-occurrence from the PD text | Shipped | Gutenberg #23950 + Wikidata. |
| 西遊記 | Sentence co-occurrence from the PD text | Shipped | Gutenberg #23962 + Wikidata. PKU matrix has no licence. |
| 水滸傳 | Sentence co-occurrence from the PD text | Shipped | Gutenberg #23863 (70-chapter recension) + Wikidata. |
| 史記 | Sentence co-occurrence from the PD text | Shipped | Gutenberg #24226 + Wikidata humans described by the work (P1343). See `pipeline/raw/shiji/SOURCE.md`. |
| U.S. Congress | Cosponsorship projected graph | Shipped | Fowler via Benson et al., CC BY 4.0. Segments are Congresses. See `pipeline/raw/congress/SOURCE.md`. |
| Friends | Scene co-occurrence edge lists | Shipped | Michelle Edwards, CC BY 4.0. Ten seasons. See `pipeline/raw/friends/SOURCE.md`. |
| 红楼梦 relationship graph | Typed edges, Mandarin labels | Supplement | Investigate only if typed relations become a mechanic |
| Harry Potter | Several candidates, none canonical | Later | Licence and provenance need checking before production use |

### Licensing

Confirmed at ingest, not assumed. ASOIAF (Beveridge & Shan) is **CC BY-NC-SA 4.0**, stated in the upstream README rather than in a `LICENSE` file. Two clauses have consequences beyond a credit line:

**ShareAlike** makes the emitted graphs an adaptation, so `/data` is distributed under CC BY-NC-SA 4.0 regardless of what the application code is licensed as. `/data/LICENSE` is generated to say so.

**NonCommercial** forecloses any commercial use of the game for as long as this dataset ships. Worth knowing now rather than after the game works.

Attribution is enforced in code rather than maintained by hand. `Provenance` carries a required `Attribution` and `License`, every stage appends what it changed to `attribution.modifications`, and the emitter refuses to write a universe whose credit, licence URL, or statement of changes is missing. Adding a source with unresolved terms therefore fails the build instead of shipping quietly.

Credit travels inside each universe file and in `/data/ATTRIBUTION.md`, which is never fetched by the app and so can name everything freely. The generated `creditLine` is meant for the reveal screen, alongside the line about what a tie meant in this book.

### Why ASOIAF first

It is the one source where the data work is nearly zero, which means the first build tests the game rather than the ingest. A clean weighted edge list across multiple books, with a cast large enough for real ambiguity and recognisable enough that a correct guess feels earned. Use it to find out whether the puzzle is fun. If it is not, no amount of additional data will fix that.

### Why the two PKU sets come next

They turn *what story are you in* from a formality into a real question, and they are nearly the same adapter. They also stress-test the invariant that all universes look identical — a Qing-dynasty household network and a Westerosi court network should be visually indistinguishable until the reveal, and if they are not, the design has a leak.

There is a second, quieter reason to include them early: a structurally similar court is exactly the kind of near-miss that makes the cross-universe question interesting.

### Bible, shipped

The text is public domain. The graphs on the internet were not usable: MetaV/Gnosis people tables are CC BY-SA, which cannot share a `/data` directory with ASOIAF's CC BY-NC-SA, and KONECT's Bible network mixes names with places. The shipped graph is a people-only verse co-occurrence built from the KJV plus Wikidata labels (CC0).

### Harry Potter, deferred

Dialogue datasets with annotated relations exist, and there are open co-occurrence networks derived directly from the novels, but the latter come out of a noisy NLP pipeline and the former need their licensing understood. Neither is hard; both are a distraction from finding out whether the game works. Defer.

### If you eventually process text yourself

```
legally usable text → chapter segmentation → character dictionary
→ alias resolution → windowed co-occurrence → manual validation → canonical graph
```

The expensive step is alias resolution and it is mostly manual. Note what is *not* in that chain: nothing decides whether two people "have a relationship". Co-occurrence with a stated window is a definition you can record in provenance and a player can reason about. A model's judgment about relationships is neither.
