import { useMemo } from 'react';
import type { StartLinks } from '../render/MarginLinks';
import { TopBar } from '../render/TopBar';
import { clueBonus, clueTotal, type Session } from '../engine/session';
import {
  isComplete,
  residenceTotal,
  type Residence,
} from '../engine/residence';
import { readRound } from '../graph/reading';
import { PageTitle } from '../render/PageTitle';
import { measureWorld } from '../gallery/metrics';
import { ReadingPage } from './ReadingPage';
import type { Universe, UniverseMeta } from '../types';

interface Props {
  session: Session;
  universe: Universe;
  meta: UniverseMeta | null;
  /** This world's map, live or paused on the shelf. Null if never mapped. */
  residence: Residence | null;
  /** True when the player is living in `residence` right now, rather than
   * playing a one-off round in a world that happens to have a paused map. */
  living: boolean;
  /** Closing artifact: every node named, former selves marked. */
  closed?: boolean;
  startLinks: StartLinks;
  onOpenGallery: () => void;
  onOpenCharacter: (i: number) => void;
  onOpenWorld: () => void;
  onOpenTwin: (worldId: string, name: string) => void;
}

export function Reveal({
  session,
  universe,
  meta,
  residence,
  living,
  closed = false,
  startLinks,
  onOpenGallery,
  onOpenCharacter,
  onOpenWorld,
  onOpenTwin,
}: Props) {
  const clues = clueTotal(session.ledger);
  /** Who you turned out to be — the lab row follows them by name. */
  const youName = universe.nodes.find((n) => n.i === session.you)?.n ?? null;
  const youRecord = meta?.nodes?.[String(session.you)] ?? null;
  const { expansions, facts, names } = session.ledger;

  const world = useMemo(() => measureWorld(universe), [universe]);

  const round = useMemo(
    () => (closed ? null : readRound(universe, world, session.you, session.known)),
    [universe, world, session.you, session.known, closed],
  );

  const seen = session.known.visible.size;
  const nearest = useMemo(() => {
    const withHops = session.guesses
      .filter((g) => !g.characterCorrect && g.hops !== null)
      .map((g) => ({ name: g.characterQuery, hops: g.hops as number }));
    if (withHops.length === 0) return null;
    return withHops.reduce((a, b) => (b.hops < a.hops ? b : a));
  }, [session.guesses]);

  const tieLine = useMemo(() => {
    const edges = meta?.edges ?? {};
    return (other: number) =>
      edges[`${session.you}-${other}`]?.line ?? edges[`${other}-${session.you}`]?.line ?? null;
  }, [meta, session.you]);

  const tieMeaning = universe.provenance?.edgeDefinition
    ? `In this world, a tie meant ${universe.provenance.edgeDefinition}`
    : null;

  const { recognitions } = session.ledger;
  const bonus = clueBonus(session.ledger);
  // The board's own words: a verb and a count, not a plural noun — "Expand 1"
  // rather than "1 expansion". `.annot` uppercases it, same as every other
  // line in this row.
  const tally = [
    `Expand ${expansions}`,
    `Read ${facts}`,
    `Name ${names}`,
    ...(session.ledger.stories ? ['World'] : []),
    ...(session.ledger.answers ? ['Answer'] : []),
    ...(recognitions ? [`-${bonus}`] : []),
  ].join(' · ');

  // Any world might be returned to, so its unearned names stay off the paper
  // until the whole cast has been found.
  const folded = !closed;

  // The person just found is always labelled. Everyone else only if earned —
  // in this round, or on this world's map from earlier starts.
  const namedOnPaper = useMemo(() => {
    const base = new Map(residence?.named ?? []);
    for (const [i, name] of session.known.named) base.set(i, name);
    const yours = universe.nodes.find((n) => n.i === session.you)?.n;
    if (yours) base.set(session.you, yours);
    return base;
  }, [residence, session.known.named, session.you, universe.nodes]);
  const formerSelves = residence ? new Set(residence.selves) : undefined;
  // Every earned name printed at once is a wall of text on a large map. Only
  // the people you have been are labelled; the rest of the map names itself
  // on hover.
  const labelled = useMemo(
    () => new Set([...(residence?.selves ?? []), session.you]),
    [residence, session.you],
  );
  // A finished world is mapped whole: every tie is coloured, including ties
  // between people the player named without ever opening.
  const finished = closed || (residence !== null && isComplete(universe, residence));
  const mapped = useMemo(() => {
    if (finished) {
      const everyone = new Set(universe.nodes.map((n) => n.i));
      return { visible: everyone, expanded: everyone };
    }
    return {
      visible: new Set([...(residence?.visible ?? []), ...session.known.visible]),
      expanded: new Set([...(residence?.expanded ?? []), ...session.known.expanded]),
    };
  }, [finished, universe, residence, session.known.visible, session.known.expanded]);

  const cast = universe.nodes.length;
  const namedCount = Math.min(namedOnPaper.size, cast);
  // The design's own words for this, which say the same thing in fewer of
  // them: what the map withholds, and the one way to get more of it — the
  // same act the ways-out block below offers as its own first button.
  const graphNote = folded ? (
    <>
      Only names you've earned appear here. Play again in {universe.title} to find the rest.
    </>
  ) : null;

  return (
    <ReadingPage
      universe={universe}
      world={world}
      meta={meta}
      i={session.you}
      eyebrow={closed ? 'The whole world' : 'You are'}
      subtitle={universe.title}
      named={namedOnPaper}
      formerSelves={formerSelves}
      mapped={mapped}
      labelled={labelled}
      folded={folded}
      graphNote={graphNote}
      tieLine={tieLine}
      round={round}
      linkToCharacter={onOpenCharacter}
      linkToTwin={onOpenTwin}
      onOpenWorld={onOpenWorld}
      chrome={<TopBar inset={false} startLinks={startLinks} onOpenLab={onOpenGallery} />}
      head={
        <RevealHead
          eyebrow={closed ? 'The whole world' : 'You were'}
          name={youName}
          wiki={youRecord}
          worldTitle={universe.title}
          cast={cast}
          onOpenWorld={onOpenWorld}
          clues={clues}
          seen={seen}
          residence={residence}
          living={living}
          tally={tally}
          namedCount={namedCount}
          nearest={nearest}
        />
      }
      belowHead={
        <WaysOut startLinks={startLinks} youName={youName} onOpenLab={onOpenGallery} />
      }
      after={
        tieMeaning ? (
          <div className="annot" style={{ marginTop: 26 }}>
            {tieMeaning}
          </div>
        ) : null
      }
    />
  );
}

/**
 * The ways out of a finished round.
 *
 * The round is over and the question is answered, so this is the one screen
 * where what to do next is the whole of what is left — and it was three links
 * in the margin, the same weight as the help link. The artboard gives it the
 * block: play again here, or the two ways of going elsewhere, framed beside
 * it. The same three everywhere, in the same words, with the one that keeps
 * this map carrying the emphasis.
 */
/**
 * The ways out of a finished round.
 *
 * Down to two, since the board dropped its own copies of ANY WORLD and
 * CHOOSE A WORLD — both already in the bar above, where every other screen
 * keeps them. What is left here is specific to just having finished: play
 * the same person again, or go watch them in the lab with every wall down.
 * Both single-line, inline, at the bar's own 44px rather than the taller
 * stacked blocks this row used to hold.
 */
function WaysOut({
  startLinks,
  youName,
  onOpenLab,
}: {
  startLinks: StartLinks;
  youName: string | null;
  onOpenLab: () => void;
}) {
  return (
    <div className="reveal-actions">
      <button type="button" className="reveal-play-again" onClick={startLinks.onStartHere}>
        <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden focusable="false">
          <path d="M3 1l8 5-8 5z" fill="currentColor" />
        </svg>
        Play again here
      </button>

      {/* The one place the lab is more than a link in the corner: the player
          has just finished walking this person's neighbourhood under the
          game's rules, and the lab is where the same person can be watched
          without them. */}
      <button type="button" className="reveal-follow-lab" onClick={onOpenLab}>
        Follow {youName ?? 'them'} with no walls
        <svg
          width="11"
          height="11"
          viewBox="0 0 10 10"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1.4"
          aria-hidden
          focusable="false"
        >
          <path d="M2 5h6M5.5 2.5L8 5 5.5 7.5" />
        </svg>
      </button>
    </div>
  );
}


/**
 * The reveal's head, which is not a character page's.
 *
 * A character page opens with a title: who this is, and what they are in. A
 * reveal opens with a verdict — *you were* — and then the three figures that
 * say how the round went, across the top where they can be read at a glance
 * instead of down the side of the column in a list.
 *
 * The strip is ruled in ink above and hairline below, which is this design's
 * way of marking a reading rather than a heading: the heavy edge is the one
 * the eye starts at.
 */
function RevealHead({
  eyebrow,
  name,
  wiki,
  worldTitle,
  cast,
  onOpenWorld,
  clues,
  seen,
  residence,
  living,
  tally,
  namedCount,
  nearest,
}: {
  eyebrow: string;
  name: string | null;
  wiki: { wiki?: string; wikiLang?: string } | null;
  worldTitle: string;
  cast: number;
  onOpenWorld?: () => void;
  clues: number;
  seen: number;
  residence: Residence | null;
  living: boolean;
  tally: string;
  namedCount: number;
  /** The guess that came closest, when one did. Not on the artboard, and kept
   *  because it is the only line that says how near the player got — it goes
   *  on the detail line rather than taking a figure of its own. */
  nearest: { name: string; hops: number } | null;
}) {
  const lives = residence ? residence.starts.length + (living ? 1 : 0) : 1;
  const mapTotal = residence ? residenceTotal(residence) + (living ? clues : 0) : clues;

  return (
    <div className="reveal-head-block">
      <PageTitle
        eyebrow={eyebrow}
        title={name ?? 'Unknown'}
        worldTitle={worldTitle}
        onOpenWorld={onOpenWorld}
        cast={cast}
        wiki={wiki?.wiki ? { title: wiki.wiki, lang: wiki.wikiLang } : null}
      />

      <div className="reveal-stats">
        <Stat label="Found yourself in" figure={clues} note={clues === 1 ? 'clue' : 'clues'} />
        <Stat label="People uncovered" figure={seen} note={`of ${cast}`} />
        <Stat
          label={residence ? 'All your lives here' : 'This life'}
          figure={lives}
          note={`${lives === 1 ? 'life' : 'lives'} · ${mapTotal} ${mapTotal === 1 ? 'clue' : 'clues'}`}
        />
      </div>

      {/* What those figures are made of, and — in a residence — where the
          whole map stands: two ends of one row, not a run-on sentence. The
          board doesn't carry the closest-wrong-guess line this screen used to
          add here; it still means something, so it rides along as a title on
          the tally itself rather than taking space the design didn't leave. */}
      {/* A grid, not a plain `space-between` row — it mirrors `.reveal-stats`'s
          own three columns exactly, so the right-hand clause lands under
          ALL YOUR LIVES HERE rather than wherever the text happens to end up
          flush against the right edge. `This life` spans the first two
          columns; the residence clause takes the third, same as the stat
          above it. */}
      <div
        className="annot reveal-tally"
        style={{
          whiteSpace: 'nowrap',
          fontSize: 9,
          letterSpacing: '0.12em',
          color: 'var(--annotation)',
        }}
      >
        <span
          style={{ gridColumn: 'span 2' }}
          title={
            nearest
              ? `Closest guess ${nearest.name}, ${nearest.hops} ${nearest.hops === 1 ? 'tie' : 'ties'} away`
              : undefined
          }
        >
          This life · {tally}
        </span>
        {residence && (
          <span>
            All {lives} {lives === 1 ? 'life' : 'lives'} ·{' '}
            <span style={{ color: 'var(--ink)' }}>
              {namedCount} of {cast} named
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

/** One figure in the strip: what it counts, how many, and the unit. */
function Stat({ label, figure, note }: { label: string; figure: number; note: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div className="annot" style={{ fontSize: 9, letterSpacing: '0.2em', color: 'var(--annotation)' }}>
        {label}
      </div>
      <div className="mono" style={{ fontSize: 24, lineHeight: 1, color: 'var(--ink)' }}>
        {figure}{' '}
        <span style={{ fontSize: 11, letterSpacing: '0.12em', color: 'var(--annotation)' }}>{note}</span>
      </div>
    </div>
  );
}
