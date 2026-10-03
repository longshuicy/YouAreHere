import type { ReactNode } from 'react';

/**
 * Paper on the left, the network on the right, half the page each.
 *
 * The reveal, a character page and a world page are all this, so the network
 * is drawn in one frame everywhere: pinned to the right half below the bar,
 * full height, with nothing boxed around it. Only what goes in the two columns
 * differs.
 */
export function SplitPage({
  graph,
  graphNote,
  legend = false,
  head,
  belowHead,
  children,
  chrome,
  chromeExtra = 0,
}: {
  /** The network, filling the right half. */
  graph: ReactNode;
  /** A line set over the foot of the network, saying why it is drawn as it is. */
  graphNote?: ReactNode;
  /** The key to the accent ties over `graphNote`. Only where there is a "you"
   *  for the accent to mean. */
  legend?: boolean;
  /** Stays put at the top of the left column. */
  head: ReactNode;
  /** Full width of the left column, between the head and the scrolling body. */
  belowHead?: ReactNode;
  /** Scrolls under the head. */
  children: ReactNode;
  /** A whole bar, laid over both columns. */
  chrome?: ReactNode;
  /** Extra height `chrome` takes beyond the bar itself — the lab's tabs, laid
   *  under the bar — so the graph and the copy start clear of it instead of
   *  under it. Zero everywhere `chrome` is just the bar. */
  chromeExtra?: number;
}) {
  return (
    <div
      className="reveal-root"
      style={{ position: 'relative', height: '100dvh', overflow: 'hidden', background: 'var(--paper)' }}
    >
      <div
        className="reveal-graph"
        style={chromeExtra ? { top: `calc(var(--chrome-band) + ${chromeExtra}px)` } : undefined}
      >
        {graph}
        {/* Free-floating in the graph's own corner, not a caption boxed off
            by a rule and a paper backing — the design sets it loose under a
            small legend, both in the annotation grey, with nothing drawn
            between them and the diagram they describe. */}
        {graphNote && (
          <div
            style={{
              position: 'absolute',
              left: 24,
              bottom: 18,
              maxWidth: 420,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              pointerEvents: 'none',
            }}
          >
            {legend && (
              <div
                className="mono"
                style={{
                  display: 'flex',
                  gap: 20,
                  fontSize: 9,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: 'var(--annotation)',
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ display: 'block', width: 18, height: 2, background: 'var(--accent)' }} />
                  Discovered
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ display: 'block', width: 18, height: 1, background: 'var(--tie-strong)' }} />
                  Not yet discovered
                </span>
              </div>
            )}
            <div style={{ fontSize: 15, lineHeight: 1.4, color: 'var(--annotation)', fontStyle: 'italic' }}>
              {graphNote}
            </div>
          </div>
        )}
      </div>

      <div
        className="reveal-copy"
        style={chromeExtra ? { paddingTop: `calc(var(--chrome-band) + ${chromeExtra}px + 32px)` } : undefined}
      >
        {head}
        {belowHead}
        <div className="reveal-sections">{children}</div>
      </div>

      {/* Chrome overlays both columns so it does not steal a header row. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          padding: 'var(--pad-top) var(--pad-x) 0 var(--pad-x)',
          // Over a stacked, scrolling page the chrome would otherwise sit at the
          // top of the *document* and scroll away with the graph.
          height: 'fit-content',
          pointerEvents: 'none',
        }}
      >
        {chrome}
      </div>
    </div>
  );
}
