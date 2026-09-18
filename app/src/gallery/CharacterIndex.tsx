import { useMemo, useState } from 'react';
import type { UniverseMeta } from '../types';
import type { WorldMetrics } from './metrics';
import { buildIndex, TIER_NOTE } from './indexData';

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
        style={{ width: 'min(460px, 100%)', fontSize: 21 }}
      />

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
        <span className="annot" style={{ fontSize: 9 }}>Facet</span>
        <button
          onClick={() => chooseFacet(null)}
          className="mono"
          style={{
            fontSize: 10,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: facetKey === null ? 'var(--accent)' : 'var(--annotation)',
            borderBottom: `1px solid ${facetKey === null ? 'var(--accent)' : 'transparent'}`,
            padding: '6px 2px 4px 2px',
          }}
        >
          Any
        </button>
        {facets.map((facet) => (
          <button
            key={facet.key}
            onClick={() => chooseFacet(facet.key)}
            title={`${facet.characters} characters across ${facet.worlds} ${facet.worlds === 1 ? 'world' : 'worlds'}. ${TIER_NOTE[facet.tier]}`}
            className="mono"
            style={{
              fontSize: 10,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: facetKey === facet.key ? 'var(--accent)' : 'var(--annotation)',
              borderBottom: `1px solid ${facetKey === facet.key ? 'var(--accent)' : 'transparent'}`,
              padding: '6px 2px 4px 2px',
              // Single-world facets are dimmed rather than hidden: they are real
              // and worth browsing, they just cannot carry a corpus-wide claim.
              opacity: facet.tier === 'single' ? 0.55 : 1,
            }}
          >
            {facet.key}
          </button>
        ))}
      </div>

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
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
          <span className="annot" style={{ fontSize: 9 }}>Order by</span>
          {(
            [
              ['prominence', 'Presence'],
              ['gain', 'Horizon'],
              ['degree', 'Ties'],
              ['name', 'Name'],
              ['world', 'World'],
            ] as [SortKey, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSort(key)}
              className="mono"
              style={{
                fontSize: 10,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: sort === key ? 'var(--accent)' : 'var(--annotation)',
                borderBottom: `1px solid ${sort === key ? 'var(--accent)' : 'transparent'}`,
                padding: '6px 2px 4px 2px',
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="annot" style={{ fontSize: 9 }}>
          {loading ? 'Reading the enrichment files…' : `${filtered.length} of ${rows.length}`}
        </span>
      </div>

      <div>
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
              <span style={{ fontFamily: 'var(--serif)', fontSize: 17, color: 'var(--ink)' }}>
                {row.name}
              </span>
              <span className="annot" style={{ fontSize: 9, paddingLeft: 12 }}>
                {row.worldTitle}
              </span>
              {activeFacet && row.facts[activeFacet.key] && (
                <span
                  style={{
                    fontFamily: 'var(--serif)',
                    fontSize: 13,
                    color: 'var(--annotation)',
                    paddingLeft: 12,
                  }}
                >
                  {row.facts[activeFacet.key].join(', ')}
                </span>
              )}
            </div>
            <span className="mono" style={{ fontSize: 11, color: 'var(--body)', width: 58, textAlign: 'right' }}>
              {row.degree} ties
            </span>
            <span className="mono" style={{ fontSize: 11, color: 'var(--body)', width: 52, textAlign: 'right' }}>
              {row.gain.toFixed(1)}×
            </span>
            <span
              className="mono"
              style={{ fontSize: 11, color: 'var(--unknown)', width: 46, textAlign: 'right' }}
              title="Where their weighted degree ranks inside their own world"
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
