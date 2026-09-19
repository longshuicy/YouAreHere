import { Stage } from '../render/Stage';
import { Ledger, LedgerBreakdown } from '../render/Ledger';
import { BrandCluster, CHROME_PADDING, GiveUpLinks, HelpLink } from '../render/MarginLinks';
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
  onClaim: (i: number, query: string) => void;
  suggest: (query: string) => string[];
  hasFacts: (i: number) => boolean;
  factLines: Map<number, string>;
  /** Your place in this world by number of ties, said in words. Free. */
  standing: string;
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
  onClaim,
  suggest,
  hasFacts,
  factLines,
  standing,
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
    <div style={{ position: 'relative', height: '100dvh', overflow: 'hidden' }}>
      {/* The diagram is the page, not a panel on it. */}
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
          pointerEvents: 'none',
        }}
      >
        <div className="chrome-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <BrandCluster onStartAgain={onStartAgain} />
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 'clamp(12px, 4vw, 28px)' }}>
            <Ledger ledger={session.ledger} />
            <HelpLink onOpenKey={onOpenKey} />
          </div>
        </div>

        <div
          className="stack-sm"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 24 }}
        >
          {/* This corner is about *where* you are. */}
          <div style={{ maxWidth: 520 }}>
            {worldKnown ? (
              <>
                <div style={{ fontSize: 'clamp(17px, 4.6vw, 21px)' }}>{universeTitle}</div>
                {worldBlurb && (
                  <div style={{ fontSize: 'clamp(14px, 3.8vw, 17px)', color: 'var(--body)', marginTop: 6, lineHeight: 1.5 }}>
                    {worldBlurb}
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: 'clamp(17px, 4.6vw, 21px)', color: 'var(--body)' }}>
                You don’t know where you are.
              </div>
            )}
            <div
              style={{
                fontSize: 'clamp(14px, 3.8vw, 17px)',
                color: 'var(--body)',
                marginTop: 10,
                fontStyle: 'italic',
              }}
            >
              {standing}
            </div>
          </div>
          {/* Win path first; give-up sits under it, same corner, quieter. */}
          <div
            className="foot-actions"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: 10,
            }}
          >
            <button
              className="action"
              onClick={onOpenGuess}
              style={{
                pointerEvents: 'auto',
                whiteSpace: 'nowrap',
                fontSize: 'clamp(12px, 3.4vw, 15px)',
                letterSpacing: 'clamp(0.16em, 1vw, 0.3em)',
                color: 'var(--accent)',
                borderBottom: '2px solid var(--accent)',
                padding: '16px 10px 12px 10px',
              }}
            >
              I've found myself
            </button>
            <GiveUpLinks
              onReveal={onReveal}
              onRevealStory={worldKnown ? undefined : onRevealStory}
            />
          </div>
        </div>
      </div>

      {/* Itemised tally only — exits no longer live here. */}
      <div
        style={{
          position: 'absolute',
          right: 'var(--pad-x)',
          top: 'calc(var(--pad-top) + 36px)',
        }}
      >
        <LedgerBreakdown ledger={session.ledger} />
      </div>
    </div>
  );
}
