import type { IndexFile, Universe, UniverseMeta } from '../types';

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

/** Fetched only when the reveal fires — never before. */
export async function fetchMeta(universeId: string): Promise<UniverseMeta> {
  const res = await fetch(`${base}/data/${universeId}.meta.json`);
  if (!res.ok) throw new Error(`Failed to load ${universeId}.meta.json: ${res.status}`);
  return res.json();
}

/** Picks a playable start. Today every universe is `unbanded`, so this treats
 * the whole playable pool as one band; once band scoring lands, prefer
 * `approachable` first. */
export function pickPuzzle(universe: Universe, minBand: 'approachable' | 'hard' | 'unbanded' = 'unbanded') {
  const candidates = universe.puzzles.filter((p) => {
    if (minBand === 'unbanded') return true;
    return p.band === minBand;
  });
  const pool = candidates.length > 0 ? candidates : universe.puzzles;
  return pool[Math.floor(Math.random() * pool.length)];
}
