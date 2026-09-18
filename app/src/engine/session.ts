import type { NodeIndex, PuzzleRecord, Universe, UniverseId } from '../types';

export type Phase = 'cold' | 'explore' | 'guess' | 'reveal';
// 'unbanded' covers today's data, which has not been through difficulty scoring yet.
export type Band = 'approachable' | 'hard' | 'unbanded';

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
 * `locate` is gone too. Guessing is free and wrong guesses cost nothing, so a
 * player could brute-force the story from a short dropdown in a few free tries
 * — paying clues for what trial gives away was never a real trade. The world is
 * now revealed by guessing the story correctly, which costs nothing and is the
 * same act the guess screen already asks for.
 */
export const COST = { expand: 1, facts: 2, name: 3 } as const;

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
}

export function clueTotal(ledger: Ledger): number {
  return ledger.expansions * COST.expand + ledger.facts * COST.facts + ledger.names * COST.name;
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
  band: Band;
  universe: UniverseId;
  you: NodeIndex;
  puzzleId: string;

  known: Known;
  ledger: Ledger;
  guesses: GuessRecord[];
  lastGuess: GuessRecord | null;
}

export type Action =
  | { type: 'EXPAND'; node: NodeIndex }
  | { type: 'FACTS'; node: NodeIndex }
  | { type: 'NAME'; node: NodeIndex; name: string }
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
export function initSession(universe: Universe, puzzle: PuzzleRecord): Session {
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
    band: puzzle.band ?? 'unbanded',
    universe: universe.id,
    you,
    puzzleId: puzzle.id,
    known: {
      visible,
      expanded: new Set([you]),
      facts: new Set(),
      named: new Map(),
      hop,
      parent,
    },
    ledger: { expansions: 0, facts: 0, names: 0 },
    guesses: [],
    lastGuess: null,
  };
}

export type ActionKey = 'expand' | 'facts' | 'name';

/** The world is known once the player has named it correctly — free, and the
 * same act the guess screen already asks for. */
export function worldIsKnown(session: Session): boolean {
  return session.guesses.some((g) => g.storyCorrect);
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
