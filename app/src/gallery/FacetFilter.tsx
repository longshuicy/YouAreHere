import { TIER_NOTE, type FacetSummary, type IndexRow } from './indexData';
import { FilterChip, FilterGroup, FilterPopover } from './FilterPopover';

/**
 * The character index's filter: every facet the enrichment files record,
 * grouped by what kind of fact it is rather than listed by how many worlds
 * carry it, and under each one chosen, its values.
 *
 * Facets compound: a character must have every facet chosen, and where values
 * are picked under a facet, any one of them. Most facets come from a handful of
 * worlds, so two together often leave nobody — every chip says how many it
 * would leave, and the ones that would leave none are greyed rather than
 * hidden, so the reader can see what is recorded even where it does not meet.
 */

/** Facet → the values allowed under it. An empty list is "has this facet at all". */
export type CharacterSelection = Record<string, string[]>;

const GROUPS: { label: string; keys: string[] }[] = [
  { label: 'Who they are', keys: ['gender', 'species', 'culture', 'traits', 'titles', 'occupation'] },
  { label: 'Where they belong', keys: ['homeworld', 'affiliations', 'unit', 'houses'] },
  { label: 'In the story', keys: ['role', 'books', 'pov', 'born', 'died'] },
];

const LABELS: Record<string, string> = { pov: 'POV', species: 'Origin' };

/** Enough to choose from without the panel outgrowing the window. */
const VALUE_LIMIT = 40;

export function facetLabel(key: string): string {
  if (LABELS[key]) return LABELS[key];
  const spaced = key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function matchesCharacter(row: IndexRow, selection: CharacterSelection): boolean {
  for (const key in selection) {
    const labels = row.facts[key];
    if (!labels) return false;
    const allowed = selection[key];
    if (allowed.length > 0 && !allowed.some((v) => labels.includes(v))) return false;
  }
  return true;
}

function countMatching(pool: IndexRow[], selection: CharacterSelection): number {
  let n = 0;
  for (const row of pool) if (matchesCharacter(row, selection)) n++;
  return n;
}

function without(selection: CharacterSelection, key: string): CharacterSelection {
  const next = { ...selection };
  delete next[key];
  return next;
}

export function FacetFilter({
  facets,
  pool,
  applied,
  onApply,
  loading,
}: {
  facets: FacetSummary[];
  /** The characters the search leaves, which every count is out of. */
  pool: IndexRow[];
  applied: CharacterSelection;
  onApply: (next: CharacterSelection) => void;
  loading: boolean;
}) {
  const byKey = new Map(facets.map((f) => [f.key, f]));
  const grouped = new Set(GROUPS.flatMap((g) => g.keys));
  const groups = [
    ...GROUPS.map((g) => ({ label: g.label, facets: g.keys.flatMap((k) => byKey.get(k) ?? []) })),
    { label: 'Also recorded', facets: facets.filter((f) => !grouped.has(f.key)) },
  ].filter((g) => g.facets.length > 0);

  return (
    <FilterPopover
      label="Filter characters"
      title="Show only characters with…"
      applied={applied}
      empty={{}}
      active={Object.keys(applied).length}
      countFor={(draft) => countMatching(pool, draft)}
      noun={['character', 'characters']}
      onApply={onApply}
      footnote="Greyed out · would leave nobody"
    >
      {(draft, setDraft) => {
        const chosen = Object.keys(draft).flatMap((k) => byKey.get(k) ?? []);
        return (
          <>
            {groups.length === 0 && (
              <div className="annot filter-pop-empty">
                {loading ? 'Reading the enrichment files…' : 'No world here records anything to filter by'}
              </div>
            )}

            {groups.map((group) => (
              <FilterGroup key={group.label} label={group.label}>
                <div className="filter-chips">
                  {group.facets.map((facet) => {
                    const on = facet.key in draft;
                    const count = countMatching(pool, on ? draft : { ...draft, [facet.key]: [] });
                    return (
                      <FilterChip
                        key={facet.key}
                        on={on}
                        dim={!on && count === 0}
                        count={count}
                        title={`${facet.characters.toLocaleString()} characters across ${facet.worlds} ${facet.worlds === 1 ? 'world' : 'worlds'}. ${TIER_NOTE[facet.tier]}`}
                        onClick={() =>
                          setDraft((was) => (facet.key in was ? without(was, facet.key) : { ...was, [facet.key]: [] }))
                        }
                      >
                        {facetLabel(facet.key)}
                      </FilterChip>
                    );
                  })}
                </div>
              </FilterGroup>
            ))}

            {chosen.map((facet) => {
              const picked = draft[facet.key];
              const others = without(draft, facet.key);
              return (
                <FilterGroup key={`values-${facet.key}`} label={`${facetLabel(facet.key)} is`}>
                  <div className="filter-chips filter-values">
                    <FilterChip
                      on={picked.length === 0}
                      onClick={() => setDraft((was) => ({ ...was, [facet.key]: [] }))}
                    >
                      Anything
                    </FilterChip>
                    {facet.values.slice(0, VALUE_LIMIT).map((v) => {
                      const on = picked.includes(v.value);
                      const count = countMatching(pool, { ...others, [facet.key]: [v.value] });
                      return (
                        <FilterChip
                          key={v.value}
                          on={on}
                          dim={!on && count === 0}
                          count={count}
                          onClick={() =>
                            setDraft((was) => {
                              const current = was[facet.key] ?? [];
                              const next = on ? current.filter((x) => x !== v.value) : [...current, v.value];
                              return { ...was, [facet.key]: next };
                            })
                          }
                        >
                          {v.value}
                        </FilterChip>
                      );
                    })}
                  </div>
                  <div className="annot filter-tier-note">{TIER_NOTE[facet.tier]}</div>
                </FilterGroup>
              );
            })}
          </>
        );
      }}
    </FilterPopover>
  );
}
