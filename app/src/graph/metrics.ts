import { ordinal } from './project';
import type { MetaRecord, NodeFacts, NodeIndex, Universe, UniverseMeta } from '../types';

/**
 * Reveal-time readings of the network, computed in the browser from the
 * universe file alone.
 *
 * None of this needs the pipeline and none of it needs the enrichment sidecar,
 * which matters because the sidecar is nearly empty in 26 of the 32 worlds —
 * exactly the worlds where the reveal had least to say. A Shakespeare play can
 * now end on something specific about the shape you were standing in, which is
 * the thing the whole game was about.
 *
 * All of it runs once, when the reveal fires. The heaviest world is 726 nodes
 * and 2,987 ties, so nothing here is worth optimising.
 */
export interface RevealMetrics {
  degree: number;
  /** 1-based rank by number of ties, and the cast it is out of. The
   * denominator is withheld during play and given here, because the game is
   * over. */
  rank: number;
  castSize: number;
  /**
   * 1-based rank by *weighted* degree: tie weights summed, which is roughly how
   * much of the text this character is present for.
   *
   * Not the same question as `rank`, and the pipeline's own note on the measure
   * explains why it matters: plain degree "rewards whoever meets many people
   * once each". Ranked by ties, the best-connected people in the Bible are
   * Azariah and Shemaiah, named beside many others in genealogies. Ranked by
   * page time, David, Saul, Moses and Aaron rise. Across the catalogue the two
   * ranks differ by a median of eight places and at the extreme by nearly
   * three hundred — Haman is 337th by ties and 57th by page time.
   */
  pageRank: number;
  /** Mean standing of the people you were tied to, 0 to 1. Whether you stood
   * among the major figures or among the spear-carriers. */
  company: number;
  /** Your strongest tie, and the one below it — "half again your next" is a
   * more legible reading than any raw count. */
  heaviest: { other: NodeIndex; name: string; weight: number; next: number } | null;
  /** Share of your neighbours' possible pairings that are actually tied. 1 means
   * everyone you know knows each other; 0 means you are the only thing they
   * have in common. */
  clustering: number;
  /** Furthest anyone in your part of the world stands from you, in ties. */
  eccentricity: number | null;
  /** How many characters fall out of contact with the rest if you are removed.
   * Null when the network holds together without you. */
  cutsOff: number | null;
}

function adjacency(universe: Universe): Map<NodeIndex, Map<NodeIndex, number>> {
  const adj = new Map<NodeIndex, Map<NodeIndex, number>>();
  for (const n of universe.nodes) adj.set(n.i, new Map());
  for (const [s, t, w] of universe.edges) {
    adj.get(s)?.set(t, w);
    adj.get(t)?.set(s, w);
  }
  return adj;
}

/** Nodes reachable from `from`, optionally pretending `without` is not there. */
function reach(
  adj: Map<NodeIndex, Map<NodeIndex, number>>,
  from: NodeIndex,
  without?: NodeIndex,
): Map<NodeIndex, number> {
  const depth = new Map<NodeIndex, number>([[from, 0]]);
  let frontier = [from];
  let d = 0;
  while (frontier.length) {
    d += 1;
    const next: NodeIndex[] = [];
    for (const node of frontier) {
      for (const n of adj.get(node)?.keys() ?? []) {
        if (n === without || depth.has(n)) continue;
        depth.set(n, d);
        next.push(n);
      }
    }
    frontier = next;
  }
  return depth;
}

export function revealMetrics(universe: Universe, you: NodeIndex): RevealMetrics {
  const adj = adjacency(universe);
  const mine = adj.get(you) ?? new Map();
  const degree = mine.size;

  let above = 0;
  for (const n of universe.nodes) {
    if (n.i !== you && (adj.get(n.i)?.size ?? 0) > degree) above += 1;
  }

  // Weighted degree, and the standing that falls out of it. Computed here
  // rather than read off the sidecar: the client already holds every tie weight
  // (it draws thickness with them), so shipping the answer as well would be the
  // same number in two places, and the gallery has already grown its own copy.
  const weighted = new Map<NodeIndex, number>();
  for (const n of universe.nodes) weighted.set(n.i, 0);
  for (const [s, t, w] of universe.edges) {
    weighted.set(s, (weighted.get(s) ?? 0) + w);
    weighted.set(t, (weighted.get(t) ?? 0) + w);
  }
  const mineWeighted = weighted.get(you) ?? 0;
  let heavier = 0;
  for (const n of universe.nodes) {
    if (n.i !== you && (weighted.get(n.i) ?? 0) > mineWeighted) heavier += 1;
  }

  // Standing as a 0-to-1 rank, so an average over neighbours means something.
  const ascending = [...universe.nodes].sort(
    (a, b) => (weighted.get(a.i) ?? 0) - (weighted.get(b.i) ?? 0),
  );
  const standing = new Map<NodeIndex, number>();
  const last = Math.max(1, ascending.length - 1);
  ascending.forEach((n, idx) => standing.set(n.i, idx / last));

  const neighbourList = [...mine.keys()];
  const company =
    neighbourList.length > 0
      ? neighbourList.reduce((sum, n) => sum + (standing.get(n) ?? 0), 0) / neighbourList.length
      : 0;

  // Heaviest tie, and the one under it.
  let best: { other: NodeIndex; weight: number } | null = null;
  let second = 0;
  for (const [other, w] of mine) {
    if (!best || w > best.weight) {
      if (best) second = Math.max(second, best.weight);
      best = { other, weight: w };
    } else if (w > second) second = w;
  }
  const nameOf = (i: NodeIndex) => universe.nodes.find((n) => n.i === i)?.n ?? '';

  // Closed triangles among your neighbours, over the pairs that could have been.
  const neighbours = [...mine.keys()];
  let closed = 0;
  for (let a = 0; a < neighbours.length; a += 1) {
    for (let b = a + 1; b < neighbours.length; b += 1) {
      if (adj.get(neighbours[a])?.has(neighbours[b])) closed += 1;
    }
  }
  const pairs = (neighbours.length * (neighbours.length - 1)) / 2;

  const fromYou = reach(adj, you);
  let eccentricity = 0;
  for (const d of fromYou.values()) if (d > eccentricity) eccentricity = d;

  // Are you holding two halves together? Walk the world from one of your
  // neighbours with yourself taken out of it, and see who can no longer be
  // reached. Anyone already in a different component of the whole graph does
  // not count — they were never reachable through you.
  let cutsOff: number | null = null;
  if (neighbours.length > 0) {
    const without = reach(adj, neighbours[0], you);
    let stranded = 0;
    for (const n of fromYou.keys()) {
      if (n !== you && !without.has(n)) stranded += 1;
    }
    if (stranded > 0) cutsOff = stranded;
  }

  return {
    degree,
    rank: above + 1,
    castSize: universe.nodes.length,
    pageRank: heavier + 1,
    company,
    heaviest: best ? { other: best.other, name: nameOf(best.other), weight: best.weight, next: second } : null,
    clustering: pairs > 0 ? closed / pairs : 0,
    eccentricity: eccentricity > 0 ? eccentricity : null,
    cutsOff,
  };
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

const CARDINALS = [
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve',
];

/** Words up to twelve, numerals past it. A sentence about pacing outward reads
 * badly with a digit dropped into the middle of it. */
function cardinal(n: number): string {
  return n <= CARDINALS.length ? CARDINALS[n - 1] : String(n);
}

/**
 * The readings, in words, strongest first.
 *
 * Composed here rather than in the screen so the same function can be run
 * against the whole catalogue offline. Writing sentences that are true is easy;
 * writing sentences a person can read is not, and the only way to tell the
 * difference is to look at a few hundred of them.
 *
 * Every line says what happened in ordinary words. The first drafts were
 * written in the vocabulary of the thing that produced them — "stands in a
 * shape like yours", "no one in your part of this story", "your heaviest tie" —
 * which is the analyst's language, not the reader's, and at the reveal the
 * reader is the only person in the room. The rule here: if a sentence needs the
 * player to know how the number was computed, it is the wrong sentence.
 *
 * Capped, because a reveal is a beat and not a report. Six true sentences in a
 * column is a dashboard, and this is the last thing the player sees.
 */
export function describeReadings(
  m: RevealMetrics,
  signals: MetaRecord['signals'] | null,
  limit = 4,
): string[] {
  const out: string[] = [];

  // What `lookAlikes` actually counts is characters who would have been
  // indistinguishable from you on the cold open — same rough number of ties,
  // same rough mix of large and small people on the other end. So that is what
  // it says. "Stands in a shape like yours" was the pipeline's phrase for it
  // and meant nothing to anyone who had not read the pipeline.
  if (signals) {
    out.push(
      signals.lookAlikes === 0
        ? 'No one else in any of these stories would have looked quite like you.'
        : signals.lookAlikes === 1
          ? 'One other character across these stories would have looked just like you.'
          // "Another 97" rather than "97 others", so the sentence does not open
          // on a numeral.
          : `Another ${signals.lookAlikes} characters across these stories would have looked just like you.`,
    );
  }

  if (m.cutsOff !== null) {
    out.push(
      m.cutsOff === 1
        ? 'Take you out of the story and one character is left with no way through to anyone else.'
        : `Take you out of the story and ${m.cutsOff} characters are left with no way through to anyone else.`,
    );
  }

  out.push(
    m.rank === 1
      ? `You had ${plural(m.degree, 'tie', 'ties')}, more than anyone else in the story.`
      : `You had ${plural(m.degree, 'tie', 'ties')}, which put you ${ordinal(m.rank)} out of ${m.castSize} for people met.`,
  );

  // How many people you met and how much of the book you were in are different
  // questions, and the sentence above only answers the first. Said separately,
  // and only when the two answers disagree enough to be worth the line: a
  // character who met few people but was on the page constantly is a shape
  // worth naming, and one whose two ranks agree has nothing extra to report.
  const spread = Math.abs(m.rank - m.pageRank);
  if (spread >= Math.max(5, Math.round(m.castSize * 0.1))) {
    out.push(
      m.pageRank === 1
        ? 'For all that, no one was on the page more than you.'
        : m.pageRank < m.rank
          ? `For time on the page, though, you came ${ordinal(m.pageRank)}: fewer people, far more of the story.`
          : `For time on the page, though, you came only ${ordinal(m.pageRank)}: many people, each of them briefly.`,
    );
  }

  if (m.heaviest) {
    const ratio = m.heaviest.next > 0 ? m.heaviest.weight / m.heaviest.next : Infinity;
    // Below half again the comparison is noise: most characters have two or
    // three ties of nearly equal weight, and the clause was firing on half the
    // catalogue while saying nothing.
    const how =
      ratio >= 2
        ? ', more than twice as much as with the next person'
        : ratio >= 1.4
          ? ', half as much again as with the next person'
          : '';
    // "Share the story" is the phrase the whole game uses for a tie's weight,
    // and the one place the design forbids saying "close" or "knows well".
    out.push(`You shared more of the story with ${m.heaviest.name} than with anyone else${how}.`);
  }

  // Whose company you kept. Distinct from how many people you knew and from
  // whether they knew each other, and the only one of the three that is about
  // them rather than about you.
  if (m.degree >= 3) {
    if (m.company >= 0.82)
      out.push('The people you stood among were some of the best known in the book.');
    else if (m.company <= 0.4)
      out.push('You kept company with the story\u2019s minor figures.');
  }

  if (m.degree >= 3) {
    if (m.clustering >= 0.85) out.push('Nearly everyone you knew also knew each other.');
    else if (m.clustering <= 0.15)
      out.push('Hardly any of the people you knew knew each other. You were what they had in common.');
  }

  // Says what the number is by describing how you would get it: walk outward
  // from your node, one tie at a time, and see how far you have to go. The
  // earlier phrasings named the measurement ("no one in your part of this
  // story") without ever showing the walk, which is the only part of it a
  // reader can picture.
  //
  // Still held back in small worlds. In a twelve-hand play everyone is two ties
  // from everyone and the sentence is true of every character alike, which
  // makes it filler dressed as a finding.
  if (m.eccentricity !== null && m.castSize >= 40) {
    out.push(
      `Walk outward from you, tie by tie, and no one you can reach sits more than ${cardinal(m.eccentricity)} steps away.`,
    );
  }

  return out.slice(0, limit);
}

/**
 * Facts read against the rest of the cast rather than on their own.
 *
 * The composed `line` the sidecar ships already says what this character is.
 * What it cannot say is how rare that is here, and rarity is the whole subject
 * of the game: "sworn to House Lannister" is a label, "one of 26 here sworn to
 * House Lannister" is a reading.
 *
 * Empty in the 26 worlds with no enrichment, which is why the structural
 * readings have to be able to carry the page alone.
 */
export function describeContext(meta: UniverseMeta | null, facts: NodeFacts): string[] {
  const out: string[] = [];
  const all = Object.values(meta?.nodes ?? {});
  if (all.length === 0) return out;

  // A viewpoint character: one of the people the story is narrated through.
  // Named with the accurate term and then glossed, rather than called a
  // "narrator" or "first person" — these chapters are third-person limited,
  // and the plainer word would be plainly wrong.
  if (Number(facts.pov ?? 0) > 0) {
    const voices = all.filter((n) => Number((n.facts as NodeFacts)?.pov ?? 0) > 0).length;
    out.push(
      voices === 1
        ? 'You are this story\u2019s only viewpoint character: the whole of it is told through your eyes.'
        : `You are one of only ${voices} viewpoint characters in this story, one of the few it is told through.`,
    );
  }

  const house = facts.houses?.[0];
  if (house) {
    const sworn = all.filter((n) => ((n.facts as NodeFacts)?.houses ?? []).includes(house)).length;
    if (sworn > 1) out.push(`You are one of ${sworn} people here sworn to ${house}.`);
  }

  const culture = facts.culture;
  if (culture) {
    // Matched case-insensitively: the source spells the same group both "Free
    // Folk" and "Free folk", which split one people into two smaller ones and
    // undercounted both.
    const key = culture.toLowerCase();
    const kin = all.filter((n) => ((n.facts as NodeFacts)?.culture ?? '').toLowerCase() === key).length;
    // Said as a background rather than as a plural noun. The field holds
    // demonyms ("Ironborn", "Dothraki") and bare place names ("Westeros", "the
    // Reach") indiscriminately, and the obvious phrasing produced "one of 8
    // Westeros in this story". This shape is grammatical whichever it is.
    if (kin === 2) out.push(`One other person in this story shares your background: ${culture}.`);
    else if (kin > 2) out.push(`Another ${kin - 1} people in this story share your background: ${culture}.`);
  }
  return out;
}
