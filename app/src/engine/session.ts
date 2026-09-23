import type { NodeIndex, PuzzleRecord, Universe, UniverseId } from '../types';
import { monogramOf, resolveName } from './names';

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
 *
 * `claim` is not in the table, because it is not a purchase in either
 * direction. Put a name to somebody else's node: right, and the node is named
 * for nothing and hands a clue back; wrong, and nothing happens but the name
 * being struck through. It is the doctrine the world question has always run
 * on — naming it right is an answer, not a purchase — applied to the other
 * half, and the rule was never specific to the world.
 *
 * A wrong claim was briefly priced at 1, on the reasoning that a free attempt
 * makes walking a cast list a procedure rather than a bet. That reasoning was
 * backwards. Guessing is free is the governing rule, not a rule with an
 * exception for guessing about other people, and charging for a wrong guess
 * taxes exactly the player the mechanic exists for: the one who has a
 * hypothesis and no way to test it. The brute-force worry is also thinner than
 * it looks — the claim field has no type-ahead, so names come from the
 * player's own memory of the book, and a player who can list the cast has
 * already answered the half of the question that was hard.
 */
export const COST = { expand: 1, facts: 2, name: 3, story: 2 } as const;

/** What a correct claim gives back. Held apart from COST because it is a
 * refund, not a price, and floors the total at zero rather than driving it
 * below — the ledger is a record of what you spent, and you cannot spend less
 * than nothing. */
export const RECOGNITION_REFUND = 1;

export interface Known {
  visible: Set<NodeIndex>;
  expanded: Set<NodeIndex>;
  /** Nodes whose facts have been bought. */
  facts: Set<NodeIndex>;
  named: Map<NodeIndex, string>;
  /** The monogram an expansion leaves behind: first character and name length,
   * for nodes that have been expanded but not named. */
  initials: Map<NodeIndex, { initial: string; length: number }>;
  /** Names the player has put to a node and been refused, newest last. Kept so
   * a wrong claim stays struck through on the node it was made against, and is
   * never silently paid for twice. */
  rejected: Map<NodeIndex, string[]>;
  /** Nodes named by getting them right rather than by paying — a correct claim,
   * or a character guessed into the wrong slot. Carried for the reveal. */
  recognised: Set<NodeIndex>;
  /** Not in the architecture doc's sketch, but required to drive the radial ego
   * layout: hop distance and discovering parent for every visible node. */
  hop: Map<NodeIndex, number>;
  parent: Map<NodeIndex, NodeIndex | null>;
  /** Residence only: nodes already opened by earlier starts. What this start
   * opened is `expanded` minus these, which is what the stage keeps in full ink. */
  carried?: ReadonlySet<NodeIndex>;
}

/** Counts of actions taken, NOT clue totals. What each one costs lives in COST,
 * and `clueTotal` is the only place the two are multiplied together. */
export interface Ledger {
  expansions: number;
  facts: number;
  names: number;
  /** 0 or 1 — the world can only be given away once. */
  stories: number;
  /** Right claims: the only entry that is a credit. Wrong ones are not counted
   * at all — they cost nothing, so a tally of them would be a scoreboard of
   * the player's mistakes and nothing else. The struck-through names on the
   * node they were offered to are the record that matters. */
  recognitions: number;
}

/** What you paid, before any correct claim is taken off. */
export function clueSpent(ledger: Ledger): number {
  return (
    ledger.expansions * COST.expand +
    ledger.facts * COST.facts +
    ledger.names * COST.name +
    ledger.stories * COST.story
  );
}

/** What a run of correct claims gives back. */
export function clueBonus(ledger: Ledger): number {
  return ledger.recognitions * RECOGNITION_REFUND;
}

export function clueTotal(ledger: Ledger): number {
  // The score is what you spent, with the bonus canceled off it. A correct
  // claim is advertised as -1; this is the only place that -1 lands.
  // Floors at zero rather than driving the total below — the ledger is a
  // record of what you spent, and you cannot spend less than nothing.
  return Math.max(0, clueSpent(ledger) - clueBonus(ledger));
}

export interface GuessRecord {
  universe: UniverseId;
  characterQuery: string;
  characterIndex: NodeIndex | null;
  storyCorrect: boolean;
  characterCorrect: boolean;
  /**
   * How far the character they named actually stands from them, in ties.
   *
   * Only ever filled in once the story is right, which is the guard against
   * using the guess box as an oracle: you cannot ask how far away someone is
   * until you have established which book you are both in. Null when the story
   * was wrong, when the name resolved to nobody, or when no path exists.
   *
   * This is what makes a wrong guess worth making. "Right story, wrong person"
   * used to be a consolation prize; a distance turns it into a move.
   */
  hops: number | null;
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
  /** The last claim resolved, for the menu to report on. */
  lastClaim: { node: NodeIndex; query: string; correct: boolean } | null;
}

export type Action =
  | { type: 'EXPAND'; node: NodeIndex }
  | { type: 'FACTS'; node: NodeIndex }
  | { type: 'NAME'; node: NodeIndex; name: string }
  | { type: 'CLAIM'; node: NodeIndex; query: string }
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

/** Shortest path in ties between two nodes of the full graph, or null when they
 * are in different components. Runs over the whole universe, not the visible
 * subgraph: the answer is a fact about the book, not about how much of it the
 * player has uncovered. */
export function hopsBetween(universe: Universe, from: NodeIndex, to: NodeIndex): number | null {
  if (from === to) return 0;
  const seen = new Set<NodeIndex>([from]);
  let frontier: NodeIndex[] = [from];
  let depth = 0;
  while (frontier.length > 0) {
    depth += 1;
    const next: NodeIndex[] = [];
    for (const node of frontier) {
      for (const n of neighborsOf(universe, node)) {
        if (seen.has(n)) continue;
        if (n === to) return depth;
        seen.add(n);
        next.push(n);
      }
    }
    frontier = next;
  }
  return null;
}

/** Builds the starting session for a puzzle. One-off play starts clean.
 * Residence carry-over goes through `wakeInResidence` in `engine/residence.ts`
 * — this helper is the cold open of a first (or shuffled) waking only. */
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
      // Your own node is expanded from the first frame but leaves no monogram:
      // the initial of your own name is not structure, it is the answer.
      expanded: new Set([you]),
      facts: new Set(),
      named: new Map(),
      initials: new Map(),
      rejected: new Map(),
      recognised: new Set(),
      hop,
      parent,
    },
    ledger: { expansions: 0, facts: 0, names: 0, stories: 0, recognitions: 0 },
    guesses: [],
    lastGuess: null,
    lastClaim: null,
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

/**
 * What this node will still sell you.
 *
 * `hasFacts` reports whether the enrichment sidecar actually holds a line for a
 * node. It is optional only so the engine stays usable without one; in the app
 * it is always supplied, because in 22 of the 32 worlds most nodes have no line
 * behind them — four Shakespeare plays have none at all — and Facts was
 * charging 2 clues to answer "nothing is recorded of them". An empty shelf is
 * not stock, so it is not offered.
 */
export function availableActionsFor(
  session: Session,
  node: NodeIndex,
  hasFacts?: (node: NodeIndex) => boolean,
): ActionKey[] {
  const actions: ActionKey[] = [];
  if (!session.known.expanded.has(node)) actions.push('expand');
  // Nothing about yourself is for sale: naming or reading facts about your own
  // node would just be answering the question. That is what the guess is for.
  if (node === session.you) return actions;
  if (!session.known.facts.has(node) && (hasFacts?.(node) ?? true)) actions.push('facts');
  if (!session.known.named.has(node)) actions.push('name');
  return actions;
}

/** Whether a node will take a claim. Your own node will not — putting a name to
 * yourself is the guess, and it belongs on the screen built for it. */
export function canClaim(session: Session, node: NodeIndex): boolean {
  return (
    node !== session.you &&
    session.known.visible.has(node) &&
    !session.known.named.has(node)
  );
}

export function makeReducer(universe: Universe) {
  const nameOf = (i: NodeIndex) => universe.nodes.find((n) => n.i === i)?.n ?? '';

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
        // The expansion leaves a monogram on the node that paid for it. One
        // clue now buys two different kinds of evidence: who this node is tied
        // to, and the shape of its name.
        const initials = new Map(session.known.initials);
        if (action.node !== session.you && !session.known.named.has(action.node)) {
          initials.set(action.node, monogramOf(nameOf(action.node)));
        }
        return {
          ...session,
          known: { ...session.known, visible, expanded, hop, parent, initials },
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
      /**
       * Put a name to somebody else's node.
       *
       * Right: the node is named for nothing and gives a clue back. Wrong: the
       * name is struck through and nothing else happens — nothing said, no
       * proximity, no "close", and nothing charged.
       */
      case 'CLAIM': {
        if (!canClaim(session, action.node)) return session;
        const query = action.query.trim();
        if (!query) return session;
        const resolved = resolveName(universe, query);
        const correct = resolved !== null && resolved === action.node;
        const lastClaim = { node: action.node, query, correct };

        if (correct) {
          const named = new Map(session.known.named);
          named.set(action.node, nameOf(action.node));
          const recognised = new Set(session.known.recognised);
          recognised.add(action.node);
          const initials = new Map(session.known.initials);
          initials.delete(action.node);
          return {
            ...session,
            known: { ...session.known, named, recognised, initials },
            ledger: { ...session.ledger, recognitions: session.ledger.recognitions + 1 },
            lastClaim,
          };
        }

        const rejected = new Map(session.known.rejected);
        const prior = rejected.get(action.node) ?? [];
        // The ledger does not move. All that changes is the list of names this
        // node has already refused, and a name it has refused once is not
        // written down twice.
        if (prior.some((p) => p.toLowerCase() === query.toLowerCase())) {
          return { ...session, lastClaim };
        }
        rejected.set(action.node, [...prior, query]);
        return { ...session, known: { ...session.known, rejected }, lastClaim };
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

        // The distance is only computed once the book is settled. Until then a
        // wrong guess says what it always said and no more.
        const hops =
          storyCorrect && !characterCorrect && action.characterIndex !== null
            ? hopsBetween(universe, session.you, action.characterIndex)
            : null;

        const record = {
          universe: action.universe,
          characterQuery: action.characterQuery,
          characterIndex: action.characterIndex,
          storyCorrect,
          characterCorrect,
          hops,
        };
        const guesses = [...session.guesses, record];
        if (storyCorrect && characterCorrect) {
          return { ...session, phase: 'reveal', guesses, lastGuess: record };
        }

        // Right piece, wrong place: you produced a real name from this book and
        // put it on yourself. The person is there on the paper — so they are
        // labelled, free, and you have one fewer stranger to account for.
        let known = session.known;
        if (
          storyCorrect &&
          action.characterIndex !== null &&
          session.known.visible.has(action.characterIndex) &&
          !session.known.named.has(action.characterIndex)
        ) {
          const named = new Map(known.named);
          named.set(action.characterIndex, universe.nodes.find((n) => n.i === action.characterIndex)?.n ?? '');
          const recognised = new Set(known.recognised);
          recognised.add(action.characterIndex);
          const initials = new Map(known.initials);
          initials.delete(action.characterIndex);
          known = { ...known, named, recognised, initials };
        }

        return { ...session, phase: 'guess', known, guesses, lastGuess: record };
      }
      case 'REVEAL':
        return { ...session, phase: 'reveal' };
      default:
        return session;
    }
  };
}
