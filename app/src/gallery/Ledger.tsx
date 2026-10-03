import { useMemo, useState } from 'react';
import type { WorldMetrics } from './metrics';
import { progressLine, type WorldProgress } from '../engine/residence';
import { matchesWorld, WorldFilter, type WorldFacts, type WorldSelection } from './WorldFilter';
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
 * Every world as one line, on shared scales.
 *
 * This replaces the grid of cards, which stopped working somewhere around the
 * thirtieth world. A card is a reading unit and a poor comparison unit: each is
 * its own coordinate system, so comparing two means carrying a scale across
 * three hundred pixels of paper, and past a certain count the two you want to
 * compare are never next to each other. Sorting the grid helps a little and then
 * stops, because it orders cards on one measure while each card shows six.
 *
 * Here the comparison is vertical and the eye does it without being asked. Every
 * row is drawn on the same six scales at the same six positions: a column all
 * leaning one way is a catalogue skewed on that measure, an empty cell is a
 * world with nothing to say about it, and one row with every bar out is a
 * strange world. The cards are not gone — a world's own page still draws one,
 * which is where a card was always the right thing.
 */

const CAST_W = 56;

/**
 * Six measures, and cast is not among them.
 *
 * The cast is printed as a figure in its own column a few inches to the left, so
 * a bar for it would be the same fact drawn twice — and it is the one quantity
 * here that is not a shape. Half the measures that look like shape are cast size
 * in disguise: density, the small-world coefficient and mean distance all track
 * it above rho 0.88 across this catalogue, and concentration — the Gini the
 * cards print — tracks it at 0.79. That is why `One centre` is Freeman
 * centralization instead: it asks concentration's question, but scored against
 * the star of the same size, so a twelve-hander and a cast of nine hundred are
 * each measured against their own ceiling.
 */
const COLUMNS: LedgerColumn<WorldMetrics>[] = [
  {
    key: 'centre',
    label: 'One at the centre',
    of: (w) => w.centralization,
    format: (v) => v.toFixed(2),
    title:
      'Whether the story has one person at its centre. High is a story about somebody, with everyone else attached to them; low is an ensemble where no one is the hub. Measured against the most centralised world of the same size, so a twelve-hander and a cast of nine hundred are each scored against their own ceiling.\n\nBlind to who. A two-hander and a tyranny score alike.',
  },
  {
    key: 'apart',
    label: 'Typical distance',
    of: (w) => w.distanceSpread,
    format: (v) => v.toFixed(2),
    title:
      'How many handshakes lie between two characters picked at random, with the fact that a bigger cast needs more of them divided out. Low means everyone is effectively in one room; high means the story is a chain of places that only touch at the edges.\n\nBlind to where the density came from: a world extracted scene by scene sits lower than one extracted chapter by chapter, and this cannot tell that from a cast who genuinely all know each other.',
  },
  {
    key: 'camps',
    label: 'Split into camps',
    of: (w) => w.modularity,
    format: (v) => v.toFixed(2),
    title:
      'How cleanly the cast divides into groups that keep to themselves — households, courts, armies. High means the camps barely mix; low means everybody turns up everywhere.\n\nBlind to small factions, which are swallowed by big ones.',
  },
  {
    key: 'circles',
    label: 'Friends overlap',
    of: (w) => w.clustering,
    format: (v) => v.toFixed(2),
    title:
      'Whether the people you know also know each other. High is a world of households and tables; low is hub and spoke, where everyone meets through somebody.\n\nBlind in small neighbourhoods, where it swings wildly on one tie.',
  },
  {
    key: 'horizon',
    label: 'Has outsiders',
    of: (w) => w.horizonSpread,
    format: (v) => `${v.toFixed(1)}×`,
    title:
      'The furthest character’s horizon divided by an ordinary one’s. A big number means the world has genuine outsiders; near 1 means it has none.\n\nBlind to everyone but that one character, who decides the figure alone — which is the point of it.',
  },
  {
    key: 'diameter',
    label: 'Furthest apart',
    of: (w) => w.diameter,
    format: (v) => String(v),
    title:
      'The most handshakes between any two characters — how far apart the two furthest people in the book actually are. Typical distance is the average; this is the extreme.\n\nBlind to how rare that walk is: one pair at the end of a thread sets it for everybody.',
  },
];

export function Ledger({
  worlds,
  progress,
  onOpen,
  hovered,
  onHover,
  facts,
}: {
  worlds: WorldMetrics[];
  progress: Map<string, WorldProgress>;
  onOpen: (id: string) => void;
  /** Each world's facets, for the filter. No filter is drawn without them. */
  facts?: Map<string, WorldFacts>;
  /** Shared with anything else drawing the same worlds, so a row and a mark
   * light together. Local when nothing else is listening. */
  hovered?: string | null;
  onHover?: (id: string | null) => void;
}) {
  const [query, setQuery] = useState('');
  /** A to Z, not biggest-first. The ledger's job is comparison, and an opening
   * order that is itself one of the measures quietly nominates that measure as
   * the important one. The alphabet nominates nothing. */
  const [sort, setSort] = useState({ key: 'title', descending: false });
  const [selection, setSelection] = useState<WorldSelection>({});
  const [localHover, setLocalHover] = useState<string | null>(null);
  const hot = hovered ?? localHover;

  const bands = useBands(worlds, COLUMNS);

  const searched = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? worlds.filter((w) => w.title.toLowerCase().includes(needle)) : worlds;
  }, [worlds, query]);

  const rows = useMemo(() => {
    const matched = facts ? searched.filter((w) => matchesWorld(facts.get(w.id), selection)) : searched;
    const col = COLUMNS.find((c) => c.key === sort.key);
    const of = col ? col.of : sort.key === 'cast' ? (w: WorldMetrics) => w.nodes : null;
    const ordered = [...matched].sort((a, b) => (of ? of(a) - of(b) : a.title.localeCompare(b.title)));
    if (sort.descending) ordered.reverse();
    return ordered;
  }, [searched, facts, selection, sort]);

  const countFor = (next: WorldSelection) =>
    facts ? searched.filter((w) => matchesWorld(facts.get(w.id), next)).length : searched.length;

  const setHot = (id: string | null) => {
    setLocalHover(id);
    onHover?.(id);
  };
  const sortBy = (key: string) => setSort((was) => nextSort(was, key, (k) => k === 'title'));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingTop: 22 }}>
      <LedgerControls count={`${rows.length} of ${worlds.length}`}>
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder={`Search ${worlds.length} ${worlds.length === 1 ? 'world' : 'worlds'}`}
        />
        {facts && (
          <WorldFilter
            facts={facts}
            applied={selection}
            onApply={setSelection}
            countFor={countFor}
          />
        )}
        <ScaleNote />
      </LedgerControls>

      <div>
        <HeadRow>
          <Head
            label="World"
            sortKey="title"
            sort={sort}
            onSort={sortBy}
            grow
            title={
              'Every world you have loaded, drawn on the same six scales. Press a row to open its page \u2014 the whole network, its fingerprint, its camps and its outliers.\n\nBlind to the obvious: all of this is measured on who appears with whom, which is a proxy for a story and not the story.'
            }
          />
          <Head
            label="Cast"
            sortKey="cast"
            sort={sort}
            onSort={sortBy}
            width={CAST_W}
            title={
              'How many characters the world has, after the pipeline drops anyone with fewer than two ties and keeps the largest connected piece. Printed as a figure rather than drawn as a bar: it is not a shape, and half the measures that look like shape turn out to be this one in disguise.\n\nBlind to how the source was read. A film counted scene by scene yields a different cast from a novel counted chapter by chapter.'
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
          {rows.map((world) => {
            const lit = hot === world.id;
            const mapped = progress.get(world.id);
            return (
              <div
                key={world.id}
                role="button"
                tabIndex={0}
                onMouseEnter={() => setHot(world.id)}
                onMouseLeave={() => setHot(null)}
                onFocus={() => setHot(world.id)}
                onBlur={() => setHot(null)}
                onClick={() => onOpen(world.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpen(world.id);
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
                    gap: 10,
                    paddingLeft: lit ? 10 : 0,
                    paddingRight: 12,
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--serif)',
                      fontSize: 15,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      // The same underline every other link in this app wears,
                      // drawn only under the pointer so a page of fifty-two is
                      // not a page of fifty-two underlines.
                      textDecoration: lit ? 'underline' : 'none',
                      textDecorationColor: 'var(--accent)',
                      textUnderlineOffset: 3,
                      textDecorationThickness: 1,
                    }}
                  >
                    {world.title}
                  </span>
                  {mapped && (
                    <span
                      className="annot"
                      style={{ fontSize: 8, color: 'var(--accent)', whiteSpace: 'nowrap' }}
                    >
                      {progressLine(mapped)}
                    </span>
                  )}
                </div>
                <div
                  className="mono"
                  style={{
                    flex: `0 0 ${CAST_W}px`,
                    fontSize: 10,
                    color: lit ? 'var(--accent)' : 'var(--unknown)',
                  }}
                >
                  {world.nodes}
                </div>
                {bands.map((band, i) => (
                  <Cell
                    key={COLUMNS[i].key}
                    lean={leanOf(band, world)}
                    lit={lit}
                    minor={i >= 3}
                    figure={COLUMNS[i].format(COLUMNS[i].of(world))}
                  />
                ))}
                <OpenMark lit={lit} />
              </div>
            );
          })}

          {rows.length === 0 && (
            <div className="annot" style={{ textAlign: 'center', padding: '40px 0' }}>
              No world matches
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
