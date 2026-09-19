/**
 * The figures a character reading draws.
 *
 * Every one of them is a strip of marks on a rule, because that is the only
 * chart this paper knows how to print: the gallery's fingerprint draws its
 * distributions this way and the reveal should not introduce a second visual
 * language for the same kind of statement.
 *
 * The accent is spent carefully. The style sheet gives exactly one meaning to
 * #8C2F2A — *you* — so it marks the subject and nothing else: never a category,
 * never a series, never the larger half of a split.
 */

/**
 * The coordinate width every figure is drawn in. It is half a copy column,
 * because that is the space a figure gets: the note that explains it sits in
 * the other half. Heights are in the same space, so each figure keeps its
 * proportions at whatever size the column is.
 */
const WIDTH = 255;

function axis(left: string, right: string) {
  return (
    <div
      className="mono"
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: 7.5,
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        color: 'var(--unknown)',
        paddingTop: 4,
      }}
    >
      <span>{left}</span>
      <span>{right}</span>
    </div>
  );
}

/**
 * A crowd, and where the subject stands in it.
 *
 * `crowd` is the faint background layer — one tick per member, overprinting so
 * a crowd at one value darkens rather than stacking, the way the gallery's
 * horizon strip reads. It is only worth drawing when the quantity has a
 * distribution: standing is a *rank*, so plotting the whole cast's standing
 * draws a bar of evenly spaced ticks from end to end whatever the story is,
 * which says nothing and buries the marks that do. Ease is a score, and its
 * crowd is a real shape.
 */
export function CrowdStrip({
  crowd = [],
  values = [],
  mark,
  left,
  right,
  width = WIDTH,
  height = 74,
}: {
  crowd?: number[];
  values?: number[];
  mark?: number | null;
  left: string;
  right: string;
  width?: number;
  height?: number;
}) {
  const base = height - 0.5;
  const at = (v: number) => Math.min(width - 0.5, Math.max(0.5, v * width));
  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height + 1}`}
        aria-hidden
        style={{ display: 'block', width: '100%', height: 'auto' }}
      >
        {crowd.map((v, k) => (
          <line
            key={`c${k}`}
            x1={at(v)}
            y1={base - height * 0.34}
            x2={at(v)}
            y2={base}
            stroke="var(--unknown)"
            strokeWidth={1}
            opacity={0.3}
          />
        ))}
        {values.map((v, k) => (
          <line
            key={`v${k}`}
            x1={at(v)}
            y1={base - height * 0.72}
            x2={at(v)}
            y2={base}
            stroke="var(--tie-strong)"
            strokeWidth={1}
            opacity={0.65}
          />
        ))}
        {mark != null && (
          <g>
            <line x1={at(mark)} y1={1} x2={at(mark)} y2={base} stroke="var(--accent)" strokeWidth={1.4} />
            <circle cx={at(mark)} cy={1.5} r={2.2} fill="var(--accent)" />
          </g>
        )}
        <line x1={0} y1={base} x2={width} y2={base} stroke="var(--rule)" strokeWidth={1} />
      </svg>
      {axis(left, right)}
    </div>
  );
}

/**
 * The subject's own ties, strongest first.
 *
 * Not a distribution of anything — it is the shape of one person's attachments,
 * and what it is for is the silhouette: one tower and a flat tail is a
 * character with a single relationship, an even row is one spread thin.
 */
export function TieWeights({
  weights,
  width = WIDTH,
  height = 184,
}: {
  weights: number[];
  width?: number;
  height?: number;
}) {
  const peak = Math.max(...weights, 1);
  const slot = width / Math.max(1, weights.length);
  // Below a couple of pixels a gap between bars costs more than it buys: the
  // bars stop reading as bars and start reading as a dither.
  const gap = slot > 3 ? Math.min(2, slot * 0.25) : 0;
  const base = height - 0.5;
  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height + 1}`}
        aria-hidden
        style={{ display: 'block', width: '100%', height: 'auto' }}
      >
        {weights.map((w, k) => {
          const h = (w / peak) * (height - 2);
          return (
            <rect
              key={k}
              x={k * slot}
              y={base - h}
              width={Math.max(0.6, slot - gap)}
              height={h}
              fill={k === 0 ? 'var(--tie-strong)' : 'var(--unknown)'}
              opacity={k === 0 ? 0.9 : 0.55}
            />
          );
        })}
        <line x1={0} y1={base} x2={width} y2={base} stroke="var(--rule)" strokeWidth={1} />
      </svg>
      {axis('Strongest', `${weights.length} ties`)}
    </div>
  );
}

/** Ties that stayed inside the subject's own camp, against those that left it. */
export function CampSplit({
  inCamp,
  outCamp,
  camps,
  width = WIDTH,
}: {
  inCamp: number;
  outCamp: number;
  camps: number;
  width?: number;
}) {
  const total = Math.max(1, inCamp + outCamp);
  const height = 22;
  const split = (inCamp / total) * width;
  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden
        style={{ display: 'block', width: '100%', height: 'auto' }}
      >
        <rect x={0} y={0} width={split} height={height} fill="var(--unknown)" opacity={0.45} />
        <rect x={split} y={0} width={width - split} height={height} fill="var(--body)" opacity={0.75} />
      </svg>
      {axis(`${inCamp} in your camp`, `${outCamp} outside · ${camps} camps`)}
    </div>
  );
}

import type { RingMark } from '../graph/reading';

/**
 * Your opening ring, and the rings of the people it could equally have been.
 *
 * This replaced a chart that counted them. Counting was the wrong move: the
 * number is abstract, the reader never met those people, and a line falling
 * from seven to seven says nothing anybody can feel. Drawn side by side the
 * point makes itself  every one of these has the same number of spokes, by
 * construction, because that is what put them on the list — and the reader
 * looks for themselves, fails, and now knows exactly what the diagram was and
 * was not able to say.
 *
 * Only the two things an opening diagram actually states are drawn: how thick
 * each tie is, and how large the person on the far end of it. No layout, no
 * relaxation, no simulation: the spokes are handed even angles, which is
 * honest here precisely because the angles carry nothing. Two rings differ in
 * their ink, not in their arrangement.
 */
export function LookAlikeRings({
  rings,
  width = WIDTH * 2,
}: {
  rings: { name: string; ring: RingMark[]; you?: boolean }[];
  width?: number;
}) {
  const cells = Math.max(1, rings.length);
  const cell = width / cells;
  // Sized to the cell, so two rivals are drawn large and four are drawn small
  // rather than every case being drawn at the size the busiest one needs. The
  // ceiling only stops a pair from filling half the page.
  const radius = Math.min(cell * 0.38, 78);
  const height = radius * 2 + 30;
  // A crowded ring would be a solid disc of ink at this size; the strokes come
  // down as the spokes go up so a hub still reads as a drawing.
  const crowding = Math.min(1, 16 / Math.max(1, rings[0]?.ring.length ?? 1));
  const stroke = 0.5 + 1.7 * crowding;

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden
        style={{ display: 'block', width: '100%', height: 'auto' }}
      >
        {rings.map((subject, index) => {
          const cx = index * cell + cell / 2;
          const cy = radius + 4;
          return (
            <g key={`${subject.name}-${index}`}>
              {subject.ring.map((mark, k) => {
                const angle = (Math.PI * 2 * k) / Math.max(1, subject.ring.length) - Math.PI / 2;
                const x = cx + Math.cos(angle) * radius;
                const y = cy + Math.sin(angle) * radius;
                return (
                  <g key={k}>
                    <line
                      x1={cx}
                      y1={cy}
                      x2={x}
                      y2={y}
                      stroke="var(--tie-strong)"
                      strokeWidth={stroke * (0.45 + 0.55 * mark.strength)}
                      opacity={0.5 + 0.4 * mark.strength}
                    />
                    <circle
                      cx={x}
                      cy={y}
                      r={(2 + 2.4 * mark.standing) * (0.6 + 0.4 * crowding)}
                      fill="var(--paper)"
                      stroke="var(--unknown)"
                      strokeWidth={0.9}
                    />
                  </g>
                );
              })}
              <circle cx={cx} cy={cy} r={4.2} fill={subject.you ? 'var(--accent)' : 'var(--body)'} />
              <text
                x={cx}
                y={height - 5}
                textAnchor="middle"
                style={{
                  font: `10px var(--serif)`,
                  fill: subject.you ? 'var(--accent)' : 'var(--annotation)',
                }}
              >
                {subject.you ? 'You' : subject.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
