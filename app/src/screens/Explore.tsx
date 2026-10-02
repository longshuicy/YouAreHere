import type { ReactNode } from 'react';
import { Stage } from '../render/Stage';
import { Ledger } from '../render/Ledger';
import { type StartLinks, CHROME_PADDING } from '../render/MarginLinks';
import { TopBar } from '../render/TopBar';
import { PlayKey } from '../render/PlayKey';
import type { VisibleGraph } from '../graph/project';
import type { LaidOutNode } from '../graph/layout';
import type { Session } from '../engine/session';
import { COST, worldIsKnown } from '../engine/session';
import type { Residence } from '../engine/residence';

interface Props {
  graph: VisibleGraph;
  positions: Map<number, LaidOutNode>;
  session: Session;
  residence?: Residence | null;
  onExpand: (i: number) => void;
  onFacts: (i: number) => void;
  onName: (i: number) => void;
  onClaim: (i: number, query: string) => void;
  suggest: (query: string) => string[];
  hasFacts: (i: number) => boolean;
  factLines: Map<number, string>;
  /** Free clue for a visible tie when the player hovers it. */
  edgeLine?: (a: number, b: number) => string | null;
  /** Your place in this world by number of ties, said in words. Free. */
  standing: string;
  onOpenGuess: () => void;
  onOpenKey: () => void;
  onReveal: () => void;
  onRevealStory: () => void;
  onToggleBackground: () => void;
  /** The lab is reachable from every screen; this is the play screen's way in. */
  onOpenGallery: () => void;
  startLinks: StartLinks;
  /** Shown in place of the question line once the story has been guessed right. */
  universeTitle: string;
  worldBlurb: string | null;
}

export function Explore({
  graph,
  positions,
  session,
  residence = null,
  onExpand,
  onFacts,
  onName,
  onClaim,
  suggest,
  hasFacts,
  factLines,
  edgeLine,
  standing,
  onOpenGuess,
  onOpenKey,
  onReveal,
  onRevealStory,
  onToggleBackground,
  onOpenGallery,
  startLinks,
  universeTitle,
  worldBlurb,
}: Props) {
  const worldKnown = worldIsKnown(session);
  // Nothing to hide on a first walk with no residence behind it: the toggle
  // is a control over paper that is not on the stage yet, so it does not
  // show until there is carried-over paper or a horizon count to act on.
  const hasBackground = graph.nodes.some((n) => n.faded || n.horizon) || graph.edges.some((e) => e.faded || e.horizon);

  // The last name earned *in this round*.
  //
  // `session.known.named` is not that: inside a residence it opens already
  // holding every name the map carries, so the latest entry in it is just as
  // likely to be someone named three lives ago. Printing that under "what you
  // know so far" told the player this round had found them, which it had not
  // — and the carried names are already drawn on the diagram, where they
  // belong. What is left is what this walk bought: a name in the session that
  // the map did not already have.
  //
  // Yours is never one of these. It is not a tie of yours, and it arrives in
  // `named` by being answered rather than by being bought.
  let earnedName: string | null = null;
  for (const [i, name] of session.known.named) {
    if (i === session.you) continue;
    if (residence?.named.has(i)) continue;
    earnedName = name;
  }

  return (
    <div style={{ position: 'relative', height: '100dvh', overflow: 'hidden' }}>
      {/* The diagram is the page, not a panel on it — but it stops short of
          the bar. Run to the full height it put nodes and their names under
          the ways on, where a tie crossing a link made both unreadable and
          the link underneath could not be clicked anyway. `--chrome-band` is
          the bar's own height, so the drawing ends exactly where the bar
          does. */}
      <div style={{ position: 'absolute', inset: 0, top: 'var(--chrome-band)' }}>
        <Stage
          graph={graph}
          positions={positions}
          session={session}
          onExpand={onExpand}
          onFacts={onFacts}
          onName={onName}
          onClaim={onClaim}
          suggest={suggest}
          hasFacts={hasFacts}
          onOpenGuess={onOpenGuess}
          factLines={factLines}
          edgeLine={edgeLine}
          hideBackground={session.hideBackground}
        />
      </div>

      {/* Chrome floats over the paper and never takes a click the graph wants. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          padding: CHROME_PADDING,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: 16,
          pointerEvents: 'none',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* The wordmark and the ways on share the left, because they are the
              same thing: who is speaking, and what you can do about it. The
              corner on the right is Elsewhere, as on every other screen. */}
          <TopBar
            inset={false}
            startLinks={startLinks}
            onOpenKey={onOpenKey}
            onOpenLab={onOpenGallery}
          />
          <PlayKey />
        </div>

        <div
          className="stack-sm"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 24 }}
        >
          {/* This corner is about *where* you are, and what the world has told
              you so far. A panel rather than loose text: it sits over a drawing
              now, and prose laid straight on a graph is unreadable the moment a
              tie runs under it. */}
          <div className="play-panel" style={{ width: 'min(440px, 100%)', gap: 14 }}>
            {worldKnown ? (
              <div>
                <div style={{ fontSize: 'clamp(19px, 4.6vw, 30px)', lineHeight: 1.1 }}>{universeTitle}</div>
                {worldBlurb && (
                  <div style={{ fontSize: 'clamp(14px, 3.8vw, 17px)', color: 'var(--body)', marginTop: 8, lineHeight: 1.5 }}>
                    {worldBlurb}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ fontSize: 'clamp(19px, 4.6vw, 30px)', lineHeight: 1.1 }}>
                You don’t know where you are.
              </div>
            )}

            {/* Everything the round has actually told you, kept where it was
                told to you rather than scrolling away as the next thing is
                bought. The free reading is always the first line: it is the
                one the game gives without being asked. */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                borderTop: '1px solid var(--rule)',
                paddingTop: 12,
              }}
            >
              <div className="annot" style={{ fontSize: 9, letterSpacing: '0.2em', color: 'var(--annotation)' }}>
                What you know so far
              </div>
              <KnownRow label="Reading">{standing}</KnownRow>
              {/* Said as something that happened, not as a standing fact: the
                  row is a log of what this walk turned up, and `one of your
                  ties is X` reads as a thing you have always known. */}
              {earnedName && <KnownRow label="Name">You put a name to {earnedName}.</KnownRow>}
            </div>
          </div>

          {/* And this corner is about what it has cost, and the two ways the
              round can end. The count was in the opposite corner from the
              actions that move it; it is now the heading of the panel those
              actions sit in. */}
          <div className="play-panel foot-actions" style={{ width: 'min(360px, 100%)', gap: 12 }}>
            <Ledger ledger={session.ledger} residence={residence} itemised variant="panel" />

            <button className="found-block" onClick={onOpenGuess}>
              <span className="found-word">I’ve found myself</span>
              <span className="found-sub">Free · a wrong guess costs nothing</span>
            </button>

            {/* Two boxes, always. Which two depends on what the round has
                left to offer: the world is only a question until it is
                answered, and there is only carried paper to put away once
                some has been carried. They are the same size and the same
                weight because they are the same kind of thing — a bounded
                choice with a price on it, which is what separates them from
                the free claim above. */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
              {!worldKnown && (
                <button className="outline-button" onClick={onRevealStory}>
                  Reveal world
                  <span className="outline-button-sub">Costs {clues(COST.story)}</span>
                </button>
              )}
              {hasBackground && (
                <button className="outline-button" onClick={onToggleBackground}>
                  {session.hideBackground ? 'Show background' : 'Hide background'}
                  <span className="outline-button-sub">
                    {session.ledger.declutters > 0 ? 'Already paid' : `Costs ${clues(COST.declutter)}`}
                  </span>
                </button>
              )}
              <button className="outline-button" onClick={onReveal}>
                Reveal answer
                <span className="outline-button-sub">Costs {clues(COST.answer)}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

/** A price, in the one unit this game has. Takes a plain number so a cost that
 *  is a literal in the table does not make the comparison look impossible. */
function clues(n: number): string {
  return `${n} ${n === 1 ? 'clue' : 'clues'}`;
}

/** One thing the round has told you: what kind of knowing it was, and what it
 *  said. The label is a fixed column so the sentences line up as a list rather
 *  than a ragged paragraph. */
function KnownRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
      <span
        className="mono"
        style={{
          width: 64,
          flexShrink: 0,
          fontSize: 9,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: 'var(--accent)',
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: 'clamp(15px, 3.8vw, 18px)', fontStyle: 'italic', lineHeight: 1.35 }}>
        {children}
      </span>
    </div>
  );
}
