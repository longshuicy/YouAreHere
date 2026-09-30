import { easeFloor, type Residence } from '../engine/residence';

/** The thumb's diameter, as `.ease` draws it in index.css. Needed here because
 * the rule behind it is drawn by this component and has to agree with where the
 * browser puts the mark. */
const THUMB = 9;

/** Said on hover, and by a screen reader through `aria-description`. */
const WHY_THE_STOP_MOVES =
  'It reaches further into the hard end as you put names to this world.';

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
 * HARD is set in unknown grey until the range actually reaches it, and comes
 * to full ink when it does. That happens once in a world.
 *
 * The stop is drawn ABOVE the bar, not on it. On it is where the thumb is, and
 * at the start of a residence those are the same place: the reach is a sliver
 * at the easy end, the dial opens parked against it, and a hairline on the
 * track went under the 9px circle sitting on the same few pixels. A bound the
 * player cannot see is a bound that reads as a broken control. Above the bar it
 * is never occluded, at any reach, at any value — and it carries its own short
 * label, so the mark does not have to be decoded from position alone.
 *
 * Why the stop moves is carried as the control's own tooltip rather than as a
 * line of prose under it. Resistance alone does not distinguish "this opens up
 * as you learn the world" from "this is broken", so the sentence still has to
 * exist — but it was answering a question a player has at most once, and on the
 * cold open it was a third line of explanation on a screen that already asks
 * for exactly one thing to be clicked. The mark above the bar carries its own
 * short label, so the tooltip is a second reading for whoever goes looking,
 * which is what a tooltip is for; nothing the player needs is only in it.
 */

export function EaseDial({ residence, cast, value, onChange }: Props) {
  const floor = easeFloor(residence, cast);
  const reach = 1 - floor;
  const at = Math.max(floor, Math.min(1, value));
  const reached = reach >= 0.98;
  /** Where a value sits on the bar, in the thumb's own coordinates. Ease runs
   * 0 obscure to 1 findable; the bar runs easy to hard, so a value's position
   * is its complement. The stop therefore sits at `reach`, and everything
   * beyond it — the hard end — is what the map has not earned yet. */
  const mark = (v: number) => `calc(${THUMB / 2}px + ${v} * (100% - ${THUMB}px))`;

  const row = (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 12 }}
      title={reached ? undefined : WHY_THE_STOP_MOVES}
    >
      <span
        className="mono"
        style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}
      >
        Easy
      </span>

      {/* 34 tall: the input owns the bottom 22, which puts the bar — and the
          thumb centred on it — at 23. Everything the thumb must not cover is
          drawn above 18, which is where the top of the thumb is. */}
      <span style={{ position: 'relative', flex: 1, minWidth: 90, height: 34 }}>
        {/* Reachable. */}
        <span
          style={{
            position: 'absolute',
            left: 0,
            top: 23,
            width: mark(reach),
            height: 1,
            background: 'var(--unknown)',
            transition: 'width 500ms ease',
          }}
        />
        {/* Not yet reachable, in the chooser's tick pattern. */}
        <span
          style={{
            position: 'absolute',
            left: mark(reach),
            top: 23,
            right: 0,
            height: 1,
            background: 'repeating-linear-gradient(to right, var(--rule) 0 1px, transparent 1px 4px)',
            transition: 'left 500ms ease',
          }}
        />
        {/* The stop: a tick standing clear above the bar, and its label set
            into the stretch that is still locked — which is widest exactly
            when the reach is narrowest, so the words have the most room on
            the first start, when they are most needed. */}
        {!reached && (
          <>
            <span
              style={{
                position: 'absolute',
                left: mark(reach),
                top: 5,
                width: 1,
                height: 9,
                background: 'var(--unknown)',
                transition: 'left 500ms ease',
              }}
            />
            <span
              className="mono"
              style={{
                position: 'absolute',
                left: mark(reach),
                right: 0,
                top: 3,
                paddingLeft: 5,
                fontSize: 8,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                color: 'var(--unknown)',
                transition: 'left 500ms ease',
              }}
            >
              As far as your map reaches
            </span>
          </>
        )}
        <input
          className="ease ease-bounded"
          type="range"
          min={0}
          max={100}
          step={1}
          value={100 - Math.round(at * 100)}
          aria-valuemax={Math.round(reach * 100)}
          aria-label="How hard a person to be next, as far as this map reaches"
          aria-description={reached ? undefined : WHY_THE_STOP_MOVES}
          title={reached ? undefined : WHY_THE_STOP_MOVES}
          onChange={(e) => onChange(Math.max(floor, (100 - Number(e.target.value)) / 100))}
          style={{ position: 'absolute', insetInline: 0, bottom: 0, height: 22, width: '100%', margin: 0 }}
        />
      </span>

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
        Hard
      </span>
    </div>
  );

  return <div>{row}</div>;
}
