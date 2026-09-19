import { useMemo } from 'react';
import { BrandCluster, CHROME_PADDING, HelpLink } from '../render/MarginLinks';
import { FullGraph } from '../render/FullGraph';
import type { Session } from '../engine/session';
import { clueTotal } from '../render/Ledger';
import { describeContext, describeReadings, revealMetrics } from '../graph/metrics';
import type { NodeFacts, Universe, UniverseMeta } from '../types';

interface Props {
  session: Session;
  universe: Universe;
  meta: UniverseMeta | null;
  onWakeElsewhere: () => void;
  onOpenKey: () => void;
  onStartAgain: () => void;
  onOpenGallery: () => void;
}

export function Reveal({
  session,
  universe,
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
   * It was to arrive from the pipeline, on `puzzle.reveal.line`, chosen at
   * build time from a set of templates. The pipeline never emitted one: zero of
   * 1,357 puzzles carried the record, so the slot sat behind a null check from
   * the day it was written and was never once seen. The record and the prop
   * that carried it are gone.
   *
   * Everything below is computed here instead, which also means it works in the
   * 26 worlds whose enrichment sidecar is empty, and those are precisely the
   * worlds the reveal had nothing to say about. The pipeline doc argued this
   * could not be done in the browser, because measuring a start against the
   * whole catalogue would mean shipping the whole catalogue. That still holds,
   * and it is why `lookAlikes` is counted at build time and shipped as a single
   * number on the reveal-only sidecar. Nothing else here needs more than the
   * one universe already loaded.
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
  const readings = useMemo(
    () => describeReadings(metrics, signals, universe.id),
    [metrics, signals, universe.id],
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


  /** Context and readings are the same kind of remark about the same person,
   * so they are one list and one style. */
  const notes = useMemo(
    () => [...context, ...readings],
    [context, readings],
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
    <div
      className="reveal-root"
      style={{ position: 'relative', height: '100dvh', overflow: 'hidden', background: 'var(--paper)' }}
    >
      {/* Graph is the right half of the page, not a boxed panel. */}
      <div className="reveal-graph">
        <FullGraph
          universe={universe}
          you={session.you}
          named={session.known.named}
          tieLine={tieLine}
          role="subject"
        />
      </div>

      {/* Paper column on the left. Wider than the old centred 560px strip. */}
      <div className="reveal-copy">
        <div className="chrome" style={{ letterSpacing: '0.3em' }}>
          You are
        </div>

        <div style={{ fontSize: 'clamp(34px, 9vw, 57px)', letterSpacing: '0.015em', marginTop: 14, lineHeight: 1.1 }}>
          {you?.n ?? 'Unknown'}
        </div>

        <div style={{ fontSize: 'clamp(18px, 5vw, 23px)', fontStyle: 'italic', color: 'var(--body)', marginTop: 10 }}>
          {universe.title}
        </div>

        {characterLine && (
          <div style={{ fontSize: 'clamp(16px, 4.2vw, 19px)', color: 'var(--body)', marginTop: 30 }}>
            {characterLine}
          </div>
        )}

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

        {tieMeaning && (
          <div className="annot" style={{ marginTop: 30 }}>
            {tieMeaning}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 36,
            marginTop: 40,
            flexWrap: 'wrap',
          }}
        >
          <button className="action" style={{ letterSpacing: '0.3em' }} onClick={onWakeElsewhere}>
            Start somewhere else
          </button>
          <button type="button" className="action-quiet" onClick={onOpenGallery}>
            The topology gallery
          </button>
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
          // Over a stacked, scrolling reveal the chrome would otherwise sit at
          // the top of the *document* and scroll away with the graph.
          height: 'fit-content',
          pointerEvents: 'none',
        }}
      >
        <BrandCluster onStartAgain={onStartAgain} />
        <HelpLink onOpenKey={onOpenKey} />
      </div>
    </div>
  );
}
