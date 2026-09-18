import { Stage } from '../render/Stage';
import { MarginLinks } from '../render/MarginLinks';
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
        // minHeight so nothing is ever unreachable, but everything below is
        // sized so the screen does not actually need it on a laptop: at 1280x800
        // the whole cold open came to 936px and scrolled. The stage kept its
        // height — it is what decides how many neighbours can be drawn around
        // you — so the space came out of the padding, the leading and the gaps.
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: 'clamp(10px, 2vh, 20px)',
        padding: 'clamp(16px, 3.1vh, 36px) 64px clamp(18px, 3.3vh, 40px) 64px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div className="chrome">YOU ARE HERE</div>
        <MarginLinks onOpenKey={onOpenKey} onStartAgain={onStartAgain} />
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 'clamp(12px, 2.2vh, 22px)',
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
        <div style={{ width: 'min(620px, 80vw)', height: 'min(440px, 44vh)' }}>
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

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'clamp(8px, 1.4vh, 18px)' }}>
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
