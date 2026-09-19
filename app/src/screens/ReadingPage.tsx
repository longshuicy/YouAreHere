import type { ReactNode } from 'react';
import { FullGraph } from '../render/FullGraph';
import { CHROME_PADDING } from '../render/MarginLinks';
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
  tieLine,
  round = null,
  headAside,
  chromeLeft,
  chromeRight,
  after,
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
  tieLine?: (other: number) => string | null;
  round?: RoundReading | null;
  /** Sits beside the name. The reveal puts the round's tally here; the gallery
   * has no round and leaves it out. */
  headAside?: ReactNode;
  chromeLeft?: ReactNode;
  chromeRight?: ReactNode;
  /** Whatever belongs under the reading: the round, the actions. */
  after?: ReactNode;
}) {
  const character = universe.nodes.find((n) => n.i === i);
  return (
    <div
      className="reveal-root"
      style={{ position: 'relative', height: '100dvh', overflow: 'hidden', background: 'var(--paper)' }}
    >
      {/* Graph is the right half of the page, not a boxed panel. */}
      <div className="reveal-graph">
        <FullGraph universe={universe} you={i} named={named} tieLine={tieLine} role="subject" />
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
              {subtitle}
            </div>
          </div>

          {headAside && <div className="reveal-head-aside">{headAside}</div>}
        </div>

        <div className="reveal-sections">
          <CharacterReading universe={universe} world={world} meta={meta} i={i} round={round} />
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
