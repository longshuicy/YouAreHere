# The experiment

What happens to 52 worlds when the walls come down. Third surface, after the game and
the gallery. Not a game mode.

2026-10-02 · @Chen

Counts that depend on corpus size are stated as rules and computed at load, as in the
gallery. Unlike the gallery, every figure here is *relative* — defined against a graph
that is changing. That is the point.

## What this is

The game asks: can you recognise a story from the topology it made?

This asks the reverse. Erase the story, keep the people, let the graph rewire itself
under one rule, and watch.

Two questions, neither needing a model in the loop:

1. **Which rewiring rule makes story-shaped graphs?** Story graphs have a signature —
   high clustering, strong modularity, a few hubs, short paths. The classic random
   models each miss it differently: Erdős–Rényi has no clustering, preferential
   attachment grows hubs but no communities, Watts–Strogatz gets clustering but no hubs.
   Testing against real narrative topology normally isn't possible because nobody has
   it. `data/` has 52.
2. **How long does a world survive its boundary?** One survival curve per world.

## Where the worlds sit

(Rings used to appear across the drawing at the end of a long run. They were the ring
drawn around the followed character: it is drawn inside the transformed sheet, so its
radius is a screen size divided by the view's scale, and the automatic fit was freezing
one frame after every refit — d3-zoom reported its own programmatic transform as a hand
on the surface, and the fit stood down for it. A stale scale turned a small ring into a
circle the size of the field. The fit no longer mistakes itself for a user, and the ring
is clamped as well.)


Each world is a disc whose radius goes as √n, and the discs are packed — largest first,
each placed at whichever position tangent to two already-placed worlds lies closest to
the origin. The result is a rough disc whose area is the population.

They used to sit on a square grid at a fixed pitch. 水滸傳 has 974 characters and Indiana
Jones has 20, and both got the same cell: the small worlds floated in acres of nothing,
the large ones very nearly touched, and most of the drawing's area was a picture of how
many files are in `data/` rather than how many people are in them.

## What it costs

Running the full population used to take about seventy per cent of a main thread, and a
*paused* experiment took the same — the layout ticked and the canvas redrew regardless of
whether anything had moved. Both are now gated on having something to say, and the
simulation itself is a little over half what it was. It is about a third of a thread
running and nothing paused.

Almost all of that came from one line. The triadic term τ is a share of a neighbourhood,
so computing it walks one; it appears in the review of every surviving tie, which is
sixty-three thousand of them every round, ten rounds a second. But τ is bounded above by
1 + λ, so the probability it scales is bounded too — and a random draw at or above that
bound cannot strengthen the tie however many friends the two have in common. Drawing
first and rejecting on the bound skips the walk about four times in five, and more often
the stronger the tie, since a saturated tie has little room to be strengthened. It is not
an approximation: the same draw decides the same way and the random stream is consumed in
the same order, so a seed still reproduces its run exactly.

The rest was cadence. The layout is told what the graph looks like once a second rather
than ten times — the canvas reads the graph directly and draws every tie the instant it
forms, so what lags is only where the layout *puts* them — and it is reheated on the same
beat rather than on every round, which previously held it permanently hot. It ticks at
twenty a second rather than sixty, which also sets the drawing's rate, and it stops
entirely once it has gone cold. Reading one character's history walks the entries written
since the last read rather than the whole two-hundred-thousand-entry ring.

Hiding every tie changes none of this measurably: the drawing was never the expensive
part.

## Initial condition

The 52 shipped worlds, unaltered. 8,727 characters, 58,173 ties, node ids namespaced by
world. **No cross-world ties exist.** That is not a problem to solve; it is $t = 0$.

### Tie strength

Strength $s$ is a new channel, continuous, $s \in [0, 100]$ — not the shipped weight and
not the shipped rank.

The shipped rank $\rho_u(e)$ (§3.1 of Algorithms) is asymmetric, undefined at $d(u) = 1$,
and zero-sum within an ego: forming one tie would make every other tie lose rank with no
event behind it. It is a drawing channel. The raw weight is in incomparable units —
Congress runs $50 \to 81 \to 1135$, Hamlet $1 \to 1 \to 9$ — so a shared decay step
erases Hamlet and leaves Congress untouched.

So $s$ is initialised log against the world's own median, making *how far above typical*
mean the same thing everywhere:

$$
z = \log_2\!\left(\frac{w}{\tilde{w}_W}\right), \qquad
s_0 = \operatorname{lerp}\bigl(s_{\min},\, s_{\max},\, \tfrac{\operatorname{clamp}(z,\,\pm k) + k}{2k}\bigr)
$$

$\tilde{w}_W$ is world $W$'s median tie weight. A median tie starts mid-scale; a tie
$2^k$ times typical starts at the ceiling. Within-world ordering survives and magnitude
is not flattened the way quantile bins would flatten it. $k = 4$ by default and is a
control.

$\rho_u$ remains useful as a *decision input*, recomputed live: how a tie ranks among my
others is what should decide whether I bother maintaining it.

## The five actions

```
FORM        nonexistent → s_init
STRENGTHEN  s += δ        (saturating toward s_max)
WEAKEN      s -= decay
CUT         s ≤ 0 → nonexistent
NOTHING     unchanged
```

Everything a character can do changes the topology or leaves it alone.

## The round

A round is a year. Every character acts every round; there is no sampling of actors.

1. Each character draws **one encounter** from the mix.
2. If the two are strangers, **both decide independently**. The tie forms only if both
   say FORM.
3. Every existing tie is **reviewed once**, by its lower-id endpoint.
4. Untouched ties decay.

## The encounter mix

One rule, not several variants. Each encounter is drawn from a mixture of three
exhaustive, disjoint channels, weighted by the controls and normalised:

| channel | draws from |
|---|---|
| **Own world** | uniform over my own world |
| **Friend of a friend** | uniform within two hops, excluding current ties |
| **Cross world** | uniform over everyone outside my world |

A uniform draw over all 8,727 is already 95% cross-world for a 445-character world, so
"random" is not a channel — it is a particular setting of own-world against cross-world.

Friend-of-a-friend is the only channel that changes character mid-run: at $t = 0$ it is
almost entirely within-world, and it becomes a cross-world channel of its own as soon as
the first bridges exist.

## Decision rules

Structural, not random. A tie forms only when **both** sides say FORM — not a setting,
a mechanism. It means something only because the two sides hold genuinely different
positions: each is weighed by its own degree, its own remaining availability, and how
the other looks from where it stands. Under random decisions the same requirement would
be nothing but $p^2$.

For strangers $u$, $v$:

$$P_u(\text{FORM}) = p \cdot \sigma(u) \cdot \tau(u,v) \cdot \kappa(v)$$

| | | |
|---|---|---|
| $p$ | formation pressure | the base rate |
| $\sigma(u) = 1/(1 + d(u)/d_0)$ | saturation | a busy character is less available |
| $\tau(u,v) = 1 + \lambda\,\dfrac{\lvert N(u) \cap N(v)\rvert}{\min(d(u), d(v))}$ | triadic closure | shared friends help |
| $\kappa(v) = (d(v)/\bar{d})^{\alpha}$ | preferential attachment | $\alpha = 0$ ignores degree |

The tie forms at $s_{\text{init}}$ iff both draw FORM.

For an existing tie $(u,v)$ at strength $s$:

- **STRENGTHEN** with probability $p_s \cdot \tau(u,v) \cdot (1 - s/s_{\max})$.
  Diminishing returns upward. A tie strengthened or formed this round counts as touched.
- **WEAKEN**: an untouched tie loses `decay` per round.
- **CUT** when $s$ reaches 0.

### Why the triadic term is a share, not a count

$\tau$ appears in both formation and maintenance, so an unbounded version runs
away: a densifying graph raises shared-neighbour counts, which raises
strengthening, which prevents the cuts that would have thinned it. The prototype
ran exactly that way — mean degree 18.9 to 47.5 in ninety years, one tie cut per
round, no equilibrium at any setting. Dividing by $\min(d(u), d(v))$ bounds
$\tau$ at $1 + \lambda$ however dense the graph becomes, and asks the better
question: what *share* of my people do we have in common, not how many.

### Why there is no cap

A fixed degree cap detonates at $t = 0$. Mean degree is 13.3 globally but 54.5 in 水滸傳,
31.6 in Congress, 4.1 in the Civil War. Any cap low enough to shape the run amputates the
densest worlds before a single encounter happens, and everything measured afterward
measures the amputation.

Saturation $\sigma$, formation pressure and decay replace it. Steady-state mean degree is
roughly

$$\bar{d}_\infty \approx (\text{ties formed per round}) \times (\text{average tie lifetime})$$

so those controls put a run in growth, equilibrium or collapse — and the two realised
rates are shown live beside mean degree, so the regime is visible rather than inferred.

## Controls

All live; a change takes effect on the next round.

| group | controls |
|---|---|
| **Encounter mix** | own world · friend of a friend · cross world (normalised) |
| **Tie formation** | formation pressure $p$ · saturation $d_0$ · triadic bonus $\lambda$ · preferential attachment $\alpha$ |
| **Tie maintenance** | strengthen rate $p_s$ · decay per round · $s_{\text{init}}$ · init clamp $k$ |
| **Worlds** | which of the fifty-two are in, one by one; all · none |
| **Run** | seed · length in years · play / pause / step · reset · refit |
| **View** | who you are reading over — anyone, by name, or by clicking one · draw all ties, cross-world only, or none · hover a world in the key to light it |

The world controls are a draft until applied; everything else takes effect on the next
round.

$\lambda$ and $\alpha$ are controls rather than constants because they are the two levers
that decide the answer to question 1: $\lambda = 0$ forbids communities, $\alpha = 0$
forbids hubs.

Everything that is *not* a control lives in `app/src/experiment/constants.ts`, one file,
each number with the argument for its value written beside it. Several of them were
wrong at first in ways no amount of reasoning would have caught — see the two notes
above — and a number that can be wrong should not be buried in the function that uses
it. Rounds per second is among them: it changes how fast you watch, never what happens,
and a control that cannot alter the result does not belong beside controls that can.

**The population is chosen, not preset.** All fifty-two are in by default and any of
them can be taken out. Every universe file is fetched once at load — four megabytes
together, since the bulk of `data/` is reveal-only sidecars nothing here reads — so
changing the selection is a merge rather than a round trip, and the picker is something
to fiddle with rather than something to commit to.

A six-world shortcut sat beside *all* and *none* for most of the build — a fast
instrument for tuning, where a round cost about a twentieth as much. Every rule here was
tuned on it before it was ever run at scale, and it is gone from the picker now that it
has done that: a preset nobody uses twice is a third button on a control that wanted two.

## The screen

**The experiment is the lab's first view**, beside *Worlds* and *Characters*, rather
than a separate surface with chrome of its own — which is most of what made it read as a
different product. One header serves all three: the wordmark and the ways back into the
game on the first line, the lab's name and its three rooms on the second, sharing the
rule the tabs are underlined against. It is what `/lab` opens on, and the separate
`/experiment` route is gone.

Under that header:

| | |
|---|---|
| **the shelf** | three figures — world loyalty, cross-world ties, worlds apart — with *all figures* behind a disclosure |
| **the map** | the drawing in its own frame, with *what is drawn* the only thing over it |
| **the foot** | a caption before the run; the transport after it |
| **the column** | setting up, in four steps — and once the walls are down, the reading |

*Worlds apart* is the count of connected components, said as what it means: at year zero
every world is its own island and the number is fifty-two, and the number falling is the
walls coming down.

**Setting up is four steps, in the order the argument runs.** Which worlds take part
decides who there is to follow; following somebody decides whose story the run tells; the
conditions decide what happens to them; then the walls come down. Each step states what
it has settled on, so the column is a summary of the run about to happen rather than a
form, and a step with its answer in it is ticked rather than numbered: the number is the
order you work in, and once a step is settled the order is behind you. Two of them have
more to say than a line — the worlds take a list, the conditions take a panel of dials —
and those replace the column rather than opening over it, so the map is never covered by
the thing that decides what is on it.

Side by side the map and the reading need about eleven hundred pixels before the drawing
is a drawing rather than a stripe. Below that the screen gives up being one screen: the
two become rows that scroll, the map keeping a little over half the viewport, and the rule
between them turns from a side into a top.

**Nobody is followed until somebody is chosen.** Waking a visitor up as a stranger is the
game's move; here it is the second of four decisions. Take anyone at random, find them by
name, or click them on the map.

**The conditions start as three places rather than eleven dials.** *Stay close*,
*balanced* and *wander far* set the four that decide a run's character — how far people
reach, how hard they look, how fast the unused fades — and leave saturation, the triadic
bonus and preferential attachment where fine-tuning finds them. Every dial behind
*fine-tune* is named for what it does to people with its symbol kept underneath, because
λ means nothing to a visitor and everything to this document, and both are reading that
panel.

**The transport is a transport.** A round filled button for play, a round outlined one
for a single year, the year as a figure, the track, and speed at one, four or sixteen times
— which changes how fast you watch and never what happens. *Refit* and *what is drawn*
are not transport, and sit over the map where the thing they change is.
everything it did and more, so it was a third way of saying "one year at a time".

## Going back

The year track is a scrubber. Drag it and the drawing becomes that year's.

Replaying is a way of looking and never a rewind: the simulation is untouched, nothing is
discarded, and play puts the view back on the head and carries on from there. Because a
past year looks exactly like a present one — which is the whole difficulty — it is said
plainly: the drawing takes an accent frame, a line over it names the year being replayed
against the year the run has reached, and the figures beside it are measured from the
replayed graph rather than carried over from the live one. A panel reading "year 3" beside
today's tie count is worse than no panel.

Three of the four things a past year needs were already here:

| | where it comes from |
|---|---|
| **the ties** | replayed from the ledger, which holds every FORM and CUT since the initial condition |
| **the figures** | measured from that replayed graph, with the two realised rates read off the stored series |
| **the headline's line** | the series it was already keeping, clipped to the year on screen |
| **where everyone was** | the one thing nothing else records — see below |

A force layout is iterative, so replaying the same graph does not give back the same
picture. Positions are therefore kept per year: two Float32Arrays over 8,727 characters,
about seventy kilobytes a year, and two hundred and forty of them is seventeen megabytes,
allocated as the run reaches them.

That is a cap on how many pictures are held, not on how far back they reach. A run longer
than the cap is sampled — every second year at five hundred, every fifth at a thousand —
so the whole of it stays reachable and only the precision gives way. The scrubber lands on
the nearest year held, which in a settled layout is a difference of a pixel or two.

The scrubber's reach is drawn on the rail, as a dashed stretch at the left standing for
the years the run no longer remembers. A knob that simply stops halfway along a
thousand-year run reads as a broken control rather than as a bounded memory.

The ledger has a horizon of its own, and it is the harder one. At the default settings the
fifty-two worlds produce around two and a half thousand formings and cuttings a year, so
two million entries is about eight hundred — the whole of a four-hundred-year run with
room to spare, and most of the longest the length control offers, at twenty-six megabytes.
Unlike the pictures these cannot be sampled: an event skipped is a tie that never forms or
never ends, and the replay would be of a graph that never existed. The scrubber's left end
is whichever horizon is nearer, so it never offers a year it cannot show.

Strengths are not replayed at all. Strengthening and decay touch tens of thousands of
ties a round — seventeen million events over a default run — so recording them is out of
the question, and inferring them would be drawing a number nobody measured. Every
replayed tie is drawn at one weight, and the banner says so, because a drawing that
quietly made one of its channels up would be worse than one that admits it has three.

The picture is taken once a round rather than once a frame. A frame can carry several
rounds, and taking it at the end of the batch left holes in the scrubber at exactly the
moments the machine was busiest.

Nothing else is on the screen at rest. The fifty-two world names, the eleven sliders, the
loyalty leaderboard and the end-of-run report are each one line until asked for, and the
line states its own setting, so a shut drawer still says whether it needs opening. The
line carries a mark that turns when it opens, because a label over a summary says nothing
about being pressable.

**Figures that move are drawn as lines.** World loyalty, each world's own loyalty in the
key, and — for whoever you woke as — how many people they know and what share of them are
still from home. A number says where something is; this run is about how it got there,
and a single current value cannot carry that. The person's two lines are rebuilt
backwards out of the ledger rather than accumulated forward, so they are complete for
anyone picked at any point rather than starting empty when the watch moves.

**Choosing the population is free; using it is not.** Every toggle used to commit at
once — re-merging 8,727 characters, tearing down the layout and rebuilding the run, once
per click — so dropping six worlds cost six full rebuilds and six lurches, and a render
landing mid-change could hand a fifty-two-entry reading to a fifty-one-world population
and take the screen down with it. The picker is a draft now, applied in one go.

**You wake up as someone.** The game's premise, kept: the seed names the whole run — the
same number gives the same history and the same person to watch it happen to — and their
thread is the one piece of reading that is always on screen. It can be any of the 8,727;
click the field, search a name, or take anyone.

The opening frame is theirs. Before the run starts the view sits on their shoulder — their
world filling the frame around them, the other fifty-one drifting at the edges — and
pressing play lets it go, so the fit eases outward to all of them. The walls coming down,
done as a camera move.

### Their story

The person being followed carries a dated list of what has happened to them, in plain
words — *Met Remus Lupin, from Harry Potter* — and a mark on the year track for each of
those years, so their life is drawn along the run's own timeline. Pressing a dated line
takes the view to that year.

Three kinds of thing happen to somebody: they meet a person, they lose touch with one,
and a tie of theirs goes quiet. The first two are the FORM and CUT the ledger already
holds. The third is **FADE** — a tie crossing below half strength on its way down — and
it is the one event here recorded for the reading rather than for the simulation. It
fires on the crossing, not on the state, so it is as rare as a cut rather than as common
as decay, and it is listed only while the tie it belongs to is still there: a tie that
went quiet and was later cut is a cut, and at the end of a long run there are enough
fadings to bury every meeting.

The marks are thinned the same way. At a lively setting one character can have several
hundred events over two hundred years, and all of them ticked at once is a solid red bar —
a texture, which says less than three marks would. Ties that cross a wall get the room
first, because those are what this experiment is about.

### Their story

The person being followed carries a dated list of what has happened to them, in plain
words — *Met Remus Lupin, from Harry Potter* — and a mark on the year track for each of
those years, so their life is drawn along the run's own timeline. Pressing a dated line
takes the view to that year.

Three kinds of thing happen to somebody: they meet a person, they lose touch with one, and
a tie of theirs goes quiet. The first two are the FORM and CUT the ledger already holds.
The third is **FADE** — a tie crossing below half strength on its way down — and it is the
only event recorded for the reading rather than for the simulation. It fires on the
crossing and not on the state, so it is as rare as a cut rather than as common as decay,
and it is listed only while the tie it belongs to is still there: a tie that went quiet and
was later cut is a cut, and at the end of a long run there are enough fadings to bury every
meeting.

The marks are thinned on the same principle. At a lively setting one character can have
several hundred events over a four hundred year run, and all of them ticked at once is a
solid red bar — a texture, which says less than three marks would. Ties that cross a wall
get the room first, because those are what this experiment is about, and the rest are
sampled at an even stride across the whole life rather than taken off the end of a
newest-first list — which put every mark inside the last stretch of the rail and left the
rest of it blank. The crossings are sampled too: exempting them is fine for somebody with
two of them and ruinous for somebody who has spent seven hundred years meeting outsiders,
whose rail went solid red.

A fading takes at most three of the story's lines for the same reason. Somebody with
seventy ties has seventy of them waiting, and a story that is nothing but friendships
going quiet is not the story of a wall coming down: the meetings and the partings are what
happened, and a fading is a note in the margin.

Their history reaches behind the moment you looked, because the experiment keeps every
FORM and CUT for everyone — about three megabytes as a ring buffer, since the two events
that change the topology are rare beside maintenance. The log used to belong to whoever
was being watched, which meant picking someone on year ninety showed an empty panel and
switching away threw the first one's life out. STRENGTHEN stays out of the ledger for the
same reason it stays out of the reading: a character with sixty ties strengthens about ten
of them a round, so keeping them would be keeping almost nothing else. It is counted
instead, one line a year, and only while someone is being watched.

**The names are not printed on the drawing.** Fifty-two of them at once overprinted into
a grey smear that named nothing, at the centroids, which at full scale is exactly where
the cross-world ties converge. The names live in the key instead, each beside the swatch
that is its colour on the field; hovering one lights that world and washes the rest back.
On the field a world is named only when something has asked for it — a hovered key row,
your own world, the world under the pointer — never more than three at a time, and in ink
rather than grey, because a name only drawn when wanted can afford to be legible.

## Metrics

Split by cost, not by interest.

**Live, every round** — $O(V+E)$, 2–5 ms, no worker:

density · mean and max degree · connected components · cross-world tie share ·
**world loyalty** · per-world survival · ties formed per round · ties cut per round

World loyalty is the headline: for each character, the share of surviving ties still
inside their original world. 100% at round 0.

**On completion, once.** The run ends, the report appears:

clustering coefficient · modularity · communities · characters left alone · average path
length (sampled BFS from ~200 sources; exact is 8,727 × 58,173 traversals and takes
seconds) · assortativity · **drift from its own shape**

Communities are counted with a floor of five members. Without one the number is
meaningless: the partition starts with everyone in a group of their own and only moves
those with ties, so the first full-scale run reported 1,152 "communities" against a
modularity of 0.61 that described something like forty real groups. The leftovers are
reported separately, as characters left alone, which is a finding rather than noise.

Drift asks question 1. Each world's fingerprint is three intrinsic numbers — mean
degree, mean local clustering, and the share of ties held by the top tenth of the cast —
measured over the characters who started in that world, using **only their ties to each
other**. Cross-world ties are the subject of every other figure here and are excluded
from this one on purpose: the question is what happened to the story's own internal
structure, not how much of it leaked.

## Determinism

A seeded PRNG, never `Math.random`. Same seed and same controls produce the same run.
The URL is the experiment:

```
?seed=48291&own=20&fof=60&cross=20&p=0.35&decay=1.5&years=200
```

There is no baked experiment file and no generator. A visitor forks a run by changing one
number.

## Rendering

58,173 ties is 67,000 DOM elements; SVG cannot hold it.

- **Canvas** for the mass — four batched strokes for the strength bands, one for
  cross-world ties, one filled pass per world for the nodes.
- **An SVG sheet over it** for everything that is not mass: world labels, the followed
  character's ties, the hovered character's ties. Never more than a few hundred marks,
  and the only ones anyone reads individually. It is also the surface that takes the
  pointer, so the canvas underneath never needs to know about zoom or hover.
- **d3-quadtree** for node hover, rebuilt only when the pointer moves. Hover a character
  and their ties light up; click and you are following them.
- **No tie hover.** Picking one hairline out of 58,000 is not an interaction anyone can
  perform.
- **Ties use a non-scaling stroke; nodes scale as √k.** Thickness is meaning, and a zoom
  that multiplies it is a different drawing rather than a closer look. Nodes cannot do
  the same — held at exactly true size they shrink to sub-pixel specks as the view
  spreads, which is the opposite of what zooming in is for.
- **A label is drawn only where its world is wide enough on screen to hold the name.**
  All fifty-two at once overprint into a grey smear that names nothing.
- **The force layout runs in a worker.** One tick at full scale costs tens of
  milliseconds — the whole frame budget before anything is drawn, and the sliders stop
  answering while the graph settles. Positions persist and alpha takes a small kick when
  ties change, so communities drift as the graph rewires. That drift is the animation.

### The one colour rule

Accent red marks the character being followed and their ties, and marks nothing else.
Cross-world ties are **ink**, which appears nowhere else in the drawing; hover is the
same ink, heavier.

Node fills are each world's shipped accent **washed well back toward the paper**. Those
accents are chosen to identify one world on one card at full strength; eight thousand at
once is a different job. Fifty-two saturated colours in a single field shout over each
other and — worse — over the red, so the one mark that has to be findable was the
hardest thing on the screen to find. Washed back, a world still reads as a region of
colour and red stays the loudest thing in the drawing. Cross-world ties were accent once, and two of the fifty-two worlds are
already reds — Harry Potter `#7F1D1D`, 紅樓夢 `#A12B3C` — so the one mark meaning *this
tie is new* was the colour of two of the populations. A colour that means several things
means none of them.

## Deliberately absent

- **No LLM.** Every rule here is arithmetic, which is what makes the parameters controls
  rather than a canned replay.
- **No degree cap**, and **no five-level strength binning** — both were arbitrary at a
  scale where worlds differ by an order of magnitude.
- **No separate experimental arms.** One rule, one mix, continuous controls. Comparing two
  settings means opening two URLs.
- **No cross-world ramp.** It was a modifier on the cross-world weight that climbed from
  zero across a run. Cut: it made the first half of every run uneventful, and the same
  shape is reachable by turning the weight up by hand while watching.
- **No homophily channel, yet.** Deciding by character similarity needs a vocabulary
  shared across worlds, and `affiliations` and `traits` have none — "Order of the Phoenix"
  and "House Stark" share nothing, so set similarity would collapse into world loyalty
  wearing a costume. A one-time offline embedding pass over the 8,727 `line` strings would
  fix it without putting a model in the loop. Parked.
- **No spoiler guard.** Like the gallery, this is a looking-at piece.
