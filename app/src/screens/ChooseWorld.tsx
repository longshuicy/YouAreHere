import { useMemo } from 'react';
import { MarginLinks } from '../render/MarginLinks';
import type { IndexUniverseEntry } from '../types';

interface Props {
  universes: IndexUniverseEntry[];
  onChoose: (entry: IndexUniverseEntry) => void;
  onCancel: () => void;
  onOpenKey: () => void;
  onStartAgain: () => void;
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

export function ChooseWorld({ universes, onChoose, onCancel, onOpenKey, onStartAgain, pending }: Props) {
  // Grouped under the letter a title actually starts with, articles included —
  // "A Song of Ice and Fire" files under A and "The Tempest" under T. Filing by
  // the first *significant* word is the librarian's convention, but it hides a
  // title under a letter the reader is not looking at, and thirty-one worlds is
  // a list you scan rather than one you search.
  const groups = useMemo(() => {
    const byLetter = new Map<string, IndexUniverseEntry[]>();
    for (const entry of [...universes].sort((a, b) => a.title.localeCompare(b.title))) {
      const first = entry.title.trim().charAt(0).toUpperCase();
      const letter = /[A-Z]/.test(first) ? first : '#';
      const bucket = byLetter.get(letter);
      if (bucket) bucket.push(entry);
      else byLetter.set(letter, [entry]);
    }
    return [...byLetter.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [universes]);

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        padding: '44px 64px 56px 64px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div className="chrome">YOU ARE HERE</div>
        <MarginLinks onOpenKey={onOpenKey} onStartAgain={onStartAgain} />
      </div>

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 22,
          minHeight: 0,
          paddingTop: 24,
        }}
      >
        <div style={{ fontSize: 27, textAlign: 'center' }}>Where would you like to wake?</div>

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
            width: 'min(880px, 92vw)',
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            paddingRight: 4,
          }}
        >
          {/* The columns live *inside* the scroller, at their natural height.
              Given a fixed height instead, a multi-column box does not scroll
              its overflow downward — it lays out more columns to the right, off
              the edge of a container that only scrolls vertically. The whole of
              T, twelve worlds including The Bible, was sitting out there
              unreachable. */}
          <div style={{ columnWidth: 210, columnGap: 44 }}>
          {groups.map(([letter, entries]) => (
            <div key={letter} style={{ breakInside: 'avoid', marginBottom: 20 }}>
              <div
                className="mono"
                style={{
                  fontSize: 10,
                  letterSpacing: '0.3em',
                  color: 'var(--unknown)',
                  borderBottom: '1px solid var(--rule)',
                  paddingBottom: 6,
                  marginBottom: 2,
                }}
              >
                {letter}
              </div>
              {entries.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => onChoose(entry)}
                  disabled={pending !== null}
                  title={sizeOf(entry.nodes).title}
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    gap: 8,
                    width: '100%',
                    fontFamily: 'var(--serif)',
                    fontSize: 18,
                    lineHeight: 1.25,
                    color: pending === entry.id ? 'var(--accent)' : 'var(--body)',
                    textAlign: 'left',
                    padding: '9px 0 8px 0',
                    minHeight: 40,
                    cursor: pending === null ? 'pointer' : 'default',
                    opacity: pending !== null && pending !== entry.id ? 0.45 : 1,
                  }}
                >
                  <span>{entry.title}</span>
                  <span
                    className="mono"
                    style={{
                      fontSize: 9,
                      letterSpacing: '0.16em',
                      color: 'var(--unknown)',
                      flexShrink: 0,
                      paddingLeft: 10,
                    }}
                  >
                    {sizeOf(entry.nodes).label}
                  </span>
                </button>
              ))}
            </div>
          ))}
          </div>
        </div>

        <div className="annot" style={{ textAlign: 'center' }}>
          Choosing settles the story. You will still have to work out who you are.
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <button className="action-quiet ruled" onClick={onCancel}>
          Wake anywhere instead
        </button>
      </div>
    </div>
  );
}
