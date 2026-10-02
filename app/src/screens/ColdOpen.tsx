import { useRef, useState } from 'react';
import { Stage } from '../render/Stage';
import { CHROME_PADDING, ChromeRight, hereLabel, type StartLinks } from '../render/MarginLinks';
import { EaseDial } from '../render/EaseDial';
import type { Residence } from '../engine/residence';
import type { VisibleGraph } from '../graph/project';
import type { LaidOutNode } from '../graph/layout';
import type { Session } from '../engine/session';

/** One column for the whole page: the title, the diagram, the verse, the
 *  settings and the action all take their width from here, so every edge on
 *  the page lines up with every other one. */
/* 100% rather than 92vw: the page already holds itself off the edges with
   `--pad-x`, and a measure set against the *viewport* was wider than the box
   it sat in — six pixels of horizontal overflow on a phone, and a scrollbar
   under a screen with nothing to scroll sideways to. */
const MEASURE = 'min(460px, 100%)';

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
  /** Second start of a residence onward — one word added: Again. */
  again?: boolean;
  /** The last unnamed node: the guess is free. */
  lastNode?: boolean;
  /** The map being resumed, when this cold open is a residence's. The scale is
   * then drawn bounded by it rather than running the full catalogue. */
  residence?: Residence | null;
  /** This world's cast, for the bound on that scale. */
  cast: number;
  /** The same two exits every other screen carries. The cold open used to be
   * the one screen without them, on the reasoning that it was already a way
   * in — true when it only ever followed a shuffle, and not true once a
   * residence resumes here, where there was no way to say "not this stranger"
   * without first beginning as them. */
  startLinks: StartLinks;
  /** How many worlds are on the shelf. Printed under the door on a first look:
   * a door labelled `choose a world` asks a player to want something they have
   * no way of knowing the size of, and the number is the cheapest possible
   * answer — it says there is a catalogue back there without spending a line
   * of the screen on naming any of it. Not a secret: what the game protects is
   * which world *you* are in, and a count gives none of that away. */
  worldCount: number;
  onBegin: () => void;
  targetEase: number;
  onChooseEase: (ease: number) => void;
  /* "I read the Chinese classics" used to be a fourth control in the row below,
   * and is now on the world chooser. The game design doc asks this screen for
   * exactly one thing to click, and of everything that had collected here that
   * tick was the one with no claim to the space: what it does is raise the
   * familiarity band of five titles, which only tilts *which world* the random
   * draw picks up, and only at the findable end of the scale. That is a filter
   * on the catalogue rather than a declaration about the player, and it was
   * barely even a question — the default is read off the browser's languages and
   * remembered, so ticking it is a correction. It now sits on the screen that is
   * entirely about which worlds you get, a foot from the ANY WORLD button whose
   * draw it actually changes. */
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
  again = false,
  lastNode = false,
  residence = null,
  cast,
  startLinks,
  worldCount,
  onBegin,
  targetEase,
  onChooseEase,
  onOpenGallery,
}: Props) {
  const titleRef = useRef<HTMLDivElement>(null);
  const [walking, setWalking] = useState(false);

  /**
   * Nobody has named this world yet, and no map is being resumed: the player
   * is on the very first screen of the game, or has just asked for any world
   * at all.
   *
   * It is the one state where most of this screen's controls are noise. The
   * scale asks for an opinion about difficulty from someone who does not yet
   * know what the game is. Worse, two of the three ways on were a distinction
   * this player provably cannot perceive: `Another life here` redraws the
   * stranger inside the unnamed world and `Any world` redraws them in a
   * different unnamed world, and with no title on the page both read as "a
   * different stranger in a book I cannot name". Offering a choice whose two
   * sides look identical is what made the opening feel like configuration.
   *
   * So a first look is a fork with two doors and nothing else: begin as the
   * stranger on the stage, or go and pick the book yourself. Everything hidden
   * here comes back the moment it means something — the scale and the three
   * ways on are all on the residence's cold open, under a title.
   */
  const firstLook = worldTitle === null && !again;

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
            The topology lab
          </button>
        </ChromeRight>
      </div>

      {/* On a first look `cold-main` is shrink-wrapped rather than stretched:
          with the scale and the three ways on gone there is no longer enough
          on the page to fill it, and a stretched box centred its contents by
          opening a band of nothing between the verse and Begin.
          What is left over is handed out by this spacer and the one at the
          foot, one part above the column and two below. Auto margins were
          tried first and cannot do this — an auto margin on each side of the
          column takes a share each, so the free space lands *between* the
          verse and Begin as well as above the title, which is the gap being
          closed. Weighted away from centre because the page hangs from its
          title: the eye starts at the top, and the last thing it should have
          to go looking for is the one thing to click. */}
      {firstLook && <div aria-hidden style={{ flex: '1 1 0', minHeight: 0 }} />}

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
          // Shrink-wrapped on a first look: see the note on the row above.
          flex: firstLook ? '0 1 auto' : 1,
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
            {again ? (
              <>
                {worldTitle ?? 'Here'}
                <span style={{ fontStyle: 'normal', color: 'var(--annotation)' }}>
                  {' '}
                  · Again{lastNode ? ' · the last' : ''}
                </span>
              </>
            ) : (
              (worldTitle ?? 'You don\u2019t know where here is.')
            )}
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

      {/* The scale stays on a first waking. Inside a residence the stranger is
          already chosen, so only the way to another world and Begin remain. */}
      <div
        style={{
          width: MEASURE,
          margin: '0 auto',
          // Just enough that Begin does not read as the verse's fourth line.
          // No more than that: with the scale and the three ways on gone there
          // is nothing between the verse and Begin, and a gap sized for the
          // controls that used to sit in it is a gap sized for nothing.
          paddingTop: firstLook ? 'clamp(2px, 1vh, 12px)' : undefined,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 'clamp(9px, 1.5vh, 16px)',
        }}
      >
        {/* The scale is on this screen whether or not a map is being resumed.
            It was briefly hidden inside a residence, on the reasoning that the
            stranger had already been dealt and a dial that did not redraw would
            look broken. The premise was wrong: nothing is for sale before
            Begin, so a cold open's ledger is always empty and the scale may
            trade the stranger in here exactly as it does anywhere else. What
            changes inside a residence is only how far it reaches — see
            EaseDial. */}
        {firstLook ? null : again && residence ? (
          <div style={{ width: '100%' }}>
            <EaseDial
              residence={residence}
              cast={cast}
              value={targetEase}
              onChange={onChooseEase}
            />
          </div>
        ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'clamp(8px, 3vw, 16px)',
                width: '100%',
              }}
            >
              <span className="mono" style={{ fontSize: 10, letterSpacing: '0.2em', color: 'var(--unknown)', whiteSpace: 'nowrap' }}>
                EASY
              </span>
              {/* Stored as ease — 1 is findable — and read out as difficulty,
                  which runs the other way: easy on the left, hard on the
                  right, because that is the direction every difficulty scale
                  a player has ever met increases in. The two words the scale
                  used to carry named the *start* rather than the ask, and a
                  reader had to work out for themselves which end was the
                  hard one. */}
              <input
                className="ease"
                type="range"
                min={0}
                max={100}
                step={1}
                value={100 - Math.round(targetEase * 100)}
                aria-label="How hard a stranger to wake as"
                onChange={(e) => onChooseEase((100 - Number(e.target.value)) / 100)}
                style={{ flex: 1, minHeight: 44 }}
              />
              <span className="mono" style={{ fontSize: 10, letterSpacing: '0.2em', color: 'var(--unknown)', whiteSpace: 'nowrap' }}>
                HARD
              </span>
            </div>
        )}

        {/* The way out of a resumed map stays: without it, choosing a world
            with a map on it was a door that only opened inward. Gone on a
            first look — see `firstLook`. */}
        {!firstLook && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'baseline',
                gap: 'clamp(14px, 4vw, 30px)',
                flexWrap: 'wrap',
                // The three ways on are one line. They are alternatives to each
                // other, and a wrapped third read as a step below the first two
                // rather than a peer of them — so the row is allowed past the
                // measure the prose is set to, and only wraps on a phone.
                width: 'max-content',
                maxWidth: '92vw',
                flexShrink: 0,
              }}
            >
              {/* One vocabulary for the three things a player can want, the
                  same on every screen: begin as this stranger, be somebody
                  else here, or go somewhere else. Choosing *which* world is a
                  refinement of the third, not a fourth thing. */}
              <button
                className="action-quiet"
                onClick={startLinks.onStartHere}
                disabled={walking}
                style={{ fontSize: 10, letterSpacing: '0.18em', minHeight: 0, padding: '7px 2px' }}
              >
                {/* Without the title, unlike the top bar: the cold open
                    prints the world two inches above this row, so repeating it
                    only makes the longest label in the row as long as the
                    longest title in the catalogue — and pushes the three onto
                    two lines. */}
                {hereLabel(null)}
              </button>

              <button
                className="action-quiet"
                onClick={startLinks.onStartAgain}
                disabled={walking}
                style={{ fontSize: 10, letterSpacing: '0.18em', minHeight: 0, padding: '7px 2px' }}
              >
                Any world
              </button>

              <button
                className="action-quiet"
                onClick={startLinks.onChooseWorld}
                disabled={walking}
                style={{ fontSize: 10, letterSpacing: '0.18em', minHeight: 0, padding: '7px 2px' }}
              >
                Choose a world
              </button>
            </div>
        )}

        <button
          className="action"
          onClick={begin}
          disabled={walking}
          style={{ fontSize: 15, letterSpacing: '0.44em', borderBottomWidth: 2, padding: '14px 0 11px 6px' }}
        >
          {lastNode ? 'This is the last' : 'Begin'}
        </button>

        {/* The other door. Under Begin rather than beside it, because the two
            are not peers: one is what this screen is for and the other is the
            way to a different screen. */}
        {firstLook && (
          <button
            className="action-quiet"
            onClick={startLinks.onChooseWorld}
            disabled={walking}
            style={{
              gap: 8,
              fontSize: 10,
              letterSpacing: '0.18em',
              minHeight: 0,
              padding: '2px 2px 0',
            }}
          >
            <span>Or choose a world</span>
            {/* Inside the button rather than beside it: the count is the reason
                to press this, so it should not be a caption sitting next to a
                target it is not part of. */}
            <span style={{ color: 'var(--unknown)' }}>· {worldCount} to pick from</span>
          </button>
        )}
      </div>

      {firstLook && <div aria-hidden style={{ flex: '2 1 0', minHeight: 0 }} />}
    </div>
  );
}
