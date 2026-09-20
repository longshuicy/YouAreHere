import { useMemo } from 'react';
import { BrandCluster, ChromeRight } from '../render/MarginLinks';
import { clueBonus, clueTotal, type Session } from '../engine/session';
import { readRound } from '../graph/reading';
import { measureWorld } from '../gallery/metrics';
import { ReadingPage } from './ReadingPage';
import type { Universe, UniverseMeta } from '../types';

interface Props {
  session: Session;
  universe: Universe;
  meta: UniverseMeta | null;
  onStartAgain: () => void;
  onOpenGallery: () => void;
  /** Jump straight into another character's own page in the topology gallery
   * — every name on this page belongs to someone the story has already
   * named, so nothing here is a spoiler a link would hand out early. */
  onOpenCharacter: (i: number) => void;
  /** Jump to this world's own card in the gallery. */
  onOpenWorld: () => void;
  /** Jump to the nearest double named in "What the shape said" — the one name
   * on this page that can belong to a different world entirely. */
  onOpenTwin: (world: string, name: string) => void;
}

export function Reveal({
  session,
  universe,
  meta,
  onStartAgain,
  onOpenGallery,
  onOpenCharacter,
  onOpenWorld,
  onOpenTwin,
}: Props) {
  const clues = clueTotal(session.ledger);
  const { expansions, facts, names } = session.ledger;

  /**
   * The world, measured the same way the gallery measures it.
   *
   * The reveal used to compute its own small set of figures and nothing else,
   * which is why it could say how many ties you had and never which camp they
   * belonged to. `measureWorld` is the one place communities are found, so the
   * reveal asks it rather than growing a second, quietly different answer to
   * the same question. One world, once, when the reveal fires: the heaviest in
   * the catalogue is 726 characters.
   */
  const world = useMemo(() => measureWorld(universe), [universe]);

  /** The half of the reading that is about the round rather than the person. */
  const round = useMemo(
    () => readRound(universe, world, session.you, session.known),
    [universe, world, session.you, session.known],
  );

  /** What you actually turned over, and how near you came. Both read off the
   * session rather than the data — this is the part of the page that is about
   * the player rather than the character. */
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
    // The only entry that came back to you. Read out last so the line ends on
    // what you knew rather than on what you bought.
    ...(recognitions ? [`-${bonus}`] : []),
  ].join('  ·  ');

  return (
    <ReadingPage
      universe={universe}
      world={world}
      meta={meta}
      i={session.you}
      eyebrow="You are"
      subtitle={universe.title}
      named={session.known.named}
      tieLine={tieLine}
      round={round}
      linkToCharacter={onOpenCharacter}
      linkToTwin={onOpenTwin}
      onOpenWorld={onOpenWorld}
      chromeLeft={<BrandCluster onStartAgain={onStartAgain} />}
      chromeRight={
        <ChromeRight>
          <button type="button" className="annot-link" onClick={onOpenGallery}>
            The topology gallery
          </button>
        </ChromeRight>
      }
      headAside={
        /* What the round cost, beside the name it bought. */
        <>
          {/* The same mono as the eyebrow beside it, at the same size, so the
              two headings share a line rather than nearly sharing one. */}
          <div className="chrome" style={{ letterSpacing: '0.3em' }}>
            How it went
          </div>
          <div
            className="mono reveal-head-tally"
            style={{
              fontSize: 9.5,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--annotation)',
              lineHeight: 1.7,
              paddingTop: 14,
            }}
          >
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
          </div>
        </>
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
