import { DEGREE_BANDS, GAIN_AXIS, type WorldMetrics } from './metrics';
import { noteTooltip as tooltip } from './notes';

/** Fixed log placement, so a tick means the same thing on every card. */
function gainToX(gain: number, width: number): number {
  const clamped = Math.min(GAIN_AXIS.max, Math.max(GAIN_AXIS.min, gain));
  return (Math.log(clamped) / Math.log(GAIN_AXIS.max)) * width;
}

const STRIP_WIDTH = 252;

/** The strip's own caption. Without one the two panels read as a single grey
 * block — the ticks look like noise under the bars rather than a second figure
 * measuring something entirely different. */
function StripLabel({ left, right }: { left: string; right?: string }) {
  return (
    <div
      className="mono"
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: 7.5,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color: 'var(--unknown)',
        width: STRIP_WIDTH,
        paddingBottom: 3,
      }}
    >
      <span>{left}</span>
      {right && <span>{right}</span>}
    </div>
  );
}

function DegreeBars({ histogram }: { histogram: number[] }) {
  const peak = Math.max(...histogram, 1);
  const barWidth = STRIP_WIDTH / DEGREE_BANDS.length;
  const height = 20;
  return (
    <svg width={STRIP_WIDTH} height={height + 1} aria-hidden style={{ display: 'block' }}>
      {histogram.map((count, i) => {
        // Scaled to the world's own tallest band: the panel is the *shape* of the
        // distribution, and a world's cast size is already said elsewhere.
        const h = (count / peak) * height;
        return (
          <rect
            key={i}
            x={i * barWidth + 1}
            y={height - h}
            width={barWidth - 2}
            height={h}
            fill="var(--unknown)"
            opacity={0.55}
          />
        );
      })}
      <line x1={0} y1={height + 0.5} x2={STRIP_WIDTH} y2={height + 0.5} stroke="var(--rule)" strokeWidth={1} />
    </svg>
  );
}

function HorizonStrip({ world }: { world: WorldMetrics }) {
  const height = 22;
  const base = height - 5.5;
  return (
    <svg width={STRIP_WIDTH} height={height} aria-hidden style={{ display: 'block' }}>
      <line x1={0} y1={base} x2={STRIP_WIDTH} y2={base} stroke="var(--rule)" strokeWidth={1} />
      {[1, 10, 100].map((mark) => (
        <line
          key={mark}
          x1={Math.min(STRIP_WIDTH - 0.5, Math.max(0.5, gainToX(mark, STRIP_WIDTH)))}
          y1={base}
          x2={Math.min(STRIP_WIDTH - 0.5, Math.max(0.5, gainToX(mark, STRIP_WIDTH)))}
          y2={base + 4}
          stroke="var(--leader)"
          strokeWidth={1}
        />
      ))}
      {/* Ticks overprint, so a crowd at one value darkens rather than stacking —
          the same way repeated impressions darken ink. */}
      {world.characters
        .filter((c) => c.degree > 0)
        .map((c) => (
          <line
            key={c.i}
            x1={gainToX(c.gain, STRIP_WIDTH)}
            y1={1}
            x2={gainToX(c.gain, STRIP_WIDTH)}
            y2={base - 1.5}
            stroke="var(--tie-strong)"
            strokeWidth={1}
            opacity={0.5}
          />
        ))}
    </svg>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }} title={note}>
      <span className="mono" style={{ fontSize: 7.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--unknown)' }}>
        {label}
      </span>
      <span className="mono" style={{ fontSize: 12, letterSpacing: '0.04em', color: 'var(--body)' }}>
        {value}
      </span>
    </div>
  );
}

interface Props {
  world: WorldMetrics;
  onOpen: (id: string) => void;
}

export function Fingerprint({ world, onOpen }: Props) {
  return (
    <button
      onClick={() => onOpen(world.id)}
      aria-label={`${world.title} — cast of ${world.nodes}, ${world.communities} camps`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        alignItems: 'flex-start',
        textAlign: 'left',
        width: '100%',
        padding: '0 0 22px 0',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--serif)',
          fontSize: 17,
          lineHeight: 1.15,
          color: 'var(--ink)',
          minHeight: 40,
        }}
      >
        {world.title}
      </div>

      <div title={tooltip('ties')}>
        <StripLabel left="Ties each" right="Few → many" />
        <DegreeBars histogram={world.degreeHistogram} />
      </div>
      <div title={tooltip('horizon')} style={{ paddingTop: 4 }}>
        <StripLabel left="Horizon" right="1× → 100×" />
        <HorizonStrip world={world} />
      </div>

      <div style={{ display: 'flex', gap: 18, paddingTop: 4 }}>
        <Figure
          label="Concentration"
          value={world.concentration.toFixed(2)}
          note={tooltip('concentration')}
        />
        <Figure label="Camps" value={String(world.communities)} note={tooltip('camps')} />
        <Figure
          label="Outermost"
          value={`${world.horizonSpread.toFixed(1)}×`}
          note={tooltip('horizon')}
        />
      </div>
    </button>
  );
}
