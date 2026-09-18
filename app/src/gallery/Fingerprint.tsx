import { DEGREE_BANDS, GAIN_AXIS, type WorldMetrics } from './metrics';
import { noteTooltip as tooltip } from './notes';

/** Fixed log placement, so a tick means the same thing on every card and at
 * every size. */
function gainToX(gain: number, width: number): number {
  const clamped = Math.min(GAIN_AXIS.max, Math.max(GAIN_AXIS.min, gain));
  return (Math.log(clamped) / Math.log(GAIN_AXIS.max)) * width;
}

export const CARD_STRIP = 252;

/** The strip's own caption. Without one the two panels read as a single grey
 * block — the ticks look like noise under the bars rather than a second figure
 * measuring something entirely different. */
export function StripLabel({
  left,
  right,
  width,
  size = 7.5,
}: {
  left: string;
  right?: string;
  width: number;
  size?: number;
}) {
  return (
    <div
      className="mono"
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: size,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color: 'var(--unknown)',
        width: '100%',
        maxWidth: width,
        paddingBottom: 3,
      }}
    >
      <span>{left}</span>
      {right && <span>{right}</span>}
    </div>
  );
}

export function DegreeBars({
  histogram,
  width = CARD_STRIP,
  height = 20,
}: {
  histogram: number[];
  width?: number;
  height?: number;
}) {
  const peak = Math.max(...histogram, 1);
  const barWidth = width / DEGREE_BANDS.length;
  return (
    <svg
      viewBox={`0 0 ${width} ${height + 1}`}
      aria-hidden
      style={{ display: 'block', width: '100%', maxWidth: width, height: 'auto' }}
    >
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
      <line x1={0} y1={height + 0.5} x2={width} y2={height + 0.5} stroke="var(--rule)" strokeWidth={1} />
    </svg>
  );
}

export function HorizonStrip({
  world,
  width = CARD_STRIP,
  height = 22,
  labelMarks = false,
}: {
  world: WorldMetrics;
  width?: number;
  height?: number;
  labelMarks?: boolean;
}) {
  const base = height - 5.5;
  const marks = [1, 3, 10, 30, 100];
  return (
    <svg
      viewBox={`0 0 ${width} ${height + (labelMarks ? 14 : 0)}`}
      aria-hidden
      style={{ display: 'block', width: '100%', maxWidth: width, height: 'auto' }}
    >
      <line x1={0} y1={base} x2={width} y2={base} stroke="var(--rule)" strokeWidth={1} />
      {marks.map((mark) => {
        const x = Math.min(width - 0.5, Math.max(0.5, gainToX(mark, width)));
        return (
          <g key={mark}>
            <line x1={x} y1={base} x2={x} y2={base + 4} stroke="var(--leader)" strokeWidth={1} />
            {labelMarks && (
              <text
                x={Math.min(width - 11, Math.max(11, x))}
                y={base + 15}
                textAnchor="middle"
                style={{ font: '9px var(--mono)', fill: 'var(--unknown)', letterSpacing: '0.08em' }}
              >
                {mark}×
              </text>
            )}
          </g>
        );
      })}
      {/* Ticks overprint, so a crowd at one value darkens rather than stacking —
          the same way repeated impressions darken ink. */}
      {world.characters
        .filter((c) => c.degree > 0)
        .map((c) => (
          <line
            key={c.i}
            x1={gainToX(c.gain, width)}
            y1={1}
            x2={gainToX(c.gain, width)}
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

      <div title={tooltip('ties')} style={{ width: '100%' }}>
        <StripLabel left="Ties each" right="Few → many" width={CARD_STRIP} />
        <DegreeBars histogram={world.degreeHistogram} />
      </div>
      <div title={tooltip('horizon')} style={{ paddingTop: 4, width: '100%' }}>
        <StripLabel left="Horizon" right="1× → 100×" width={CARD_STRIP} />
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
