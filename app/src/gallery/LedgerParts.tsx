import { useMemo, type ReactNode } from 'react';

/**
 * The shared parts of a ledger: the search field, the bar cell, the sortable
 * column head, and the arithmetic that places a bar against the rest of the
 * catalogue.
 *
 * Worlds and characters are the same kind of list — many comparable things,
 * each with a handful of measures — so they are drawn by the same pieces rather
 * than by two files that look alike until one of them is edited.
 */

export interface LedgerColumn<T> {
  key: string;
  label: string;
  /** Which way is "more". Every bar leans right for more of the thing named. */
  of: (row: T) => number;
  format: (v: number) => string;
  /** The gloss, shown on the head. Every figure here states its blind spot. */
  title?: string;
}

export const BAR_H = 9;
export const ROW_H = 27;
/** A metric column's share of whatever width the page has. The name column
 * takes the slack, so the measure columns stay the same width as each other on
 * every screen — which is the whole point of a shared scale. */
export const COL_BASIS = 92;
export const COL_GAP = 10;
/** Narrow enough that six of them plus a name still fit a laptop window without
 * the row forcing the page sideways — at which point every other line on the
 * page looks clipped too, because the whole document has grown. */
export const COL_MIN = 44;
export const NAME_FLEX = '2 1 180px';
export const NAME_MIN = 104;
/** The gutter the open-mark sits in, at the end of every row and reserved in
 * the head so the columns above and below still line up. */
export const OPEN_W = 20;
/** Clears the sticky view switcher above. */
export const HEAD_OFFSET = 46;

export interface Band<T> {
  col: LedgerColumn<T>;
  /** Every distinct value's place along the column, 0 to 1. Ties share a
   * place, so two worlds with the same figure draw the same bar. */
  rank: Map<number, number>;
}

/**
 * Each column's own distribution, so a bar is placed against the catalogue
 * rather than against a constant.
 *
 * Corpus-relative, and it re-derives every time a world is loaded. That is
 * right here and would be wrong on a card: a card says what a thing is, a row
 * says where it stands, and where it stands is a fact about the company it
 * keeps.
 *
 * Measured over everything loaded, never over what the filter left. A column
 * that rescaled to its own filtered subset would redraw every bar each time a
 * facet was chosen, and "far out" would quietly come to mean "far out among
 * these nine", which is the one thing a shared scale exists to prevent.
 */
export function useBands<T>(rows: T[], columns: LedgerColumn<T>[]): Band<T>[] {
  return useMemo(
    () =>
      columns.map((col) => {
        const values = rows.map(col.of).sort((a, b) => a - b);
        const rank = new Map<number, number>();
        values.forEach((v, i) => {
          if (!rank.has(v)) rank.set(v, i / Math.max(1, values.length - 1));
        });
        return { col, rank };
      }),
    [rows, columns],
  );
}

/**
 * Where this one places on that column, as −1 to 1: the far left of the
 * catalogue to the far right, with 0 at the middle.
 *
 * Rank, and only rank. There was a second reading for a while — distance from
 * the middle in units of the tenth-to-ninetieth spread — and it was dropped
 * rather than kept as a toggle. It drew better pictures: empty cells where a
 * world was ordinary, long bars where it was not. But its bar length meant
 * nothing a reader could say out loud without first being told what a
 * tenth-to-ninetieth spread is, it clipped at both ends, and offering both put
 * the reader in charge of a decision they had no way to make. A rank needs one
 * sentence and never clips. The real figure is a hover away, which is where a
 * figure belongs.
 */
export function leanOf<T>(band: Band<T>, row: T): number {
  return (band.rank.get(band.col.of(row)) ?? 0.5) * 2 - 1;
}

/**
 * One measure for one row: a bar from the middle of the catalogue, and on hover
 * the figure behind it.
 *
 * The figure is centred in its own cell, and the bar drops to a rule under it.
 *
 * It used to be printed just past the end of its own bar, pointing outward,
 * which seemed tidy and was unreadable in the one case that matters. Two
 * neighbouring cells where the left one leans hard right and the right one
 * leans hard left put both figures in the ten pixels of gutter between them,
 * printed on top of each other: `100%` and `19.0%` came out as one illegible
 * smear. Anchoring each figure inside its own cell fixes the overlap but not
 * the collision with a full-length bar, which reaches the cell edge the figure
 * would sit at. Centring it and standing the bar down is the only arrangement
 * where the number is always legible and always belongs to the column it is
 * under — and the row being read is the one row whose exact figures the reader
 * has asked for, so a thinner bar there costs nothing.
 */
export function Cell({
  lean,
  figure,
  lit,
  minor,
}: {
  lean: number;
  figure: string;
  lit: boolean;
  /** Dropped on a narrow screen. Six columns is a laptop's worth; a phone gets
   * the first few and the rest are a turn of the device away. */
  minor?: boolean;
}) {
  const height = lit ? 2 : BAR_H;
  return (
    <div
      className={minor ? 'led-col led-minor' : 'led-col'}
      style={{
        position: 'relative',
        flex: `1 1 ${COL_BASIS}px`,
        minWidth: COL_MIN,
        marginRight: COL_GAP,
        height: ROW_H - 8,
      }}
    >
      {/* The middle of the catalogue. Fifty of these make a rule down the
          block, which is the alignment every bar is read against — so it is
          drawn at the leader weight rather than the hairline the rows are
          ruled with. At `--rule` it was the same grey as the row separators
          and disappeared among them, and a diverging bar with no visible
          baseline is just a bar in a random place. */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: -3,
          bottom: -3,
          width: 1,
          background: 'var(--leader)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          // Standing down to a rule along the foot of the cell, so the figure
          // above it has clean paper to sit on.
          top: lit ? ROW_H - 12 : (ROW_H - 8 - BAR_H) / 2,
          height,
          width: `${Math.max(0.6, Math.abs(lean) * 50)}%`,
          background: lit ? 'var(--accent)' : 'var(--tie-strong)',
          ...(lean >= 0 ? { left: '50%' } : { right: '50%' }),
        }}
      />
      {lit && (
        <div
          className="mono"
          style={{
            position: 'absolute',
            // Stops above the rule rather than over it: the paper background
            // is there to mask the centre line behind the digits, and at
            // `inset: 0` it masked the bar as well.
            top: 0,
            left: 0,
            right: 0,
            bottom: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 9,
            color: 'var(--accent)',
            whiteSpace: 'nowrap',
            background: 'var(--paper)',
          }}
        >
          {figure}
        </div>
      )}
    </div>
  );
}

/**
 * The mark at the end of a row that says the row opens something.
 *
 * Colour alone was not carrying it. A row went accent on hover and the pointer
 * turned into a hand, and both of those are only discovered by someone who has
 * already guessed there is something to discover — a reader scanning a page of
 * figures has no reason to put the cursor on one and find out. So the mark is
 * drawn at rest, in the leader grey, on every row: a column of faint arrows
 * down the right edge says *these all go somewhere* before anything is touched,
 * which is the half of the problem hover cannot reach. On hover it goes accent
 * with the rest of the row, and the name underlines in the same vocabulary
 * every other link in this app uses.
 */
export function OpenMark({ lit }: { lit: boolean }) {
  return (
    <div
      className="mono"
      aria-hidden
      style={{
        flex: `0 0 ${OPEN_W}px`,
        fontSize: 11,
        lineHeight: 1,
        textAlign: 'right',
        color: lit ? 'var(--accent)' : 'var(--leader)',
        transition: 'color 90ms ease',
      }}
    >
      →
    </div>
  );
}

/** Keeps the head row the same width as the rows under it. */
export function OpenSpacer() {
  return <div style={{ flex: `0 0 ${OPEN_W}px` }} />;
}

export function Head({
  label,
  sortKey,
  sort,
  onSort,
  grow,
  width,
  title,
  minor,
}: {
  label: string;
  sortKey: string;
  sort: { key: string; descending: boolean };
  onSort: (key: string) => void;
  /** The name column, which absorbs the page's slack. */
  grow?: boolean;
  /** A fixed column, for a bare figure like a cast count. */
  width?: number;
  title?: string;
  minor?: boolean;
}) {
  const on = sort.key === sortKey;
  return (
    <button
      onClick={() => onSort(sortKey)}
      className={minor ? 'annot led-col led-minor' : 'annot led-col'}
      title={title}
      aria-label={`Sort by ${label}`}
      style={{
        ...(grow
          ? { flex: NAME_FLEX, minWidth: NAME_MIN, textAlign: 'left' }
          : width !== undefined
            ? { flex: `0 0 ${width}px`, textAlign: 'left' }
            : {
                flex: `1 1 ${COL_BASIS}px`,
                minWidth: COL_MIN,
                marginRight: COL_GAP,
                textAlign: 'center',
              }),
        fontSize: 8.5,
        letterSpacing: '0.1em',
        lineHeight: 1.4,
        color: on ? 'var(--accent)' : 'var(--annotation)',
      }}
    >
      {label}
      {on ? (sort.descending ? ' ↓' : ' ↑') : ''}
    </button>
  );
}

/** Clicking the column already sorted by turns it over. A name reads A to Z, a
 * quantity reads most-first. */
export function nextSort(
  was: { key: string; descending: boolean },
  key: string,
  alphabetical: (key: string) => boolean,
): { key: string; descending: boolean } {
  return was.key === key
    ? { key, descending: !was.descending }
    : { key, descending: !alphabetical(key) };
}

/**
 * What a bar means, said once, in plain words, where the control used to be.
 *
 * One line, and it has to stay one line: set to a 560px measure it wrapped to
 * three and pushed the table a third of a screen down the page, which is a lot
 * of paper to spend on a sentence nobody reads twice. It runs the full width of
 * the row it shares with the count instead, and the wording is cut to fit
 * there.
 */
export function ScaleNote() {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flex: '1 1 auto', minWidth: 0 }}>
      <span className="field-label" style={{ flexShrink: 0 }}>
        Bars
      </span>
      <span className="annot" style={{ fontSize: 9, lineHeight: 1.8 }}>
        Left of the line is below the middle of the catalogue, right is above, a full bar is the far
        end. Hover a row for its figures, press one to open it.
      </span>
    </div>
  );
}

/** The search field, in the one place that decides what one looks like. */
export function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
}) {
  return (
    <div style={{ position: 'relative', width: 'min(460px, 100%)' }}>
      <input
        className="field"
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        autoComplete="off"
        style={{ fontSize: 21, paddingRight: 28 }}
      />
      {value && (
        <button
          className="field-clear"
          aria-label="Clear the search"
          onClick={() => onChange('')}
          style={{ position: 'absolute', right: 0, bottom: 10 }}
        >
          ×
        </button>
      )}
    </div>
  );
}

/** The pinned head row, which is also the sort control: the thing you want to
 * order by is the thing you are already looking down. Pinned because a long
 * ledger is several screens, and a column you cannot name is one you cannot
 * read. */
export function HeadRow({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        paddingTop: 10,
        paddingBottom: 7,
        position: 'sticky',
        top: HEAD_OFFSET,
        zIndex: 4,
        background: 'var(--paper)',
      }}
    >
      {children}
    </div>
  );
}
