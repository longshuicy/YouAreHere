import { Stage } from '../render/Stage';
import { Ledger } from '../render/Ledger';
import type { StartLinks } from '../render/MarginLinks';
import { TopBar } from '../render/TopBar';
import { PlayKey } from '../render/PlayKey';
import { KnownLog } from '../render/KnownLog';
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

  return (
    <div className="play-root">
      {/* The wordmark and the ways on share the left, because they are the
          same thing: who is speaking, and what you can do about it. The
          corner on the right is Elsewhere, as on every other screen. */}
      <TopBar startLinks={startLinks} onOpenKey={onOpenKey} onOpenLab={onOpenGallery} />

      <div className="play-cols">
        {/* The side column is about the round: where you are, what the world
            has told you, what it has cost, and the ways it can end. Read top
            to bottom. */}
        <aside className="play-info">
          {worldKnown ? (
            <div>
              <div className="play-side-title">{universeTitle}</div>
              {worldBlurb && (
                <div style={{ fontSize: 15, color: 'var(--body)', marginTop: 8, lineHeight: 1.5 }}>{worldBlurb}</div>
              )}
            </div>
          ) : (
            <div className="play-side-title">You don’t know where you are.</div>
          )}

          {/* Everything the round has actually told you, kept where it was
              told to you rather than scrolling away as the next thing is
              bought. */}
          <KnownLog graph={graph} session={session} standing={standing} />

          {/* The tally heads the buttons that move it. */}
          <div className="play-side-foot">
            <Ledger ledger={session.ledger} residence={residence} itemised variant="panel" />

            <button className="found-block" onClick={onOpenGuess}>
              <span className="found-word">I’ve found myself</span>
              <span className="found-sub">Free · a wrong guess costs nothing</span>
            </button>

            {/* Which of these depends on what the round has left to offer: the
                world is only a question until it is answered, and there is
                only carried paper to put away once some has been carried.
                Outlined rather than filled: a bounded choice with a price on
                it, not the claim above them. */}
            {/* Kept once the world is known, greyed out rather than removed:
                a button that vanished moved everything above it, the claim
                included, out from under the pointer. */}
            <button className="outline-button priced" onClick={onRevealStory} disabled={worldKnown}>
              Reveal world
              <span className="outline-button-sub">
                {!worldKnown ? `Costs ${clues(COST.story)}` : session.storyRevealed ? 'Already paid' : 'Already known'}
              </span>
            </button>
            {hasBackground && (
              <button className="outline-button priced" onClick={onToggleBackground}>
                {session.hideBackground ? 'Show background' : 'Hide background'}
                <span className="outline-button-sub">
                  {session.ledger.declutters > 0 ? 'Already paid' : `Costs ${clues(COST.declutter)}`}
                </span>
              </button>
            )}
            <button className="outline-button priced" onClick={onReveal}>
              Reveal answer
              <span className="outline-button-sub">Costs {clues(COST.answer)}</span>
            </button>
          </div>
        </aside>

        {/* The diagram takes the rest. It used to run under floating panels,
            where a tie crossing a line of prose made both unreadable; now
            nothing is laid over it but the key and the node menu. */}
        <div className="play-stage">
          <div style={{ position: 'absolute', inset: 0 }}>
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
          <div className="play-stage-key">
            <PlayKey />
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
