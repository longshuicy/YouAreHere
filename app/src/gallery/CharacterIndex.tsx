import { useMemo, useState } from 'react';
import type { UniverseMeta } from '../types';
import type { WorldMetrics } from './metrics';
import { buildIndex, type IndexRow } from './indexData';
import { FacetFilter, matchesCharacter, type CharacterSelection } from './FacetFilter';
import {
  Cell,
  Head,
  HeadRow,
  LedgerControls,
  OpenMark,
  OpenSpacer,
  ROW_H,
  NAME_FLEX,
  ScaleNote,
  SearchField,
  leanOf,
  nextSort,
  rowHighlight,
  useBands,
  type LedgerColumn,
} from './LedgerParts';

/**
 * Every character in every loaded world, on the same shared scales the worlds
 * ledger uses.
 *
 * It used to print three right-aligned figures per row, which is a table and
 * not a comparison: three numbers in three units, read one row at a time. The
 * same bars as the worlds ledger make the catalogue vertical — you can run an
 * eye down `Presence` and see where the leads stop and the furniture starts,
 * across every book at once.
 *
 * Every column here is a share or a rank *inside the character's own world*,
 * never a raw count. That is what makes a row from a twelve-hander and a row
 * from a cast of nine hundred the same kind of statement. Ties is the one raw
 * figure, and it is printed as a number rather than drawn as a bar for exactly
 * that reason.
 */

/** Rendering every row at once is slow and useless; nobody reads past a screen
 * or two, and the count says what the filter actually matched. */
const PAGE = 150;
const TIES_W = 44;

/**
 * Four, not six.
 *
 * Six fitted and still read as a crowd, because two of them were saying a
 * neighbour's sentence over again. `Friends of friends` and `World in reach`
 * are both built on the same two-hop reach — one divided by the character's own
 * ties, the other by their world's cast — and of the two it is the share that a
 * reader can state out loud: *this person can get to 84% of their book in two
 * handshakes*. The ratio is the more interesting number and the harder one, so
 * it stays where it has room to be explained: the horizon strip on a world's
 * page, and that page's `The widest horizon` column, which is still sorted on
 * it. `Time per person` went for the same reason against `How present` — weight
 * per tie against weight overall, two readings of the same ledger.
 *
 * What is left is four questions that do not overlap: how much of the book they
 * are in, how much of it they can see, whether their circle is closed, and how
 * big the group around them is.
 */
const COLUMNS: LedgerColumn<IndexRow>[] = [
  {
    key: 'presence',
    label: 'How present',
    of: (r) => r.prominence,
    format: (v) => String(Math.round(v * 100)),
    title:
      'How much of their own book they are actually in, as a place among its whole cast: 0 is barely there, 100 is the most present person in that story. A rank inside their own world, so a lead in a twelve-hander and a lead in a saga both sit near the top.\n\nBlind to what the presence is made of: a scene and a battle count the same.',
  },
  {
    key: 'inview',
    label: 'World in reach',
    of: (r) => r.reachShare,
    format: (v) => `${Math.round(v * 100)}%`,
    title:
      'How much of their own book they can get to in two handshakes. A protagonist sits near 100%; somebody sealed in a side plot sits low however many friends of friends they have.\n\nBlind to distance beyond two hops: it says what is near, not what is reachable.',
  },
  {
    key: 'circle',
    label: 'Friends overlap',
    of: (r) => r.clustering,
    format: (v) => v.toFixed(2),
    title:
      'Whether the people they know also know each other. High is somebody inside a household, where everyone is already acquainted; low is somebody who moves between groups that never meet — the only thing those groups have in common.\n\nBlind in a small neighbourhood, where one tie swings it from 0 to 1.',
  },
  {
    key: 'camp',
    label: 'Size of their group',
    of: (r) => r.campShare,
    format: (v) => `${Math.round(v * 100)}%`,
    title:
      'How much of the cast is in their camp — the group that mostly appears with each other rather than with the rest.\n\nBlind to small factions, which the partition swallows into big ones.',
  },
];

export function CharacterIndex({
  worlds,
  metas,
  loading,
  onOpen,
}: {
  worlds: WorldMetrics[];
  metas: Map<string, UniverseMeta>;
  loading: boolean;
  /** Opening a character replaces the whole gallery, the way opening a world
   * does — so the page it opens onto is owned up there, not here. */
  onOpen: (worldId: string, i: number) => void;
}) {
  const [query, setQuery] = useState('');
  const [selection, setSelection] = useState<CharacterSelection>({});
  /** A to Z. An opening order that is itself one of the measures quietly
   * nominates that measure as the important one; the alphabet nominates
   * nothing. */
  const [sort, setSort] = useState({ key: 'name', descending: false });
  const [limit, setLimit] = useState(PAGE);
  const [hot, setHot] = useState<string | null>(null);

  const { rows, facets } = useMemo(() => buildIndex(worlds, metas), [worlds, metas]);
  const chosenKeys = Object.keys(selection);
  const bands = useBands(rows, COLUMNS);

  const searched = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (r) => r.name.toLowerCase().includes(needle) || r.worldTitle.toLowerCase().includes(needle),
    );
  }, [rows, query]);

  const filtered = useMemo(() => {
    const out = Object.keys(selection).length > 0 ? searched.filter((r) => matchesCharacter(r, selection)) : searched;
    const col = COLUMNS.find((c) => c.key === sort.key);
    const sorted = [...out].sort((a, b) => {
      if (col) return col.of(a) - col.of(b);
      if (sort.key === 'ties') return a.degree - b.degree;
      if (sort.key === 'world') return a.worldTitle.localeCompare(b.worldTitle) || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
    if (sort.descending) sorted.reverse();
    return sorted;
  }, [searched, selection, sort]);

  const applySelection = (next: CharacterSelection) => {
    setSelection(next);
    setLimit(PAGE);
  };
  const sortBy = (key: string) =>
    setSort((was) => nextSort(was, key, (k) => k === 'name' || k === 'world'));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingTop: 22 }}>
      <LedgerControls
        count={
          loading
            ? 'Reading the enrichment files…'
            : `${filtered.length.toLocaleString()} of ${rows.length.toLocaleString()}`
        }
      >
        <SearchField
          value={query}
          onChange={(next) => {
            setQuery(next);
            setLimit(PAGE);
          }}
          placeholder={`Search ${rows.length.toLocaleString()} ${rows.length === 1 ? 'character' : 'characters'}`}
        />
        <FacetFilter
          facets={facets}
          pool={searched}
          applied={selection}
          onApply={applySelection}
          loading={loading}
        />
        <ScaleNote />
      </LedgerControls>

      <div>
        <HeadRow>
          <Head
            label="Character"
            sortKey="name"
            sort={sort}
            onSort={sortBy}
            grow
            title={
              'Everyone in every world you have loaded, with the book they are from beside the name. Press a row to read their page.\n\nBlind to the obvious: a co-appearance graph knows who shares a scene, not who matters in it.'
            }
          />
          <Head
            label="Ties"
            sortKey="ties"
            sort={sort}
            onSort={sortBy}
            width={TIES_W}
            title={
              'How many other characters they appear with. The one raw count here, printed as a figure rather than drawn as a bar: it cannot be compared across books, because twelve ties in a twelve-hander and twelve in a saga are not the same fact.\n\nBlind to how often. Somebody met once and somebody present throughout both count as one tie.'
            }
          />
          {COLUMNS.map((col, i) => (
            <Head
              key={col.key}
              label={col.label}
              sortKey={col.key}
              sort={sort}
              onSort={sortBy}
              title={col.title}
              minor={i >= 3}
            />
          ))}
          <OpenSpacer />
        </HeadRow>

        <div style={{ borderTop: '1px solid var(--rule)' }}>
          {filtered.slice(0, limit).map((row) => {
            const lit = hot === row.key;
            return (
              <div
                key={row.key}
                role="button"
                tabIndex={0}
                onMouseEnter={() => setHot(row.key)}
                onMouseLeave={() => setHot(null)}
                onFocus={() => setHot(row.key)}
                onBlur={() => setHot(null)}
                onClick={() => onOpen(row.worldId, row.i)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpen(row.worldId, row.i);
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  height: ROW_H,
                  borderBottom: '1px solid var(--rule)',
                  cursor: 'pointer',
                  outline: 'none',
                  color: lit ? 'var(--accent)' : 'var(--ink)',
                  ...rowHighlight(lit),
                }}
              >
                <div
                  style={{
                    flex: NAME_FLEX,
                    minWidth: 120,
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 9,
                    paddingLeft: lit ? 10 : 0,
                    paddingRight: 12,
                    overflow: 'hidden',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--serif)',
                      fontSize: 15,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      flexShrink: 0,
                      maxWidth: '60%',
                      textDecoration: lit ? 'underline' : 'none',
                      textDecorationColor: 'var(--accent)',
                      textUnderlineOffset: 3,
                      textDecorationThickness: 1,
                    }}
                  >
                    {row.name}
                  </span>
                  {/* The world beside the name rather than under it: a ledger
                      row is one line tall, and at this height a second line is
                      the next character's. */}
                  <span
                    className="annot"
                    style={{
                      fontSize: 8,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      color: lit ? 'var(--accent)' : 'var(--unknown)',
                    }}
                  >
                    {row.worldTitle}
                    {chosenKeys.map(
                      (key) =>
                        row.facts[key] && (
                          <span key={key} style={{ color: lit ? 'var(--accent)' : 'var(--annotation)' }}>
                            {' · '}
                            {row.facts[key].join(', ')}
                          </span>
                        ),
                    )}
                  </span>
                </div>
                <div
                  className="mono"
                  style={{
                    flex: `0 0 ${TIES_W}px`,
                    fontSize: 10,
                    color: lit ? 'var(--accent)' : 'var(--unknown)',
                  }}
                >
                  {row.degree}
                </div>
                {bands.map((band, i) => (
                  <Cell
                    key={COLUMNS[i].key}
                    lean={leanOf(band, row)}
                    lit={lit}
                    minor={i >= 3}
                    figure={COLUMNS[i].format(COLUMNS[i].of(row))}
                  />
                ))}
                <OpenMark lit={lit} />
              </div>
            );
          })}

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
    </div>
  );
}
