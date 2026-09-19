import { Stage } from '../render/Stage';
import { BrandMark, CHROME_PADDING, MarginLinks } from '../render/MarginLinks';
import type { VisibleGraph } from '../graph/project';
import type { LaidOutNode } from '../graph/layout';
import type { Session } from '../engine/session';

interface Props {
  graph: VisibleGraph;
  positions: Map<number, LaidOutNode>;
  session: Session;
  onBegin: () => void;
  onChooseWorld: () => void;
  targetEase: number;
  onChooseEase: (ease: number) => void;
  onOpenKey: () => void;
  onStartAgain: () => void;
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
  onBegin,
  onChooseWorld,
  targetEase,
  onChooseEase,
  onOpenKey,
  onStartAgain,
  onOpenGallery,
}: Props) {

  return (
    <div
      style={{
        // Height, not minHeight: with only a floor the page grew past the
        // window and the bottom inset fell off the edge, which parked Begin
        // on the glass. Overflow still scrolls on a short window.
        // Top and sides share CHROME_PADDING so the brand mark does not jump
        // when this screen gives way to play. Leftover height sits above the
        // scale rather than between the headline and the graph; the extra
        // bottom inset lifts Begin off the edge.
        height: '100vh',
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 'clamp(10px, 2vh, 20px)',
        padding: CHROME_PADDING,
        paddingBottom: 80,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
        <BrandMark onStartAgain={onStartAgain} />
        <MarginLinks onOpenKey={onOpenKey} onOpenGallery={onOpenGallery} />
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 'clamp(12px, 2.2vh, 22px)',
        }}
      >
        <div style={{ fontSize: 'clamp(24px, 3.2vh, 31px)', letterSpacing: '0.01em', flexShrink: 0 }}>
          You wake up here.
        </div>

        {/* The opening ring has to hold every neighbour you have, and the stage
            zooms it to fit half the *smaller* side — so this height, not the
            width, is what decides how many characters can stand around you
            before they touch. At 300px it was about a dozen, which is fewer
            than the puzzle generator is allowed to hand it. */}
        <div style={{ width: 'min(620px, 80vw)', height: 'min(440px, 44vh)', flexShrink: 1, minHeight: 0 }}>
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
            <div>Find your coordinates.</div>
            <div>Find yourself.</div>
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
            gap: 16,
            width: 'min(420px, 76vw)',
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

        {/* Begin stays the loud one and stays first: the default is still to wake
            somewhere nobody has named. Choosing is offered beside it, quieter. */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'baseline',
            gap: 34,
          }}
        >
          <button className="action" onClick={onBegin}>
            Begin
          </button>
          <button className="action-quiet" onClick={onChooseWorld}>
            Choose a world
          </button>
        </div>
      </div>
    </div>
  );
}
