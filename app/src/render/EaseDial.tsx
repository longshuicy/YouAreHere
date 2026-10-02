import { easeFloor, type Residence } from '../engine/residence';

interface Props {
  residence: Residence;
  cast: number;
  value: number;
  onChange: (next: number) => void;
}

export interface Hardness {
  /** The lowest ease this map has opened. */
  floor: number;
  /** How much of the bar is reachable, 0 to 1. */
  reach: number;
  /** `value`, clamped into what is reachable. */
  at: number;
  /** Where `at` sits inside the opened stretch, 0 easiest to 100 hardest.
   *  The number the dial's note and BEGIN's caption both read off, so they
   *  cannot disagree. */
  pct: number;
}

/** One reading of the dial, shared by the dial and whatever reports it. */
export function hardnessOf(residence: Residence, cast: number, value: number): Hardness {
  const floor = easeFloor(residence, cast);
  const reach = 1 - floor;
  const at = Math.max(floor, Math.min(1, value));
  return { floor, reach, at, pct: reach > 0 ? Math.round(((1 - at) / reach) * 100) : 0 };
}

/** How the dial says what it is set to, in one place. BEGIN prints the same
 *  words under its own, so the two never drift. */
export function hardnessWord({ pct }: Hardness): string {
  if (pct <= 0) return 'Easy';
  if (pct >= 100) return 'Hard';
  return `${pct}% toward hard`;
}

/**
 * The scale, bounded by the map.
 *
 * It chooses how findable a person to wake as next, drawing from whoever is
 * left in this book. Its reach is `named / cast` — the same measurement the
 * chooser prints against a world's title — so the bar grows as the map does,
 * and the stretch past the stop is a part of this world you have not earned a
 * way into yet.
 *
 * The drawing is the artboard's: a solid 4px rule for what is open, a dotted
 * one for what is not, a tick and a short label where they meet, and a
 * standing accent bar for the thumb. The parts above the bar are above it
 * because the thumb is *on* it — at the start of a residence the reach is a
 * sliver, the dial opens parked against its own stop, and a hairline drawn on
 * the track went under the mark sitting on the same few pixels. A bound the
 * player cannot see is a bound that reads as a broken control.
 *
 * The thumb stops at the limit rather than springing back from it: the value
 * is clamped on the way in, so dragging further right keeps it pinned on the
 * stop and lets go of it there. The bound is a fact about how much of the book
 * is known, and meeting it as resistance says that better than a sentence.
 *
 * The input keeps the full 0 to 100 range and clamps itself rather than
 * carrying the floor as its `min`. A range input lays its value out across its
 * whole width, so a `min` of 0.7 would put value 0.7 at the *left edge* while
 * the rule behind it puts the stop seven tenths along — the thumb would sit
 * well past a boundary it was in fact obeying.
 *
 * Its marks are placed with the same arithmetic the browser uses for a thumb:
 * the centre travels from half a thumb's width to that much short of the far
 * end, never the full span, so a stop drawn at a flat percentage would sit a
 * few pixels off the mark it is supposed to stop at.
 */

/** The thumb's width, as the bar below draws it. */
const THUMB = 4;

export function EaseDial({ residence, cast, value, onChange }: Props) {
  const { reach, floor, at, pct } = hardnessOf(residence, cast, value);
  const reached = reach >= 0.98;
  const lives = residence.starts.length;

  /** Where a value sits on the bar. Ease runs 0 obscure to 1 findable; the bar
   *  runs easy to hard, so a value's position is its complement — and the stop
   *  therefore sits at `reach`. */
  const mark = (v: number) => `calc(${THUMB / 2}px + ${v} * (100% - ${THUMB}px))`;

  const end = (text: string, lit: boolean) => (
    <span
      className="mono"
      style={{
        fontSize: 10,
        letterSpacing: '0.2em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        color: lit ? 'var(--ink)' : 'var(--annotation)',
        transition: 'color 400ms ease',
      }}
    >
      {text}
    </span>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
      <div className="annot" style={{ fontSize: 9, letterSpacing: '0.2em', color: 'var(--annotation)' }}>
        How hard a person to be next
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {end('Easy', true)}

        {/* 40 tall: the bar is at 22, everything that must not be covered by
            the thumb is between 0 and 14, and the input owns the lot. */}
        <div className="ease-dial" style={{ position: 'relative', flex: 1, minWidth: 90, height: 40 }}>
          {/* Open. */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 22,
              width: mark(reach),
              height: 4,
              background: 'var(--ink)',
              transition: 'width 500ms ease',
            }}
          />
          {/* Not yet open. */}
          <div
            style={{
              position: 'absolute',
              left: mark(reach),
              right: 0,
              top: 23,
              height: 0,
              borderTop: '2px dotted var(--rule)',
              transition: 'left 500ms ease',
            }}
          />

          {/* The stop, and its own short label set into the stretch that is
              still shut — which is widest exactly when the reach is narrowest,
              so the words have the most room on the first life, when they are
              most needed. */}
          {!reached && (
            <>
              <div
                style={{
                  position: 'absolute',
                  left: mark(reach),
                  top: 14,
                  width: 1,
                  height: 20,
                  background: 'var(--ink)',
                  transition: 'left 500ms ease',
                }}
              />
              <span
                className="mono"
                style={{
                  position: 'absolute',
                  left: mark(reach),
                  right: 0,
                  top: 0,
                  marginLeft: 6,
                  fontSize: 8,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  color: 'var(--annotation)',
                  transition: 'left 500ms ease',
                }}
              >
                Open so far
              </span>
            </>
          )}

          {/* A standing bar rather than a dot: it is a reading off a scale,
              and it has to stay legible against both the 4px rule it sits on
              and the paper the dotted stretch leaves. The paper ring is what
              keeps it off the ink when the two meet. */}
          <div
            aria-hidden
            className="ease-thumb"
            style={{
              position: 'absolute',
              left: mark(1 - at),
              top: 14,
              width: THUMB,
              height: 20,
              marginLeft: -THUMB / 2,
              background: 'var(--accent)',
              boxShadow: '0 0 0 2px var(--paper)',
              pointerEvents: 'none',
            }}
          />

          <input
            className="ease-track"
            type="range"
            min={0}
            max={100}
            step={1}
            value={100 - Math.round(at * 100)}
            aria-valuemax={Math.round(reach * 100)}
            aria-valuetext={hardnessWord({ floor, reach, at, pct })}
            aria-label="How hard a person to be next, as far as this map reaches"
            onChange={(e) => onChange(Math.max(floor, (100 - Number(e.target.value)) / 100))}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', margin: 0 }}
          />
        </div>

        {/* Hard comes to full ink only once the range actually reaches it.
            That happens once in a world. */}
        {end('Hard', reached)}
      </div>

      <div style={{ fontSize: 15, color: 'var(--body)', minHeight: 20 }}>
        {pct <= 0
          ? 'The most findable person this world has.'
          : pct >= 100
            ? 'As hard a start as your map has opened.'
            : `${pct}% of the way to the hard end.`}
      </div>

      {!reached && (
        <div className="annot" style={{ fontSize: 9, letterSpacing: '0.14em', color: 'var(--annotation)' }}>
          Open to {Math.round(reach * 100)}% after {lives} {lives === 1 ? 'life' : 'lives'} here. Keep
          playing this world to open more.
        </div>
      )}
    </div>
  );
}
