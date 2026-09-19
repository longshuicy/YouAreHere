import { Stage } from '../render/Stage';
import { BrandMark, MarginLinks } from '../render/MarginLinks';
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
}: Props) {

  return (
    <div
      style={{
        // minHeight, not height: on a short window the copy and the controls
        // below it used to be clipped off the bottom of the screen with no way
        // to reach them, which quietly hid the difficulty scale and `Begin` itself.
        // Content packs to the top so the opening ring sits high; leftover height
        // falls as air above the scale and Begin rather than between the headline
        // and the graph.
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        gap: 'clamp(8px, 1.6vh, 16px)',
        padding: 'clamp(14px, 2.4vh, 28px) 64px clamp(20px, 3.6vh, 44px) 64px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <BrandMark onStartAgain={onStartAgain} />
        <MarginLinks onOpenKey={onOpenKey} />
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 'clamp(10px, 1.8vh, 18px)',
        }}
      >
        <div style={{ fontSize: 'clamp(24px, 3.2vh, 31px)', letterSpacing: '0.01em' }}>
          You wake up here.
        </div>

        {/* The opening ring has to hold every neighbour you have, and the stage
            zooms it to fit half the *smaller* side — so this height, not the
            width, is what decides how many characters can stand around you
            before they touch. At 300px it was about a dozen, which is fewer
            than the puzzle generator is allowed to hand it. */}
        <div style={{ width: 'min(620px, 80vw)', height: 'min(400px, 40vh)' }}>
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
          marginTop: 'auto',
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
