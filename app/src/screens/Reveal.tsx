import { useMemo } from 'react';
import { BrandCluster, ChromeRight, type StartLinks } from '../render/MarginLinks';
import { clueBonus, clueTotal, type Session } from '../engine/session';
import {
  isComplete,
  residenceTotal,
  startOrdinal,
  type Residence,
} from '../engine/residence';
import { readRound } from '../graph/reading';
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

const TALLY_STYLE = {
  fontSize: 9.5,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--annotation)',
  lineHeight: 1.7,
  paddingTop: 14,
} as const;

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
  const startNumber = residence
    ? residence.selves.includes(session.you)
      ? residence.selves.length
      : residence.selves.length + 1
    : 1;

  const graphNote = folded ? (
    <>
      Only the names you have earned are on this map. Everyone else stays unnamed until you find
      them: start in {universe.title} to keep going.
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
      chromeLeft={<BrandCluster {...startLinks} />}
      chromeRight={
        <ChromeRight>
          <button type="button" className="annot-link" onClick={onOpenGallery}>
            The topology gallery
          </button>
        </ChromeRight>
      }
      headAside={
        closed && residence ? (
          <>
            <div className="chrome" style={{ letterSpacing: '0.3em' }}>
              How it went
            </div>
            <div className="mono reveal-head-tally" style={TALLY_STYLE}>
              {residence.starts.map((n, k) => (
                <div key={k}>
                  {startOrdinal(k + 1)} · {n} {n === 1 ? 'clue' : 'clues'}
                </div>
              ))}
              <div style={{ marginTop: 8, color: 'var(--ink)' }}>
                {residenceTotal(residence)}{' '}
                {residenceTotal(residence) === 1 ? 'clue' : 'clues'} to map a whole world
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="chrome" style={{ letterSpacing: '0.3em' }}>
              How it went
            </div>
            <div className="mono reveal-head-tally" style={TALLY_STYLE}>
              <div>{tally}</div>
              <div>
                You found yourself in {clues} {clues === 1 ? 'clue' : 'clues'}
              </div>
              <div>
                You uncovered {seen} of {world.nodes} people
              </div>
              {nearest && (
                <div>
                  Closest guess {nearest.name}, {nearest.hops}{' '}
                  {nearest.hops === 1 ? 'tie' : 'ties'} away
                </div>
              )}
              {residence && (
                <div style={{ marginTop: 8, color: 'var(--ink)' }}>
                  {living ? `${startOrdinal(startNumber)} · ` : 'Your map · '}
                  {namedCount} of {cast} named
                  {/* A finished map's total is final — the clues it took to
                      name the whole world. Rounds played there afterwards are
                      one-offs and do not add to it. */}
                  {residenceTotal(residence) > 0 &&
                    ` · ${residenceTotal(residence) + (living ? clues : 0)} clues ${
                      finished ? 'in total' : 'so far'
                    }`}
                </div>
              )}
            </div>
          </>
        )
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
