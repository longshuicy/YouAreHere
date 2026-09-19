import { useRef, useState } from 'react';
import { Stage } from '../render/Stage';
import { CHROME_PADDING, ChromeRight } from '../render/MarginLinks';
import type { VisibleGraph } from '../graph/project';
import type { LaidOutNode } from '../graph/layout';
import type { Session } from '../engine/session';

/** One column for the whole page: the title, the diagram, the verse, the
 *  settings and the action all take their width from here, so every edge on
 *  the page lines up with every other one. */
const MEASURE = 'min(460px, 92vw)';

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
        gap: 'clamp(8px, 1.4vh, 16px)',
        padding: CHROME_PADDING,
        paddingBottom: 'max(32px, var(--pad-bottom))',
      }}
    >
      {/* The gallery is not a thing to do here, so it is not offered beside the
          thing to do. It goes to the corner this game keeps everything that is
          not the page in, which also means it is reachable from every screen
          rather than only from the two ends of a run. */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
        <ChromeRight>
          <button type="button" className="annot-link" onClick={onOpenGallery} disabled={walking}>
            The topology gallery
          </button>
        </ChromeRight>
      </div>

      {/* One column, and everything sits in it.
          There were four widths down this page: 243px of verse, a 256px
          drawing, a 560px stage and a 772px row of controls, none of them
          sharing an edge. Worse, the scale was not on the page's axis at all:
          paired with the toggle and centred as a pair, its track sat 140px
          left of the title above it, which is the kind of wrongness a reader
          feels without being able to name. */}
      <div
        className="cold-main"
        style={{
          flex: 1,
          minHeight: 0,
          width: MEASURE,
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'clamp(10px, 1.7vh, 18px)',
        }}
      >
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          <div
            ref={titleRef}
            className="brand"
            style={{ fontSize: 'clamp(26px, 3.4vh, 33px)', letterSpacing: '0.04em' }}
          >
            You are here.
          </div>
          <div
            className="title-sub"
            style={{
              fontSize: 'clamp(17px, 2.2vh, 21px)',
              fontStyle: worldTitle ? 'italic' : undefined,
              color: 'var(--body)',
              marginTop: 8,
              opacity: walking ? 0 : 1,
              transition: 'opacity 400ms ease',
            }}
          >
            {worldTitle ?? 'You don\u2019t know where here is.'}
          </div>
        </div>

        {/* The opening ring has to hold every neighbour you have, and the stage
            zooms it to fit half the *smaller* side, so this height is what
            decides how many characters can stand around you before they touch.
            It is the shortest stage in the game and `COLD_OPEN_FIT` in
            layout.ts is calibrated against it. */}
        <div
          className="cold-stage"
          style={{
            width: '100%',
            height: 'min(400px, 40vh)',
            flexShrink: 1,
            minHeight: 0,
            overflow: 'visible',
          }}
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
            gap: 'clamp(6px, 1vh, 12px)',
            fontSize: 'clamp(14px, 1.8vh, 17px)',
            color: 'var(--body)',
            lineHeight: 1.45,
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

      {/* Everything here is an adjustment to the stranger you are about to be
          handed: which scale to draw them from, whether the draw may reach the
          Chinese classics, which world they live in. And then the one thing
          that is not an adjustment. Choosing a world used to sit beside Begin
          as though it were an alternative to beginning. It is not: it is the
          last setting before it. */}
      <div
        style={{
          width: MEASURE,
          margin: '0 auto',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 'clamp(9px, 1.5vh, 16px)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'clamp(8px, 3vw, 16px)',
            width: '100%',
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

        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'baseline',
            gap: 'clamp(14px, 4vw, 30px)',
            flexWrap: 'wrap',
          }}
        >
          <button
            className="action-quiet"
            onClick={onChooseWorld}
            disabled={walking}
            style={{ fontSize: 10, letterSpacing: '0.18em', minHeight: 0, padding: '7px 2px' }}
          >
            {worldTitle ? 'Choose another world' : 'Choose a world'}
          </button>

          {/* Hidden once a world is named: this only tilts the random draw. */}
          {!worldTitle && (
            <button
              className="action-quiet"
              aria-pressed={readsChineseClassics}
              onClick={() => onReadsChineseClassics(!readsChineseClassics)}
              style={{
                color: readsChineseClassics ? 'var(--ink)' : undefined,
                fontSize: 10,
                letterSpacing: '0.18em',
                minHeight: 0,
                padding: '7px 2px',
              }}
            >
              <span aria-hidden="true" style={{ marginRight: 8 }}>{readsChineseClassics ? '[\u00d7]' : '[ ]'}</span>
              I read the Chinese classics
            </button>
          )}
        </div>

        {/* The only thing on this page that is not a setting. */}
        <button
          className="action"
          onClick={begin}
          disabled={walking}
          style={{ fontSize: 15, letterSpacing: '0.44em', borderBottomWidth: 2, padding: '14px 0 11px 6px' }}
        >
          Begin
        </button>
      </div>
    </div>
  );
}
