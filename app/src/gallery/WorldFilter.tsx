import { useMemo } from 'react';
import type { Universe } from '../types';
import { familiarityFor } from '../data/worlds';
import { FilterChip, FilterGroup, FilterPopover } from './FilterPopover';

/**
 * The worlds ledger's filter.
 *
 * Nothing here is fetched or emitted for it: every facet is read off what the
 * client already holds — the provenance each universe file carries, the cast,
 * and the familiarity bands in `data/worlds.ts`.
 * Several choices in one facet match any of them; choices across facets must
 * all hold.
 */

export type WorldFacts = Record<string, string>;
export type WorldSelection = Record<string, string[]>;

const WORLD_FACETS: { key: string; label: string; order: string[] }[] = [
  { key: 'medium', label: 'Told as', order: ['Play', 'Book', 'Film', 'TV series', 'Real-life record'] },
  { key: 'language', label: 'Language', order: ['English', 'Chinese'] },
  { key: 'size', label: 'Cast size', order: ['Small · under 50', 'Medium · 50 to 199', 'Large · 200 and up'] },
  { key: 'known', label: 'How well known', order: ['Well known', 'Somewhat known', 'Little known'] },
];

const MEDIUM: Record<string, string> = {
  play: 'Play',
  book: 'Book',
  chapter: 'Book',
  volume: 'Book',
  juan: 'Book',
  film: 'Film',
  season: 'TV series',
  congress: 'Real-life record',
  year: 'Real-life record',
  decade: 'Real-life record',
};

const KNOWN = ['Little known', 'Somewhat known', 'Well known'];

function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function worldFactsOf(universe: Universe): WorldFacts {
  const facts: WorldFacts = {};
  const unit = universe.provenance?.sourceUnit;
  if (unit) facts.medium = MEDIUM[unit] ?? capitalised(unit);
  facts.language = /[\u3400-\u9fff]/.test(universe.title) ? 'Chinese' : 'English';
  const cast = universe.nodes.length;
  facts.size = cast < 50 ? 'Small · under 50' : cast < 200 ? 'Medium · 50 to 199' : 'Large · 200 and up';
  facts.known = KNOWN[familiarityFor(universe.id)] ?? 'Well known';
  return facts;
}

export function matchesWorld(facts: WorldFacts | undefined, selection: WorldSelection): boolean {
  return Object.entries(selection).every(
    ([key, values]) => values.length === 0 || (facts !== undefined && values.includes(facts[key])),
  );
}

export function selectionSize(selection: WorldSelection): number {
  return Object.values(selection).reduce((sum, values) => sum + values.length, 0);
}

function without(selection: WorldSelection, key: string): WorldSelection {
  const next = { ...selection };
  delete next[key];
  return next;
}

export function WorldFilter({
  facts,
  applied,
  onApply,
  countFor,
}: {
  facts: Map<string, WorldFacts>;
  applied: WorldSelection;
  onApply: (next: WorldSelection) => void;
  /** How many of the worlds the search leaves a selection keeps. */
  countFor: (selection: WorldSelection) => number;
}) {
  /** Every value any world has, in each facet's reading order. */
  const facets = useMemo(
    () =>
      WORLD_FACETS.map((facet) => {
        const seen = new Map<string, number>();
        for (const f of facts.values()) {
          const value = f[facet.key];
          if (value) seen.set(value, (seen.get(value) ?? 0) + 1);
        }
        const rank = (v: string) => {
          const i = facet.order.indexOf(v);
          return i === -1 ? facet.order.length : i;
        };
        const values = [...seen.entries()]
          .sort((a, b) => rank(a[0]) - rank(b[0]) || b[1] - a[1] || a[0].localeCompare(b[0]))
          .map(([value]) => value);
        return { ...facet, values };
      }).filter((facet) => facet.values.length > 0),
    [facts],
  );

  return (
    <FilterPopover
      label="Filter worlds"
      title="Show only worlds…"
      applied={applied}
      empty={{}}
      active={selectionSize(applied)}
      countFor={countFor}
      noun={['world', 'worlds']}
      onApply={onApply}
      footnote="Greyed out · would leave no worlds"
    >
      {(draft, setDraft) =>
        facets.map((facet) => (
          <FilterGroup key={facet.key} label={facet.label}>
            <div className="filter-chips">
              {facet.values.map((value) => {
                const chosen = draft[facet.key] ?? [];
                const on = chosen.includes(value);
                const count = countFor({ ...without(draft, facet.key), [facet.key]: [value] });
                return (
                  <FilterChip
                    key={value}
                    on={on}
                    dim={!on && count === 0}
                    count={count}
                    onClick={() =>
                      setDraft((was) => {
                        const current = was[facet.key] ?? [];
                        const next = on ? current.filter((v) => v !== value) : [...current, value];
                        return { ...was, [facet.key]: next };
                      })
                    }
                  >
                    {value}
                  </FilterChip>
                );
              })}
            </div>
          </FilterGroup>
        ))
      }
    </FilterPopover>
  );
}
