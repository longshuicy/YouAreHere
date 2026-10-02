/**
 * Where everyone was, year by year.
 *
 * The one part of a past year that nothing else can recover: the ties are in the
 * ledger and the figures are in the metric series, but a force layout is
 * iterative, so replaying the same graph does not give back the same picture.
 *
 * A picture is two Float32Arrays over every character — about seventy kilobytes
 * for the full catalogue — so the cap is on how many are held, not on how far
 * back they reach. A run longer than the cap is sampled: every second year at
 * five hundred, every fifth at a thousand. The scrubber then lands on the
 * nearest year held, which in a settled layout is a difference of a pixel or
 * two, and the whole of the run stays reachable instead of only its last two
 * hundred and forty years.
 */
import { SNAPSHOT_LIMIT } from './constants';
import type { Positions } from './Field';

export interface Snapshots {
  /** Which year each slot holds; -1 when never written. */
  year: Int32Array;
  x: (Float32Array | null)[];
  y: (Float32Array | null)[];
  /** One picture every `stride` years. 1 for a run that fits. */
  stride: number;
}

export function emptySnapshots(years: number): Snapshots {
  return {
    year: new Int32Array(SNAPSHOT_LIMIT).fill(-1),
    x: new Array(SNAPSHOT_LIMIT).fill(null),
    y: new Array(SNAPSHOT_LIMIT).fill(null),
    stride: Math.max(1, Math.ceil((years + 1) / SNAPSHOT_LIMIT)),
  };
}

/** Which slot a year belongs in, or -1 if it is not one of the years kept. */
function slotFor(snaps: Snapshots, year: number): number {
  if (year % snaps.stride !== 0) return -1;
  const n = year / snaps.stride;
  return ((n % SNAPSHOT_LIMIT) + SNAPSHOT_LIMIT) % SNAPSHOT_LIMIT;
}

/** Copy, never keep: the worker hands out a fresh pair of arrays every tick and
 * holding one would pin it and lie about the year after. */
export function capture(snaps: Snapshots, year: number, pos: Positions) {
  const i = slotFor(snaps, year);
  if (i < 0) return;
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
 * The walk back covers the sampling stride, and a little more for the years a
 * dropped frame might still have missed: a few years of a settled layout is a
 * pixel or two, and showing that is better than refusing to go to a year the
 * ledger can describe perfectly well.
 */
export function positionsAt(snaps: Snapshots, year: number): Positions | null {
  const reach = snaps.stride + NEAREST_BACK;
  for (let back = 0; back <= reach && year - back >= 0; back++) {
    const d = year - back;
    const i = slotFor(snaps, d);
    if (i >= 0 && snaps.year[i] === d && snaps.x[i] && snaps.y[i]) {
      return { x: snaps.x[i]!, y: snaps.y[i]! };
    }
  }
  return null;
}

/** How far back to look for a picture beyond the stride before giving up. */
const NEAREST_BACK = 3;

/** The oldest year still held, which is where the scrubber's left end sits. */
export function earliestYear(snaps: Snapshots): number {
  let lo = Infinity;
  for (let i = 0; i < SNAPSHOT_LIMIT; i++) {
    if (snaps.year[i] >= 0 && snaps.year[i] < lo) lo = snaps.year[i];
  }
  return Number.isFinite(lo) ? lo : 0;
}
