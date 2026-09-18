import { BrandMark, CHROME_PADDING, MarginLinks } from '../render/MarginLinks';
import { FullGraph } from '../render/FullGraph';
import type { Session } from '../engine/session';
import { clueTotal } from '../render/Ledger';
import type { PuzzleRecord, Universe, UniverseMeta } from '../types';

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

  const structuralLine = puzzle.reveal?.line ?? null;
  const characterLine = meta?.nodes[String(session.you)]?.line ?? null;
  const tieMeaning = universe.provenance?.edgeDefinition
    ? `In this story, a tie meant ${universe.provenance.edgeDefinition}`
    : null;

  const tally = [
    `${expansions} ${expansions === 1 ? 'expansion' : 'expansions'}`,
    `${facts} ${facts === 1 ? 'reading' : 'readings'}`,
    `${names} ${names === 1 ? 'name' : 'names'}`,
    ...(session.ledger.stories ? ['the story'] : []),
  ].join('  ·  ');

  return (
    <div style={{ position: 'relative', height: '100vh', overflow: 'hidden' }}>
      {/* Full-bleed network; the answer floats over it on clean paper. */}
      <div style={{ position: 'absolute', inset: 0 }}>
        <FullGraph universe={universe} you={session.you} />
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

          {characterLine && (
            <div style={{ fontSize: 19, color: 'var(--body)', marginTop: 14, maxWidth: 620 }}>
              {characterLine}
            </div>
          )}

          <div style={{ fontSize: 23, fontStyle: 'italic', color: 'var(--body)', marginTop: characterLine ? 10 : 6 }}>
            {universe.title}
          </div>

          <div
            className="mono"
            style={{
              fontSize: 11,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: 'var(--annotation)',
              marginTop: 42,
              lineHeight: 2.1,
            }}
          >
            <div>{tally}</div>
            <div style={{ color: 'var(--ink)' }}>
              You found yourself in {clues} {clues === 1 ? 'clue' : 'clues'}
            </div>
          </div>

          {structuralLine && (
            <div style={{ fontSize: 21, fontStyle: 'italic', color: 'var(--body)', marginTop: 34 }}>
              {structuralLine}
            </div>
          )}

          {tieMeaning && (
            <div className="annot" style={{ marginTop: 22 }}>
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
