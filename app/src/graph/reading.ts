import { cardinal, ordinal } from './project';
import type { NodeIndex, Universe } from '../types';
// The gallery's `measureWorld` is the canonical set of intrinsic measurements
// for a world — communities included — and a character reading wants exactly
// those, measured the same way. Imported rather than reimplemented so a camp
// means the same thing on the reveal as it does on a gallery card.
import { DEGREE_BANDS, type WorldMetrics } from '../gallery/metrics';

/**
 * One character, read against the world they stand in.
 *
 * Everything here answers a question a person actually asks when the game ends
 * — "was I anyone to them?", "could I have known?", "was I unlucky?" — rather
 * than reporting a figure because the figure was available. That ordering
 * matters: the first draft of this file was a list of cheap computations
 * (a scatter of tie weight against partner standing, two histograms of the same
 * quantity) and every one of them was true, legible and of no interest.
 *
 * All of it is computed in the browser from the universe already in memory. The
 * heaviest world is 726 characters and 2,987 ties and the work here is linear
 * in the ties, so nothing is worth caching beyond the one `useMemo` at the call
 * site.
 */

/** One end of a tie, read from the subject's side. */
export interface TiePartner {
  i: NodeIndex;
  name: string;
  weight: number;
  /** Where this tie sits among the subject's own. 1 is their strongest. */
  yourPlace: number;
  /** Where the subject sits among *this partner's* ties. 1 is their strongest. */
  theirPlace: number;
  theirDegree: number;
  /** The partner's standing in the story, 0 to 1. */
  prominence: number;
  sameCamp: boolean;
}

export interface Standing {
  inCamp: number;
  outCamp: number;
  /** How many distinct camps the subject's ties touch. */
  camps: number;
  /** The shape of the position, in two words. */
  label: string;
  line: string;
}

/** One tie, as a ring drawing needs it: how heavy, and how large the person on
 * the other end. Nothing else is visible in an opening diagram. */
export interface RingMark {
  strength: number;
  standing: number;
}

export interface LookAlike {
  i: NodeIndex;
  name: string;
  ring: RingMark[];
}

export interface Shortlist {
  /** Everyone else in this story who opened with the same number of ties. */
  count: number;
  /** Of those, the ones whose ring was made of people of the same standing:
   * the ones the opening diagram genuinely could not tell apart. Carried with
   * their rings, because the point is made by drawing them beside yours, not
   * by counting them. */
  nearest: LookAlike[];
}

export interface CharacterReading {
  i: NodeIndex;
  name: string;
  degree: number;
  /** Strongest first. */
  ties: TiePartner[];
  /**
   * The one tie worth a sentence, and whether it was returned.
   *
   * Reciprocity is the only reading here that needed no new computation at all:
   * every edge in every shipped world already carries its rank from *each* end
   * (`UniverseEdge[3]` and `[4]`), normalised 0 to 1 with 1 the strongest.
   * `project.ts` stopped drawing thickness from rank and nothing has read those
   * two numbers since. They answer the question the thickness never could —
   * not how close you were to them, but whether you were that to them.
   */
  asymmetry: { partner: TiePartner; mutual: boolean } | null;
  shortlist: Shortlist;
  standing: Standing;
  /** The subject's own tie weights, strongest first. */
  weights: number[];
  /** The subject's own opening ring, drawn the same way as the look-alikes'. */
  ring: RingMark[];
  /** The standing of each person the subject is tied to. */
  company: number[];
  /** The subject's neighbours binned by how many ties *they* have. */
  neighbourDegrees: number[];
  /** This character's own start, against every scored start in the world. */
  ease: { mine: number | null; all: number[] };
}

/** Rank arrives normalised: 1 is the strongest tie at that end, 0 the weakest,
 * evenly spaced and rounded to three places. Turned back into a place. */
function placeOf(rank: number, degree: number): number {
  return Math.round((1 - rank) * Math.max(0, degree - 1)) + 1;
}

interface Incident {
  other: NodeIndex;
  weight: number;
  myRank: number;
  theirRank: number;
}

function incidentTies(universe: Universe, i: NodeIndex): Incident[] {
  const out: Incident[] = [];
  for (const [s, t, weight, fromSource, fromTarget] of universe.edges) {
    if (s === t) continue;
    if (s === i) out.push({ other: t, weight, myRank: fromSource, theirRank: fromTarget });
    else if (t === i) out.push({ other: s, weight, myRank: fromTarget, theirRank: fromSource });
  }
  return out;
}

/** Who is tied to whom, built once and handed to whatever needs it. */
export function adjacencyOf(universe: Universe): Map<NodeIndex, NodeIndex[]> {
  const adj = new Map<NodeIndex, NodeIndex[]>();
  for (const n of universe.nodes) adj.set(n.i, []);
  const seen = new Set<string>();
  for (const [s, t] of universe.edges) {
    if (s === t) continue;
    const key = s < t ? `${s}-${t}` : `${t}-${s}`;
    if (seen.has(key)) continue;
    seen.add(key);
    adj.get(s)?.push(t);
    adj.get(t)?.push(s);
  }
  return adj;
}

/** Every tie, with its weight, for the whole world at once. */
function weightedAdjacency(universe: Universe): Map<NodeIndex, { other: NodeIndex; weight: number }[]> {
  const adj = new Map<NodeIndex, { other: NodeIndex; weight: number }[]>();
  for (const n of universe.nodes) adj.set(n.i, []);
  for (const [s, t, weight] of universe.edges) {
    if (s === t) continue;
    adj.get(s)?.push({ other: t, weight });
    adj.get(t)?.push({ other: s, weight });
  }
  return adj;
}

/** Everyone this character is tied to, strongest tie first. */
export function tiesOf(universe: Universe, world: WorldMetrics, i: NodeIndex): TiePartner[] {
  const byIndex = new Map(world.characters.map((c) => [c.i, c]));
  const nameOf = new Map(universe.nodes.map((n) => [n.i, n.n]));
  const me = byIndex.get(i);
  const myCamp = me?.community ?? -1;

  return incidentTies(universe, i)
    .map((tie) => {
      const them = byIndex.get(tie.other);
      const theirDegree = them?.degree ?? 0;
      return {
        i: tie.other,
        name: nameOf.get(tie.other) ?? '',
        weight: tie.weight,
        yourPlace: placeOf(tie.myRank, me?.degree ?? 0),
        theirPlace: placeOf(tie.theirRank, theirDegree),
        theirDegree,
        prominence: them?.prominence ?? 0,
        sameCamp: (them?.community ?? -2) === myCamp,
      };
    })
    .sort((a, b) => b.weight - a.weight || a.yourPlace - b.yourPlace);
}

export function readCharacter(
  universe: Universe,
  world: WorldMetrics,
  i: NodeIndex,
): CharacterReading {
  const byIndex = new Map(world.characters.map((c) => [c.i, c]));
  const nameOf = new Map(universe.nodes.map((n) => [n.i, n.n]));
  const me = byIndex.get(i);
  const ties = tiesOf(universe, world, i);

  // The strongest tie, which the reveal's prose already names, carrying the one
  // thing the prose cannot say: what the subject was at the other end of it.
  const strongest = ties[0] ?? null;
  const asymmetry = strongest
    ? { partner: strongest, mutual: strongest.theirPlace === 1 }
    : null;

  // What kind of position this was, said as a position rather than as a number.
  // Two figures decide it — how many ties stayed inside your own camp, and how
  // many camps they touched at all — and neither is worth printing on its own.
  // "Four camps" is a quantity; "you were one of the few ways between them" is
  // the thing the quantity was for.
  const inCamp = ties.filter((t) => t.sameCamp).length;
  const camps = new Set(ties.map((t) => byIndex.get(t.i)?.community ?? -1)).size;
  const outCamp = ties.length - inCamp;
  const outShare = ties.length > 0 ? outCamp / ties.length : 0;
  const standing: Standing = {
    inCamp,
    outCamp,
    camps,
    label:
      ties.length === 0
        ? 'Apart'
        : camps <= 1
          ? 'Inside one camp'
          : outShare >= 0.5 && camps >= 3
            ? 'A crossing point'
            : camps >= 3
              ? 'A way between camps'
              : 'Mostly inside one camp',
    line:
      ties.length === 0
        ? 'You were tied to nobody at all.'
        : camps <= 1
          ? 'Everyone you knew belonged to the same camp as you. Nothing reached you from outside it.'
          : outShare >= 0.5 && camps >= 3
            ? `More of your ties ran outside your own camp than inside it, and they reached ${cardinal(camps)} camps in all. You were a way between them.`
            : camps >= 3
              ? `Your ties touched ${cardinal(camps)} camps, though most of them stayed in your own.`
              : `Your ties ran to ${cardinal(camps)} camps, mostly your own.`,
  };

  // Who else opened the same way. Degree is the one thing the opening diagram
  // states outright — every one of your ties is drawn from the first frame —
  // so an exact match on it is exactly the set the first frame could not
  // separate. Within that set, the ring is made of circles of different sizes,
  // and size is standing: comparing the two sorted profiles is comparing the
  // two diagrams as drawn.
  const myDegree = me?.degree ?? 0;
  // The opening diagram states two things about each tie and nothing else: how
  // thick it is, and how large the circle on the far end is. A ring is those
  // two numbers, which is why two characters with the same ring are genuinely
  // indistinguishable on the first frame.
  const weighted = weightedAdjacency(universe);
  let heaviest = 0;
  for (const [, , w] of universe.edges) if (w > heaviest) heaviest = w;
  const ceiling = Math.log1p(heaviest) || 1;
  const ringOf = (id: NodeIndex): RingMark[] =>
    (weighted.get(id) ?? [])
      .map((tie) => ({
        strength: Math.log1p(tie.weight) / ceiling,
        standing: byIndex.get(tie.other)?.prominence ?? 0,
      }))
      .sort((a, b) => b.strength - a.strength);

  const adjacency = adjacencyOf(universe);
  const profileOf = (id: NodeIndex): number[] =>
    (adjacency.get(id) ?? [])
      .map((n) => byIndex.get(n)?.prominence ?? 0)
      .sort((a, b) => b - a);
  const myProfile = profileOf(i);
  const sameShape = world.characters.filter((c) => c.i !== i && c.degree === myDegree);
  const shortlist: Shortlist = {
    count: sameShape.length,
    nearest: sameShape
      .map((c) => {
        const theirs = profileOf(c.i);
        let distance = 0;
        for (let k = 0; k < myProfile.length; k++) distance += Math.abs(myProfile[k] - theirs[k]);
        return { i: c.i, name: c.name, distance: myProfile.length ? distance / myProfile.length : 0 };
      })
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3)
      .map(({ i: id, name }) => ({ i: id, name, ring: ringOf(id) })),
  };

  const neighbourDegrees = new Array(DEGREE_BANDS.length).fill(0);
  for (const tie of ties) {
    const band = DEGREE_BANDS.findIndex(([low, high]) => tie.theirDegree >= low && tie.theirDegree <= high);
    if (band >= 0) neighbourDegrees[band] += 1;
  }

  const scored = universe.puzzles.filter((p) => typeof p.ease === 'number');
  return {
    i,
    name: nameOf.get(i) ?? '',
    degree: myDegree,
    ties,
    asymmetry,
    shortlist,
    standing,
    weights: ties.map((t) => t.weight),
    ring: ringOf(i),
    company: ties.map((t) => t.prominence),
    neighbourDegrees,
    ease: {
      mine: scored.find((p) => p.you === i)?.ease ?? null,
      all: scored.map((p) => p.ease as number),
    },
  };
}

/**
 * The asymmetry, in words. Kept beside the computation because the whole point
 * of the reading is the sentence, not the pair of integers.
 *
 * Deliberately does not restate *how much* of the story the two shared. The
 * readings above have usually just said that in their own words, and the first
 * draft of this line repeated the claim verbatim two inches below it. The only
 * thing this sentence is here to add is the other end of the tie.
 */
export function describeAsymmetry(reading: CharacterReading): string | null {
  const a = reading.asymmetry;
  if (!a) return null;
  const { partner, mutual } = a;
  if (mutual) return `You and ${partner.name} were each other\u2019s strongest tie.`;
  if (partner.theirDegree <= 1) return null;
  return `${partner.name} was your strongest tie. To ${partner.name}, you were ${ordinal(partner.theirPlace)} of ${cardinal(partner.theirDegree)}.`;
}

/**
 * The half of the reading that is about the player rather than the character.
 *
 * Separated because the gallery shows the same character with no game behind
 * them: there is no round to report, and the reading has to stand without one.
 */
export interface RoundReading {
  /**
   * How many people the diagram could have been at the opening, and how many
   * were still standing once everything you turned over was taken into account.
   *
   * This replaced a chart of the fall between the two. The chart was honest and
   * unreadable: its x axis was "ties you turned over", which is nought to three
   * in a real round, and the count it plotted usually did not move at all, so a
   * falling-curve form was carrying data that does not fall. Two numbers and a
   * drawing of the rivals say the same thing without inventing an axis.
   */
  candidates: { opened: number; standing: number };
  /**
   * The tie you never turned over that would have ruled out the most people.
   *
   * The other half of "could you have known": not what your play narrowed, but
   * what one more move would have. It is computable for every tie still face
   * down, and it is the only part of this reading a player could have acted on.
   */
  discriminator: { i: NodeIndex; name: string; rulesOut: number; leavesOnlyYou: boolean } | null;
  /** The person standing one unturned step away who would have said the most. */
  missed: { throughId: NodeIndex; through: string; whoId: NodeIndex; who: string } | null;
  /** Ties among your strongest that you never once turned over. */
  neverTurned: { i: NodeIndex; name: string; place: number }[];
}

/** Is every count in `need` also in `have`? Both sorted ascending. */
function contains(have: number[], need: number[]): boolean {
  let h = 0;
  for (const want of need) {
    while (h < have.length && have[h] < want) h += 1;
    if (h >= have.length || have[h] !== want) return false;
    h += 1;
  }
  return true;
}

export function readRound(
  universe: Universe,
  world: WorldMetrics,
  you: NodeIndex,
  known: {
    visible: Set<NodeIndex>;
    expanded: Set<NodeIndex>;
    named: Map<NodeIndex, string>;
    facts: Set<NodeIndex>;
    hop: Map<NodeIndex, number>;
  },
): RoundReading {
  const adjacency = adjacencyOf(universe);
  const byIndex = new Map(world.characters.map((c) => [c.i, c]));
  const nameOf = new Map(universe.nodes.map((n) => [n.i, n.n]));
  const degreeOf = (id: NodeIndex) => byIndex.get(id)?.degree ?? 0;

  // Candidates are everyone who opened with the same number of ties, the
  // subject included — the curve is "how many people this could still have
  // been", and the answer is never fewer than one.
  const ties = tiesOf(universe, world, you);
  const myDegree = byIndex.get(you)?.degree ?? 0;
  const candidates = world.characters.filter((c) => c.degree === myDegree);
  const ringOf = new Map(
    candidates.map((c) => [
      c.i,
      (adjacency.get(c.i) ?? []).map(degreeOf).sort((a, b) => a - b),
    ]),
  );

  // Only your own ties constrain your own ring, and only in the order you
  // turned them over — which the session already records, because `expanded` is
  // a Set and a Set keeps what was put into it in the order it was put there.
  const turnedOver = [...known.expanded].filter((id) => id !== you && known.hop.get(id) === 1);
  const evidence: number[] = [];
  for (const id of turnedOver) evidence.push(degreeOf(id));
  evidence.sort((a, b) => a - b);
  const standing = candidates.filter((c) => contains(ringOf.get(c.i) ?? [], evidence));

  // What one more would have been worth. Every tie still face down is tried in
  // turn, and the one that would have thrown out the most people is the answer.
  let discriminator: RoundReading['discriminator'] = null;
  for (const tie of ties) {
    if (known.expanded.has(tie.i)) continue;
    const next = [...evidence, degreeOf(tie.i)].sort((a, b) => a - b);
    const left = standing.filter((c) => contains(ringOf.get(c.i) ?? [], next)).length;
    const rulesOut = standing.length - left;
    if (rulesOut > (discriminator?.rulesOut ?? 0)) {
      discriminator = { i: tie.i, name: tie.name, rulesOut, leavesOnlyYou: left <= 1 };
    }
  }

  // What one more expansion would have been worth: of everyone you could still
  // have turned over, whose ring held the largest figure you had never seen?
  let missed: RoundReading['missed'] = null;
  let best = -1;
  for (const v of known.visible) {
    if (known.expanded.has(v)) continue;
    for (const n of adjacency.get(v) ?? []) {
      if (known.visible.has(n)) continue;
      const standing = byIndex.get(n)?.prominence ?? 0;
      if (standing > best) {
        best = standing;
        missed = {
          throughId: v,
          through: nameOf.get(v) ?? 'someone',
          whoId: n,
          who: nameOf.get(n) ?? 'someone',
        };
      }
    }
  }

  // The people you shared most of the story with, and never looked at. Held to
  // the top few ties, because the fourth-strongest tie going unturned is not a
  // thing anyone would regret.
  const neverTurned = ties
    .filter(
      (t) =>
        t.yourPlace <= 3 &&
        !known.expanded.has(t.i) &&
        !known.named.has(t.i) &&
        !known.facts.has(t.i),
    )
    .map((t) => ({ i: t.i, name: t.name, place: t.yourPlace }));

  return {
    candidates: { opened: candidates.length, standing: standing.length },
    discriminator,
    missed,
    neverTurned,
  };
}
