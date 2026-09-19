import { useRef, useState } from 'react';
import { Stage } from '../render/Stage';
import { CHROME_PADDING, HelpLink } from '../render/MarginLinks';
import type { VisibleGraph } from '../graph/project';
import type { LaidOutNode } from '../graph/layout';
import type { Session } from '../engine/session';

/** Where the title sits once play begins — same inset as the explore chrome. */
const TITLE_CORNER = { top: 44, left: 64 };
const TITLE_CORNER_SIZE = 20;

interface Props {
  graph: VisibleGraph;
  positions: Map<number, LaidOutNode>;
  session: Session;
  /** Set when the player picked the book first. The story question is settled;
   *  the stranger on the stage is still whoever the scale drew. */
  worldTitle: string | null;
  onBegin: () => void;
  onChooseWorld: () => void;
  targetEase: number;
  onChooseEase: (ease: number) => void;
  readsChineseClassics: boolean;
  onReadsChineseClassics: (next: boolean) => void;
  onOpenKey: () => void;
  onOpenGallery: () => void;
}

/**
 * Where on the difficulty scale to wake.
 *
 * A scale rather than a couple of named settings, because the thing underneath
 * is a continuous score: the pipeline measures how findable each start is, and
 * cutting that into "approachable" and "hard" would have put a boundary where
 * the measurement has none. The ends are labelled and the middle is not, which
 * is honest — the number means something relative and nothing absolute.
 *
 * Worded as a kind of person rather than a difficulty, because that is what it
 * chooses. It picks which scored start you are handed and changes nothing about
 * what an action costs, so "difficulty is a property of the start, never a
 * setting" still holds: you are choosing which start, not new rules for it.
 */
export function ColdOpen({
  graph,
  positions,
  session,
  worldTitle,
  onBegin,
  onChooseWorld,
  targetEase,
  onChooseEase,
  readsChineseClassics,
  onReadsChineseClassics,
  onOpenKey,
  onOpenGallery,
}: Props) {
  const titleRef = useRef<HTMLDivElement>(null);
  const [walking, setWalking] = useState(false);

  /** The centred headline takes its seat in the top-left. The second line
   *  fades: it has said what it came to say, and the explore screen will
   *  pick the thought up as "You don't know where you are." */
  const begin = () => {
    const line = titleRef.current;
    const reduce =
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!line || reduce) {
      onBegin();
      return;
    }

    const from = line.getBoundingClientRect();
    const fromSize = parseFloat(getComputedStyle(line).fontSize);
    const dx = TITLE_CORNER.left - from.left;
    const dy = TITLE_CORNER.top - from.top;
    const scale = TITLE_CORNER_SIZE / fromSize;

    setWalking(true);
    line.style.transformOrigin = 'top left';
    line.style.transition = 'transform 720ms cubic-bezier(0.22, 1, 0.36, 1)';
    line.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      onBegin();
    };
    line.addEventListener('transitionend', finish, { once: true });
    window.setTimeout(finish, 800);
  };

  return (
    <div
      className="cold-open"
      style={{
        height: '100dvh',
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 'clamp(10px, 2vh, 20px)',
        padding: CHROME_PADDING,
        paddingBottom: 'max(40px, var(--pad-bottom))',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-start', flexShrink: 0 }}>
        <HelpLink onOpenKey={onOpenKey} />
      </div>

      <div
        className="cold-main"
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 'clamp(12px, 2.2vh, 22px)',
        }}
      >
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          <div
            ref={titleRef}
            className="brand"
            style={{ fontSize: 'clamp(28px, 3.8vh, 38px)', letterSpacing: '0.04em' }}
          >
            You are here.
          </div>
          <div
            className="title-sub"
            style={{
              fontSize: 'clamp(20px, 2.6vh, 26px)',
              fontStyle: worldTitle ? 'italic' : undefined,
              color: 'var(--body)',
              marginTop: 10,
              opacity: walking ? 0 : 1,
              transition: 'opacity 400ms ease',
            }}
          >
            {worldTitle ?? 'You don’t know where here is.'}
          </div>
        </div>

        {/* The opening ring has to hold every neighbour you have, and the stage
            zooms it to fit half the *smaller* side — so this height, not the
            width, is what decides how many characters can stand around you
            before they touch. At 300px it was about a dozen, which is fewer
            than the puzzle generator is allowed to hand it. */}
        <div
          className="cold-stage"
          style={{ width: 'min(620px, 92vw)', height: 'min(440px, 44vh)', flexShrink: 1, minHeight: 0, overflow: 'visible' }}
        >
          <Stage
            graph={graph}
            positions={positions}
            session={session}
            onExpand={() => {}}
            onFacts={() => {}}
            onName={() => {}}
            interactive={false}
            pannable={false}
          />
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 'clamp(10px, 1.6vh, 18px)',
            fontSize: 'clamp(15px, 1.95vh, 19px)',
            color: 'var(--body)',
            lineHeight: 1.5,
            textAlign: 'center',
            flexShrink: 0,
          }}
        >
          <div>
            <div>We find our place in the universe</div>
            <div>by whom we follow, whom we find,</div>
            <div>whom we love, and whom we lose.</div>
          </div>
          <div style={{ color: 'var(--ink)' }}>
            Find your coordinates. <em>Find yourself.</em>
          </div>
        </div>
      </div>

      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 'clamp(8px, 1.4vh, 18px)',
        }}
      >
        {/* The scale sits above the commit, because it changes what you
            are about to begin — the stranger on the stage is redrawn the moment
            it is touched, so the choice is visible before it is taken. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'clamp(8px, 3vw, 16px)',
            width: 'min(420px, 100%)',
          }}
        >
          <span className="mono" style={{ fontSize: 10, letterSpacing: '0.2em', color: 'var(--unknown)', whiteSpace: 'nowrap' }}>
            OBSCURE
          </span>
          <input
            className="ease"
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(targetEase * 100)}
            aria-label="How findable a stranger to wake as"
            onChange={(e) => onChooseEase(Number(e.target.value) / 100)}
            style={{ flex: 1, minHeight: 44 }}
          />
          <span className="mono" style={{ fontSize: 10, letterSpacing: '0.2em', color: 'var(--unknown)', whiteSpace: 'nowrap' }}>
            FINDABLE
          </span>
        </div>

        {/* Hidden once a world is named: this only tilts the random draw. */}
        {!worldTitle && (
          <button
            className="action-quiet"
            aria-pressed={readsChineseClassics}
            onClick={() => onReadsChineseClassics(!readsChineseClassics)}
            style={{ color: readsChineseClassics ? 'var(--ink)' : undefined, fontSize: 10, letterSpacing: '0.2em' }}
          >
            <span aria-hidden="true" style={{ marginRight: 8 }}>{readsChineseClassics ? '[\u00d7]' : '[ ]'}</span>
            I read the Chinese classics
          </button>
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'baseline',
            gap: 34,
            flexWrap: 'wrap',
          }}
        >
          <button className="action" onClick={begin} disabled={walking}>
            Begin
          </button>
          <button className="action-quiet" onClick={onChooseWorld} disabled={walking}>
            {worldTitle ? 'Choose another world' : 'Choose a world'}
          </button>
          <button type="button" className="action-quiet" onClick={onOpenGallery} disabled={walking}>
            The topology gallery
          </button>
        </div>
      </div>
    </div>
  );
}
