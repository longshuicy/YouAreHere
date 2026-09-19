import { useMemo } from 'react';
import { BrandMark, CHROME_PADDING, MarginLinks } from '../render/MarginLinks';
import { FullGraph } from '../render/FullGraph';
import type { Session } from '../engine/session';
import { clueTotal } from '../render/Ledger';
import { describeContext, describeReadings, revealMetrics } from '../graph/metrics';
import type { NodeFacts, PuzzleRecord, Universe, UniverseMeta } from '../types';

interface Props {
  session: Session;
  universe: Universe;
  puzzle: PuzzleRecord;
  meta: UniverseMeta | null;
  onWakeElsewhere: () => void;
  onOpenKey: () => void;
  onStartAgain: () => void;
  onOpenGallery: () => void;
}

export function Reveal({
  session,
  universe,
  puzzle,
  meta,
  onWakeElsewhere,
  onOpenKey,
  onStartAgain,
  onOpenGallery,
}: Props) {
  const you = universe.nodes.find((n) => n.i === session.you);
  const clues = clueTotal(session.ledger);
  const { expansions, facts, names } = session.ledger;

  /**
   * The structural fact the design has always promised at the reveal.
   *
   * It was to arrive from the pipeline, on `puzzle.reveal.line`. The pipeline
   * has never emitted one — zero of 1,357 puzzles carry the record — so the
   * slot has sat behind a null check since it was written and has never once
   * been seen. Everything below is computed in the browser instead, which also
   * means it works in the 26 worlds whose enrichment sidecar is empty, and
   * those are precisely the worlds the reveal had nothing to say about.
   */
  const metrics = useMemo(() => revealMetrics(universe, session.you), [universe, session.you]);
  const signals = meta?.nodes[String(session.you)]?.signals ?? null;
  const myFacts = useMemo(
    () => (meta?.nodes[String(session.you)]?.facts ?? {}) as NodeFacts,
    [meta, session.you],
  );

  const context = useMemo(() => describeContext(meta, myFacts), [meta, myFacts]);

  /**
   * How the network read, in words. Ordered strongest first and capped, because
   * a reveal is a beat and not a report — six true sentences in a column is a
   * dashboard, and this page is the last thing the player sees.
   */
  const readings = useMemo(() => describeReadings(metrics, signals), [metrics, signals]);

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

  const structuralLine = puzzle.reveal?.line ?? null;

  /** Context, readings and the pipeline's structural line are all the same kind
   * of remark about the same person, so they are one list and one style. */
  const notes = useMemo(
    () => [...context, ...readings, ...(structuralLine ? [structuralLine] : [])],
    [context, readings, structuralLine],
  );
  const characterLine = meta?.nodes[String(session.you)]?.line ?? null;
  const tieMeaning = universe.provenance?.edgeDefinition
    ? `In this story, a tie meant ${universe.provenance.edgeDefinition}`
    : null;

  const { recognitions } = session.ledger;
  const tally = [
    `${expansions} ${expansions === 1 ? 'expansion' : 'expansions'}`,
    `${facts} ${facts === 1 ? 'reading' : 'readings'}`,
    `${names} ${names === 1 ? 'name' : 'names'}`,
    ...(session.ledger.stories ? ['the story'] : []),
    // The only entry that came back to you. Read out last so the line ends on
    // what you knew rather than on what you bought.
    ...(recognitions ? [`${recognitions} recognised, −${recognitions}`] : []),
  ].join('  ·  ');

  return (
    <div style={{ position: 'relative', height: '100vh', overflow: 'hidden' }}>
      {/* Full-bleed network; the answer floats over it on clean paper. */}
      <div style={{ position: 'absolute', inset: 0 }}>
        <FullGraph
          universe={universe}
          you={session.you}
          named={session.known.named}
          tieLine={tieLine}
        />
      </div>

      <div
        style={{
          position: 'absolute',
          inset: 0,
          padding: CHROME_PADDING,
          display: 'flex',
          flexDirection: 'column',
          // Let hovers reach the network underneath; only the exits take clicks.
          pointerEvents: 'none',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <BrandMark onStartAgain={onStartAgain} />
          <MarginLinks onOpenKey={onOpenKey} onOpenGallery={onOpenGallery} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 46, textAlign: 'center' }}>
          <div className="chrome" style={{ letterSpacing: '0.3em' }}>You are</div>

          <div style={{ fontSize: 57, letterSpacing: '0.015em', marginTop: 14, lineHeight: 1.1 }}>
            {you?.n ?? 'Unknown'}
          </div>

          <div style={{ fontSize: 23, fontStyle: 'italic', color: 'var(--body)', marginTop: 10 }}>
            {universe.title}
          </div>

          {/* Everything from here down is prose, and prose is read from a fixed
              left edge. The headline above stays centred; the column under it
              does not, because a centred paragraph makes the reader find the
              start of every line for themselves. */}
          <div style={{ textAlign: 'left', width: 'min(560px, 100%)' }}>
          {characterLine && (
            <div style={{ fontSize: 19, color: 'var(--body)', marginTop: 30 }}>
              {characterLine}
            </div>
          )}

          {/* Everything about the run, in one voice. The clue count used to be
              picked out in ink while the rest sat in annotation grey, and the
              coverage lines lived in a second identical block further down the
              page; two blocks styled the same way, separated by prose, is one
              block that has been cut in half for no reason. */}
          <div
            className="mono"
            style={{
              fontSize: 11,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: 'var(--annotation)',
              marginTop: characterLine ? 34 : 30,
              lineHeight: 2.1,
            }}
          >
            <div>{tally}</div>
            <div>
              You found yourself in {clues} {clues === 1 ? 'clue' : 'clues'}
            </div>
            <div>
              You uncovered {seen} of the {metrics.castSize} people in this story
            </div>
            {nearest && (
              <div>
                Your closest guess was {nearest.name}, {nearest.hops}{' '}
                {nearest.hops === 1 ? 'tie' : 'ties'} from you
              </div>
            )}
          </div>

          {/* And everything about the character and the shape they stood in,
              also in one voice. These were three blocks at two sizes, two
              colours and two slopes, which asked the reader to work out what
              the differences meant. They mean nothing: it is all the same kind
              of remark, so it is all set the same way. */}
          {notes.length > 0 && (
            <div
              style={{
                fontSize: 16,
                color: 'var(--annotation)',
                marginTop: 28,
                lineHeight: 1.75,
              }}
            >
              {notes.map((line) => (
                <div key={line}>{line}</div>
              ))}
            </div>
          )}

          </div>

          {tieMeaning && (
            <div className="annot" style={{ marginTop: 30 }}>
              {tieMeaning}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 36, marginTop: 40, pointerEvents: 'auto' }}>
            <button className="action" style={{ letterSpacing: '0.3em' }} onClick={onWakeElsewhere}>
              Wake somewhere else
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
