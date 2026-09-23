import type { ReactNode } from 'react';
import { FullGraph } from '../render/FullGraph';
import { CHROME_PADDING } from '../render/MarginLinks';
import { NameLink } from '../render/NameLink';
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
  chromeLeft?: ReactNode;
  chromeRight?: ReactNode;
  /** Whatever belongs under the reading: the round, the actions. */
  after?: ReactNode;
  /** Passed straight through to the reading: jump to another character in the
   * topology gallery. Absent where there is nowhere to jump to. */
  linkToCharacter?: (i: NodeIndex) => void;
  /** Passed straight through to the reading: jump to a cross-catalogue nearest
   * double, who may stand in a world that is not this one. */
  linkToTwin?: (world: string, name: string) => void;
  /** Turns the world's own title, under the name, into a way to the gallery's
   * card for it. Absent on the reveal for a story the player never named. */
  onOpenWorld?: () => void;
}) {
  const character = universe.nodes.find((n) => n.i === i);
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
        {graphNote && (
          <div
            className="annot"
            style={{
              position: 'absolute',
              left: 24,
              right: 24,
              bottom: 18,
              lineHeight: 1.6,
              pointerEvents: 'none',
              borderTop: '1px solid var(--rule)',
              paddingTop: 10,
              background: 'var(--paper)',
            }}
          >
            {graphNote}
          </div>
        )}
      </div>

      {/* Paper column on the left: a head that stays, a body that scrolls. */}
      <div className="reveal-copy">
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
              }}
            >
              {character?.n ?? 'Unknown'}
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
          padding: CHROME_PADDING,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          // Over a stacked, scrolling page the chrome would otherwise sit at the
          // top of the *document* and scroll away with the graph.
          height: 'fit-content',
          pointerEvents: 'none',
        }}
      >
        {chromeLeft}
        {chromeRight}
      </div>
    </div>
  );
}
