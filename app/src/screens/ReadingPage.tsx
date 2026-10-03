import type { ReactNode } from 'react';
import { FullGraph } from '../render/FullGraph';
import { CHROME_PADDING } from '../render/MarginLinks';
import { NameLink } from '../render/NameLink';
import { WikiLink } from '../render/WikiLink';
import { CharacterReading } from './CharacterReading';
import type { RoundReading } from '../graph/reading';
import type { WorldMetrics } from '../gallery/metrics';
import type { NodeIndex, Universe, UniverseMeta } from '../types';

/**
 * A character, on a page: the network on the right, the reading on the left.
 *
 * Both the reveal and the gallery's character page are this. Not "the same
 * layout as" — the same component, so the gallery cannot drift into a second
 * arrangement of the same material, which is what happened the first time the
 * two were written separately and is the whole reason this file exists.
 *
 * What the two callers differ in is the frame around the reading: the line
 * above the name, what the chrome offers, and whether there is a round to
 * report underneath. Everything between the name and the last figure is
 * identical by construction.
 */
export function ReadingPage({
  universe,
  world,
  meta,
  i,
  eyebrow,
  subtitle,
  named,
  formerSelves,
  mapped,
  labelled,
  folded = false,
  graphNote,
  tieLine,
  round = null,
  headAside,
  belowHead,
  head,
  chrome,
  chromeLeft,
  chromeRight,
  after,
  linkToCharacter,
  linkToTwin,
  onOpenWorld,
}: {
  universe: Universe;
  world: WorldMetrics;
  meta: UniverseMeta | null;
  i: NodeIndex;
  /** The line above the name. The only place the two callers' framing differs. */
  eyebrow: string;
  subtitle: string;
  /** Names the player earned, kept on the paper. Nobody has earned any in the
   * gallery, where the network arrives fully named regardless. */
  named?: Map<number, string>;
  /** Residence: nodes the player has woken as. */
  formerSelves?: ReadonlySet<number>;
  /** The player's map: people drawn and people opened, so its ties can be
   * coloured whether or not their names were earned. */
  mapped?: { visible: ReadonlySet<number>; expanded: ReadonlySet<number> };
  /** Which names are printed; the rest show on hover. */
  labelled?: ReadonlySet<number>;
  /** Residence mid-run: withhold unnamed hover labels. */
  folded?: boolean;
  /** A line set over the foot of the network, saying why it is drawn as it is. */
  graphNote?: ReactNode;
  tieLine?: (other: number) => string | null;
  round?: RoundReading | null;
  /** Sits beside the name. The reveal puts the round's tally here; the gallery
   * has no round and leaves it out. */
  headAside?: ReactNode;
  /** Full-width, between the head and the reading. See the note at the slot. */
  belowHead?: ReactNode;
  /** Replaces the whole head — eyebrow, name, subtitle and aside. The reveal
   *  draws its own, which is a different thing from a character page's: a
   *  verdict with a strip of figures under it rather than a title. Nothing
   *  else passes it, so every other page keeps the head below. */
  head?: ReactNode;
  /** A whole bar, laid over both columns. Supersedes the left/right pair,
   *  which the gallery still uses. */
  chrome?: ReactNode;
  chromeLeft?: ReactNode;
  chromeRight?: ReactNode;
  /** Whatever belongs under the reading: the round, the closing note. Scrolls
   * with it. Anything a reader must be able to reach without having read to
   * the bottom first belongs in `headAside` instead — see `whatNow` in
   * Reveal.tsx. */
  after?: ReactNode;
  /** Passed straight through to the reading: jump to another character in the
   * topology lab. Absent where there is nowhere to jump to. */
  linkToCharacter?: (i: NodeIndex) => void;
  /** Passed straight through to the reading: jump to a cross-catalogue nearest
   * double, who may stand in a world that is not this one. */
  linkToTwin?: (world: string, name: string) => void;
  /** Turns the world's own title, under the name, into a way to the gallery's
   * card for it. Absent on the reveal for a story the player never named. */
  onOpenWorld?: () => void;
}) {
  const character = universe.nodes.find((n) => n.i === i);
  const record = meta?.nodes[String(i)];
  return (
    <div
      className="reveal-root"
      style={{ position: 'relative', height: '100dvh', overflow: 'hidden', background: 'var(--paper)' }}
    >
      {/* Graph is the right half of the page, not a boxed panel. */}
      <div className="reveal-graph">
        <FullGraph
          universe={universe}
          you={i}
          named={named}
          formerSelves={formerSelves}
          mapped={mapped}
          labelled={labelled}
          tieLine={tieLine}
          role="subject"
          folded={folded}
        />
        {/* Free-floating in the graph's own corner, not a caption boxed off
            by a rule and a paper backing — the design sets it loose under a
            small legend, both in the annotation grey, with nothing drawn
            between them and the diagram they describe. */}
        {graphNote && (
          <div
            style={{
              position: 'absolute',
              left: 24,
              bottom: 18,
              maxWidth: 420,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              pointerEvents: 'none',
            }}
          >
            <div
              className="mono"
              style={{
                display: 'flex',
                gap: 20,
                fontSize: 9,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'var(--annotation)',
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <span style={{ display: 'block', width: 18, height: 2, background: 'var(--accent)' }} />
                Your ties
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <span style={{ display: 'block', width: 18, height: 1, background: 'var(--tie-strong)' }} />
                Everyone else's
              </span>
            </div>
            <div style={{ fontSize: 15, lineHeight: 1.4, color: 'var(--annotation)', fontStyle: 'italic' }}>
              {graphNote}
            </div>
          </div>
        )}
      </div>

      {/* Paper column on the left: a head that stays, a body that scrolls. */}
      <div className="reveal-copy">
        {head ?? (
          <div className="reveal-head">
            <div className="reveal-head-name">
              <div className="chrome" style={{ letterSpacing: '0.3em' }}>
                {eyebrow}
              </div>

              <div
                style={{
                  // Smaller than the design's 57px, because there the name had
                  // a whole centred page to itself and here it shares its line
                  // with the tally. At 57 a two-word name wrapped to three lines
                  // and the fixed head ate a third of the column.
                  fontSize: 'clamp(30px, 7vw, 46px)',
                  letterSpacing: '0.015em',
                  marginTop: 14,
                  lineHeight: 1.1,
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'baseline',
                  gap: '8px 12px',
                }}
              >
                <span>{character?.n ?? 'Unknown'}</span>
                {record?.wiki && (
                  <WikiLink title={record.wiki} lang={record.wikiLang ?? 'en'} />
                )}
              </div>

              <div
                style={{
                  fontSize: 'clamp(18px, 5vw, 23px)',
                  fontStyle: 'italic',
                  color: 'var(--body)',
                  marginTop: 10,
                }}
              >
                {onOpenWorld ? (
                  <NameLink style={{ fontStyle: 'italic' }} onClick={onOpenWorld}>
                    {subtitle}
                  </NameLink>
                ) : (
                  subtitle
                )}
              </div>
            </div>

            {headAside && <div className="reveal-head-aside">{headAside}</div>}
          </div>
        )}

        {/* Full width of the copy column, between the head and the reading.
            A reveal's ways out belong here: the aside beside the name is a
            narrow column of figures, and three buttons in it are three buttons
            in a gutter. Nothing passes this but the reveal, so every other
            page that uses this layout is unchanged. */}
        {belowHead}

        <div className="reveal-sections">
          <CharacterReading
            universe={universe}
            world={world}
            meta={meta}
            i={i}
            round={round}
            linkToCharacter={linkToCharacter}
            linkToTwin={linkToTwin}
          />
          {after}
        </div>
      </div>

      {/* Chrome overlays both columns so it does not steal a header row. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          padding: chrome ? 'var(--pad-top) var(--pad-x) 0 var(--pad-x)' : CHROME_PADDING,
          display: chrome ? 'block' : 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          // Over a stacked, scrolling page the chrome would otherwise sit at the
          // top of the *document* and scroll away with the graph.
          height: 'fit-content',
          pointerEvents: 'none',
        }}
      >
        {chrome ?? (
          <>
            {chromeLeft}
            {chromeRight}
          </>
        )}
      </div>
    </div>
  );
}
