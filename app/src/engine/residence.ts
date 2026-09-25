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
  /**
   * Strangers the player walked away from without finding out who they were,
   * most recent first. They are still unnamed, so they are still candidates —
   * but handing one straight back reads as the game ignoring the player, who
   * had just said "not this one".
   */
  left: NodeIndex[];
}

/**
 * How far toward the obscure end of the scale this map may be asked to go.
 *
 * A hard start is only tractable because of the map already drawn around it. A
 * degree-two walk-on is a fine puzzle on the ninth start, with two thirds of
 * the book on the paper, and close to unsolvable on the second, with almost
 * nothing. So the dial is bounded by how much of the world the player knows:
 * at the beginning it moves only near the findable end, and it reaches the far
 * end once the map does.
 *
 * Without the bound, a player who set the dial to OBSCURE at the door would be
 * dealt exactly the people they have no means to identify, give up or walk
 * away, and be dealt another — and walking away names nobody, so the pool
 * would never shrink. The residence would not merely invert its arc, it would
 * stall without advancing.
 *
 * Returns the lowest value the dial may take, on the same 0 (obscure) to 1
 * (findable) scale the cold open's slider uses.
 */
export function easeFloor(residence: Residence, cast: number): number {
  if (cast <= 0) return 0;
  const share = Math.min(1, residence.named.size / cast);
  return Math.max(0, 1 - share);
}

/** How far back the picker remembers a stranger the player walked away from. */
const LEFT_MEMORY = 6;

/** How hard one of them is suppressed. A penalty rather than an exclusion, the
 * same way `loader.ts` treats a recent puzzle: a small world late in a
 * residence cannot run out of people to be. */
const LEFT_PENALTY = 0.02;

const STORAGE_KEY = 'you-are-here-residences';
const LEGACY_KEY = 'you-are-here-residence';
const ACTIVE_KEY = 'you-are-here-active-world';
const START_KEY = 'you-are-here-start';

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
    left: [],
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
 * Copy this start's learning onto the map without ending the start.
 *
 * A correct claim, a struck name, an expansion — anything that should already
 * be on the shelf and in the chooser's progress before the player leaves.
 * Ending the start still goes through absorbStart / absorbUnfinished, which
 * record the ledger and, on a walk-away, the stranger left behind.
 */
export function syncKnowledge(residence: Residence, session: Session): Residence {
  return mergeKnowledge(residence, session, '');
}

/**
 * Fold a start the player left before finding themselves.
 *
 * What they bought stays on the map, and what it cost stays on the ledger —
 * otherwise leaving mid-round would be a way to buy names for nothing. They
 * are not added to their former selves: they never found out who they were.
 */
export function absorbUnfinished(residence: Residence, session: Session): Residence {
  const merged = mergeKnowledge(residence, session, '');
  return {
    ...merged,
    spent: residence.spent + clueTotal(session.ledger),
    left: [session.you, ...merged.left.filter((i) => i !== session.you)].slice(0, LEFT_MEMORY),
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
    // A named stranger is out of the candidate pool anyway; keeping them here
    // would only crowd out somebody who still needs suppressing.
    left: residence.left.filter((i) => !named.has(i)),
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

/** How many of the easiest remaining candidates the next start is drawn from.
 *
 * Not one: taking the top of the list every time makes every residence in a
 * world the same run in the same order. Not many: a wide window is the old
 * absolute-target picker again, reaching past people the player could actually
 * place. Four is enough that two runs diverge in the first few starts and stay
 * diverged, because each draw changes what is left. */
const START_WINDOW = 4;

/**
 * Next stranger to wake as inside a residence.
 *
 * Candidates are every unnamed node. The playable gate (degree ≥ 6, no hubs)
 * is lifted after the first start — see Residence.md.
 *
 * Difficulty is the *rank* of who is left, never an absolute score. The
 * candidates are ordered by ease and the next start is drawn from the easiest
 * few; the residence gets harder only because the findable people get used up,
 * which is the arc the mode is for. An earlier version walked an absolute
 * target down by a fixed step per start — `1 - starts * 0.18` — which reached
 * the obscure end of the scale on the sixth start and stayed there while a
 * dozen findable people were still unnamed, and which favoured the unplayable
 * leaves once it did, because an unscored node reads as ease 0. Rank has no
 * such end to hit: it is always relative to who is actually left.
 *
 * Unscored nodes — the leaves the playable gate excluded, which carry no
 * `ease` — sort below every scored start and so come last, which is where
 * they belong.
 *
 * Nodes two or three hops from known territory are preferred: one expansion
 * should touch a face the player recognises without handing over the answer.
 *
 * `dial` is the player's own request on the cold open's scale, 0 obscure to 1
 * findable, and it moves the window *down* the ranking rather than picking an
 * absolute score: at 1 the window sits at the top of whoever is left, which is
 * the default and what the residence did before the dial existed. How far it
 * may travel is bounded by `easeFloor` — see the note there for why an
 * unbounded dial stalls the mode rather than merely inverting it.
 */
export function pickNextStart(
  universe: Universe,
  residence: Residence,
  dial = 1,
): PuzzleRecord | null {
  const unnamed = universe.nodes
    .map((n) => n.i)
    .filter((i) => !residence.named.has(i));
  if (unnamed.length === 0) return null;

  // The stranger just walked away from is never the next one, so long as there
  // is anyone else to be. The player said "not this one"; a weighting that
  // merely made it unlikely still read as the game ignoring them. Older ones
  // are only suppressed — see LEFT_PENALTY below.
  const justLeft = residence.left[0];
  const candidates =
    unnamed.length > 1 && justLeft !== undefined
      ? unnamed.filter((i) => i !== justLeft)
      : unnamed;

  const distance = hopsFromKnown(universe, residence.named, residence.visible);
  const easeByNode = new Map(universe.puzzles.map((p) => [p.you, p.ease ?? 0]));
  // Below every scored start, rather than level with the most obscure of them:
  // having no score is not the same as scoring zero.
  const easeOf = (i: NodeIndex) => easeByNode.get(i) ?? -1;

  const ranked = [...candidates].sort((a, b) => easeOf(b) - easeOf(a));
  // How far down the ranking the dial has been pushed, as a share of the list,
  // and never further than the map has earned. `1 - dial` is the ask; the floor
  // is the bound. They meet exactly at the dial's own lowest position, so a
  // player holding it at the obscure end is always reading the true depth.
  const depth = Math.min(
    Math.max(0, 1 - dial),
    1 - easeFloor(residence, universe.nodes.length),
  );
  const span = Math.max(0, ranked.length - START_WINDOW);
  const offset = Math.round(depth * span);
  const window = ranked.slice(offset, offset + START_WINDOW);

  // Inside the window, nearness to the known map is the only tilt — every one
  // of them is already among the most findable people left.
  const weights = window.map((i) => {
    const hops = distance.get(i);
    let w = 1;
    if (hops === 2 || hops === 3) w = 3;
    else if (hops === 1) w = 1.4;
    else if (hops !== undefined && hops >= 5) w = 0.5;
    // Walking away from somebody leaves them the easiest person left, and the
    // walk just taken puts named faces beside them — so without this they come
    // back at the top of the window with the nearness bonus on top.
    if (residence.left.includes(i)) w *= LEFT_PENALTY;
    return w;
  });

  const total = weights.reduce((sum, w) => sum + w, 0);
  let chosen = window[window.length - 1];
  if (total > 0) {
    let ticket = Math.random() * total;
    for (let k = 0; k < window.length; k++) {
      ticket -= weights[k];
      if (ticket < 0) {
        chosen = window[k];
        break;
      }
    }
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

  // A biography bought in an earlier start is not readable about yourself. The
  // purchase stays on the map for every other node; it is withheld here for the
  // same reason `availableActionsFor` refuses to sell it — it is the answer.
  const facts = new Set(residence.facts);
  facts.delete(you);

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
    facts,
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
    ledger: { expansions: 0, facts: 0, names: 0, stories: 0, answers: 0, recognitions: 0 },
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
  /** Absent in maps saved before abandoned strangers were remembered. */
  left?: NodeIndex[];
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
    left: r.left,
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
    left: s.left ?? [],
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

/**
 * The start currently being played, so a refresh is a no-op rather than a deal.
 *
 * Saved only inside a residence. A one-off round dying on a reload is
 * acceptable — nothing outlives it. A residence start is not: its clues are on
 * a total that is still running and its names are bound for a map, so a reload
 * that dealt a new stranger both lost the spend and handed the player a free
 * undo of a start going badly.
 *
 * `route.ts` still refuses to put any of this in the URL. This is the same
 * doctrine, not an exception to it: the address bar is shareable and a
 * bookmark of a running puzzle hands over the answer; local storage is this
 * browser's own memory of what it was in the middle of.
 */
interface StoredStart {
  universe: UniverseId;
  you: NodeIndex;
  puzzleId: string;
  phase: Session['phase'];
  ease: number | null;
  storyRevealed: boolean;
  worldChosen: boolean;
  ledger: Ledger;
  guesses: Session['guesses'];
  known: {
    visible: NodeIndex[];
    expanded: NodeIndex[];
    facts: NodeIndex[];
    named: [NodeIndex, string][];
    initials: [NodeIndex, { initial: string; length: number }][];
    rejected: [NodeIndex, string[]][];
    recognised: NodeIndex[];
    hop: [NodeIndex, number][];
    parent: [NodeIndex, NodeIndex | null][];
    carried: NodeIndex[] | null;
  };
}

export function saveStart(session: Session | null): void {
  try {
    if (!session) {
      localStorage.removeItem(START_KEY);
      return;
    }
    const k = session.known;
    const stored: StoredStart = {
      universe: session.universe,
      you: session.you,
      puzzleId: session.puzzleId,
      phase: session.phase,
      ease: session.ease,
      storyRevealed: session.storyRevealed,
      worldChosen: session.worldChosen,
      ledger: session.ledger,
      guesses: session.guesses,
      known: {
        visible: [...k.visible],
        expanded: [...k.expanded],
        facts: [...k.facts],
        named: [...k.named.entries()],
        initials: [...k.initials.entries()],
        rejected: [...k.rejected.entries()],
        recognised: [...k.recognised],
        hop: [...k.hop.entries()],
        parent: [...k.parent.entries()],
        carried: k.carried ? [...k.carried] : null,
      },
    };
    localStorage.setItem(START_KEY, JSON.stringify(stored));
  } catch {
    // Blocked storage: the start holds for this sitting only, as before.
  }
}

export function clearStart(): void {
  saveStart(null);
}

/** The start in progress, if it belongs to this world. Null otherwise, which
 * includes a stored start left behind by a world the player has since left. */
export function loadStart(universe: UniverseId): Session | null {
  try {
    const raw = localStorage.getItem(START_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as StoredStart;
    if (s.universe !== universe) return null;
    return {
      phase: s.phase,
      ease: s.ease,
      universe: s.universe,
      you: s.you,
      puzzleId: s.puzzleId,
      storyRevealed: s.storyRevealed,
      worldChosen: s.worldChosen,
      known: {
        visible: new Set(s.known.visible),
        expanded: new Set(s.known.expanded),
        facts: new Set(s.known.facts),
        named: new Map(s.known.named),
        initials: new Map(s.known.initials),
        rejected: new Map(s.known.rejected),
        recognised: new Set(s.known.recognised),
        hop: new Map(s.known.hop),
        parent: new Map(s.known.parent),
        carried: s.known.carried ? new Set(s.known.carried) : undefined,
      },
      ledger: s.ledger,
      guesses: s.guesses,
      // Both are about the move just made, and the move just made is over.
      lastGuess: null,
      lastClaim: null,
    };
  } catch {
    return null;
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
