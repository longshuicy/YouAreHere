/**
 * Where everyone was, day by day.
 *
 * The one part of a past day that nothing else can recover: the ties are in the
 * ledger and the figures are in the metric series, but a force layout is
 * iterative, so replaying the same graph does not give back the same picture.
 *
 * Slots are indexed by day modulo the cap, which makes the ring self-evicting
 * and the lookup a single comparison — a slot either holds the day asked for or
 * holds the day that overwrote it.
 */
import { SNAPSHOT_LIMIT } from './constants';
import type { Positions } from './Field';

export interface Snapshots {
  /** Which day each slot holds; -1 when never written. */
  day: Int32Array;
  x: (Float32Array | null)[];
  y: (Float32Array | null)[];
}

export function emptySnapshots(): Snapshots {
  return {
    day: new Int32Array(SNAPSHOT_LIMIT).fill(-1),
    x: new Array(SNAPSHOT_LIMIT).fill(null),
    y: new Array(SNAPSHOT_LIMIT).fill(null),
  };
}

/** Copy, never keep: the worker hands out a fresh pair of arrays every tick and
 * holding one would pin it and lie about the day after. */
export function capture(snaps: Snapshots, day: number, pos: Positions) {
  const i = ((day % SNAPSHOT_LIMIT) + SNAPSHOT_LIMIT) % SNAPSHOT_LIMIT;
  const n = pos.x.length;
  // Allocated as the run reaches each slot rather than all at once, so a short
  // run pays for the days it ran and a re-used slot pays nothing.
  if (!snaps.x[i] || snaps.x[i]!.length !== n) {
    snaps.x[i] = new Float32Array(n);
    snaps.y[i] = new Float32Array(n);
  }
  snaps.x[i]!.set(pos.x);
  snaps.y[i]!.set(pos.y);
  snaps.day[i] = day;
}

/**
 * The nearest picture at or just before `day`.
 *
 * Exact nearly always, because a picture is taken every round. The short walk
 * backwards is for the rounds a dropped frame might still miss: two days of a
 * settled layout is a pixel or two, and showing that is better than refusing to
 * go to a day the ledger can describe perfectly well.
 */
export function positionsAt(snaps: Snapshots, day: number): Positions | null {
  for (let back = 0; back <= NEAREST_BACK && day - back >= 0; back++) {
    const d = day - back;
    const i = ((d % SNAPSHOT_LIMIT) + SNAPSHOT_LIMIT) % SNAPSHOT_LIMIT;
    if (snaps.day[i] === d && snaps.x[i] && snaps.y[i]) {
      return { x: snaps.x[i]!, y: snaps.y[i]! };
    }
  }
  return null;
}

/** How far back to look for a picture before giving up on a day. */
const NEAREST_BACK = 3;

/** The oldest day still held, which is where the scrubber's left end sits. */
export function earliestDay(snaps: Snapshots): number {
  let lo = Infinity;
  for (let i = 0; i < SNAPSHOT_LIMIT; i++) {
    if (snaps.day[i] >= 0 && snaps.day[i] < lo) lo = snaps.day[i];
  }
  return Number.isFinite(lo) ? lo : 0;
}
