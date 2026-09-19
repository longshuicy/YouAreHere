/** Shared page inset so the brand mark does not jump when the screen changes.
 *  A screen may override only the bottom; top and sides stay put.
 *  The values are tokens rather than literals so a phone gets its own, narrower
 *  margins from one place in index.css. */
export const CHROME_PADDING = 'var(--pad-top) var(--pad-x) var(--pad-bottom) var(--pad-x)';

/**
 * Chrome zones:
 * 1. Identity — the wordmark, with start-again as a quiet action beside it
 * 2. Reference — "What can I do" in the top-right
 * 3. Give-up — next to the screen's primary action, never labeled
 */

/** The product name. Serif and ink — the narrative voice, not a chrome label. */
export function BrandMark() {
  return <div className="brand">You are here.</div>;
}

/** Wordmark plus a quieter restart, so the name is not itself a hidden button. */
export function BrandCluster({ onStartAgain }: { onStartAgain: () => void }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 22,
        pointerEvents: 'auto',
      }}
    >
      <BrandMark />
      <button type="button" className="annot-link" onClick={onStartAgain}>
        Start again
      </button>
    </div>
  );
}

/** Persistent help — the only thing in the top-right reference slot. */
export function HelpLink({ onOpenKey }: { onOpenKey: () => void }) {
  return (
    <button
      type="button"
      className="annot-link"
      onClick={onOpenKey}
      style={{ pointerEvents: 'auto' }}
    >
      What can I do
    </button>
  );
}

/** Paid spoil and give-up, as a quiet pair. No heading — the placement is the hierarchy. */
export function GiveUpLinks({
  onReveal,
  onRevealStory,
}: {
  onReveal?: () => void;
  onRevealStory?: () => void;
}) {
  if (!onReveal && !onRevealStory) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 22,
        pointerEvents: 'auto',
      }}
    >
      {onRevealStory && (
        <button type="button" className="annot-link" onClick={onRevealStory}>
          Which story is this
        </button>
      )}
      {onReveal && (
        <button type="button" className="annot-link" onClick={onReveal}>
          Reveal answer
        </button>
      )}
    </div>
  );
}
