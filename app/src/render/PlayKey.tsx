/**
 * Which circle is you, and how to move, standing over the diagram rather than
 * behind a link.
 *
 * The overlay still exists and still says more, but these are the one piece of
 * reference a player needs *while looking at the page* — going to find it
 * breaks the looking. It is small, grey and one line, which is the most a
 * permanent key is allowed to cost.
 */
export function PlayKey() {
  return (
    <div className="play-key" aria-label="Key">
      <span>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden focusable="false">
          <circle cx="6" cy="6" r="4.5" fill="var(--accent)" />
        </svg>
        You
      </span>
      <span>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden focusable="false">
          <circle cx="6" cy="6" r="4.5" fill="var(--paper)" stroke="var(--body)" strokeWidth="1.25" />
          <circle cx="6" cy="6" r="1.6" fill="var(--body)" />
        </svg>
        Facts read
      </span>
      <span style={{ color: 'var(--unknown)' }}>· Hover anyone to explore</span>
    </div>
  );
}
