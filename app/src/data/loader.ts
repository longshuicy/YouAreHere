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

/** How hard an unrecognisable world is suppressed at the easy end of the scale.
 *
 * The ease score measures how distinctive a start's *shape* is, which is the
 * whole of "who am I" and none of "what is this". A world can be structurally
 * generous and still unnameable: The Taming of the Shrew scores level with
 * Hamlet, and Cymbeline above both. Everything the graph can tell you helps once
 * you know the book; nothing in it helps you name the book.
 *
 * So the familiarity band tilts world selection, and only at the easy end. At
 * the hard end a player has asked for the far edge of the catalogue and should
 * get 水滸傳 as readily as Friends; suppressing it there would be answering a
 * question they did not ask. A penalty rather than a filter, again — at the
 * easiest setting a band-0 world still comes up about one time in seven that its
 * starts would otherwise earn.
 */
const FAMILIARITY_TEMPERATURE = 0.5;

/** The top band, and the value that makes this term vanish. */
const FAMILIAR = 2;

function familiarityWeight(band: number, targetEase: number): number {
  const unknownness = (FAMILIAR - Math.min(FAMILIAR, band)) / FAMILIAR;
  return Math.exp((-unknownness * targetEase) / FAMILIARITY_TEMPERATURE);
}

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
 *
 * Then tilted by how nameable the world is (`familiarityOf`), which the ease
 * histogram cannot see — see `FAMILIARITY_TEMPERATURE`. Only here: `pickPuzzle`
 * is choosing among the starts of a world already settled, and a player who
 * opens the story dropdown and asks for Pericles gets Pericles.
 */
export function pickWorld<T extends { playable: PlayableCounts }>(
  worlds: T[],
  targetEase = 1,
  easeBuckets = 10,
  familiarityOf: (world: T) => number = () => FAMILIAR,
): T | undefined {
  if (worlds.length === 0) return undefined;
  const weights = worlds.map((world) => {
    const histogram = world.playable.histogram;
    const recognisable = familiarityWeight(familiarityOf(world), targetEase);
    if (!histogram || histogram.length === 0) {
      return world.playable.total * easeWeight(0.5, targetEase) * recognisable;
    }
    let weight = 0;
    for (let b = 0; b < histogram.length; b++) {
      if (!histogram[b]) continue;
      const centre = (b + 0.5) / (easeBuckets || histogram.length);
      weight += histogram[b] * easeWeight(centre, targetEase);
    }
    return weight * recognisable;
  });
  return weightedChoice(worlds, weights);
}
