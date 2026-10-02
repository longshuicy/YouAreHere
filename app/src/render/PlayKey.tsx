/**
 * What the circles mean, standing over the diagram rather than behind a link.
 *
 * The overlay still exists and still says more, but the four states of a node
 * are the one piece of reference a player needs *while looking at the page* —
 * going to find it breaks the looking. It is small, grey and one line, which
 * is the most a permanent key is allowed to cost.
 */
const SWATCHES: { label: string; fill: string; dim?: boolean }[] = [
  { label: 'You', fill: 'var(--accent)' },
  { label: 'Expanded', fill: 'var(--panel)' },
  { label: 'Seen', fill: 'var(--paper)' },
  { label: 'At the edge', fill: 'var(--paper)', dim: true },
];

export function PlayKey() {
  return (
    <div className="play-key" aria-label="Key">
      {SWATCHES.map((s) => (
        <span key={s.label} style={{ opacity: s.dim ? 0.55 : 1 }}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden focusable="false">
            <circle
              cx="6"
              cy="6"
              r="4.5"
              fill={s.fill}
              stroke={s.label === 'You' ? 'none' : 'var(--unknown)'}
              strokeWidth="1.1"
            />
          </svg>
          {s.label}
        </span>
      ))}
      <span style={{ color: 'var(--unknown)' }}>· Hover anyone to expand them</span>
    </div>
  );
}
