import { COST, RECOGNITION_REFUND } from '../engine/session';

interface Props {
  onClose: () => void;
}

const ROWS: Array<{ label: string; gloss: string; cost: string }> = [
  { label: 'Expand', gloss: 'their neighbours, and their initial', cost: '1' },
  { label: 'Facts', gloss: 'what is known of them', cost: '2' },
  { label: 'Name', gloss: 'one name, nothing more', cost: '3' },
  // Not attached to a node like the others — it is about the world, so it lives
  // in the margin. Listed here all the same, because a price that is only
  // discoverable by paying it is not a price.
  { label: 'Reveal world', gloss: 'which world this is', cost: '2' },
  // The dearest thing on the table, and listed like everything else, because a
  // price that is only discoverable by paying it is not a price.
  { label: 'Reveal answer', gloss: 'who you are, told to you', cost: `${COST.answer}` },
  // The only row that can pay you, and the only one that can never charge you.
  // Listed last because it is not a purchase in either direction.
  { label: 'Claim', gloss: 'say who they are', cost: `-${RECOGNITION_REFUND}` },
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
        // The key is taller than a phone once the rows wrap, so it scrolls
        // rather than running off the bottom with Close below the fold.
        overflowY: 'auto',
        padding: 'max(24px, var(--pad-top)) var(--pad-x)',
        zIndex: 40,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(720px, 100%)',
          margin: 'auto 0',
          display: 'flex',
          flexDirection: 'column',
          gap: 'clamp(22px, 4vh, 34px)',
        }}
      >
        {/* The one chrome line long enough to need two of them on a phone. */}
        <div className="chrome" style={{ whiteSpace: 'normal', lineHeight: 1.7 }}>
          What can I do · opens over the paper, always available
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {ROWS.map((r) => (
            <div
              key={r.label}
              className="key-row"
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
              <div style={{ fontSize: 'clamp(14px, 3.8vw, 17px)', color: 'var(--body)' }}>
                {r.gloss} &nbsp;·&nbsp; {r.cost}
              </div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 'clamp(15px, 4vw, 18px)', lineHeight: 1.7, color: 'var(--body)' }}>
          <div style={{ color: 'var(--ink)' }}>Read the graph.</div>
          <div style={{ marginTop: 18 }}>Larger nodes are in more of the world.</div>
          <div>Thicker lines mean stronger ties.</div>
          <div>An expanded node keeps its initial, and a rule as long as its name.</div>
          <div style={{ marginTop: 18, color: 'var(--ink)' }}>Guessing is free, and it answers back.</div>
          <div>Name anyone and you are told how far from you they stand.</div>
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
