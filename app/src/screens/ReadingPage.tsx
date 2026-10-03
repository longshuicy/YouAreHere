import type { ReactNode } from 'react';
import { FullGraph } from '../render/FullGraph';
import { PageTitle } from '../render/PageTitle';
import { SplitPage } from './SplitPage';
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
  chromeExtra = 0,
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
  eyebrow?: string;
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
  /** A whole bar, laid over both columns. */
  chrome?: ReactNode;
  /** Extra height `chrome` takes beyond the bar itself — the lab's tabs, laid
   *  under the bar on the character page — so the graph and the reading start
   *  clear of it instead of under it. Zero everywhere `chrome` is just the bar. */
  chromeExtra?: number;
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
    <SplitPage
      chrome={chrome}
      chromeExtra={chromeExtra}
      graph={
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
      }
      graphNote={graphNote}
      legend
      head={
        head ?? (
          <div className="reveal-head">
            <div className="reveal-head-name">
              <PageTitle
                eyebrow={eyebrow}
                title={character?.n ?? 'Unknown'}
                worldTitle={subtitle}
                onOpenWorld={onOpenWorld}
                cast={universe.nodes.length}
                wiki={record?.wiki ? { title: record.wiki, lang: record.wikiLang } : null}
              />
            </div>

            {headAside && <div className="reveal-head-aside">{headAside}</div>}
          </div>
        )
      }
      belowHead={belowHead}
    >
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
    </SplitPage>
  );
}
