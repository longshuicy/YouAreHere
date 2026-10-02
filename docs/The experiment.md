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

**The ramp is a modifier, not a channel.** Cross-world weight is held constant or ramped
$0 \to c_{\max}$ across the run. Ramped, the walls do not fall; they thin.

Friend-of-a-friend is the only channel that changes character mid-run: at $t = 0$ it is
almost entirely within-world, and it becomes a cross-world channel of its own as soon as
the first bridges exist.

## Decision rules

Structural, not random. Mutual consent means something only because the two sides hold
different positions in the graph.

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
| **Encounter mix** | own world · friend of a friend · cross world (normalised) · cross-world ramp on/off, $c_{\max}$ |
| **Tie formation** | formation pressure $p$ · saturation $d_0$ · triadic bonus $\lambda$ · preferential attachment $\alpha$ · mutual consent on/off |
| **Tie maintenance** | strengthen rate $p_s$ · decay per round · $s_{\text{init}}$ · init clamp $k$ |
| **Run** | seed · length in days · play / pause / step · speed · scrub · reset to $t=0$ |
| **View** | pin a character · colour by original world, current community, or world loyalty · draw all ties, cross-world only, or none |

$\lambda$ and $\alpha$ are controls rather than constants because they are the two levers
that decide the answer to question 1: $\lambda = 0$ forbids communities, $\alpha = 0$
forbids hubs. Mutual consent is a toggle because how often the two sides disagree is
itself a measurement.

## Metrics

Split by cost, not by interest.

**Live, every round** — $O(V+E)$, 2–5 ms, no worker:

density · mean and max degree · connected components · cross-world tie share ·
**world loyalty** · per-world survival · ties formed per round · ties cut per round

World loyalty is the headline: for each character, the share of surviving ties still
inside their original world. 100% at round 0.

**On completion, once.** The run ends, the report appears:

clustering coefficient · modularity and community count · average path length (sampled
BFS from ~200 sources; exact is 8,727 × 58,173 traversals and takes seconds) ·
assortativity · **drift from ground truth**

Drift reuses the gallery's own fingerprint: how far the rewired graph has moved from the
shape a story actually made. It is question 1, measured.

## Determinism

A seeded PRNG, never `Math.random`. Same seed and same controls produce the same run.
The URL is the experiment:

```
?seed=48291&own=20&fof=70&cross=10&ramp=1&p=0.3&decay=4&days=200
```

There is no baked experiment file and no generator. A visitor forks a run by changing one
number.

## Rendering

58,173 ties is 67,000 DOM elements; SVG cannot hold it.

- **Canvas** for the node field and the tie mass, **SVG over it** for labels, hairline
  chrome, and the pinned character's ties — so the surface still looks like YOU ARE HERE.
- **d3-quadtree** for node hover. Hover a character, their ties light up, cross-world ties
  brightest. Click to pin and read their encounter log through the run.
- **No tie hover.** Picking one hairline out of 58,000 is not an interaction anyone can
  perform.
- Force layout runs incrementally in a worker: positions persist, alpha takes a small kick
  when ties change. Communities drift as the graph rewires, which is the animation.

## Deliberately absent

- **No LLM.** Every rule here is arithmetic, which is what makes the parameters controls
  rather than a canned replay.
- **No degree cap**, and **no five-level strength binning** — both were arbitrary at a
  scale where worlds differ by an order of magnitude.
- **No separate experimental arms.** One rule, one mix, continuous controls. Comparing two
  settings means opening two URLs.
- **No homophily channel, yet.** Deciding by character similarity needs a vocabulary
  shared across worlds, and `affiliations` and `traits` have none — "Order of the Phoenix"
  and "House Stark" share nothing, so set similarity would collapse into world loyalty
  wearing a costume. A one-time offline embedding pass over the 8,727 `line` strings would
  fix it without putting a model in the loop. Parked.
- **No spoiler guard.** Like the gallery, this is a looking-at piece.
