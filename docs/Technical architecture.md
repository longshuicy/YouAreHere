# Technical architecture

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| App | React + TypeScript + Vite | State machine plus SVG; types matter because graph data is easy to get subtly wrong |
| Geometry | D3 modules only (d3-force, d3-scale, d3-interpolate) | Good at maths, bad as a DOM owner |
| Rendering | Hand-written SVG in React components | A few hundred nodes at most; SVG stays inspectable and animatable in CSS |
| Data | Static JSON, lazy-loaded per universe | The graphs never change at runtime |
| Analysis | Python, pandas, NetworkX, run offline | Puzzle difficulty is computed once at build time, never in the browser |
| Hosting | GitHub Pages | Static files and nothing else |

### Deliberately absent

No server, no database, no API, no auth, no LLM at runtime, no graph database, no state library beyond React's own. Each of these would be a way of postponing the actual problem, which is whether the puzzle is fun.

The one to resist hardest is a runtime graph query layer. Everything the client needs can be precomputed into JSON, including which characters make good puzzles and what the reveal line should say.

### Repo shape

```
/app          React client
  /engine     game state, reducer, action costs
  /graph      layout, geometry, D3 wrappers
  /render     SVG components
  /screens    cold open, explore, guess, reveal
/pipeline     Python, offline
  /ingest     one adapter per dataset
  /canon      normalisation, alias resolution
  /analyse    signatures, candidate counts
  /emit       JSON writers
/data         generated output, committed
```

The pipeline and the app share nothing but the JSON schema, which should be written down once and validated on both sides.

## State model

One reducer owns the session. Everything the player has learned lives in a single object, which makes the ledger trivially correct and the whole session serialisable for a share link or a replay.

```ts
type Phase = 'cold' | 'explore' | 'guess' | 'reveal'
type Band  = 'approachable' | 'hard' | 'unbanded'  // 'unbanded' covers today's data, pre-difficulty-scoring

interface Session {
  phase: Phase
  band: Band            // a property of the puzzle, not a player setting
  universe: UniverseId      // known to the engine, never rendered pre-reveal
  you: NodeId

  known: {
    visible: Set<NodeId>      // drawn at all
    expanded: Set<NodeId>     // neighbours materialised
    facts: Set<NodeId>        // OTHER nodes whose facts were bought
    named: Map<NodeId, string>
  }

  ledger: {          // COUNTS of actions taken, not clue totals
    expansions: number
    facts: number
    names: number
  }

  guesses: Array<{ universe: UniverseId; character: NodeId; correct: boolean }>
}
```

### The rule that keeps the game honest

The renderer must never receive the full graph. A projection function sits between the loaded universe and the components:

```ts
function project(universe: Universe, known: Known): VisibleGraph
```

`VisibleGraph` contains only nodes in `known.visible`, with `name: null` unless revealed. Tie strength is present on every visible edge: thickness is the medium the puzzle is written in and is never withheld. The projection still earns its place — it is what keeps unvisited nodes, unbought names and the size of the graph out of the DOM entirely.

If the full graph is passed down and components merely decline to draw parts of it, every answer sits in the DOM and in the React devtools. Someone will find it, and the codebase will stop being able to tell you what the player knows.

### Costs live in one table

```ts
const COST = { expand: 1, facts: 2, name: 3 } as const
```

Actions are dispatched as `{ type: 'expand', node }`; the reducer applies the cost and the knowledge change together so they cannot drift apart. Everything is counted in clues — there is no second hint currency; see the Game design doc for why that was dropped.

`locate` was removed outright, along with `known.locatedUniverse`; it came back on 2026-09-18 as `story`, at 2 clues, once thirty-one worlds made brute-forcing the dropdown tedious rather than clever. `worldIsKnown(session)` is the single predicate behind it and is true on any of three routes: a guess that got the story right, a world chosen before play, or the purchase. Keeping one predicate rather than three checks is what stops the screens disagreeing about whether the world is known — the guess screen drops its dropdown, the explore corner fills in, and the margin link retires, all off the same answer.

The ledger holds **counts**, never costs. `clueTotal()` is the single place the two are multiplied, which is what keeps "one name" from being reported as "3 names" — the bug that follows directly from storing a cost in a field named for a count.

> **Superseded 2026-09-17/18:** the table once read `{ expand: 1, weigh: 1, name: 3, locate: 8 }`, and is now `{ expand: 1, facts: 2, name: 3, story: 2 }`. `weigh` went because tie strength is the diagram and charging for it charged for the puzzle itself. `locate` went because free guessing already gave the world away, then returned as `story` at 2 once the catalogue grew past the point where guessing was a reasonable way to get it. All three stories are in the Game design doc's information economy section.

### Residence

> **Parked, 2026-09-18 — not implemented.** `Session` has no `residence` field, `initSession` takes no residence, and there is no `WAKE_AGAIN` action. Every waking starts clean and nothing crosses between runs, which is why the session object is now exactly what one run needs and no more. The sketch below stands as the spec for when it comes back; see the Game design doc for why it is parked.

A session would belong to a residence, which outlives it. The residence is what makes a second waking in the same book easier, and it would be the only state that crosses runs.

```ts
interface Residence {
  universe: UniverseId
  wakings: number
  learned: Map<NodeId, string>   // names bought in ANY waking here
  clues: number                  // running total across the residence
  bandFloor: Band                // rises as wakings accumulate
}
```

On a new waking, `known.named` is seeded from `residence.learned` at no cost, and the projection treats those as revealed from the first frame. `phase` still starts at `cold`, but the guess screen omits the story field whenever `residence.wakings > 0`.

Shuffling discards the residence and starts a new one. There is no way back into a discarded residence, which keeps the state model to exactly one live object and avoids a save-slot interface the game does not want.

### Persistence

`localStorage` for two things only: whether topology mode is unlocked, and the last completed ledger. No accounts, no sync, no analytics beyond what you would add later and deliberately.

## Rendering

React owns the DOM. D3 answers one question and then gets out of the way:

> Given these nodes and this anchor, where should each node sit?

No `d3.select`, no `enter/exit/update`, no D3-managed transitions on elements React also controls. Two libraries mutating the same nodes is the single most common way these projects become unmaintainable.

### Component tree

```tsx
<Stage>                     // svg, viewBox, pan/zoom transform
  <Edges  edges={visible.edges} />
  <Nodes  nodes={visible.nodes} onAct={dispatch} />
  <Labels nodes={visible.named} />
  <NodeMenu anchor={hovered} actions={availableFor(hovered)} />
</Stage>
<Ledger counts={session.ledger} />
<Prompt />                  // "What do you want to know?"
<GuessButton />             // I'VE FOUND MYSELF
```

Draw order is deliberate: edges under nodes, labels above both, menu above everything. Labels need a halo in the paper colour so they stay legible where they cross an edge.

### Where chrome lives

Four zones, and nothing crosses between them. Top-left is the title. **The right margin holds everything *about* the session rather than in it** — the ledger, the itemised tally, the key, and the way out — stacked and right-aligned in one column. Bottom-left is the question. Bottom-right is reserved for the single action that ends a run, which is why the utility links moved out of it: two competing right-aligned clusters at the same corner have no alignment that reads as deliberate.

A form's commit belongs to the form. `THIS IS ME` sits directly under the field it submits with `KEEP LOOKING` beside it, rather than pinned to the window's edge where it reads as unrelated chrome.

### Why SVG and not canvas

The graphs are small — tens of visible nodes, a few hundred at full reveal. SVG gives real DOM nodes for hit testing, CSS transitions for the motion described in the design tab, crisp hairlines at any zoom, and an inspector that shows you what is wrong. Canvas would only be worth it past a few thousand elements, which this never reaches. If the full-reveal frame does stutter, the fix is to simplify that one animation, not to rewrite the renderer.

### Coordinates

A single `Stage` transform handles pan and zoom, driven by `d3-zoom` through `graph/zoom.ts`: D3 owns the gesture maths and hands back a `{k, x, y}`, which React applies to one `<g>`. D3 never touches the DOM React owns. The same hook drives the reveal's full-graph view. There is no rubber-band overscroll — `d3-zoom` clamps rather than bounces, and the elastic feel would have to be written by hand.

**Ties meet the circumference, not the centre.** Each line is trimmed by the drawn radius at both ends. A line that runs under a hollow circle reads as a line *crossing* it rather than a tie *to* it, which is exactly the wrong reading in a diagram whose whole subject is what connects to what.

**Nodes can be dragged** out of the way, because labels collide and no automatic layout fixes that as well as a hand does. A nudge is a per-node offset held in the `Stage`, applied on top of the laid-out position, so a relayout never fights a manual placement. A drag under 3px is treated as a click, so dragging never also pins the menu.

D3 binds its zoom listener natively to the `<svg>`, which runs *before* React's synthetic handlers — so `stopPropagation` in a React `onPointerDown` is too late to stop a pan, and dragging a node moves the whole graph. The fix belongs in `d3-zoom`'s own `.filter()`: reject any non-wheel gesture whose target sits inside `[data-node]`.

There is **no rubber-band overscroll**. `d3-zoom` clamps rather than bounces, and the elastic feel would have to be hand-written; it also contradicts the motion rule that the diagram is still except when the player has caused something — a snap-back is the graph moving after the player stopped.

Both stages **measure themselves** and express marks in real pixels rather than layout units. A fixed `viewBox` means one user unit is a different number of pixels in a 300px-tall cold-open diagram than in a full-window explore view, so a 10px label renders at 4px in one and 14px in the other, and hit targets shrink to nothing. The stage observes its own size and maps one unit to one CSS pixel; zoom-to-fit then scales *positions only*, leaving node radii, tie widths and labels at their true size so degree and tie strength stay readable at every depth. Layout works in an abstract coordinate space centred on the player's node at the origin; the stage maps that to the viewport. Keeping the two separate means the reveal animation can expand the world without the player's node moving on screen, which is the effect the design calls for.

### Accessibility

The graph needs a parallel text representation: each node as a list item with its degree and its known relations, actions reachable by keyboard, and the ledger announced on change. This is not only an accessibility concern — a text rendering of the player's knowledge is the fastest way to debug the projection function.

## Radial ego layout

A plain force graph is wrong here. In a force graph the player's node drifts, hop distance is not legible, and every expansion rearranges the world. The player's spatial memory is the thing they are reasoning with, so the layout must protect it.

### The model

- **Radius encodes hop distance.** You at the origin, direct neighbours on ring 1, their neighbours on ring 2, and so on. Ring spacing shrinks slightly as radius grows so the diagram stays compact.
- **Angle encodes lineage.** A node's angle is inherited from its parent, within a wedge whose width is the parent's wedge divided among its children. A cluster discovered through one neighbour stays visually attached to that neighbour, which is how the player remembers it.
- **Force only relaxes.** Run `forceCollide` plus a weak `forceRadial` pinning each node to its ring, for a fixed small number of ticks. Never a free simulation.

### Stability rules

These are the ones that will be violated by accident, so they belong in a test.

1. A node that is already placed keeps its coordinates. New nodes are placed relative to existing ones, not the other way round.
2. Your node is pinned at the origin, permanently.
3. New nodes are born at their parent's position and animate outward. They never appear at their final coordinates.
4. Relaxation is bounded — a fixed tick count, then stop. No simulation running in the background.
5. When a node reachable by two paths appears, it joins the ring of the shorter path and its angle is the mean of its parents'. Re-parenting an already-drawn node is a last resort.

### Two-parent edges

The first time an expansion reveals an edge between two already-visible nodes — a closed triangle — that is a genuinely informative moment for the player. Draw it with the same outward animation as a new edge so it registers rather than silently appearing.

### The reveal layout

The reveal switches layout models: from a radial ego diagram to a force-directed layout of the full graph. Do not cut between them. Run the force layout offline at build time, store the coordinates in the universe JSON, and interpolate each visible node from its ego position to its stored position, with unseen nodes fading in at theirs. Precomputing the final layout also means the reveal looks the same every time, which matters if anyone ever shares a screenshot.

## Motion

Motion carries meaning here, so it gets a spec rather than being left to defaults.

| Moment | Behaviour | Duration | Easing |
| --- | --- | --- | --- |
| Edge appears | Stroke draws from parent to child via dash offset | 400 ms | ease-out |
| Node appears | Scales 0 to 1 at the far end, 150 ms after its edge starts | 250 ms | ease-out, slight overshoot |
| Layout settles | Existing nodes ease to relaxed positions | 600 ms | ease-in-out |
| Weight revealed | Stroke width interpolates from hairline | 300 ms | ease-out |
| Name revealed | Label fades up and rises 4px | 500 ms | ease-out |
| Guess opens | Graph dims to about 40%, fields fade in | 300 ms | ease |
| Reveal | Ego positions interpolate to full-graph positions; unseen nodes fade in staggered by hop distance | 2000 ms | ease-in-out |

### Rules

- **Stagger by hop distance.** When several nodes appear at once, delay each by roughly 40 ms per step from the node that caused them. The expansion then reads as propagation outward rather than a simultaneous pop.
- **Never move and reveal in the same instant.** If an expansion also triggers relaxation, settle first, then draw the new edges. Two simultaneous changes are illegible.
- **Nothing loops.** No pulsing, no breathing, no ambient drift. The diagram is still except when the player has caused something.
- **Respect `prefers-reduced-motion`.** Fall back to instant placement with a short opacity fade. The game must remain fully playable — the motion is expressive, not functional.

### Implementation

CSS transitions for node and edge properties, driven by React state. Use `d3-interpolate` only for the reveal, where the tween is over a set of coordinates rather than a single property, and drive it with `requestAnimationFrame` on a transform layer rather than animating hundreds of individual elements.

## Loading and deployment

### What ships

```
/data/index.json          universe list and band counts, well under 1 KB
/data/asoiaf.json
/data/starwars.json
/data/shakespeare.json
/data/asoiaf.meta.json    character enrichment, fetched on the first Facts buy or at the reveal
/data/ATTRIBUTION.md      source credit, citations, and what was changed
/data/LICENSE             terms the emitted graphs inherit from their sources
```

`index.json` loads at boot and carries universe ids, file names, and how many playable starts of each difficulty band each universe holds. A universe file loads when a session starts.

It carries no character names. The type-ahead on the guess screen deliberately draws from every loaded universe so the player cannot learn how large one book's cast is, and a cast list in the boot payload would hand that over. This is the one leak in the loading path worth engineering against, and the emitter asserts it.

### The network-tab leak

A curious player can open devtools and read `asoiaf.json`. **Accept it.** Files ship under their real names.

Opaque names like `/data/u3.json` were the earlier plan, and they are cheap, but they buy less than they look like they do. The guess screen already lists every loaded universe in its story dropdown, so which books are in play was never the secret — the secret is which one *you* are in, and a player who is cross-referencing network requests against a dropdown has stopped playing the game. Meanwhile the indirection makes every file in `/data` unreadable to the person maintaining it, and a missing universe becomes a puzzle about which of `u1`…`u4` is which.

The cost of being wrong here is small and recoverable. Renaming files later is a build-step change and nothing else.

### Size budget

ASOIAF at roughly 800 nodes and 3,000 edges is a few hundred KB of JSON, well under 100 KB gzipped. Keep node ids short, store edges as index pairs rather than id strings, and round coordinates to one decimal. If a universe file passes 500 KB, something has gone wrong in the emitter — most likely provenance metadata that belongs in a separate build-time file rather than in the shipped graph.

### Deployment

Vite build to `/docs` or a `gh-pages` branch, GitHub Actions on push to main, base path set for the repo subdirectory. The pipeline does not run in CI — it runs locally and its output is committed, so the data is versioned, diffable, and reviewable. A bad regeneration should show up as a diff, not as a silently different game.
