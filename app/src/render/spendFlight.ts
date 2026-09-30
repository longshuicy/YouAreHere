/**
 * The mark that carries a spend from the node it was made at up to the count
 * in the corner, and the lift that makes the count admit it moved.
 *
 * The problem this solves is distance, not size: every spend happens at a node
 * somewhere on the paper, and the count sits in the far corner in small grey
 * mono. A player watching their own click never sees the number tick, and so
 * never connects the two. One mark travelling between them says all of it —
 * that a ledger exists, where it lives, and that *this* click moved it.
 *
 * The click site does not get to say what it cost. Only the ledger knows: a
 * claim is free when it is wrong and a credit when it is right, and the button
 * cannot tell which until the engine has ruled. So a click leaves behind only
 * a *place*, and the ledger — once it sees its own total move — sends the mark
 * from there with the true figure on it.
 *
 * Nothing here loops or pulses. It runs once, because the player caused it.
 */

interface Origin {
  x: number;
  y: number;
  at: number;
}

let origin: Origin | null = null;
let target: HTMLElement | null = null;

/** How long a recorded place stays good. Long enough to outlast the render
 *  that follows the click, short enough that a spend made somewhere else
 *  entirely never flies from a stale node. */
const ORIGIN_TTL_MS = 1500;

/**
 * The mark's timing, which is the whole of whether it is seen.
 *
 * A first pass flew it in 520ms on a fast-out curve and began fading it
 * halfway, which put nearly all of its travel into the first few frames and
 * dimmed it for the rest — a blink at the node, and at 11px, against a layout
 * that is itself still settling for 600ms after an expand, it read as nothing.
 *
 * So: it waits where the click was, at a size worth reading, long enough for
 * the eye that is already there to catch it. Then it crosses on an even curve,
 * shrinking to the size of the count it is going to join, and it does not
 * begin to fade until it has almost arrived.
 */
const DWELL_MS = 180;
const FLIGHT_MS = 620;
/** Larger than the count at rest, and it sheds the difference on the way — a
 *  mark that becomes the number it lands on rather than merely reaching it. */
const LIFT_OFF_SCALE = 1.45;
/** The lit count settles back over rather longer than the flight, so the
 *  corner stays warm well past the arrival that lit it. */
const SETTLE_MS = 900;
/** With motion reduced there is no settle to watch, so the colour is simply
 *  held and then dropped. A held colour is not motion. */
const HOLD_MS = 1100;

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Remember where a spend was made. Called at the click, before the engine has
 *  ruled on what — if anything — it cost. */
export function markSpendOrigin(el: HTMLElement | null): void {
  if (!el) return;
  const r = el.getBoundingClientRect();
  origin = { x: r.left + r.width / 2, y: r.top + r.height / 2, at: performance.now() };
}

/** The count the marks fly to. */
export function registerSpendTarget(el: HTMLElement | null): void {
  target = el;
}

export function clearSpendTarget(el: HTMLElement | null): void {
  if (target === el) target = null;
}

/**
 * Send one mark from the last recorded place to the count. The place is spent
 * in the sending: a single click buys a single mark, whatever else re-renders.
 *
 * `onLand` fires when the mark reaches the corner, so that the count lights in
 * answer to an arrival rather than alongside a departure. Simultaneous, the
 * two readings were one event happening twice; sequenced, they are cause and
 * effect, which is the whole thing being taught.
 *
 * Returns false when there is nothing to fly from or to — a spend made off the
 * paper, or motion the player has asked not to see. The caller then lights the
 * count itself, at once; the flight is the part that is optional.
 */
export function flySpend(text: string, onLand: () => void): boolean {
  const from = origin;
  origin = null;

  if (!from || !target) return false;
  if (performance.now() - from.at > ORIGIN_TTL_MS) return false;
  if (prefersReducedMotion()) return false;

  const to = target.getBoundingClientRect();
  const tx = to.left + to.width / 2;
  const ty = to.top + to.height / 2;

  const mark = document.createElement('div');
  mark.textContent = text;
  mark.setAttribute('aria-hidden', 'true');
  Object.assign(mark.style, {
    position: 'fixed',
    left: `${from.x}px`,
    top: `${from.y}px`,
    // Its own centre rides the path between the two points.
    transform: 'translate(-50%, -50%)',
    fontFamily: 'var(--mono, ui-monospace, monospace)',
    // The analytical voice, but at a size that survives being looked away
    // from. The count it joins is 11px; this is not the count, it is a figure
    // crossing a wide sheet of paper against a settling diagram.
    fontSize: '15px',
    fontWeight: '500',
    letterSpacing: '0.18em',
    color: 'var(--accent)',
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
    zIndex: '60',
  } satisfies Partial<CSSStyleDeclaration>);

  document.body.appendChild(mark);

  const held = `translate(-50%, -50%) scale(${LIFT_OFF_SCALE})`;
  const landed = `translate(calc(-50% + ${tx - from.x}px), calc(-50% + ${ty - from.y}px)) scale(1)`;
  const total = DWELL_MS + FLIGHT_MS;
  const leaves = DWELL_MS / total;
  // It holds its full ink until it is all but home, then goes in the last
  // breath — it does not vanish on arrival so much as become the number it
  // landed on.
  const fades = 1 - 140 / total;

  const flight = mark.animate(
    [
      { transform: held, opacity: 1, offset: 0 },
      { transform: held, opacity: 1, offset: leaves },
      { transform: landed, opacity: 1, offset: fades },
      { transform: landed, opacity: 0, offset: 1 },
    ],
    // Even at both ends: a mark that is readable in the middle of its path,
    // rather than one that spends its distance before the eye has found it.
    { duration: total, easing: 'ease-in-out', fill: 'forwards' },
  );

  let gone = false;
  const arrive = () => {
    if (gone) return;
    gone = true;
    mark.remove();
    onLand();
  };
  flight.onfinish = arrive;
  // An animation that never finishes — a backgrounded tab, an interrupted
  // frame — must not leave a mark stranded over the paper or a count that
  // never admits what it was told.
  window.setTimeout(arrive, total + 250);

  return true;
}

/**
 * Light a line and let it settle back to what it was. The lit colour is passed
 * in because the only line that is already accent — the credit — cannot be lit
 * by accent, and lifts to ink instead.
 */
export function flashLit(el: HTMLElement | null, litColor: string): void {
  if (!el) return;

  el.style.transition = 'none';
  el.style.color = litColor;
  void el.offsetWidth;

  if (prefersReducedMotion()) {
    window.setTimeout(() => {
      el.style.transition = 'none';
      el.style.color = '';
    }, HOLD_MS);
    return;
  }

  el.style.transition = `color ${SETTLE_MS}ms ease-out`;
  // Back to whatever the stylesheet says it is, rather than to a colour named
  // twice — the breakdown lines and the count do not agree on their resting ink.
  el.style.color = '';
}
