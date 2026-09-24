import { easeFloor, type Residence } from '../engine/residence';

/** The thumb's diameter, as `.ease` draws it in index.css. Needed here because
 * the rule behind it is drawn by this component and has to agree with where the
 * browser puts the mark. */
const THUMB = 9;

interface Props {
  residence: Residence;
  cast: number;
  value: number;
  onChange: (next: number) => void;
}

/**
 * The scale, bounded by the map.
 *
 * The same control as the cold open's, meaning the same thing — how findable a
 * person to be — drawing from a different pool. Outside a residence it draws
 * from the whole catalogue; here, from whoever is left in this book.
 *
 * Its reach is `named / cast`, which is the same number the chooser prints as a
 * run of ticks against a world's title. So the two marks are one measurement
 * shown twice, and the unreachable stretch is drawn in the chooser's own tick
 * pattern rather than in some mark invented for this screen: a reader who has
 * seen the shelf reads this without being told.
 *
 * The thumb stops at the limit rather than springing back from it: the value is
 * clamped on the way in, so dragging further left keeps it pinned on the stop
 * and lets go of it there. The bound is a fact about how much of the book is
 * known, and meeting it as resistance says that better than a sentence would,
 * which is why there is no sentence.
 *
 * The input keeps the full 0 to 100 range and does the clamping itself rather
 * than carrying the floor as its `min`. A range input lays its value out across
 * its whole width, so a `min` of 0.7 would put value 0.7 at the *left edge* of
 * the bar while the rule drawn behind it puts the stop seven tenths along —
 * the thumb would sit well past a boundary it was in fact obeying.
 *
 * The rule's parts are placed with the same arithmetic the browser uses for the
 * thumb: its centre travels from half a thumb's width to that much short of the
 * far end, never the full span, so a stop drawn at a flat percentage would sit
 * a few pixels off the mark it is supposed to stop.
 *
 * OBSCURE is set in unknown grey until the range actually reaches it, and comes
 * to full ink when it does. That happens once in a world.
 *
 * A line under it says what the bound is, and goes away once the scale reaches
 * the whole of itself. Resistance alone does not distinguish "this opens up as
 * you learn the world" from "this is broken", and the widening happens between
 * starts, slowly, so the part of it that is a reward is invisible to anyone who
 * does not already know to expect it. Not a tooltip: this app does not use
 * them, the key exists for exactly this kind of telling, and hover is not a
 * thing a reader on a phone can do.
 */
export function EaseDial({ residence, cast, value, onChange }: Props) {
  const floor = easeFloor(residence, cast);
  const reach = 1 - floor;
  const at = Math.max(floor, Math.min(1, value));
  const reached = reach >= 0.98;
  /** Where a value sits on the bar, in the thumb's own coordinates. */
  const mark = (v: number) => `calc(${THUMB / 2}px + ${v} * (100% - ${THUMB}px))`;

  const row = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 12 }}>
      <span
        className="mono"
        style={{
          fontSize: 9,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
          color: reached ? 'var(--ink)' : 'var(--unknown)',
          transition: 'color 400ms ease',
        }}
      >
        Obscure
      </span>

      <span style={{ position: 'relative', flex: 1, minWidth: 90, height: 22 }}>
        {/* Not yet reachable, in the chooser's tick pattern. */}
        <span
          style={{
            position: 'absolute',
            left: 0,
            top: 10,
            width: mark(floor),
            height: 1,
            background: 'repeating-linear-gradient(to right, var(--rule) 0 1px, transparent 1px 4px)',
          }}
        />
        {/* Reachable. */}
        <span
          style={{
            position: 'absolute',
            left: mark(floor),
            top: 10,
            right: 0,
            height: 1,
            background: 'var(--unknown)',
            transition: 'left 500ms ease',
          }}
        />
        {/* The stop, so the change from tick to rule reads as a boundary rather
            than as something the renderer did. */}
        <span
          style={{
            position: 'absolute',
            left: mark(floor),
            top: 6,
            width: 1,
            height: 9,
            background: 'var(--unknown)',
            transition: 'left 500ms ease',
          }}
        />
        <input
          className="ease ease-bounded"
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(at * 100)}
          aria-valuemin={Math.round(floor * 100)}
          aria-label="How findable a person to be next, as far as this map reaches"
          onChange={(e) => onChange(Math.max(floor, Number(e.target.value) / 100))}
          style={{ position: 'absolute', inset: 0, width: '100%', margin: 0, minHeight: 22 }}
        />
      </span>

      <span
        className="mono"
        style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}
      >
        Findable
      </span>
    </div>
  );

  return (
    <div>
      {row}
      {!reached && (
        <div className="annot" style={{ marginTop: 6, color: 'var(--unknown)' }}>
          The scale reaches only as far as you have uncovered this world.
        </div>
      )}
    </div>
  );
}
