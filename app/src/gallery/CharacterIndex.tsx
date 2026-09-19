import { useMemo, useState } from 'react';
import type { UniverseMeta } from '../types';
import type { WorldMetrics } from './metrics';
import { buildIndex, TIER_NOTE } from './indexData';
import { RadioRow } from './RadioRow';

/**
 * Every character in every loaded world, searchable, with the facets as filters.
 *
 * The index the earlier draft of the doc wanted, made useful rather than
 * dutiful. Coverage decides what it may honestly do, and `indexData` computes
 * that rather than assuming it.
 */

type SortKey = 'name' | 'world' | 'degree' | 'gain' | 'prominence';

/** Rendering every row at once is slow and useless; nobody reads past a screen
 * or two, and the count says what the filter actually matched. */
const PAGE = 150;

/** One set of column widths for the header and the rows, so they line up. */
const COL = { ties: 46, horizon: 58, presence: 64 };

const COLUMN_NOTES = {
  ties: 'How many other characters they appear with.',
  horizon:
    'How much their second ring multiplies their first. 1.0× means they already reach everyone they ever will.',
  presence:
    'Where they rank inside their own world for how much of the story they are in, from 0 (barely present) to 100 (the most present character in the book).',
};

export function CharacterIndex({
  worlds,
  metas,
  loading,
}: {
  worlds: WorldMetrics[];
  metas: Map<string, UniverseMeta>;
  loading: boolean;
}) {
  const [query, setQuery] = useState('');
  const [facetKey, setFacetKey] = useState<string | null>(null);
  const [facetValue, setFacetValue] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>('prominence');
  const [limit, setLimit] = useState(PAGE);

  const { rows, facets } = useMemo(() => buildIndex(worlds, metas), [worlds, metas]);
  const activeFacet = facets.find((f) => f.key === facetKey) ?? null;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let out = rows;
    if (needle) {
      out = out.filter(
        (r) => r.name.toLowerCase().includes(needle) || r.worldTitle.toLowerCase().includes(needle),
      );
    }
    if (facetKey) {
      out = out.filter((r) => {
        const labels = r.facts[facetKey];
        if (!labels) return false;
        return facetValue === null || labels.includes(facetValue);
      });
    }
    const sorted = [...out];
    sorted.sort((a, b) => {
      switch (sort) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'world':
          return a.worldTitle.localeCompare(b.worldTitle) || a.name.localeCompare(b.name);
        case 'degree':
          return b.degree - a.degree;
        case 'gain':
          return b.gain - a.gain;
        default:
          return b.prominence - a.prominence;
      }
    });
    return sorted;
  }, [rows, query, facetKey, facetValue, sort]);

  const chooseFacet = (key: string | null) => {
    setFacetKey(key);
    setFacetValue(null);
    setLimit(PAGE);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingTop: 22 }}>
      <div style={{ position: 'relative', width: 'min(460px, 100%)' }}>
        <input
          className="field"
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(PAGE);
          }}
          placeholder="Search every character"
          aria-label="Search every character"
          autoComplete="off"
          style={{ fontSize: 21, paddingRight: 28 }}
        />
        {query && (
          <button
            className="field-clear"
            aria-label="Clear the search"
            onClick={() => {
              setQuery('');
              setLimit(PAGE);
            }}
            style={{ position: 'absolute', right: 0, bottom: 10 }}
          >
            ×
          </button>
        )}
      </div>

      <RadioRow
        label="Facet"
        value={facetKey ?? ''}
        onChange={(key) => chooseFacet(key === '' ? null : key)}
        dim={(key) => facets.find((f) => f.key === key)?.tier === 'single'}
        options={[
          { key: '', label: 'Any' },
          ...facets.map((facet) => ({
            key: facet.key,
            label: facet.key,
            title: `${facet.characters} characters across ${facet.worlds} ${facet.worlds === 1 ? 'world' : 'worlds'}. ${TIER_NOTE[facet.tier]}`,
          })),
        ]}
      />

      {activeFacet && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="annot" style={{ fontSize: 9, lineHeight: 1.7, maxWidth: 640 }}>
            {TIER_NOTE[activeFacet.tier]}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {activeFacet.values.slice(0, 40).map((v) => (
              <button
                key={v.value}
                onClick={() => {
                  setFacetValue(facetValue === v.value ? null : v.value);
                  setLimit(PAGE);
                }}
                style={{
                  fontFamily: 'var(--serif)',
                  fontSize: 14,
                  color: facetValue === v.value ? 'var(--accent)' : 'var(--body)',
                  borderBottom: `1px solid ${facetValue === v.value ? 'var(--accent)' : 'var(--rule)'}`,
                  padding: '3px 2px',
                }}
              >
                {v.value}{' '}
                <span className="mono" style={{ fontSize: 9, color: 'var(--unknown)' }}>{v.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
          borderTop: '1px solid var(--rule)',
          paddingTop: 12,
        }}
      >
        <RadioRow
          label="Order by"
          value={sort}
          onChange={setSort}
          options={[
            { key: 'prominence', label: 'Presence' },
            { key: 'gain', label: 'Horizon' },
            { key: 'degree', label: 'Ties' },
            { key: 'name', label: 'Name' },
            { key: 'world', label: 'World' },
          ]}
        />
        <span className="annot" style={{ fontSize: 9 }}>
          {loading ? 'Reading the enrichment files…' : `${filtered.length} of ${rows.length}`}
        </span>
      </div>

      <div>
        {/* The three numbers meant nothing without these. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 16,
            padding: '0 0 7px 0',
            borderBottom: '1px solid var(--rule)',
          }}
        >
          <span className="annot" style={{ fontSize: 9, flex: 1, minWidth: 0 }}>
            Character
          </span>
          <span className="annot" style={{ fontSize: 9, width: COL.ties, textAlign: 'right' }} title={COLUMN_NOTES.ties}>
            Ties
          </span>
          <span className="annot" style={{ fontSize: 9, width: COL.horizon, textAlign: 'right' }} title={COLUMN_NOTES.horizon}>
            Horizon
          </span>
          <span className="annot" style={{ fontSize: 9, width: COL.presence, textAlign: 'right' }} title={COLUMN_NOTES.presence}>
            Presence
          </span>
        </div>
        {filtered.slice(0, limit).map((row) => (
          <div
            key={row.key}
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 16,
              padding: '9px 0',
              borderBottom: '1px solid var(--rule)',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--serif)', fontSize: 17, color: 'var(--ink)' }}>
                {row.name}
              </div>
              {/* Under the name rather than beside it: at a narrow width the
                  world's title used to wrap into the numbers column and read as
                  part of the next row. */}
              <div className="annot" style={{ fontSize: 9, paddingTop: 2 }}>
                {row.worldTitle}
                {activeFacet && row.facts[activeFacet.key] && (
                  <span style={{ color: 'var(--body)' }}>
                    {' · '}
                    {row.facts[activeFacet.key].join(', ')}
                  </span>
                )}
              </div>
            </div>
            <span
              className="mono"
              style={{ fontSize: 11, color: 'var(--body)', width: COL.ties, textAlign: 'right' }}
              title={COLUMN_NOTES.ties}
            >
              {row.degree}
            </span>
            <span
              className="mono"
              style={{ fontSize: 11, color: 'var(--body)', width: COL.horizon, textAlign: 'right' }}
              title={COLUMN_NOTES.horizon}
            >
              {row.gain.toFixed(1)}×
            </span>
            <span
              className="mono"
              style={{ fontSize: 11, color: 'var(--unknown)', width: COL.presence, textAlign: 'right' }}
              title={COLUMN_NOTES.presence}
            >
              {Math.round(row.prominence * 100)}
            </span>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="annot" style={{ textAlign: 'center', padding: '40px 0' }}>
            {loading ? 'Still loading' : 'Nobody matches'}
          </div>
        )}

        {filtered.length > limit && (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 18 }}>
            <button className="action-quiet ruled" onClick={() => setLimit((n) => n + PAGE)}>
              Show more
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
