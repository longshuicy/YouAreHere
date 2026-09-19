# Algorithms

How a world is built, drawn, and scored. Everything here is computed once at build
time unless it says otherwise; the client's share is almost entirely arithmetic on
numbers the pipeline already worked out.

Notation. A world is an undirected weighted graph $G = (V, E, w)$. $N(u)$ is the set
of neighbours of $u$, $d(u) = |N(u)|$ its degree, and $w(u,v) > 0$ the weight of the
tie between $u$ and $v$.

---

## 1. What a tie is

Every source defines an edge differently, and the difference is recorded rather than
flattened, because mixing them without saying which is which makes difficulty
incomparable across worlds.

| World | An edge means | A weight counts |
|---|---|---|
| A Song of Ice and Fire | named within fifteen words of each other | qualifying co-occurrences, over five books |
| The Bible | named in the same verse | verses naming both, over the whole King James text |
| Shakespeare | appearing in the same scene | shared scenes, over the play |
| Star Wars | speaking in the same scene | shared scenes, over episodes I–VII |

The player is never told which. In play a tie is always described the same way — a
thick tie means two characters *share more of the story* — and the real definition is
stated only at the reveal, from the world's provenance record. The vocabulary stays
general on purpose: naming the real definition mid-game would tell the player which
dataset they are in.

Note what a tie is **not**. It is not affection, alliance, or importance. Two enemies
in every scene together have one of the heaviest ties in the book.

### 1.1 The Bible, which is built rather than taken

The others adapt a published edge list. The Bible graph is assembled here from the
1769 King James text (public domain) and Wikidata's biblical figures (CC0), because
every ready-made Bible network was either unusable — mixing people with places, so a
waking lands you on "Jerusalem" — or under terms that cannot be combined with the
rest of `/data`.

The graph is easy; deciding which capitalised word is a person is not. Three rules
do that work, and each is a judgement that can be wrong.

**Shared names.** There are eight Abijahs. A written form $f$ is claimed by the set
$Q(f)$ of figures carrying it as a name or an alias. Let $\ell(q)$ be a figure's
Wikidata sitelink count, a proxy for how well known they are. The form resolves to

$$
\operatorname{owner}(f) =
\begin{cases}
q_1 & \text{if } \ell(q_1) \ge \max\bigl(3,\; 2\,\ell(q_2)\bigr) \\
\text{unassigned} & \text{otherwise}
\end{cases}
$$

where $q_1$ and $q_2$ are the best- and second-best-known claimants. A name
nobody clearly owns is dropped rather than guessed — which is why **John** is absent
from the graph. The Baptist and the Apostle are too close to separate, and inventing
a winner would put half of one man's verses in the other's ego network.

**A name beats a nickname.** If any claimant carries $f$ as its *primary* label, only
those claimants are considered. Without this rule "Miriam" resolved to Mary the
mother of Jesus — Miriam being one of Mary's alternative names, and Mary far better
known — and Moses' sister was quietly written out of Exodus.

**Eponyms.** The real trap, and it arrives through the text rather than the node
list. "Israel" stands in the King James text 2,576 times against "Jacob"'s 377,
nearly all of it the nation. Left alone it made Jacob the largest hub in the graph on
the strength of verses he is not in, and tied him to Moses — whom he never met — more
heavily than to his own sons. A hand-maintained table blocks such forms, either
everywhere or outside the books where the person acts: the twelve sons of Jacob are
matched inside Genesis, where they are people, and blocked outside it, where they are
territory. The restriction attaches to the *person*, not the form, because blocking
"Seir" while leaving "Seir the Horite" open let the territory back in through the
side door.

---

## 2. Filtering and splitting

Weak ties go first, then thin nodes, iterated to a fixed point — dropping a node can
drop its neighbour below the threshold too:

$$
E \leftarrow \{e \in E : w(e) \ge w_{\min}\}, \qquad
V \leftarrow \{u \in V : d(u) \ge d_{\min}\} \ \text{ until stable}
$$

with $w_{\min} = 1$ and $d_{\min} = 2$ for every source shipped.

### 2.1 One world per component

A merged drama corpus is not one world. The cast of Hamlet and the cast of Macbeth
share nobody, so a player waking in one can never reach the other, and asking them to
name "Shakespeare" while showing them a play is the wrong question about the right
diagram. So each connected component of at least 8 characters is emitted as its own
world.

This is deliberately **not** a split by source unit. Where plays genuinely interlock,
the component keeps them together and a per-play split would have destroyed it. In
practice 26 components are exactly one play, and two are not:

- the eight history plays from *Richard II* to *Richard III*, one continuous dynastic
  quarrel — plus *The Merry Wives of Windsor*, attached by Falstaff, Pistol, Bardolph
  and Mistress Quickly rather than by any king;
- *Julius Caesar* and *Antony and Cleopatra*, joined by Antony, Octavius and Lepidus.

After splitting, a display name loses its parenthetical qualifier when the bare name
is unique in its new world. The merged corpus had to distinguish two Dukes of
Buckingham; separated, `Hamlet (Hamlet)` would just hand over the answer.

---

## 3. Drawing

### 3.1 Tie thickness is a rank, not a weight

Raw weights are not comparable between worlds — a verse count and a scene count are
different units — and not even very comparable within one, since a hub's weakest tie
may outweigh a minor character's strongest. So thickness encodes rank: *strong
relative to this character's own ties*.

For a node $u$, order its incident edges by weight and let $r_u(e) \in \{0,\dots,d(u)-1\}$
be the position of $e$ in that order. Then

$$
\rho_u(e) = \frac{r_u(e)}{d(u) - 1}
$$

with $\rho_u(e) = 1$ when $d(u) = 1$. Every edge therefore carries **two** ranks, one
per endpoint, and the renderer uses whichever endpoint the player is looking out
from. Width and colour both key off it:

$$
\text{width} = 1 + 2.4\,\rho, \qquad \text{colour} = \text{lerp}(\texttt{\#9A9287} \to \texttt{\#7C756A},\ \rho)
$$

so ties darken as they thicken. Thickness is never for sale — it is the medium the
puzzle is written in, and a graph of uniform hairlines is not a puzzle.

### 3.2 Node size is degree

$$
\text{radius}(d) = 6 + 3.5\,\frac{\sqrt{\min(d,40)} - 1}{\sqrt{40} - 1}
$$

A square-root scale over a deliberately tight range, 6 to 9.5 units, so the diagram
reads as one family of marks rather than a bubble chart. Degree is free information.

### 3.3 The reveal layout

The full named graph is laid out once at build time with a force-directed spring
layout, seeded so it is identical on every run. Weights are compressed first:

$$
\tilde{w}(u,v) = \log(1 + w(u,v))
$$

Raw weights span three orders of magnitude, and feeding them in directly collapses
the hubs into a knot; the log keeps strong ties short without letting one tie
dominate the arrangement. 200 iterations, coordinates scaled by 600.

### 3.4 The ego layout, which runs in the client

During play the player sees a radial ego diagram, not the reveal layout. `you` is
pinned at the origin and each node sits on the ring of its hop distance:

$$
R(h) = \sum_{i=1}^{h} 95 \cdot \max(0.82^{\,i-1},\ 40/95)
$$

— ring spacing that shrinks as radius grows. Newly revealed nodes are born at the
position of the node that revealed them and animate outward, so the diagram never
jumps; a placed node keeps its coordinates forever, and relaxation is bounded to 60
ticks of a collision force with radius 26.

Children of a node are spread over an angular wedge centred on the direction away
from their parent:

$$
\theta_{\text{wedge}} =
\begin{cases}
2\pi & \text{children of } \texttt{you} \\
\min\bigl(0.9\pi,\ \max(\tfrac{\pi}{2},\ 0.13 n)\bigr) & \text{otherwise}
\end{cases}
$$

The first case is the important one and was a bug for a while. A wedge is right for
an expansion — the graph opens outward from the node you clicked — but wrong at the
centre, where there is no direction to face away from. Your own neighbours were being
laid out across 162° of the circle, so they crowded at a dozen while half the ring
stood empty.

### 3.5 Zoom to fit, and why it constrains the puzzle generator

The stage scales positions to fit its box, but **not** node radii or tie widths:

$$
k = \min\left(2.4,\ \frac{\max(80,\ \tfrac{1}{2}\min(W,H) - 64)}{\max_i \lVert p_i \rVert}\right)
$$

Keeping marks at true size is what lets degree and tie strength stay readable at any
depth. But it has a consequence: since the ring always fills the frame, the gap
between adjacent neighbours is the frame's circumference divided by how many there
are, and **growing the ring radius buys nothing — the fit cancels it exactly.** Stage
height is the only lever, and that is what caps degree in §4.

---

## 4. Choosing which characters can be starts

Not every node makes a puzzle. A start must satisfy

$$
6 \le d(u) \le 40
\qquad\text{and}\qquad
\bigl|\,B_3(u)\,\bigr| - 1 \ \ge\ \max\Bigl(1,\ \min\bigl(20,\ \operatorname{round}(0.55\,(|V| - 1))\bigr)\Bigr)
$$

where $B_3(u)$ is the set of nodes within three hops of $u$.

**The reach test is relative, and has to be.** It asks "is there enough graph in
front of this node to explore?", which is a question about the world, not the node. A
flat 20, calibrated on a 592-character novel, silently became a *minimum world size*:
reaching 20 characters requires 21 to exist. Every node in twelve-character Othello
failed a test no node in Othello could pass, and fifteen of the twenty-eight
Shakespeare worlds produced zero starts — Hamlet, Macbeth, Lear, Othello and The
Tempest among them. The $\min$ is what makes it safe: the threshold can only ever go
*down* from 20, so large worlds are judged exactly as before.

**The degree ceiling is a drawing constraint, not a difficulty one.** By §3.5 it is
the cold open's stage height that decides how many neighbours can be drawn before
they touch. Forty is the top of the range rather than a comfortable number: the
relaxation does not space a ring perfectly evenly, so a start near the cap can put
two neighbours closer than the average gap suggests.

**There is no hub exclusion, and there used to be.** The rule was that a famous shape
gives its book away. That was backwards. Waking as someone the reader recognises is
the easy end of the range, not a leak — and banning it meant the recognisable
characters were precisely the ones a player could never be. Every one of the eight
best-known characters in ASOIAF and in the Bible was unreachable: never Tyrion, never
Jon Snow, never Moses, never David. What was left was always a minor character, in
every world, every time, which is most of why the game played as hard as it did.

---

## 5. Scoring difficulty

Each playable start gets a continuous **ease** score in $[0,1]$. There are no named
bands: an earlier version cut the scale at a threshold and shipped "approachable" or
"hard", which put an arbitrary boundary in the middle of a measurement — Laertes at
0.570 was hard and Gertrude at 0.653 was approachable, and nothing happens in
between.

### 5.1 Prominence, or why weighted degree tracks fame

$$
W(u) = \sum_{v \in N(u)} w(u,v)
$$

is roughly *how much of the text a character is present for*, counted through
whoever stands next to them. That tracks how well known a character is, because
authors give page time to the people they want remembered and readers remember who
they spent time with.

Plain degree measures something else and gets it wrong in a specific way: it rewards
whoever meets many people once each. Ranked by plain degree, the best-connected
people in the Bible are Shemaiah and Azariah, named beside many others in genealogies
and known to almost nobody. Weighted, they fall away and David, Moses, Saul and Aaron
rise to the top.

Since $W$ is in incomparable units, only its rank within the world is used:

$$
P(u) = \frac{\operatorname{rank}(W(u))}{|V| - 1} \in [0,1]
$$

> **Known blind spot.** This cannot see a character who matters while *alone*. A
> narrator in a cell or on an island accumulates no co-appearances and scores near
> zero however central they are. Nothing shipped has that shape, but a novel with an
> isolated narrator would need a different measure.

### 5.2 Structural signature and ambiguity

What makes *which story* hard is that other characters look the same. A character's
signature is what can actually be read off a diagram — roughly how many ties, and
roughly how important the people on the far end are:

$$
S(u) = \Bigl(\,\beta\bigl(d(u)\bigr),\ \min(3, L(u)),\ \min(3, M(u))\,\Bigr)
$$

$$
L(u) = \bigl|\{v \in N(u) : P(v) \ge 0.85\}\bigr|, \qquad
M(u) = \bigl|\{v \in N(u) : 0.55 \le P(v) < 0.85\}\bigr|
$$

where $\beta$ buckets degree into $(6\text{–}7,\ 8\text{–}9,\ 10\text{–}12,\ 13\text{–}16,\ 17\text{–}22,\ 23\text{–}30,\ 31{+})$.

The coarseness is the point. An early version matched exact degree $\pm 1$ against an
exact neighbour profile; half of all starts came out with **zero** look-alikes and
every puzzle in the game scored as easy — the failure mode the pipeline doc warns
about under "Tolerance".

Look-alikes are counted across the **whole catalogue**, not the home world, because
the player answers *which story* first — a shape that is unique in Macbeth but
ordinary in the Bible is not a unique shape:

$$
A(u) = \Bigl|\bigl\{v \in \textstyle\bigcup_k V_k \ : \ S(v) = S(u)\bigr\}\Bigr| - 1
$$

### 5.2a Resemblance, which is a different question from ambiguity

> **Added 2026-09-19.** $A(u)$ counts how many characters could be mistaken for $u$,
> and cannot say *who* — everyone sharing a signature is equally alike by
> construction, so a bucket has no inside order. Naming one at the reveal needs a
> distance, so there is one, and it is deliberately not the signature:

$$
\sigma(u) = \Bigl(\ln\bigl(1 + d(u)\bigr),\ P(u),\ p_1(u),\ \dots,\ p_5(u)\Bigr), \qquad
p_i(u) = i\text{-th largest } P(v),\ v \in N(u)
$$

$$
\mathrm{twin}(u) = \operatorname*{arg\,min}_{v \neq u} \ \sum_{j} w_j\bigl(\sigma_j(u) - \sigma_j(v)\bigr)^2,
\qquad w = (1,\ 1,\ 0.6,\ 0.5,\ 0.4,\ 0.3,\ 0.2)
$$

> Every axis the signature rounds off, this one keeps: exact degree rather than a
> band twelve wide at the top, the character's own presence — which the signature
> omits entirely — and the five largest neighbours' standing rather than two capped
> counts either side of a cliff at 0.85. Weights are judgement, on the same footing
> as the ease weights.
>
> Measured over the shipped catalogue (4,829 characters in 41 worlds, 2,587 playable
> starts): a **unique** nearest for 88% of starts, one other tied for 6%, at worst
> seven ties; 59% of twins come from the start's own world. Ties are reported, not
> broken. Sansa Stark's 165 signature-mates include a 110-tie Liangshan outlaw; her
> nearest by $\sigma$ is Arya Stark, two hundred times closer.
>
> Both measurements ship. $A(u)$ keeps scoring difficulty, where coarseness is
> correct and precision is false precision, and $\mathrm{twin}(u)$ is named at the
> reveal, where a count of a hundred and sixty-three is trivia and a name is not.

### 5.3 Ease

$$
\boxed{\ \mathrm{ease}(u) \;=\; 0.30\,\underbrace{\Bigl(1 - \tfrac{\ln(1 + A(u))}{\ln(301)}\Bigr)}_{\text{unambiguous}} \;+\; 0.45\,\underbrace{P(u)}_{\text{you}} \;+\; 0.25\,\underbrace{\tfrac{1}{d(u)}\textstyle\sum_{v \in N(u)} P(v)}_{\text{your company}}\ }
$$

Three choices in there earned themselves:

**Log, not linear.** The difference between 2 look-alikes and 12 is most of the
puzzle; the difference between 200 and 210 is nothing. Linear scaling let this term
swamp the others in small worlds, where nearly every shape is common catalogue-wide —
it put Polonius and Horatio among the hardest starts in *Hamlet*, and Macduff and
Banquo among the hardest in *Macbeth*, which is plainly wrong about both plays.

**Mean neighbour prominence, not max.** The maximum saturates: in any decent-sized
world almost every node has one well-known neighbour, so the term was 1.0 for most
starts and discriminated nothing.

**One number from two questions.** Ambiguity is about *which story*; the other two
are about *who you are*. Collapsing them into a single scalar is a simplification,
and the one most worth revisiting once puzzles have actually been played.

Sanity check on the ordering, which is all this has been calibrated against so far:

| World | easiest | hardest |
|---|---|---|
| Hamlet | Hamlet, Claudius, Gertrude | Voltemand, Marcellus, Barnardo |
| Macbeth | Macbeth, Malcolm, Ross, Macduff | Menteith, Angus, Siward |
| The Bible | Mordecai, Elijah, Eli | Zethar, Mehuman, Biztha, Carcas |

Those last four are the interchangeable eunuchs of Esther 1 — correctly the hardest
thing in the catalogue.

---

## 6. Serving a start

The difficulty slider names a target $t \in [0,1]$. Nothing about the *rules* changes
with it — costs and disclosures are fixed — so "difficulty is a property of the
start, never a setting" survives: the slider chooses which start, not new rules for
it.

**World first.** Each world ships a histogram of its starts over ten equal ease
buckets. A world is drawn with probability proportional to its mass in the bucket $t$
falls in, searching outward if that bucket is empty, so a world with nothing at the
requested end is not offered only to hand back its nearest miss:

$$
\Pr[k] \ \propto\ \frac{m_k(s_{\min})}{s_{\min} + 1},
\qquad
m_k(s) = \begin{cases} h_k[b] & s = 0 \\ h_k[b-s] + h_k[b+s] & s > 0 \end{cases}
$$

with $b = \lfloor t \cdot 10 \rfloor$ and $s_{\min} = \min\{s : m_k(s) > 0\}$,

**Then the start.** Within that world, nearest-by-score with a window rather than a
filter, so every slider position yields a start — a world whose easiest character is
0.6 answers a request for 0.9 with that character instead of with nothing:

$$
\text{candidates} = \Bigl\{u : \bigl|\mathrm{ease}(u) - t\bigr| \le \delta_{\min} + 0.05\Bigr\},
\qquad \delta_{\min} = \min_u \bigl|\mathrm{ease}(u) - t\bigr|
$$

drawn uniformly, so a slider position is a neighbourhood of the scale rather than one
fixed character.

---

## 7. What the client is not told

Two things are withheld deliberately, and both shape the data format.

**Cast size.** The guess screen's type-ahead draws suggestions from *every* loaded
world, so the list never reveals how many candidates the chosen story has. For the
same reason `index.json` carries no character names, and the emitter refuses to write
it if one leaks. It may carry world *titles*, because half of literature is named
after its protagonist and no secret is kept by refusing to write "Hamlet".

**The signals behind the score.** Puzzle records ship `ease` and nothing else.
`lookAlikes` and `prominence` stay at build time, because "you have no look-alikes
anywhere" narrows the field far more sharply than a slider position does. `ease`
itself costs nothing it was protecting: a player who set the slider already knows
roughly how findable their start is, since that is exactly what they asked for.

A player with devtools can of course read the answer straight out of the universe
file. That trade is made deliberately.
