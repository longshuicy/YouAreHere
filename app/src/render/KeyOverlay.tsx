import { useEffect, useRef, type ReactNode } from 'react';
import { COST, RECOGNITION_REFUND, type ActionKey } from '../engine/session';
import type { VisibleEdge, VisibleNode } from '../graph/project';
import type { LaidOutNode } from '../graph/layout';
import { bearingFor, GuessInput } from '../screens/Guess';
import { CHROME_PADDING, type StartLinks } from './MarginLinks';
import { GLOSS, MenuCard, MenuPrimary, MenuRow } from './NodeMenu';
import { TopBar } from './TopBar';
import { Edges } from './Edges';
import { Nodes } from './Nodes';
import { Labels } from './Labels';
import { nodeRadius } from './scales';

interface Props {
  onClose: () => void;
  startLinks?: StartLinks;
  onOpenLab?: () => void;
}

const ACTIONS: ActionKey[] = ['expand', 'facts', 'name'];

/**
 * Opens over the paper without navigating away — a persistent key, not a
 * tutorial.
 *
 * Every control on it is the real one, drawn inert: the menu rows are the node
 * menu's, the field is the guess screen's, the circles and ties are drawn by
 * the same renderer as the map. A key that redrew them would drift from the
 * game the first time either changed.
 */
export function KeyOverlay({ onClose, startLinks, onOpenLab }: Props) {
  const pageRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    // Taken from whatever was focused underneath, so Escape here never also
    // reaches the guess field's own Escape.
    pageRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const closeThen = (go: () => void) => () => {
    onClose();
    go();
  };
  const links: StartLinks | undefined = startLinks && {
    ...startLinks,
    onStartAgain: closeThen(startLinks.onStartAgain),
    onStartHere: closeThen(startLinks.onStartHere),
    onChooseWorld: closeThen(startLinks.onChooseWorld),
  };

  return (
    <div
      ref={pageRef}
      tabIndex={-1}
      role="dialog"
      aria-label="How to play"
      className="key-page"
      style={{ padding: CHROME_PADDING }}
    >
      <TopBar
        inset={false}
        startLinks={links}
        onOpenKey={onClose}
        keyOpen
        onOpenLab={onOpenLab && closeThen(onOpenLab)}
      />

      <div className="key-cols">
        <section className="key-col">
          <h1 style={{ margin: 0, fontWeight: 400, fontSize: 'clamp(30px, 4vw, 40px)', lineHeight: 1.1 }}>
            Find yourself in as few clues as you can.
          </h1>
          <p className="key-prose" style={{ margin: 0 }}>
            You wake as someone in a story, with no name. Around you are the people you know. Work out who you are.
          </p>

          <div style={{ fontSize: 19, color: 'var(--ink)', marginTop: 8 }}>Guessing is free, and it answers back.</div>
          {/* A wrong guess as the guess screen draws one, once the world is right. */}
          <div className="play-panel" inert style={{ gap: 10, border: '1px solid var(--rule)' }}>
            <div style={{ fontSize: 22, lineHeight: 1.1 }}>Not this person.</div>
            <div>
              <GuessInput rejected="Hermione Granger" hint={false} value="" readOnly aria-label="An example guess" />
            </div>
            <div style={{ fontSize: 16, color: 'var(--body)' }}>
              {bearingFor({ characterIndex: 0, hops: 2 })}
            </div>
          </div>

          <p className="key-prose" style={{ margin: 0 }}>
            Your clues are counted. How many will it take?
          </p>
        </section>

        <section className="key-col">
          <h2 className="chrome key-head">What you can do</h2>

          <KeyGroup label="On your own circle">
            <button className="found-block">
              <span className="found-word">I’ve found myself</span>
              <span className="found-sub">Free · a wrong guess costs nothing</span>
            </button>
            <Gloss>Say who you are.</Gloss>
          </KeyGroup>

          <KeyGroup label="On anyone else’s">
            <MenuCard>
              <div style={{ borderBottom: '1px solid var(--rule)' }}>
                <MenuPrimary tinted label="claim" note={`${RECOGNITION_REFUND} back if right`} />
              </div>
              {ACTIONS.map((a, idx) => (
                <MenuRow key={a} verb={a} gloss={GLOSS[a]} price={COST[a]} ruled={idx < ACTIONS.length - 1} />
              ))}
            </MenuCard>
            <Gloss>
              Hover anyone on the map. Claim says who they are, and costs nothing; the rest is learned about them.
            </Gloss>
          </KeyGroup>

          <KeyGroup label="About the world">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
              <button className="outline-button">
                Reveal world
                <span className="outline-button-sub">Costs {clues(COST.story)}</span>
              </button>
              <button className="outline-button">
                Show background
                <span className="outline-button-sub">Costs {clues(COST.declutter)}</span>
              </button>
              <button className="outline-button">
                Reveal answer
                <span className="outline-button-sub">Costs {clues(COST.answer)}</span>
              </button>
            </div>
            <Gloss>The background is what earlier lives in this world already opened.</Gloss>
          </KeyGroup>
        </section>

        <section className="key-col">
          <h2 className="chrome key-head">Reading the map</h2>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {LEGEND.map((l) => (
              <div key={l.text} className="key-legend">
                <Figure {...l} />
                <div className="key-prose">{l.text}</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'center' }}>
        <button type="button" className="guess-back" onClick={onClose}>
          <span style={{ borderBottom: '1px solid var(--leader)' }}>Back to the map</span>
          <span style={{ color: 'var(--unknown)' }}>Esc</span>
        </button>
      </div>
    </div>
  );
}

/** One kind of move: what it is offered on, and the control that offers it.
 *  Inert, because pressing a control on the key would be pressing it in a
 *  game that is not on screen. */
function KeyGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="annot" style={{ fontSize: 9, letterSpacing: '0.2em', color: 'var(--annotation)' }}>
        {label}
      </div>
      <div inert style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {children}
      </div>
    </div>
  );
}

function Gloss({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 15, lineHeight: 1.45, color: 'var(--body)' }}>{children}</div>;
}

function clues(n: number): string {
  return `${n} ${n === 1 ? 'clue' : 'clues'}`;
}

const node = (i: number, extra: Partial<VisibleNode> = {}): VisibleNode => ({
  i,
  isYou: false,
  presence: 0.4,
  expanded: false,
  name: null,
  monogram: null,
  recognised: false,
  rejected: [],
  hop: 1,
  ...extra,
});

const tie = (source: number, target: number, strength: number, weight = 1): VisibleEdge => ({
  source,
  target,
  strength,
  weight,
});

interface Glyph {
  text: string;
  nodes: VisibleNode[];
  edges: VisibleEdge[];
  /** Where each end sits, in the figure's own pixels about its centre. Ends
   *  with no node drawn are where a tie runs off the figure. */
  at: Record<number, [number, number]>;
  lit?: string[];
}

const LEGEND: Glyph[] = [
  {
    text: 'Larger nodes are in more of the world.',
    nodes: [node(0, { presence: 0 }), node(1, { presence: 1 })],
    edges: [tie(0, 1, 0)],
    at: { 0: [-22, 0], 1: [16, 0] },
  },
  {
    text: 'Thicker lines mean stronger ties.',
    nodes: [],
    edges: [tie(0, 1, 0), tie(2, 3, 1)],
    at: { 0: [-30, -6], 1: [30, -6], 2: [-30, 6], 3: [30, 6] },
  },
  {
    text: 'Hover a tie to read what the two share.',
    nodes: [node(0), node(1)],
    edges: [tie(0, 1, 0.7, 48)],
    at: { 0: [-24, 6], 1: [24, 6] },
    lit: ['0-1'],
  },
  {
    text: 'An expanded node keeps its initial, and a rule as long as its name.',
    nodes: [node(0, { expanded: true, monogram: { initial: 'L', length: 6 } })],
    edges: [tie(0, 1, 0.3)],
    at: { 0: [-16, -9], 1: [32, -9] },
  },
  {
    text: 'The red node is you.',
    nodes: [node(0, { isYou: true, hop: 0 })],
    edges: [],
    at: { 0: [0, 0] },
  },
];

const FIG_W = 72;
const FIG_H = 44;
const noop = () => {};

/** A legend entry drawn by the map's own renderer, so the key cannot show a
 *  circle or a tie the game does not draw. */
function Figure({ nodes, edges, at, lit }: Glyph) {
  const positions = new Map<number, LaidOutNode>(
    Object.entries(at).map(([i, [x, y]]) => [Number(i), { i: Number(i), x, y, ring: 0 }]),
  );
  const byIndex = new Map(nodes.map((n) => [n.i, n]));
  // A tie whose end has no circle runs all the way to it.
  const radiusOf = (i: number) => {
    const n = byIndex.get(i);
    if (!n) return -1.5;
    return n.isYou ? 8.5 : nodeRadius(n.presence);
  };
  return (
    <svg
      width={FIG_W}
      height={FIG_H}
      viewBox={`${-FIG_W / 2} ${-FIG_H / 2} ${FIG_W} ${FIG_H}`}
      style={{ overflow: 'visible', flexShrink: 0 }}
      aria-hidden
      focusable="false"
    >
      <Edges
        edges={edges}
        positions={positions}
        you={-1}
        radiusOf={radiusOf}
        animate={false}
        lit={lit ? new Set(lit) : undefined}
      />
      <Nodes
        nodes={nodes}
        positions={positions}
        hovered={null}
        onHover={noop}
        onPointerDown={noop}
        onPointerMove={noop}
        onPointerUp={noop}
        maxHop={2}
        interactive={false}
        animate={false}
      />
      <Labels nodes={nodes} positions={positions} animate={false} />
    </svg>
  );
}
