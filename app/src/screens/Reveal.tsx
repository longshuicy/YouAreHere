import { useMemo } from 'react';
import { hereLabel, type StartLinks } from '../render/MarginLinks';
import { TopBar } from '../render/TopBar';
import { clueBonus, clueTotal, type Session } from '../engine/session';
import {
  isComplete,
  residenceTotal,
  type Residence,
} from '../engine/residence';
import { readRound } from '../graph/reading';
import { WikiLink } from '../render/WikiLink';
import { NameLink } from '../render/NameLink';
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
  const tally = [
    `${expansions} ${expansions === 1 ? 'expansion' : 'expansions'}`,
    `${facts} ${facts === 1 ? 'reading' : 'readings'}`,
    `${names} ${names === 1 ? 'name' : 'names'}`,
    ...(session.ledger.stories ? ['the world'] : []),
    ...(session.ledger.answers ? ['the answer'] : []),
    ...(recognitions ? [`-${bonus}`] : []),
  ].join('  ·  ');

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
        <WaysOut
          startLinks={startLinks}
          youName={youName}
          worldTitle={universe.title}
          onOpenLab={onOpenGallery}
        />
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
function WaysOut({
  startLinks,
  youName,
  worldTitle,
  onOpenLab,
}: {
  startLinks: StartLinks;
  youName: string | null;
  worldTitle: string;
  onOpenLab: () => void;
}) {
  return (
    <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="ways-out">
        <button type="button" className="begin-block accent" onClick={startLinks.onStartHere}>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 3, textAlign: 'left' }}>
            <span className="begin-word" style={{ fontSize: 11, letterSpacing: '0.22em' }}>
              Play again
            </span>
            <span className="begin-sub" style={{ letterSpacing: '0.18em' }}>
              {hereLabel(worldTitle)}
            </span>
          </span>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden focusable="false">
            <path d="M3 1l8 5-8 5z" fill="currentColor" />
          </svg>
        </button>
        <button type="button" className="outline-button strong" onClick={startLinks.onStartAgain}>
          Any world
        </button>
        <button type="button" className="outline-button strong" onClick={startLinks.onChooseWorld}>
          Choose a world
        </button>
      </div>

      {/* The one place the lab is more than a link in the corner: the player
          has just finished walking this person's neighbourhood under the
          game's rules, and the lab is where the same person can be watched
          without them. */}
      <button type="button" className="outline-row" onClick={onOpenLab}>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span className="mono" style={{ fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase' }}>
            Follow {youName ?? 'them'} with no walls
          </span>
          <span style={{ fontSize: 15, color: 'var(--body)' }}>
            In the topology lab: watch who they’d meet if every world opened up.
          </span>
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 10 10"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1.3"
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div className="annot" style={{ fontSize: 10, letterSpacing: '0.24em', color: 'var(--annotation)' }}>
          {eyebrow}
        </div>
        <h1
          style={{
            margin: 0,
            fontWeight: 400,
            fontSize: 'clamp(34px, 7vw, 64px)',
            lineHeight: 1.02,
            color: 'var(--accent)',
          }}
        >
          {name ?? 'Unknown'}
        </h1>
        <div
          className="annot"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 18,
            flexWrap: 'wrap',
            paddingTop: 6,
            fontSize: 10,
            letterSpacing: '0.18em',
            color: 'var(--annotation)',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            In{' '}
            {onOpenWorld ? (
              <NameLink onClick={onOpenWorld}>{worldTitle}</NameLink>
            ) : (
              <span style={{ color: 'var(--ink)' }}>{worldTitle}</span>
            )}{' '}
            · {cast} characters
          </span>
          {wiki?.wiki && <WikiLink title={wiki.wiki} lang={wiki.wikiLang ?? 'en'} />}
        </div>
      </div>

      <div className="reveal-stats">
        <Stat label="Found yourself in" figure={clues} note={clues === 1 ? 'clue' : 'clues'} />
        <Stat label="People uncovered" figure={seen} note={`of ${cast}`} />
        <Stat
          label={residence ? 'All your lives here' : 'This life'}
          figure={lives}
          note={`${lives === 1 ? 'life' : 'lives'} · ${mapTotal} ${mapTotal === 1 ? 'clue' : 'clues'}`}
        />
      </div>

      {/* What those figures are made of. One line, under the strip, in the
          order the round spent them. */}
      <div className="annot" style={{ fontSize: 9, letterSpacing: '0.16em', color: 'var(--annotation)' }}>
        This life · {tally}
        {nearest && (
          <>
            {'  ·  '}Closest guess {nearest.name}, {nearest.hops}{' '}
            {nearest.hops === 1 ? 'tie' : 'ties'} away
          </>
        )}
        {residence && (
          <>
            {'  ·  '}Across all {lives} ·{' '}
            <span style={{ color: 'var(--ink)' }}>
              {namedCount} of {cast} named
            </span>
          </>
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
