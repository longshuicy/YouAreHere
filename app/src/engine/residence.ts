import type { NodeIndex, PuzzleRecord, Universe, UniverseId } from '../types';
import { clueTotal, type Known, type Ledger, type Session } from './session';
import { monogramOf } from './names';

/**
 * A run of starts inside one world. Lives across wakings; the session is one
 * start. See docs/Residence.md.
 *
 * One map per world. Leaving a world pauses its map, and coming back resumes
 * it. Persistence holds what you have learned, not where you are standing.
 */
export interface Residence {
  universe: UniverseId;
  /** Nodes you have woken as, oldest first. */
  selves: NodeIndex[];
  /** Each start's floored clueTotal, in order. The residence score is their sum. */
  starts: number[];
  /** Clues spent in starts the player left before finding themselves. */
  spent: number;
  named: Map<NodeIndex, string>;
  recognised: Set<NodeIndex>;
  facts: Set<NodeIndex>;
  visible: Set<NodeIndex>;
  expanded: Set<NodeIndex>;
  /** Monograms left by expansions that have not yet been named. */
  initials: Map<NodeIndex, { initial: string; length: number }>;
  /** Wrong claims, so a struck name stays struck across starts. */
  rejected: Map<NodeIndex, string[]>;
}

const STORAGE_KEY = 'you-are-here-residences';
const LEGACY_KEY = 'you-are-here-residence';
const ACTIVE_KEY = 'you-are-here-active-world';

export function residenceTotal(residence: Residence): number {
  return residence.starts.reduce((sum, n) => sum + n, 0) + residence.spent;
}

export function unnamedCount(universe: Universe, named: Map<NodeIndex, string>): number {
  return universe.nodes.length - named.size;
}

export function isComplete(universe: Universe, residence: Residence): boolean {
  return unnamedCount(universe, residence.named) === 0;
}

/** A world's map before anything is on it. */
export function emptyResidence(universe: Universe): Residence {
  return {
    universe: universe.id,
    selves: [],
    starts: [],
    spent: 0,
    named: new Map(),
    recognised: new Set(),
    facts: new Set(),
    visible: new Set(),
    expanded: new Set(),
    initials: new Map(),
    rejected: new Map(),
  };
}

/** A new map, at the moment the player chooses to stay after a first reveal. */
export function beginResidence(
  universe: Universe,
  session: Session,
  yourName = '',
): Residence {
  return absorbStart(emptyResidence(universe), session, yourName);
}

/**
 * Fold a start the player left before finding themselves.
 *
 * What they bought stays on the map, and what it cost stays on the ledger —
 * otherwise leaving mid-round would be a way to buy names for nothing. They
 * are not added to their former selves: they never found out who they were.
 */
export function absorbUnfinished(residence: Residence, session: Session): Residence {
  return {
    ...mergeKnowledge(residence, session, ''),
    spent: residence.spent + clueTotal(session.ledger),
  };
}

/** Fold this start's learning into the residence after a reveal. Finding
 * yourself names that node — and only that node. Neighbours the reveal happens
 * to mention stay unnamed until the player buys or claims them. */
export function absorbStart(
  residence: Residence,
  session: Session,
  yourName = '',
): Residence {
  const merged = mergeKnowledge(residence, session, yourName);
  // A start is recorded once, when its reveal is absorbed. Re-absorbing the
  // same self must not double the ledger.
  if (residence.selves.includes(session.you)) return merged;
  return {
    ...merged,
    selves: [...residence.selves, session.you],
    starts: [...residence.starts, clueTotal(session.ledger)],
  };
}

function mergeKnowledge(residence: Residence, session: Session, yourName: string): Residence {
  const named = new Map(residence.named);
  for (const [i, name] of session.known.named) named.set(i, name);
  if (yourName) named.set(session.you, yourName);
  const recognised = new Set(residence.recognised);
  for (const i of session.known.recognised) recognised.add(i);
  const facts = new Set(residence.facts);
  for (const i of session.known.facts) facts.add(i);
  const visible = new Set(residence.visible);
  for (const i of session.known.visible) visible.add(i);
  const expanded = new Set(residence.expanded);
  for (const i of session.known.expanded) expanded.add(i);
  const initials = new Map(residence.initials);
  for (const [i, m] of session.known.initials) {
    if (!named.has(i)) initials.set(i, m);
  }
  for (const i of named.keys()) initials.delete(i);
  const rejected = new Map(residence.rejected);
  for (const [i, names] of session.known.rejected) {
    const prior = rejected.get(i) ?? [];
    const merged = [...prior];
    for (const n of names) {
      if (!merged.some((p) => p.toLowerCase() === n.toLowerCase())) merged.push(n);
    }
    rejected.set(i, merged);
  }

  return {
    ...residence,
    named,
    recognised,
    facts,
    visible,
    expanded,
    initials,
    rejected,
  };
}

function neighborsOf(universe: Universe, node: NodeIndex): NodeIndex[] {
  const out: NodeIndex[] = [];
  for (const [s, t] of universe.edges) {
    if (s === node) out.push(t);
    else if (t === node) out.push(s);
  }
  return out;
}

function puzzleFor(universe: Universe, you: NodeIndex): PuzzleRecord {
  const existing = universe.puzzles.find((p) => p.you === you);
  if (existing) return existing;
  return {
    id: `${universe.id}:residence:${you}`,
    you,
    startRadius: 1,
    ease: 0,
  };
}

/**
 * How far every node sits from territory the player already recognises, in
 * one walk outward from all of it at once.
 *
 * Named faces first; if none are named yet (should not happen mid-residence),
 * fall back to anything already visible on the paper. Nodes in a component the
 * known territory never reaches are absent from the result.
 */
function hopsFromKnown(
  universe: Universe,
  named: Map<NodeIndex, string>,
  visible: Set<NodeIndex>,
): Map<NodeIndex, number> {
  const adjacency = new Map<NodeIndex, NodeIndex[]>();
  for (const n of universe.nodes) adjacency.set(n.i, []);
  for (const [s, t] of universe.edges) {
    adjacency.get(s)?.push(t);
    adjacency.get(t)?.push(s);
  }
  const anchors = named.size > 0 ? [...named.keys()] : [...visible];
  const depth = new Map<NodeIndex, number>(anchors.map((a) => [a, 0]));
  let frontier = anchors;
  while (frontier.length > 0) {
    const next: NodeIndex[] = [];
    for (const node of frontier) {
      const d = depth.get(node)!;
      for (const n of adjacency.get(node) ?? []) {
        if (depth.has(n)) continue;
        depth.set(n, d + 1);
        next.push(n);
      }
    }
    frontier = next;
  }
  return depth;
}

/**
 * Next stranger to wake as inside a residence.
 *
 * Candidates are every unnamed node. The playable gate (degree ≥ 6, no hubs)
 * is lifted after the first start — see Residence.md. Ease walks down the
 * scale as the residence deepens, sampled within a band rather than argmax.
 * Nodes two or three hops from known territory are preferred.
 */
export function pickNextStart(
  universe: Universe,
  residence: Residence,
): PuzzleRecord | null {
  const candidates = universe.nodes
    .map((n) => n.i)
    .filter((i) => !residence.named.has(i));
  if (candidates.length === 0) return null;

  // First start of a residence is an ordinary cold open and keeps the gate —
  // but by the time we pick *next*, selves already holds the first. So the
  // gate stays lifted here always. (Entering residence happens at reveal; the
  // first waking was chosen by the ordinary picker.)
  const targetEase = Math.max(0, 1 - residence.selves.length * 0.18);
  const distance = hopsFromKnown(universe, residence.named, residence.visible);
  const easeByNode = new Map(universe.puzzles.map((p) => [p.you, p.ease ?? 0]));

  const weights = candidates.map((i) => {
    // Unplayable nodes have no puzzle score: bottom of the band.
    const ease = easeByNode.get(i) ?? 0;
    // Soft band around the falling target — same temperature idea as pickPuzzle.
    let w = Math.exp(-Math.abs(ease - targetEase) / 0.12);
    const hops = distance.get(i);
    if (hops === 2 || hops === 3) w *= 3;
    else if (hops === 1) w *= 1.4;
    else if (hops !== undefined && hops >= 5) w *= 0.5;
    return w;
  });

  const total = weights.reduce((s, w) => s + w, 0);
  let ticket = Math.random() * (total > 0 ? total : candidates.length);
  let chosen = candidates[candidates.length - 1];
  if (total > 0) {
    for (let k = 0; k < candidates.length; k++) {
      ticket -= weights[k];
      if (ticket < 0) {
        chosen = candidates[k];
        break;
      }
    }
  } else {
    chosen = candidates[Math.floor(Math.random() * candidates.length)];
  }
  return puzzleFor(universe, chosen);
}

/**
 * Seed a new session from a residence. Carries named / recognised / facts /
 * visible / expanded; re-roots hop and parent on the new you.
 */
export function wakeInResidence(
  universe: Universe,
  puzzle: PuzzleRecord,
  residence: Residence,
): Session {
  const you = puzzle.you;
  const visible = new Set(residence.visible);
  const hop = new Map<NodeIndex, number>();
  const parent = new Map<NodeIndex, NodeIndex | null>();

  // Re-root: BFS from you across the *visible* subgraph first, so carried
  // structure keeps coherent hop distances. Then attach any not-yet-visible
  // neighbours of you (the ordinary opening ring).
  visible.add(you);
  hop.set(you, 0);
  parent.set(you, null);

  const queue: NodeIndex[] = [you];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const myHop = hop.get(cur) ?? 0;
    for (const n of neighborsOf(universe, cur)) {
      if (!visible.has(n) || hop.has(n)) continue;
      hop.set(n, myHop + 1);
      parent.set(n, cur);
      queue.push(n);
    }
  }

  for (const n of neighborsOf(universe, you)) {
    if (!visible.has(n)) {
      visible.add(n);
      hop.set(n, 1);
      parent.set(n, you);
    } else if (!hop.has(n)) {
      hop.set(n, 1);
      parent.set(n, you);
    }
  }

  // Earlier map the drawn ties do not join to you. Parentless, so the layout
  // sets it on its own ring outside yours; its hop is the true distance in the
  // world, so expanding from it numbers the next ring sensibly.
  const stranded = [...visible].filter((i) => !hop.has(i));
  if (stranded.length > 0) {
    const distance = new Map<NodeIndex, number>([[you, 0]]);
    const walk: NodeIndex[] = [you];
    while (walk.length > 0) {
      const cur = walk.shift()!;
      for (const n of neighborsOf(universe, cur)) {
        if (distance.has(n)) continue;
        distance.set(n, distance.get(cur)! + 1);
        walk.push(n);
      }
    }
    const beyond = Math.max(2, ...hop.values()) + 1;
    for (const i of stranded) {
      hop.set(i, distance.get(i) ?? beyond);
      parent.set(i, null);
    }
  }

  const expanded = new Set(residence.expanded);
  expanded.add(you);

  const named = new Map(residence.named);
  // You are never pre-named as yourself — that is the answer.
  named.delete(you);

  const recognised = new Set(residence.recognised);
  recognised.delete(you);

  const initials = new Map(residence.initials);
  initials.delete(you);
  // Ensure expanded-but-unnamed nodes still carry a monogram when we have the name.
  for (const i of expanded) {
    if (i === you || named.has(i) || initials.has(i)) continue;
    const n = universe.nodes.find((node) => node.i === i)?.n;
    if (n) initials.set(i, monogramOf(n));
  }

  const known: Known = {
    visible,
    expanded,
    facts: new Set(residence.facts),
    named,
    initials,
    rejected: new Map(
      [...residence.rejected.entries()].map(([k, v]) => [k, [...v]]),
    ),
    recognised,
    hop,
    parent,
    carried: new Set([...residence.expanded].filter((i) => i !== you)),
  };

  return {
    phase: 'cold',
    ease: puzzle.ease ?? null,
    universe: universe.id,
    you,
    puzzleId: puzzle.id,
    storyRevealed: false,
    // The world is known for the rest of the residence.
    worldChosen: true,
    known,
    ledger: { expansions: 0, facts: 0, names: 0, stories: 0, recognitions: 0 },
    guesses: [],
    lastGuess: null,
    lastClaim: null,
  };
}

/** Name the last remaining node — the player is provably that person. */
export function nameLastNode(universe: Universe, residence: Residence): Residence {
  const left = universe.nodes.filter((n) => !residence.named.has(n.i));
  if (left.length !== 1) return residence;
  const last = left[0];
  const named = new Map(residence.named);
  named.set(last.i, last.n);
  const recognised = new Set(residence.recognised);
  recognised.add(last.i);
  const selves = residence.selves.includes(last.i)
    ? residence.selves
    : [...residence.selves, last.i];
  const starts =
    residence.selves.includes(last.i) && residence.starts.length === residence.selves.length
      ? residence.starts
      : [...residence.starts, 0];
  return {
    ...residence,
    selves,
    starts,
    named,
    recognised,
    visible: new Set([...residence.visible, last.i]),
    expanded: new Set([...residence.expanded, last.i]),
  };
}

/** What a world's map amounts to, for the chooser, the gallery and the reveal. */
export interface WorldProgress {
  named: number;
  cast: number;
  starts: number;
  clues: number;
  complete: boolean;
}

export function progressOf(residence: Residence, cast: number): WorldProgress {
  return {
    named: Math.min(residence.named.size, cast),
    cast,
    starts: residence.starts.length,
    clues: residenceTotal(residence),
    complete: residence.named.size >= cast,
  };
}

/** "7 of 18 named", or "Finished" once every name is on the paper. */
export function progressLine(p: WorldProgress): string {
  return p.complete ? 'Finished' : `${p.named} of ${p.cast} named`;
}

// —— persistence ————————————————————————————————————————————————

interface StoredResidence {
  universe: UniverseId;
  selves: NodeIndex[];
  starts: number[];
  /** Absent in maps saved before unfinished starts were counted. */
  spent?: number;
  named: [NodeIndex, string][];
  recognised: NodeIndex[];
  facts: NodeIndex[];
  visible: NodeIndex[];
  expanded: NodeIndex[];
  initials: [NodeIndex, { initial: string; length: number }][];
  rejected: [NodeIndex, string[]][];
}

function toStored(r: Residence): StoredResidence {
  return {
    universe: r.universe,
    selves: r.selves,
    starts: r.starts,
    spent: r.spent,
    named: [...r.named.entries()],
    recognised: [...r.recognised],
    facts: [...r.facts],
    visible: [...r.visible],
    expanded: [...r.expanded],
    initials: [...r.initials.entries()],
    rejected: [...r.rejected.entries()],
  };
}

function fromStored(s: StoredResidence): Residence {
  return {
    universe: s.universe,
    selves: s.selves,
    starts: s.starts,
    spent: s.spent ?? 0,
    named: new Map(s.named),
    recognised: new Set(s.recognised),
    facts: new Set(s.facts),
    visible: new Set(s.visible),
    expanded: new Set(s.expanded),
    initials: new Map(s.initials),
    rejected: new Map(s.rejected),
  };
}

/** Every world's map, keyed by world id. Leaving a world pauses its map; it is
 * not thrown away. */
export function loadResidences(): Map<UniverseId, Residence> {
  const out = new Map<UniverseId, Residence>();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const stored = JSON.parse(raw) as Record<string, StoredResidence>;
      for (const [id, s] of Object.entries(stored)) out.set(id, fromStored(s));
    }
    // The first build kept a single residence under the old key.
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const r = fromStored(JSON.parse(legacy) as StoredResidence);
      if (!out.has(r.universe)) out.set(r.universe, r);
      localStorage.removeItem(LEGACY_KEY);
    }
  } catch {
    // Unreadable storage: start with an empty shelf.
  }
  return out;
}

export function saveResidences(all: Map<UniverseId, Residence>): void {
  try {
    const stored: Record<string, StoredResidence> = {};
    for (const [id, r] of all) stored[id] = toStored(r);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Private windows / blocked site data: the maps hold for this sitting only.
  }
}

/** The world the player was last living in, so a refresh lands back there. */
export function loadActiveWorld(): UniverseId | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function saveActiveWorld(id: UniverseId | null): void {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    // As above.
  }
}

/** Ordinal label for the walking ledger: "Fourth start". */
export function startOrdinal(n: number): string {
  const ordinals = [
    'First',
    'Second',
    'Third',
    'Fourth',
    'Fifth',
    'Sixth',
    'Seventh',
    'Eighth',
    'Ninth',
    'Tenth',
    'Eleventh',
    'Twelfth',
  ];
  if (n >= 1 && n <= ordinals.length) return `${ordinals[n - 1]} start`;
  return `Start ${n}`;
}

/** Empty ledger shape, re-exported convenience for callers that reset a start. */
export type { Ledger };
