import { useEffect, useMemo, useRef, useState } from 'react';
import { RadioRow } from '../gallery/RadioRow';
import { CHROME_PADDING } from '../render/MarginLinks';
import type { WorldProgress } from '../engine/residence';
import type { IndexUniverseEntry } from '../types';

interface Props {
  universes: IndexUniverseEntry[];
  /** Worlds the player has mapped some of. Absent entries were never stayed in. */
  progress: Map<string, WorldProgress>;
  onChoose: (entry: IndexUniverseEntry) => void;
  /** Close the list and leave everything as it was. */
  onCancel: () => void;
  /** Give up on choosing and be handed a stranger in a world nobody named.
   * Held apart from `onCancel`, which used to do duty for both: back when the
   * cold open only ever followed a shuffle the two landed in the same place,
   * so one button could wear either label. A residence's cold open is a world
   * the player lives in, and "start anywhere" that returned them to it was
   * simply untrue. */
  onStartAnywhere: () => void;
  /** Whether the Chinese classics count as books this player can name.
   *
   * It lives here rather than on the cold open because this is the screen about
   * which worlds you get. All it does is raise the familiarity band of five
   * titles in `familiarityFor`, and that band only tilts which world the random
   * draw picks, and only towards the findable end of the scale — a filter on the
   * catalogue, not a declaration about the player, and the one it filters for is
   * `onStartAnywhere`, the block at the head of this page. */
  readsChineseClassics: boolean;
  /** Records the answer and redraws nothing. See the note at the control. */
  onReadsChineseClassics: (next: boolean) => void;
  onOpenKey: () => void;
  pending: string | null;
}

/**
 * Pick the world to wake in, instead of waking in a stranger's.
 *
 * This answers the story half of the question before play starts, which is
 * deliberately not the default — the cold open still opens on a world nobody
 * named. It is the same shape as the parked "residence" idea in the game design
 * doc: once the world is settled, the guess screen asks one thing, and what is
 * left is the question the graph is actually evidence for.
 *
 * The page reads top to bottom as the three ways a reader arrives: with a world
 * half-finished (the cards), with no world in mind at all (ANY WORLD, beside
 * the headline it answers), or with a title to go and find (the index).
 */
/**
 * How big a world is, on a five-point scale.
 *
 * Fixed cuts on the raw character count, deliberately *not* derived from the
 * catalogue as it stands. Quantiles would be better balanced today and wrong
 * tomorrow: every world added would shift the boundaries, and a play that has
 * not changed since 1603 would quietly become an S because something larger
 * arrived. A world's label should only ever change when that world does.
 *
 * The cuts are where the differences stop being interesting rather than at even
 * counts — a dozen characters, a full cast, a couple of plays' worth, a novel.
 * That the shipped catalogue lands unevenly on them (most worlds are single
 * plays of twelve to thirty) is a fact about the catalogue, not a fault in the
 * scale; it evens out as worlds that are not Shakespeare plays are added.
 *
 * It is a rough sense of how much there is to walk, not a cast list — see the
 * note on the list below for why the exact number stays off this screen.
 */
const SIZES: { upTo: number; label: string; title: string }[] = [
  { upTo: 15, label: 'XS', title: 'a dozen or so characters' },
  { upTo: 20, label: 'S', title: 'a small cast' },
  { upTo: 30, label: 'M', title: 'a full play' },
  { upTo: 100, label: 'L', title: 'several plays, or a film cycle' },
  { upTo: Infinity, label: 'XL', title: 'hundreds of characters' },
];

function sizeOf(nodes: number) {
  return SIZES.find((size) => nodes <= size.upTo) ?? SIZES[SIZES.length - 1];
}

type Order = 'title' | 'size' | 'progress';

/** In the order a world moves through them, so the page reads left to right as
 * the player's own history. */
const PROGRESS_BANDS = ['Not started', 'In progress', 'Finished'] as const;

function bandOf(p: WorldProgress | undefined): (typeof PROGRESS_BANDS)[number] {
  if (!p) return 'Not started';
  return p.complete ? 'Finished' : 'In progress';
}

/** How many started worlds get a card. Four is what fits the row at the width
 *  the page is designed for; past that they are a list, not a shelf, and the
 *  index below is already a list. */
const CARDS = 4;

/** The mark a started world carries in the index, and in the legend at the
 *  foot that says what it means. One shape, two places. */
function StartedDot({ title }: { title?: string }) {
  return (
    <span
      title={title}
      aria-hidden
      style={{
        width: 6,
        height: 6,
        flexShrink: 0,
        borderRadius: '50%',
        background: 'var(--accent)',
      }}
    />
  );
}

function GroupHeading({ label, title }: { label: string; title?: string }) {
  return (
    <div
      className="mono"
      title={title}
      style={{
        fontSize: 9,
        letterSpacing: '0.28em',
        textTransform: 'uppercase',
        color: 'var(--unknown)',
        borderBottom: '1px solid var(--rule)',
        paddingBottom: 4,
        marginBottom: 1,
      }}
    >
      {label}
    </div>
  );
}

export function ChooseWorld({
  universes,
  progress,
  onChoose,
  onCancel,
  onStartAnywhere,
  readsChineseClassics,
  onReadsChineseClassics,
  onOpenKey,
  pending,
}: Props) {
  const [query, setQuery] = useState('');
  const [order, setOrder] = useState<Order>('title');
  const listRef = useRef<HTMLDivElement>(null);
  const [canScroll, setCanScroll] = useState(false);
  const [atBottom, setAtBottom] = useState(true);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = [...universes].sort((a, b) => a.title.localeCompare(b.title));
    if (!needle) return list;
    return list.filter((entry) => entry.title.toLowerCase().includes(needle));
  }, [universes, query]);

  /** The worlds with a map on them, furthest along first. Unlike the index,
   *  these print how much of a cast is named — which the index will not do for
   *  an unvisited world, because the guess screen goes to some trouble to keep
   *  a cast's size hidden. A world you have already walked has told you its
   *  size itself; there is nothing left here to give away. */
  const started = useMemo(() => {
    const out = universes
      .map((entry) => ({ entry, p: progress.get(entry.id) }))
      .filter((row): row is { entry: IndexUniverseEntry; p: WorldProgress } => row.p != null);
    out.sort((a, b) => b.p.named / b.p.cast - a.p.named / a.p.cast);
    return out.slice(0, CARDS);
  }, [universes, progress]);

  // Grouped under the letter a title actually starts with, articles included —
  // "A Song of Ice and Fire" files under A and "The Tempest" under T. Filing by
  // the first *significant* word is the librarian's convention, but it hides a
  // title under a letter the reader is not looking at.
  //
  // By size, the same list is filed under the five-point scale instead, in scale
  // order rather than alphabetically: XS first, XL last, and titles alphabetical
  // within a band. The band is the only thing the heading says — the raw count
  // still never appears, for the reason in the note above.
  const groups = useMemo(() => {
    if (order === 'progress') {
      const byBand = new Map<string, IndexUniverseEntry[]>();
      for (const entry of filtered) {
        const band = bandOf(progress.get(entry.id));
        const bucket = byBand.get(band);
        if (bucket) bucket.push(entry);
        else byBand.set(band, [entry]);
      }
      // Furthest along first within "In progress"; the rest stay alphabetical.
      const share = (e: IndexUniverseEntry) => {
        const p = progress.get(e.id);
        return p ? p.named / p.cast : 0;
      };
      byBand.get('In progress')?.sort((a, b) => share(b) - share(a));
      // All three, always, even when one is empty: they are the columns of
      // this filing, and a column that disappears moves the other two.
      return PROGRESS_BANDS.map((band) => [band, byBand.get(band) ?? []] as const);
    }
    if (order === 'size') {
      const byBand = new Map<string, IndexUniverseEntry[]>();
      for (const entry of filtered) {
        const label = sizeOf(entry.nodes).label;
        const bucket = byBand.get(label);
        if (bucket) bucket.push(entry);
        else byBand.set(label, [entry]);
      }
      return SIZES.filter((size) => byBand.has(size.label)).map(
        (size) => [size.label, byBand.get(size.label)!] as const,
      );
    }

    const byLetter = new Map<string, IndexUniverseEntry[]>();
    for (const entry of filtered) {
      const first = entry.title.trim().charAt(0).toUpperCase();
      const letter = /[A-Z]/.test(first) ? first : '#';
      const bucket = byLetter.get(letter);
      if (bucket) bucket.push(entry);
      else byLetter.set(letter, [entry]);
    }
    return [...byLetter.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered, order, progress]);

  const row = (entry: IndexUniverseEntry) => {
    const p = progress.get(entry.id);
    return (
      <button
        key={entry.id}
        className="world-row"
        onClick={() => onChoose(entry)}
        disabled={pending !== null}
        title={
          p
            ? `${p.complete ? 'Every name found' : `${p.named} of ${p.cast} named`} · ${p.starts} ${p.starts === 1 ? 'start' : 'starts'} · ${p.clues} ${p.clues === 1 ? 'clue' : 'clues'}`
            : sizeOf(entry.nodes).title
        }
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          boxSizing: 'border-box',
          fontFamily: 'var(--serif)',
          fontSize: 14,
          lineHeight: 1.2,
          color: pending === entry.id ? 'var(--accent)' : 'var(--body)',
          textAlign: 'left',
          padding: '4px 0 3px 0',
          minHeight: 26,
          cursor: pending === null ? 'pointer' : 'default',
          opacity: pending !== null && pending !== entry.id ? 0.45 : 1,
        }}
      >
        <span
          style={{
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {entry.title}
        </span>
        {/* The whole of a world's progress, on a row, is whether it has been
            started. How far along it is lives on the cards at the top of the
            page, where there is room to print it in words. */}
        {p && <StartedDot title="Started" />}
        {/* Filed by size, the heading has already said it — repeating it on
            every row is noise. */}
        {order !== 'size' && (
          <span
            className="mono"
            style={{
              fontSize: 8,
              letterSpacing: '0.14em',
              color: 'var(--unknown)',
              flexShrink: 0,
              width: 22,
              textAlign: 'right',
            }}
          >
            {sizeOf(entry.nodes).label}
          </span>
        )}
      </button>
    );
  };

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;

    const update = () => {
      const overflow = el.scrollHeight > el.clientHeight + 2;
      setCanScroll(overflow);
      setAtBottom(!overflow || el.scrollTop + el.clientHeight >= el.scrollHeight - 4);
    };

    update();
    el.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, [groups]);

  return (
    <div
      style={{
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        gap: 22,
        padding: CHROME_PADDING,
      }}
    >
      {/* The way off this page is the first thing on it, where a reader looks
          for one. It used to be at the foot beside ANY WORLD, which put the two
          most different acts on the page side by side wearing the same weight:
          one leaves everything as it was, and one draws a world. */}
      <div
        className="chrome-row"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          flexShrink: 0,
        }}
      >
        <button type="button" className="annot-link" onClick={onCancel} style={{ gap: 8 }}>
          <svg
            width="9"
            height="9"
            viewBox="0 0 10 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            aria-hidden
            focusable="false"
          >
            <path d="M6.5 2l-3 3 3 3" />
          </svg>
          Back
        </button>
        <div className="brand">You are here.</div>
        <button type="button" className="annot-link" onClick={onOpenKey}>
          What can I do
        </button>
      </div>

      <div
        className="stack-sm"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 40, flexShrink: 0 }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <h1
            style={{
              margin: 0,
              fontWeight: 400,
              fontSize: 'clamp(24px, 5.6vw, 44px)',
              lineHeight: 1.05,
            }}
          >
            Where would you like to wake?
          </h1>
          <div style={{ fontSize: 'clamp(15px, 2vw, 18px)', color: 'var(--body)' }}>
            Choosing settles the world. You will still have to work out who you are.
          </div>
        </div>

        {/* The answer to the headline for a reader who has not got a world in
            mind — offered beside the question rather than at the bottom of the
            thing it forks away from, where it read as giving up on choosing. */}
        <button
          type="button"
          className="begin-block"
          onClick={onStartAnywhere}
          disabled={pending !== null}
          style={{ width: 'auto', flexShrink: 0, height: 56, gap: 18 }}
        >
          <span style={{ display: 'flex', flexDirection: 'column', gap: 3, textAlign: 'left' }}>
            <span className="begin-word" style={{ fontSize: 11, letterSpacing: '0.26em' }}>
              Any world
            </span>
            <span className="begin-sub" style={{ letterSpacing: '0.14em' }}>
              Let it pick
            </span>
          </span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            aria-hidden
            focusable="false"
          >
            <path d="M1 5h3c3 0 5 6 8 6h3M12 9l3 2-3 2M1 11h3c1.2 0 2.2-1 3-2.2M9 6.2C9.8 5 10.8 5 12 5h3M12 3l3 2-3 2" />
          </svg>
        </button>
      </div>

      {started.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
          <div className="annot" style={{ fontSize: 9, letterSpacing: '0.2em' }}>
            Pick up where you left off
          </div>
          <div className="started-cards">
            {started.map(({ entry, p }) => {
              const share = p.complete ? 100 : Math.max(2, Math.min(100, (p.named / Math.max(1, p.cast)) * 100));
              return (
                <button
                  key={entry.id}
                  onClick={() => onChoose(entry)}
                  disabled={pending !== null}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    padding: '12px 14px',
                    border: '1px solid var(--rule)',
                    background: 'var(--card)',
                    color: pending === entry.id ? 'var(--accent)' : 'var(--ink)',
                    textAlign: 'left',
                    opacity: pending !== null && pending !== entry.id ? 0.45 : 1,
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--serif)',
                      fontSize: 19,
                      lineHeight: 1.15,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {entry.title}
                  </span>
                  <span style={{ display: 'block', height: 3, background: 'var(--rule)' }}>
                    <span
                      style={{ display: 'block', height: '100%', width: `${share}%`, background: 'var(--accent)' }}
                    />
                  </span>
                  <span className="annot" style={{ fontSize: 9, letterSpacing: '0.14em' }}>
                    {p.complete ? 'Finished' : `${p.named} of ${p.cast} named`} · {p.starts}{' '}
                    {p.starts === 1 ? 'life' : 'lives'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Search, filing and the one preference, on one rule.
          They are all things you say *about the list*, so they sit together on
          the line that closes the page's head and opens the index. */}
      <div className="chooser-bar" style={{ flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: '1 1 240px', minWidth: 160 }}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            stroke="var(--annotation)"
            strokeWidth="1.3"
            aria-hidden
            focusable="false"
            style={{ flexShrink: 0 }}
          >
            <circle cx="6" cy="6" r="4.5" />
            <path d="M9.5 9.5L13 13" />
          </svg>
          <input
            className="field"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search all ${universes.length}`}
            aria-label="Search worlds"
            autoComplete="off"
            // The rule belongs to the bar, not to the field inside it.
            style={{ fontSize: 19, border: 'none', padding: 0, minHeight: 38 }}
          />
          {query && (
            <button className="field-clear" aria-label="Clear the search" onClick={() => setQuery('')}>
              ×
            </button>
          )}
        </div>

        {/* Two ways into the same list, because the two questions a reader
            arrives with are different: "is the world I have in mind here?" and
            "what is small enough to start on?". Filing is all that changes —
            the headings become the size scale — so switching never hides a
            title or re-flows the page into something unfamiliar. */}
        <RadioRow
          label="File by"
          value={order}
          onChange={setOrder}
          options={[
            { key: 'title', label: 'Alphabet' },
            { key: 'size', label: 'Size' },
            { key: 'progress', label: 'Progress' },
          ]}
        />

        {/* The one preference this screen carries.

            A yes-or-no among one-of-these, so it is a checkbox and keeps its
            distance from the filing row: a fourth pressable label on that line
            would read as a fourth way to file however it were marked.

            Toggling records the answer and draws nothing. The screen behind
            this list is a start the player may be going back to, and BACK
            promises to leave it exactly as it was; quietly swapping the
            stranger under the overlay would make that promise false. So the
            preference is written now and spends itself on the next random draw
            — ANY WORLD at the head of this page, or the shuffle in the margins
            of every other screen. Choosing a title from the list is unaffected
            either way: a named world skips the draw this tilts. */}
        <label
          className="mono"
          style={{
            marginLeft: 'auto',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            minHeight: 40,
            fontSize: 10,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: readsChineseClassics ? 'var(--ink)' : 'var(--annotation)',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          <input
            type="checkbox"
            checked={readsChineseClassics}
            onChange={(e) => onReadsChineseClassics(e.target.checked)}
            style={{ width: 15, height: 15, margin: 0, accentColor: 'var(--ink)' }}
          />
          I read the Chinese classics
        </label>
      </div>

      {/* Newspaper columns rather than a grid, so the alphabet reads *down*
          one column and continues at the top of the next — which is how an
          index is read. A grid would run it left-to-right across the letters
          and scatter each group over several rows.

          Titles only, plus the started mark and the size band. No cast size,
          no tie count: the guess screen goes to some trouble to keep how large
          a world's cast is hidden, and a list annotated with "18 characters"
          would give away here what is protected there. */}
      <div
        style={{
          position: 'relative',
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          ref={listRef}
          className="world-list"
          style={{
            flex: '1 1 auto',
            minHeight: 0,
            overflowY: 'auto',
            paddingRight: 10,
            // Room under the last row so a bottom fade does not cover titles.
            paddingBottom: canScroll && !atBottom ? 28 : 0,
          }}
        >
          {/* The columns live *inside* the scroller, at their natural height.
              Given a fixed height instead, a multi-column box does not scroll
              its overflow downward — it lays out more columns to the right, off
              the edge of a container that only scrolls vertically. The whole of
              T, twelve worlds including The Bible, was sitting out there
              unreachable. */}
          {filtered.length === 0 ? (
            <div className="annot" style={{ textAlign: 'center', paddingTop: 48 }}>
              No world matches
            </div>
          ) : order === 'progress' ? (
            // Three fixed columns rather than newspaper flow: the bands are
            // stages, and a stage should keep its place on the page however
            // many worlds are in it.
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                columnGap: 36,
                rowGap: 16,
                alignItems: 'start',
              }}
            >
              {groups.map(([band, entries]) => (
                <div key={band}>
                  <GroupHeading label={band} />
                  {entries.length === 0 ? (
                    <div className="annot" style={{ padding: '6px 0' }}>
                      {band === 'Finished' ? 'None yet' : 'None'}
                    </div>
                  ) : (
                    entries.map(row)
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="world-columns">
              {groups.map(([letter, entries]) => (
                <div key={letter} style={{ breakInside: 'avoid', marginBottom: 8 }}>
                  <GroupHeading
                    label={letter}
                    title={order === 'size' ? SIZES.find((size) => size.label === letter)?.title : undefined}
                  />
                  {entries.map(row)}
                </div>
              ))}
            </div>
          )}
        </div>

        {canScroll && !atBottom && (
          <div
            aria-hidden
            style={{
              pointerEvents: 'none',
              position: 'absolute',
              left: 0,
              right: 10,
              bottom: 0,
              height: 56,
              background: 'linear-gradient(to bottom, transparent, var(--paper) 72%)',
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
              paddingBottom: 6,
            }}
          >
            <span className="annot">More below</span>
          </div>
        )}
      </div>

      {/* The key to the two marks a row carries, and nothing else. A legend
          rather than prose: both of them are glyphs, and a glyph is explained
          by being stood next to its name. */}
      <div
        className="annot"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 16,
          flexShrink: 0,
          letterSpacing: '0.16em',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <StartedDot />
          Started
        </span>
        <span>XS–XL · cast size</span>
      </div>
    </div>
  );
}
