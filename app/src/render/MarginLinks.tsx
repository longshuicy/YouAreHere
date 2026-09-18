interface Props {
  onOpenKey: () => void;
  /** Absent before the game starts and at the reveal, where there is nothing left to give up. */
  onReveal?: () => void;
  /** Half an answer: which story, leaving who you are still open. Absent once
   * the world is known by any route, because then there is nothing to tell. */
  onRevealStory?: () => void;
  /** A new stranger somewhere else. Offered on every screen, because wanting out
   * of a waking is not something that only happens once you have finished it. */
  onStartAgain?: () => void;
}

/**
 * The right margin holds everything *about* the session rather than in it: what
 * may still be bought, what the actions are, and the way out. They sit in one
 * list with one spacing — a cluster of right-aligned links with uneven gaps
 * reads as three separate things that happen to be near each other.
 */
export function MarginLinks({ onOpenKey, onReveal, onRevealStory, onStartAgain }: Props) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        // Enough air that the rule under one link is not mistaken for the top of
        // the next. The links carry their own padding for a hit area, so this is
        // the gap between targets rather than between glyphs.
        gap: 10,
        pointerEvents: 'auto',
      }}
    >
      <button className="annot-link" onClick={onOpenKey}>
        What can I do
      </button>
      {onRevealStory && (
        <button className="annot-link" onClick={onRevealStory}>
          Which story is this
        </button>
      )}
      {onReveal && (
        <button className="annot-link" onClick={onReveal}>
          Reveal answer
        </button>
      )}
      {onStartAgain && (
        <button className="annot-link" onClick={onStartAgain}>
          Start again
        </button>
      )}
    </div>
  );
}
