/**
 * Every constant the experiment runs on, in one file, with the reason for each
 * number written next to it.
 *
 * They are gathered here rather than left where they are used because they are
 * the things most likely to be wrong. Several of them already were: the first
 * pass put the strength floor one decay step above death and fragmented the
 * population in a week, and let the triadic term grow without bound so nothing
 * could ever be cut. Both were a single number, buried in a function, with no
 * note saying what it was for.
 *
 * Nothing here is a *parameter*. Parameters are the sliders in the panel, and
 * they are meant to be turned while watching. These are the frame the sliders
 * hang in. Changing one changes what every run means, so each needs an argument
 * rather than a preference.
 */

// ── Tie strength ────────────────────────────────────────────────────────────

/**
 * Strength floor and ceiling. Strength is the one quantity that is comparable
 * across all fifty-two worlds, so it is a plain number on a fixed scale rather
 * than anything's own units.
 *
 * The floor is where the *weakest shipped tie in a world* lands. It is well
 * clear of zero on purpose. At a floor of 10 against a decay of 3 — the first
 * pass — every below-median tie in every world died inside four rounds, the
 * characters holding only weak ties went to isolates, and the population went
 * from 6 components to 332 while the cores quietly densified. That is not
 * dissolution, it is a cull. A tie that begins one decay step from death was
 * never in the experiment.
 */
export const S_MIN = 25;
export const S_MAX = 100;

/**
 * What one successful STRENGTHEN adds.
 *
 * Fixed rather than offered as a slider: the two rates that decide whether a
 * run grows, holds or collapses are formation pressure and decay, and a third
 * knob here would only restate the decay slider in different units. At 10
 * against the default decay of 1.5, one strengthening buys about a week.
 */
export const STRENGTHEN_STEP = 10;

/**
 * The initialisation clamp, in doublings either side of a world's median tie
 * weight.
 *
 * Shipped weights are in incomparable units — Congress runs 50 → 81 → 1135,
 * Hamlet 1 → 1 → 9 — so strength is initialised log against each world's own
 * median. Past 2^k above or below it, everything piles at the ceiling or the
 * floor. Four doublings covers the real spread: Harry Potter's 95th percentile
 * is ten times its median, Congress's three times.
 */
export const CLAMP_K = 4;

// ── The run ─────────────────────────────────────────────────────────────────

/**
 * Rounds per second while running.
 *
 * Fixed rather than offered: it changes how fast you watch, never what happens,
 * and a control that cannot alter the result does not belong beside controls
 * that can.
 */
export const YEARS_PER_SECOND = 10;

/**
 * The most rounds one animation frame may advance.
 *
 * A backgrounded tab accumulates real time and must not come back and run four
 * hundred rounds in a single frame.
 */
export const MAX_STEPS_PER_FRAME = 4;

/**
 * How often the layout is told what the graph now looks like.
 *
 * It used to be every round: fifty-eight thousand ties flattened into a
 * Float32Array, structured-cloned across the thread boundary and rebuilt into
 * fifty-eight thousand link objects, ten times a second. That is six hundred
 * thousand allocations a second to tell a force layout something it cannot
 * respond to in under a second anyway.
 *
 * Once a second instead. The canvas reads the graph directly and draws every
 * tie the instant it forms, so what lags by up to ten rounds is only where the
 * layout *puts* them — a tie taking a second to pull its two ends together,
 * which is shorter than the pull itself.
 */
export const LAYOUT_SYNC_ROUNDS = 10;

/** How much of one character's history is read back out of the ledger. Older
 * than this and nobody is scrolling to it. */
export const LOG_LIMIT = 300;

/**
 * How many topology-changing events the experiment remembers, for everyone.
 *
 * FORM and CUT only. STRENGTHEN is excluded for the same reason it is excluded
 * from the reading — a character with sixty ties strengthens about ten of them
 * a round, so keeping them would be keeping almost nothing but them.
 *
 * It is a ring buffer rather than a list because a long run at a high formation
 * pressure is unbounded otherwise, and because the oldest events are the ones
 * nobody comes back for. Four typed arrays at this size cost about eight
 * megabytes, which buys the thing the per-character log could never do: pick
 * someone in year ninety and read what has already happened to them, instead of
 * starting their history at the moment you happened to look.
 *
 * Sized against what a run actually writes. At the default settings the fifty-
 * two worlds produce around two and a half thousand formings and cuttings a
 * year, so two million entries is about eight hundred years: the whole of a
 * four-hundred-year run with room to spare, and most of the longest the length
 * control offers. Four typed arrays at this size cost twenty-six megabytes,
 * which is the price of being able to go back at all. Unlike the pictures these
 * cannot be sampled — an event skipped is a tie that never forms or never ends,
 * and the replay would be of a graph that never existed.
 */
export const LEDGER_LIMIT = 2_000_000;

/**
 * How many years of node positions are kept, so a run can be scrubbed back.
 *
 * The ties at any past year cost nothing to recover — the ledger already holds
 * every FORM and CUT, so replaying them from the initial condition rebuilds the
 * graph exactly. Where everyone *was* is the part nothing else records: a force
 * layout is iterative, so the same graph does not give back the same picture.
 *
 * One snapshot is two Float32Arrays over 8,727 characters, about seventy
 * kilobytes; this many is seventeen megabytes, a fifth of what the fifty-two
 * parsed worlds already cost. They are allocated as the run reaches them rather
 * than up front, so a run nobody scrubs pays for only the years it ran.
 *
 * This is a cap on how many pictures are held, not on how far back they reach.
 * A run longer than the cap is sampled — every second year at five hundred,
 * every fifth at a thousand — so the whole of it stays reachable and only the
 * precision gives way. The scrubber lands on the nearest year held, which in a
 * settled layout is a difference of a pixel or two.
 */
export const SNAPSHOT_LIMIT = 240;

/**
 * The strength every replayed tie is drawn at.
 *
 * Strengths are not replayable. Strengthening and decay touch tens of thousands
 * of ties a round — seventeen million events over a default run — so recording
 * them is out of the question, and inferring them would be drawing a number
 * nobody measured. One weight for all of them says plainly that the replay is
 * about who was connected to whom, not how much.
 */
export const REPLAY_S = 50;

// ── Layout ──────────────────────────────────────────────────────────────────

/**
 * How hard a character is held to the world they started in.
 *
 * A layout term, not a claim about loyalty. Fifty-two disconnected components
 * under mutual repulsion either fly apart or stack in the middle, and neither
 * is a picture of anything. Weak enough that accumulating cross-world ties drag
 * an island off its mooring, which is the thing the run exists to show.
 */
export const HOME_PULL = 0.04;

/** Node-to-node repulsion, and the distance past which it is not computed.
 * The cap is what keeps the Barnes–Hut pass affordable at 8,727 nodes. */
export const CHARGE_STRENGTH = -14;
export const CHARGE_DISTANCE_MAX = 600;

/** A tie's rest length, from weakest to strongest. Strong ties pull closer. */
export const LINK_DISTANCE_WEAK = 55;
export const LINK_DISTANCE_STRONG = 20;

/**
 * Layout cooling.
 *
 * `ALPHA_START` is deliberately low: the shipped per-world layouts are already
 * good, and opening at d3's default of 1 throws them away before anyone has
 * seen the initial condition. `ALPHA_KICK` is what a round of rewiring is worth
 * — enough to respond, not enough to reshuffle.
 */
export const ALPHA_START = 0.3;
export const ALPHA_KICK = 0.12;
export const ALPHA_DECAY = 0.015;
export const ALPHA_MIN = 0.0005;

/**
 * Clearance between two worlds at t = 0, in normalised world radii.
 *
 * This replaced a fixed grid pitch. A constant pitch gave a twenty-character
 * film and a thousand-character novel the same square, so the drawing's area
 * was a picture of the catalogue's length rather than its population. A
 * constant *gap* instead means the packing is as tight as the sizes allow and
 * every world's share of the field is its own size. See `packCircles`.
 */
export const WORLD_GAP = 0.34;

/** Normalised world radii to layout pixels. */
export const WORLD_SCALE = 180;

/** The smallest a world's starting disc may be, as a fraction of the largest.
 * Radius otherwise goes as √n, so a thirty-character play and a six-hundred
 * character saga start at comparable density instead of comparable area. */
export const MIN_WORLD_RADIUS = 0.3;

// ── Drawing ─────────────────────────────────────────────────────────────────

/**
 * Four strength bands for within-world ties, darkening as they thicken — the
 * same rule as everywhere else in this app, where tie thickness is the medium
 * the puzzle is written in.
 */
export const BANDS: readonly { width: number; stroke: string }[] = [
  { width: 0.5, stroke: '#cfc8ba' },
  { width: 0.8, stroke: '#b1aa9e' },
  { width: 1.2, stroke: '#938c81' },
  { width: 1.7, stroke: '#7c756a' },
];

/**
 * Cross-world ties: ink, and nothing else in the drawing is ink.
 *
 * They were accent red once. Two of the worlds are already reds — Harry Potter
 * #7F1D1D, 紅樓夢 #A12B3C — and the accent sits between them, so the one mark
 * meaning *this tie is new* was the same colour as two of the populations. Ink
 * is in none of the fifty-two palettes and reads hardest against the paper.
 */
export const CROSS_STROKE = '#16130f';
export const CROSS_WIDTH = 0.9;
export const CROSS_ALPHA = 0.5;

/** Node radius: a constant, plus a term in √degree so a hub reads as a hub
 * without a six-hundred-tie character becoming a blot. */
export const NODE_BASE_R = 1.1;
export const NODE_DEGREE_R = 0.5;

/** The paper the whole app is printed on. Needed as a value here because a
 * canvas cannot read a CSS variable. */
export const PAPER = '#f4f0e6';

/**
 * How far each world's accent is washed back toward the paper before it is used
 * to fill a node.
 *
 * The shipped accents are chosen to identify a world on a card, at full
 * strength, one at a time. Eight thousand of them at once is a different job:
 * fifty-two saturated colours in one field shout over each other, and — worse —
 * they shout over the accent red, which here means the single character being
 * followed. The one mark that has to be findable was the hardest thing on the
 * screen to find. Washed back, a world is still identifiable as a region of
 * colour while red stays the loudest thing in the drawing.
 */
export const NODE_WASH = 0.58;

/** Blend two hex colours. `t` is how much of `b`. */
export function mixHex(a: string, b: string, t: number): string {
  const parse = (hex: string) => {
    const h = hex.replace('#', '');
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ];
  };
  const [r1, g1, b1] = parse(a);
  const [r2, g2, b2] = parse(b);
  const to = (x: number) => Math.round(x).toString(16).padStart(2, '0');
  return `#${to(r1 + (r2 - r1) * t)}${to(g1 + (g2 - g1) * t)}${to(b1 + (b2 - b1) * t)}`;
}

/**
 * How node size answers zoom.
 *
 * Ties use a non-scaling stroke, because thickness is meaning and a zoom that
 * multiplies it turns hairlines into ropes. Nodes cannot do the same: held at
 * exactly true size they shrink to sub-pixel specks as soon as the view spreads
 * out, which is the opposite of what zooming in is for. √k is the compromise —
 * they neither vanish nor swallow the drawing.
 */
export const nodeZoomScale = (k: number) => 1 / Math.sqrt(k);

/** The ring drawn around the followed character. */
export const FOLLOW_RING_R = 7;

export const ZOOM_EXTENT: [number, number] = [0.15, 40];

/**
 * World labels, in screen points, and the gap between a name and the top of
 * the world it names.
 *
 * Names are not drawn permanently. All fifty-two at once overprinted into a
 * grey smear that named nothing, and they did it at the centroids — which at
 * full scale is precisely where the cross-world ties converge and where a word
 * is least readable. A world is named only when something asks for it by name:
 * a hovered legend row, the followed character's world, the world under the
 * pointer. Never more than three at once, so they can be set in ink, above the
 * world rather than through it.
 */
export const LABEL_PT = 11;
export const LABEL_GAP_PT = 14;

/**
 * How far everything washes back while one world is lit.
 *
 * Low enough that the lit world is unmistakable, high enough that the rest of
 * the drawing is still a drawing — the point of the gesture is to find one
 * world *within* the cloud, so hiding the cloud would answer a question nobody
 * asked.
 */
export const DIM_ALPHA = 0.16;

/** Fraction of the drawing's own size added as margin when the view auto-fits,
 * and how fast the fit eases, so a tie forming on the far edge does not jolt
 * the whole frame. */
export const FIT_PAD = 0.06;
export const FIT_EASE = 0.08;
