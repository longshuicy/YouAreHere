import type { NodeIndex, PuzzleRecord, Universe, UniverseId } from '../types';

export type Phase = 'cold' | 'explore' | 'guess' | 'reveal';

/**
 * Cost table for player actions.
 *
 * Every action is recorded the same way: as clues. There is no separate hint
 * currency — a second counter split the player's attention between two numbers
 * neither of which was the score, and a run is easier to compare against
 * another run when there is one number to compare.
 *
 * `weigh` is gone: tie strength is now shown by default everywhere, because
 * paying to see it was buying the one thing the diagram is made of. `facts`
 * replaced it — a character's discrete attributes (books, titles, allegiances)
 * drawn from the enrichment sidecar.
 *
 * `story` is the old `locate` under a plainer name, reinstated at its old price.
 * It was removed on the reasoning that guessing is free, so a player could
 * brute-force the world from a short dropdown and paying for it was a tax on
 * those who did not think to. That held at three worlds. At thirty-one, walking
 * the dropdown is not deduction, it is clicking — so the shortcut exists, and it
 * costs, because it is information and information costs. Naming the world
 * *correctly* is still free: that is an answer, not a purchase.
 *
 * Priced below `name` on purpose. A name usually gives the world away as well,
 * so it must not be cheaper than the half-answer it contains.
 */
export const COST = { expand: 1, facts: 2, name: 3, story: 2 } as const;

export interface Known {
  visible: Set<NodeIndex>;
  expanded: Set<NodeIndex>;
  /** Nodes whose facts have been bought. */
  facts: Set<NodeIndex>;
  named: Map<NodeIndex, string>;
  /** Not in the architecture doc's sketch, but required to drive the radial ego
   * layout: hop distance and discovering parent for every visible node. */
  hop: Map<NodeIndex, number>;
  parent: Map<NodeIndex, NodeIndex | null>;
}

/** Counts of actions taken, NOT clue totals. What each one costs lives in COST,
 * and `clueTotal` is the only place the two are multiplied together. */
export interface Ledger {
  expansions: number;
  facts: number;
  names: number;
  /** 0 or 1 — the world can only be given away once. */
  stories: number;
}

export function clueTotal(ledger: Ledger): number {
  return (
    ledger.expansions * COST.expand +
    ledger.facts * COST.facts +
    ledger.names * COST.name +
    ledger.stories * COST.story
  );
}

export interface GuessRecord {
  universe: UniverseId;
  characterQuery: string;
  characterIndex: NodeIndex | null;
  storyCorrect: boolean;
  characterCorrect: boolean;
}

export interface Session {
  phase: Phase;
  /** How findable this start was scored to be, 0 to 1. Carried for the reveal
   * and for tuning; nothing in play branches on it. */
  ease: number | null;
  universe: UniverseId;
  you: NodeIndex;
  puzzleId: string;

  /** True when the player bought the world rather than working it out. */
  storyRevealed: boolean;

  /** True when the player picked this world rather than waking in a stranger's.
   * The story half of the question is then already answered, so it is never put
   * to them again — see `worldIsKnown`. */
  worldChosen: boolean;

  known: Known;
  ledger: Ledger;
  guesses: GuessRecord[];
  lastGuess: GuessRecord | null;
}

export type Action =
  | { type: 'EXPAND'; node: NodeIndex }
  | { type: 'FACTS'; node: NodeIndex }
  | { type: 'NAME'; node: NodeIndex; name: string }
  | { type: 'REVEAL_STORY' }
  | { type: 'OPEN_GUESS' }
  | { type: 'CLOSE_GUESS' }
  | { type: 'GUESS'; universe: UniverseId; characterQuery: string; characterIndex: NodeIndex | null }
  | { type: 'REVEAL' };

function neighborsOf(universe: Universe, node: NodeIndex): NodeIndex[] {
  const out: NodeIndex[] = [];
  for (const [s, t] of universe.edges) {
    if (s === node) out.push(t);
    else if (t === node) out.push(s);
  }
  return out;
}

/** Builds the starting session for a puzzle. Every waking starts clean: the
 * residence model (staying in one world across several wakings, carrying bought
 * names forward) is parked, so nothing crosses between runs. */
export function initSession(
  universe: Universe,
  puzzle: PuzzleRecord,
  { worldChosen = false }: { worldChosen?: boolean } = {},
): Session {
  const you = puzzle.you;
  const visible = new Set<NodeIndex>([you]);
  const hop = new Map<NodeIndex, number>([[you, 0]]);
  const parent = new Map<NodeIndex, NodeIndex | null>([[you, null]]);
  for (const n of neighborsOf(universe, you)) {
    visible.add(n);
    hop.set(n, 1);
    parent.set(n, you);
  }

  return {
    phase: 'cold',
    ease: puzzle.ease ?? null,
    universe: universe.id,
    you,
    puzzleId: puzzle.id,
    storyRevealed: false,
    worldChosen,
    known: {
      visible,
      expanded: new Set([you]),
      facts: new Set(),
      named: new Map(),
      hop,
      parent,
    },
    ledger: { expansions: 0, facts: 0, names: 0, stories: 0 },
    guesses: [],
    lastGuess: null,
  };
}

export type ActionKey = 'expand' | 'facts' | 'name';

/** The world is known once the player has named it correctly — free, and the
 * same act the guess screen already asks for — or when they chose it up front
 * and there was never anything to name, or when they simply asked.
 *
 * The three routes cost differently, which is the point: naming it correctly is
 * free because it is an answer, choosing it up front is free because there was
 * never a question, and being told costs `COST.story` because that is a purchase.
 * None of them tells you who you are.
 */
export function worldIsKnown(session: Session): boolean {
  return session.worldChosen || session.storyRevealed || session.guesses.some((g) => g.storyCorrect);
}

export function availableActionsFor(session: Session, node: NodeIndex): ActionKey[] {
  const actions: ActionKey[] = [];
  if (!session.known.expanded.has(node)) actions.push('expand');
  // Nothing about yourself is for sale: naming or reading facts about your own
  // node would just be answering the question. That is what the guess is for.
  if (node === session.you) return actions;
  if (!session.known.facts.has(node)) actions.push('facts');
  if (!session.known.named.has(node)) actions.push('name');
  return actions;
}

export function makeReducer(universe: Universe) {
  return function reduce(session: Session, action: Action): Session {
    switch (action.type) {
      case 'EXPAND': {
        if (session.known.expanded.has(action.node) || !session.known.visible.has(action.node)) return session;
        const visible = new Set(session.known.visible);
        const hop = new Map(session.known.hop);
        const parent = new Map(session.known.parent);
        const expanded = new Set(session.known.expanded);
        expanded.add(action.node);
        const myHop = hop.get(action.node) ?? 0;
        for (const n of neighborsOf(universe, action.node)) {
          if (!visible.has(n)) {
            visible.add(n);
            hop.set(n, myHop + 1);
            parent.set(n, action.node);
          }
        }
        return {
          ...session,
          known: { ...session.known, visible, expanded, hop, parent },
          ledger: { ...session.ledger, expansions: session.ledger.expansions + 1 },
        };
      }
      case 'FACTS': {
        if (session.known.facts.has(action.node) || !session.known.visible.has(action.node)) return session;
        if (action.node === session.you) return session;
        const facts = new Set(session.known.facts);
        facts.add(action.node);
        return {
          ...session,
          known: { ...session.known, facts },
          ledger: { ...session.ledger, facts: session.ledger.facts + 1 },
        };
      }
      case 'NAME': {
        if (session.known.named.has(action.node) || !session.known.visible.has(action.node)) return session;
        const named = new Map(session.known.named);
        named.set(action.node, action.name);
        return {
          ...session,
          known: { ...session.known, named },
          ledger: { ...session.ledger, names: session.ledger.names + 1 },
        };
      }
      case 'REVEAL_STORY': {
        // Charged once. Asking again after the world is already known — however
        // it became known — buys nothing and so costs nothing.
        if (worldIsKnown(session)) return session;
        return {
          ...session,
          storyRevealed: true,
          ledger: { ...session.ledger, stories: session.ledger.stories + 1 },
        };
      }
      case 'OPEN_GUESS':
        return { ...session, phase: 'guess' };
      case 'CLOSE_GUESS':
        return { ...session, phase: 'explore' };
      case 'GUESS': {
        const storyCorrect = action.universe === session.universe;
        const characterCorrect = action.characterIndex !== null && action.characterIndex === session.you;
        const record = {
          universe: action.universe,
          characterQuery: action.characterQuery,
          characterIndex: action.characterIndex,
          storyCorrect,
          characterCorrect,
        };
        const guesses = [...session.guesses, record];
        if (storyCorrect && characterCorrect) {
          return { ...session, phase: 'reveal', guesses, lastGuess: record };
        }
        return { ...session, phase: 'guess', guesses, lastGuess: record };
      }
      case 'REVEAL':
        return { ...session, phase: 'reveal' };
      default:
        return session;
    }
  };
}
