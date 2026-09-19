import type { UniverseMeta } from '../types';
import type { WorldMetrics } from './metrics';

/**
 * Every character in every loaded world, flattened, with the facets tallied.
 *
 * What the index may honestly *do* depends on coverage, and coverage is computed
 * here rather than assumed: most facets in the catalogue come from a single
 * world's enrichment, so a chart ranking houses across the corpus would be a
 * chart about one book wearing the corpus's clothes. Tiers are derived at load,
 * so a facet moves between them on its own as books arrive and nothing in the
 * interface has to be rewritten.
 */

export interface IndexRow {
  key: string;
  /** The character's index inside their own world, so a row can be opened. */
  i: number;
  name: string;
  worldId: string;
  worldTitle: string;
  degree: number;
  gain: number;
  prominence: number;
  facts: Record<string, string[]>;
}

export type Tier = 'universal' | 'broad' | 'single';

export interface FacetSummary {
  key: string;
  characters: number;
  worlds: number;
  tier: Tier;
  values: { value: string; count: number }[];
}

export const TIER_NOTE: Record<Tier, string> = {
  universal: 'In every world, so it is safe to compare across the whole catalogue.',
  broad: 'In several worlds, but not all. Filter freely; a ranking would be reading absence as evidence.',
  single: 'From one world only. A room inside that book, never a claim about the corpus.',
};

/** Facts arrive as strings, numbers or arrays; a facet is a set of labels. */
function labelsOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v));
  if (value === null || value === undefined) return [];
  if (typeof value === 'boolean') return value ? ['yes'] : ['no'];
  return [String(value)];
}

/** Facets whose value is a property of the world rather than the person —
 * filtering by them just re-picks a world, which the index already does. */
const NOT_A_FILTER = new Set(['corpusSize']);

export function buildIndex(
  worlds: WorldMetrics[],
  metas: Map<string, UniverseMeta>,
): { rows: IndexRow[]; facets: FacetSummary[] } {
  const rows: IndexRow[] = [];
  const facetCharacters = new Map<string, number>();
  const facetWorlds = new Map<string, Set<string>>();
  const facetValues = new Map<string, Map<string, number>>();

  for (const world of worlds) {
    const meta = metas.get(world.id);
    for (const character of world.characters) {
      const raw = meta?.nodes[String(character.i)]?.facts ?? {};
      const facts: Record<string, string[]> = {};
      for (const [key, value] of Object.entries(raw)) {
        if (NOT_A_FILTER.has(key)) continue;
        const labels = labelsOf(value);
        if (labels.length === 0) continue;
        facts[key] = labels;
        facetCharacters.set(key, (facetCharacters.get(key) ?? 0) + 1);
        if (!facetWorlds.has(key)) facetWorlds.set(key, new Set());
        facetWorlds.get(key)!.add(world.id);
        if (!facetValues.has(key)) facetValues.set(key, new Map());
        const tally = facetValues.get(key)!;
        for (const label of labels) tally.set(label, (tally.get(label) ?? 0) + 1);
      }

      rows.push({
        key: `${world.id}:${character.i}`,
        i: character.i,
        name: character.name,
        worldId: world.id,
        worldTitle: world.title,
        degree: character.degree,
        gain: character.gain,
        prominence: character.prominence,
        facts,
      });
    }
  }

  const worldCount = worlds.length;
  const facets: FacetSummary[] = [...facetCharacters.entries()]
    .map(([key, characters]) => {
      const seenIn = facetWorlds.get(key)?.size ?? 0;
      const tier: Tier = seenIn >= worldCount ? 'universal' : seenIn > 1 ? 'broad' : 'single';
      const values = [...(facetValues.get(key) ?? new Map<string, number>()).entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
      return { key, characters, worlds: seenIn, tier, values };
    })
    .sort((a, b) => b.worlds - a.worlds || b.characters - a.characters);

  return { rows, facets };
}
