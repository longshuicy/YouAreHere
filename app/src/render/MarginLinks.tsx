interface Props {
  onOpenKey: () => void;
  /** Absent before the game starts and at the reveal, where there is nothing left to give up. */
  onReveal?: () => void;
}

/**
 * The right margin holds everything *about* the session rather than in it: what
 * may still be bought, what the actions are, and the way out. They sit in one
 * list with one spacing — a cluster of right-aligned links with uneven gaps
 * reads as three separate things that happen to be near each other.
 */
export function MarginLinks({ onOpenKey, onReveal }: Props) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 8,
        pointerEvents: 'auto',
      }}
    >
      <button className="annot-link" onClick={onOpenKey}>
        What can I do
      </button>
      {onReveal && (
        <button className="annot-link" onClick={onReveal}>
          Reveal answer
        </button>
      )}
    </div>
  );
}
