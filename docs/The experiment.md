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

A round is a day. Every character acts every round; there is no sampling of actors.

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
ran exactly that way — mean degree 18.9 to 47.5 in ninety days, one tie cut per
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
| **Worlds** | which of the fifty-two are in, one by one; all · none · the six |
| **Run** | seed · length in days · play / pause / step · reset · refit |
| **View** | follow a character — at random, by name, or by clicking one · draw all ties, cross-world only, or none |

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

*The six* is a shortcut to a small, deliberately mixed set: not a lesser version of the
experiment but a different instrument, where a round costs about a twentieth as much and
a parameter can be turned and judged in seconds rather than a minute. Every rule here was
tuned on it before it was ever run at scale.

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
?seed=48291&own=20&fof=60&cross=20&p=0.35&decay=1.5&days=200
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
