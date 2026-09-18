interface Props {
  onClose: () => void;
}

const ROWS: Array<{ label: string; gloss: string; cost: string }> = [
  { label: 'Expand', gloss: 'show its neighbours', cost: '1' },
  { label: 'Facts', gloss: 'what is known of them', cost: '2' },
  { label: 'Name', gloss: 'one name, nothing more', cost: '3' },
];

/** Opens over the paper without navigating away — a persistent key, not a tutorial. */
export function KeyOverlay({ onClose }: Props) {

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--paper)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        zIndex: 40,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(720px, 100%)', display: 'flex', flexDirection: 'column', gap: 34 }}
      >
        <div className="chrome">What can I do · opens over the paper, always available</div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {ROWS.map((r) => (
            <div
              key={r.label}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                padding: '13px 0',
                borderBottom: '1px solid var(--rule)',
              }}
            >
              <div className="mono" style={{ fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase' }}>
                {r.label}
              </div>
              <div style={{ fontSize: 17, color: 'var(--body)' }}>
                {r.gloss} &nbsp;·&nbsp; {r.cost}
              </div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 18, lineHeight: 1.7, color: 'var(--body)' }}>
          <div style={{ color: 'var(--ink)' }}>Read the graph.</div>
          <div style={{ marginTop: 18 }}>Larger nodes have more connections.</div>
          <div>Thicker lines mean stronger ties.</div>
          <div style={{ marginTop: 18 }}>Your clues are counted.</div>
          <div>How many will it take to find yourself?</div>
        </div>

        <div>
          <button className="action" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
