import type { IndexFile, PlayableCounts, PuzzleRecord, Universe, UniverseMeta } from '../types';

const base = import.meta.env.BASE_URL.replace(/\/$/, '');

export async function fetchIndex(): Promise<IndexFile> {
  const res = await fetch(`${base}/data/index.json`);
  if (!res.ok) throw new Error(`Failed to load index.json: ${res.status}`);
  return res.json();
}

export async function fetchUniverse(file: string): Promise<Universe> {
  const res = await fetch(`${base}/data/${file}`);
  if (!res.ok) throw new Error(`Failed to load universe file ${file}: ${res.status}`);
  return res.json();
}

/** Enrichment sidecar — fetched once per world and cached. */
export async function fetchMeta(universeId: string): Promise<UniverseMeta> {
  const res = await fetch(`${base}/data/${universeId}.meta.json`);
  if (!res.ok) throw new Error(`Failed to load ${universeId}.meta.json: ${res.status}`);
  return res.json();
}

/** How sharply selection concentrates around the requested score.
 *
 * Small enough that the slider means something, large enough that a world's
 * whole cast stays reachable. Every start keeps a non-zero chance: the previous
 * rule took a window around the *nearest* start, which at the ends of the scale
 * left only a handful of candidates — 7% of all scored starts could be served at
 * the default slider position, and The English Histories had exactly one.
 */
const EASE_TEMPERATURE = 0.08;

/** What a recently served start's weight is multiplied by. A penalty rather than
 * an exclusion, so a small world cannot run out of people to be. */
const REPEAT_PENALTY = 0.02;

function easeWeight(ease: number, targetEase: number): number {
  return Math.exp(-Math.abs(ease - targetEase) / EASE_TEMPERATURE);
}

function weightedChoice<T>(items: T[], weights: number[]): T | undefined {
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (!(total > 0)) return items[Math.floor(Math.random() * items.length)];
  let ticket = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    ticket -= weights[i];
    if (ticket < 0) return items[i];
  }
  return items[items.length - 1];
}

/**
 * Pick a start near the difficulty the player asked for.
 *
 * Weighted rather than filtered: a start's chance falls off with its distance
 * from the target, but never reaches zero. That keeps the slider meaningful
 * without making most of the catalogue unreachable, and it means the same world
 * at the same setting does not keep handing back the same person.
 */
export function pickPuzzle(
  universe: Universe,
  targetEase = 1,
  recent: readonly string[] = [],
): PuzzleRecord | undefined {
  if (universe.puzzles.length === 0) return undefined;
  const weights = universe.puzzles.map((p) => {
    const w = easeWeight(p.ease ?? 0.5, targetEase);
    return recent.includes(p.id) ? w * REPEAT_PENALTY : w;
  });
  return weightedChoice(universe.puzzles, weights);
}

/**
 * Pick a world in proportion to how many of its starts sit near the target.
 *
 * The same weighting as `pickPuzzle`, summed over a world's difficulty
 * histogram — so a world's chance is its share of the whole catalogue's weight,
 * and choosing a world then a start within it comes out the same as choosing a
 * start from everywhere at once. No world is ever impossible, which the previous
 * outward-search version could not say: at the default slider no world at all had
 * starts in the top bucket, and the search fell out to exactly three candidates.
 */
export function pickWorld<T extends { playable: PlayableCounts }>(
  worlds: T[],
  targetEase = 1,
  easeBuckets = 10,
): T | undefined {
  if (worlds.length === 0) return undefined;
  const weights = worlds.map((world) => {
    const histogram = world.playable.histogram;
    if (!histogram || histogram.length === 0) {
      return world.playable.total * easeWeight(0.5, targetEase);
    }
    let weight = 0;
    for (let b = 0; b < histogram.length; b++) {
      if (!histogram[b]) continue;
      const centre = (b + 0.5) / (easeBuckets || histogram.length);
      weight += histogram[b] * easeWeight(centre, targetEase);
    }
    return weight;
  });
  return weightedChoice(worlds, weights);
}
