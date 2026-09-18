import { Stage } from '../render/Stage';
import { Ledger, LedgerBreakdown } from '../render/Ledger';
import { BrandMark, MarginLinks } from '../render/MarginLinks';
import type { VisibleGraph } from '../graph/project';
import type { LaidOutNode } from '../graph/layout';
import type { Session } from '../engine/session';
import { worldIsKnown } from '../engine/session';

interface Props {
  graph: VisibleGraph;
  positions: Map<number, LaidOutNode>;
  session: Session;
  onExpand: (i: number) => void;
  onFacts: (i: number) => void;
  onName: (i: number) => void;
  factLines: Map<number, string>;
  onOpenGuess: () => void;
  onOpenKey: () => void;
  onReveal: () => void;
  onRevealStory: () => void;
  onStartAgain: () => void;
  /** Shown in place of the question line once the story has been guessed right. */
  universeTitle: string;
  worldBlurb: string | null;
}

export function Explore({
  graph,
  positions,
  session,
  onExpand,
  onFacts,
  onName,
  factLines,
  onOpenGuess,
  onOpenKey,
  onReveal,
  onRevealStory,
  onStartAgain,
  universeTitle,
  worldBlurb,
}: Props) {
  const worldKnown = worldIsKnown(session);

  return (
    <div style={{ position: 'relative', height: '100vh', overflow: 'hidden' }}>
      {/* The diagram is the page, not a panel on it. */}
      <div style={{ position: 'absolute', inset: 0 }}>
        <Stage
          graph={graph}
          positions={positions}
          session={session}
          onExpand={onExpand}
          onFacts={onFacts}
          onName={onName}
          onOpenGuess={onOpenGuess}
          factLines={factLines}
        />
      </div>

      {/* Chrome floats over the paper and never takes a click the graph wants. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          padding: '44px 64px 56px 64px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          pointerEvents: 'none',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <BrandMark onStartAgain={onStartAgain} />
          <Ledger ledger={session.ledger} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 24 }}>
          {/* This corner is about *where* you are. It fills itself the moment
              the player names the story correctly — which is free, and which
              they were going to do anyway. */}
          <div style={{ maxWidth: 520 }}>
            {worldKnown ? (
              <>
                <div style={{ fontSize: 21 }}>{universeTitle}</div>
                {worldBlurb && (
                  <div style={{ fontSize: 17, color: 'var(--body)', marginTop: 6, lineHeight: 1.5 }}>
                    {worldBlurb}
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: 21, color: 'var(--body)' }}>You don’t know where you are.</div>
            )}
          </div>
          {/* The one action that ends the run: given the accent, a heavier rule
              and more air than anything else on the screen. */}
          <button
            className="action"
            onClick={onOpenGuess}
            style={{
              pointerEvents: 'auto',
              whiteSpace: 'nowrap',
              fontSize: 15,
              letterSpacing: '0.3em',
              color: 'var(--accent)',
              borderBottom: '2px solid var(--accent)',
              padding: '16px 10px 12px 10px',
            }}
          >
            I've found myself
          </button>
        </div>
      </div>

      {/* The right margin: everything about the session rather than in it —
          the itemised tally, what else can be bought, and the way out. */}
      <div
        style={{
          position: 'absolute',
          right: 64,
          top: 92,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 18,
        }}
      >
        <LedgerBreakdown ledger={session.ledger} />
        <MarginLinks
              onOpenKey={onOpenKey}
              onReveal={onReveal}
              onRevealStory={worldIsKnown(session) ? undefined : onRevealStory}
            />
      </div>
    </div>
  );
}
