import { CARD_STRIP, DegreeBars, HorizonStrip, StripLabel } from './Fingerprint';
import { DEGREE_BANDS, type WorldMetrics } from './metrics';
import { METRIC_NOTES } from './notes';

const WIDE = 420;

function Band({ label, body }: { label: string; body: string }) {
  return (
    <div style={{ display: 'flex', gap: 16, padding: '9px 0' }}>
      <span
        className="mono"
        style={{
          fontSize: 8.5,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: 'var(--unknown)',
          width: 96,
          flexShrink: 0,
          paddingTop: 3,
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: 15, color: 'var(--body)', lineHeight: 1.55 }}>{body}</span>
    </div>
  );
}

/**
 * How to read a card, shown on a real one rather than described.
 *
 * The first version of this was a list of sentences at the foot of the page,
 * which is where an explanation goes to be ignored — the reader has to hold a
 * paragraph in mind and walk back up to the drawing it describes. Here the
 * drawing is the explanation, at the size it is legible, with its bands named.
 */
export function Explain({ sample }: { sample: WorldMetrics | null }) {
  const bandWidth = WIDE / DEGREE_BANDS.length;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))', gap: 40 }}>
      <div>
        <StripLabel left="Ties each" right="Few → many" width={WIDE} size={8.5} />
        {sample && <DegreeBars histogram={sample.degreeHistogram} width={WIDE} height={30} />}
        <svg
          viewBox={`0 0 ${WIDE} 14`}
          aria-hidden
          style={{ display: 'block', width: '100%', maxWidth: WIDE, height: 'auto' }}
        >
          {DEGREE_BANDS.map(([low, high], i) => (
            <text
              key={i}
              x={Math.min(WIDE - 13, Math.max(13, i * bandWidth + bandWidth / 2))}
              y={10}
              textAnchor="middle"
              style={{ font: '8.5px var(--mono)', fill: 'var(--unknown)', letterSpacing: '0.06em' }}
            >
              {high === Infinity ? `${low}+` : `${low}–${high}`}
            </text>
          ))}
        </svg>
        <div style={{ fontSize: 15, color: 'var(--body)', lineHeight: 1.55, paddingTop: 12 }}>
          How many people each character appears with, in fixed bands. Weight to the left is a cast
          of bit-players around a few principals; weight to the right is a world where nearly
          everyone meets nearly everyone.
        </div>
      </div>

      <div>
        <StripLabel left="Horizon" right="One tick per character" width={WIDE} size={8.5} />
        {sample && <HorizonStrip world={sample} width={WIDE} height={30} labelMarks />}
        <div style={{ fontSize: 15, color: 'var(--body)', lineHeight: 1.55, paddingTop: 12 }}>
          Where each character stands, by how much their second ring multiplies their first. At{' '}
          <span className="mono" style={{ fontSize: 13 }}>1×</span> they already see everyone — that
          is where protagonists sit. Far right is someone with a couple of ties and most of the
          story standing behind them.
        </div>
      </div>

      <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--rule)', paddingTop: 6 }}>
        <Band label="Concentration" body={`${METRIC_NOTES.concentration.measures} 0 is a perfect ensemble, 1 is one person and a crowd of extras. Blind to: ${METRIC_NOTES.concentration.blind}`} />
        <Band label="Camps" body={`${METRIC_NOTES.camps.measures} Blind to: ${METRIC_NOTES.camps.blind}`} />
        <Band label="Outermost" body={`The furthest character's horizon divided by a typical one's. Blind to: ${METRIC_NOTES.horizon.blind}`} />
        <div className="annot" style={{ fontSize: 9, paddingTop: 10, lineHeight: 1.8 }}>
          Every scale is fixed, so two cards are a comparison rather than a texture. Nothing here is
          stored — it is computed from the graphs each time, so a new book changes no figure that was
          already right.
        </div>
      </div>
    </div>
  );
}

export { CARD_STRIP };
