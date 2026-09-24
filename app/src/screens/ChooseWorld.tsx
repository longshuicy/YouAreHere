import { useEffect, useMemo, useRef, useState } from 'react';
import { RadioRow } from '../gallery/RadioRow';
import { BrandMark, CHROME_PADDING, HelpLink } from '../render/MarginLinks';
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
   * `onStartAnywhere`, a button at the bottom of this very list. On the cold
   * open it was a fourth control on a screen the design doc asks to have exactly
   * one thing to click. */
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
 * Titles only. No cast size, no tie count, no difficulty — the guess screen goes
 * to some trouble to keep the size of a world's cast hidden (its type-ahead
 * draws from every world at once for exactly that reason), and a list annotated
 * with "18 characters" would give away here what is protected there.
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

/** How much of a world's map is named, as a run of ticks filling the gap
 * between the title and its size, like leader dots in an index. A share rather
 * than a count, so a world's cast size stays off this screen even once the
 * player has been in it. */
function ProgressTicks({ p }: { p: WorldProgress }) {
  const share = p.complete ? 100 : Math.min(100, (p.named / Math.max(1, p.cast)) * 100);
  const ticks = (color: string) =>
    `repeating-linear-gradient(to right, ${color} 0 1px, transparent 1px 4px)`;
  return (
    <span
      aria-hidden
      style={{
        flex: 1,
        minWidth: 24,
        height: 7,
        alignSelf: 'center',
        marginLeft: 8,
        background: ticks('var(--rule)'),
      }}
    >
      <span style={{ display: 'block', height: '100%', width: `${share}%`, background: ticks('var(--unknown)') }} />
    </span>
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
          display: 'block',
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
        <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 }}>
          <span>{entry.title}</span>
          {p && <ProgressTicks p={p} />}
          {/* Filed by size, the heading has already said it — repeating it on
              every row is noise. */}
          {order !== 'size' && (
            <span
              className="mono"
              style={{ fontSize: 8, letterSpacing: '0.14em', color: 'var(--unknown)', flexShrink: 0, paddingLeft: 8 }}
            >
              {sizeOf(entry.nodes).label}
            </span>
          )}
        </span>
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
        padding: CHROME_PADDING,
      }}
    >
      <div
        className="chrome-row"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
      >
        <BrandMark />
        <HelpLink onOpenKey={onOpenKey} />
      </div>

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 14,
          minHeight: 0,
          paddingTop: 24,
        }}
      >
        <div style={{ fontSize: 'clamp(20px, 5.6vw, 27px)', textAlign: 'center' }}>
          Where would you like to wake?
        </div>

        <div style={{ position: 'relative', width: 'min(420px, 92vw)' }}>
          <input
            className="field"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search worlds"
            aria-label="Search worlds"
            autoComplete="off"
            style={{ fontSize: 20, textAlign: 'center', paddingRight: 28, paddingLeft: 28 }}
          />
          {query && (
            <button
              className="field-clear"
              aria-label="Clear the search"
              onClick={() => setQuery('')}
              style={{ position: 'absolute', right: 0, bottom: 10 }}
            >
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

        {/* The one preference this screen carries, set with the search field and
            the filing row rather than down beside ANY WORLD and BACK, because it
            belongs to the same act as they do: it is something you say about the
            list, and the bottom of the page is where you leave the list.

            Its own line, not a fourth word on the filing row: those three are
            one-of-these and this is a yes-or-no, and a fourth pressable label
            sharing their line would be read as a fourth way to file however it
            were marked. The box keeps the idiom it had on the cold open — [×] is
            a tick in a square where a filled dot is one of a set — and the rest
            of the type matches the radio options beside it, because it is a
            control of the same weight on the same page.

            Toggling records the answer and draws nothing. On the cold open it
            re-drew the world and the stranger on the spot, which was right
            there: the stage was showing a start that had already been picked, so
            a change that only landed on the next one looked like it had done
            nothing at all. Here the screen behind the list is a start the player
            may be going back to, and BACK promises to leave it exactly as it
            was; quietly swapping the stranger under the overlay would make that
            promise false. So the preference is written now and spends itself on
            the next random draw — ANY WORLD below, or the same shuffle offered
            in the margins of every other screen. Choosing a title from the list
            is unaffected either way: a named world skips the draw this tilts. */}
        <button
          className="mono"
          aria-pressed={readsChineseClassics}
          onClick={() => onReadsChineseClassics(!readsChineseClassics)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 10,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: readsChineseClassics ? 'var(--accent)' : 'var(--annotation)',
            background: 'transparent',
            border: 'none',
            padding: '6px 2px 4px 2px',
            cursor: 'pointer',
          }}
        >
          <span aria-hidden style={{ color: readsChineseClassics ? 'var(--accent)' : 'var(--leader)' }}>
            {readsChineseClassics ? '[×]' : '[ ]'}
          </span>
          I read the Chinese classics
        </button>


        {/* Newspaper columns rather than a grid, so the alphabet reads *down*
            one column and continues at the top of the next — which is how an
            index is read. A grid would run it left-to-right across the letters
            and scatter each group over several rows.

            Still titles only. No cast size, no tie count: the guess screen goes
            to some trouble to keep how large a world's cast is hidden, and a
            list annotated with "18 characters" would give away here what is
            protected there. */}
        <div
          style={{
            position: 'relative',
            width: 'min(880px, 92vw)',
            // Size to the titles; only take leftover height when they overflow,
            // so the caption sits under the last row instead of under a tall empty box.
            flex: '0 1 auto',
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

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
            flexShrink: 0,
          }}
        >
          <div className="annot" style={{ textAlign: 'center' }}>
            Choosing settles the world. You will still have to work out who you are.
          </div>
          {/* One line, not a stack: they are two exits from the same screen,
              and stacking them made the lesser of the two read as a step after
              the greater rather than an alternative to it. */}
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'center',
              gap: 'clamp(18px, 5vw, 36px)',
              flexWrap: 'wrap',
            }}
          >
            <button className="action-quiet ruled" onClick={onStartAnywhere}>
              Any world
            </button>
            <button className="action-quiet ruled" onClick={onCancel}>
              Back
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
