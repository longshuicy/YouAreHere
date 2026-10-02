/**
 * The experiment's only source of randomness.
 *
 * `Math.random` is not usable here: a run has to be reproducible from its seed
 * alone, because the URL is the experiment (docs/The experiment.md) and two
 * people opening the same link must watch the same thing happen.
 *
 * mulberry32 — 32 bits of state, one multiply-xor round. Not cryptographic and
 * does not need to be; it needs to be fast, seedable, and the same everywhere.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
