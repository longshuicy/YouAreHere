/**
 * Where everyone was, year by year.
 *
 * The one part of a past year that nothing else can recover: the ties are in the
 * ledger and the figures are in the metric series, but a force layout is
 * iterative, so replaying the same graph does not give back the same picture.
 *
 * Slots are indexed by year modulo the cap, which makes the ring self-evicting
 * and the lookup a single comparison — a slot either holds the year asked for or
 * holds the year that overwrote it.
 */
import { SNAPSHOT_LIMIT } from './constants';
import type { Positions } from './Field';

export interface Snapshots {
  /** Which year each slot holds; -1 when never written. */
  year: Int32Array;
  x: (Float32Array | null)[];
  y: (Float32Array | null)[];
}

export function emptySnapshots(): Snapshots {
  return {
    year: new Int32Array(SNAPSHOT_LIMIT).fill(-1),
    x: new Array(SNAPSHOT_LIMIT).fill(null),
    y: new Array(SNAPSHOT_LIMIT).fill(null),
  };
}

/** Copy, never keep: the worker hands out a fresh pair of arrays every tick and
 * holding one would pin it and lie about the year after. */
export function capture(snaps: Snapshots, year: number, pos: Positions) {
  const i = ((year % SNAPSHOT_LIMIT) + SNAPSHOT_LIMIT) % SNAPSHOT_LIMIT;
  const n = pos.x.length;
  // Allocated as the run reaches each slot rather than all at once, so a short
  // run pays for the years it ran and a re-used slot pays nothing.
  if (!snaps.x[i] || snaps.x[i]!.length !== n) {
    snaps.x[i] = new Float32Array(n);
    snaps.y[i] = new Float32Array(n);
  }
  snaps.x[i]!.set(pos.x);
  snaps.y[i]!.set(pos.y);
  snaps.year[i] = year;
}

/**
 * The nearest picture at or just before `year`.
 *
 * Exact nearly always, because a picture is taken every round. The short walk
 * backwards is for the rounds a dropped frame might still miss: two years of a
 * settled layout is a pixel or two, and showing that is better than refusing to
 * go to a year the ledger can describe perfectly well.
 */
export function positionsAt(snaps: Snapshots, year: number): Positions | null {
  for (let back = 0; back <= NEAREST_BACK && year - back >= 0; back++) {
    const d = year - back;
    const i = ((d % SNAPSHOT_LIMIT) + SNAPSHOT_LIMIT) % SNAPSHOT_LIMIT;
    if (snaps.year[i] === d && snaps.x[i] && snaps.y[i]) {
      return { x: snaps.x[i]!, y: snaps.y[i]! };
    }
  }
  return null;
}

/** How far back to look for a picture before giving up on a year. */
const NEAREST_BACK = 3;

/** The oldest year still held, which is where the scrubber's left end sits. */
export function earliestYear(snaps: Snapshots): number {
  let lo = Infinity;
  for (let i = 0; i < SNAPSHOT_LIMIT; i++) {
    if (snaps.year[i] >= 0 && snaps.year[i] < lo) lo = snaps.year[i];
  }
  return Number.isFinite(lo) ? lo : 0;
}
