import { useRef, useState } from 'react';
import { Stage } from '../render/Stage';
import { CHROME_PADDING, type StartLinks } from '../render/MarginLinks';
import { TopBar } from '../render/TopBar';
import { EaseDial, hardnessOf, hardnessWord } from '../render/EaseDial';
import type { Residence } from '../engine/residence';
import type { VisibleGraph } from '../graph/project';
import type { LaidOutNode } from '../graph/layout';
import type { Session } from '../engine/session';

/** Where the title sits once play begins — same inset as the explore chrome. */
const TITLE_CORNER = { top: 44, left: 64 };
const TITLE_CORNER_SIZE = 20;

/** A play triangle, the size the design draws it. Inside the block, so it
 *  takes the block's own colour rather than carrying one of its own. */
function PlayMark() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden focusable="false">
      <path d="M3 1l8 5-8 5z" fill="currentColor" />
    </svg>
  );
}

/** The chevron that marks a way *on* rather than a thing to press. */
function Chevron() {
  return (
    <svg
      width="9"
      height="9"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      aria-hidden
      focusable="false"
    >
      <path d="M3.5 2l3 3-3 3" />
    </svg>
  );
}

/** Which life BEGIN will start. A choice held here rather than taken on the
 *  spot: the two options differ only in a word of their caption until you
 *  press the thing at the bottom, and a radio that redrew the stage under it
 *  would make the page answer a question nobody had finished asking. */
type Wake = 'again' | 'any';

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
  /** The same two exits every other screen carries. */
  startLinks: StartLinks;
  /** How many worlds are on the shelf. Printed under BEGIN on a first look: a
   * door labelled `choose a world` asks a player to want something they have
   * no way of knowing the size of, and the number is the cheapest possible
   * answer. Not a secret: what the game protects is which world *you* are in,
   * and a count gives none of that away. */
  worldCount: number;
  onBegin: () => void;
  targetEase: number;
  onChooseEase: (ease: number) => void;
  onOpenKey: () => void;
  onOpenGallery: () => void;
}

/**
 * The cold start.
 *
 * Two columns, not one: the words on the left and the diagram on the right,
 * because the diagram is the thing the words are about. A centred column with
 * the drawing wedged into the middle of it made the stage look like an
 * illustration between two paragraphs; beside the prose it reads as what it
 * is, the place you are being offered.
 *
 * The screen has two states and they are genuinely different pages.
 *
 * A **first look** — no world named, no map to resume — is a fork with two
 * doors and nothing else: begin as the stranger on the stage, or go and pick
 * the book yourself. Everything else is noise at that moment. The scale asks
 * for an opinion about difficulty from someone who does not yet know what the
 * game is, and the ways on are a distinction this player provably cannot
 * perceive: with no title on the page, another stranger here and another
 * stranger elsewhere both read as "a different stranger in a book I cannot
 * name".
 *
 * **Coming back** is the page that can afford all of it, because every part of
 * it now means something. The world has a name, the map has marks on it, and
 * the two ways to wake are a real question — this book again, or let it pick.
 * The scale comes back with them, bounded by how much of the book is known.
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
  onOpenKey,
  onOpenGallery,
}: Props) {
  const titleRef = useRef<HTMLDivElement>(null);
  const [walking, setWalking] = useState(false);
  const [wake, setWake] = useState<Wake>('again');

  const firstLook = worldTitle === null && !again;
  /** The map is the player's own only once it has a mark on it. */
  const mapped = residence && residence.named.size > 0 ? residence : null;
  /** What the dial is set to, read once. BEGIN says it in its own caption, so
   *  the two have to be the same reading rather than two of them. */
  const hardness = residence ? hardnessOf(residence, cast, targetEase) : null;

  /** The centred headline takes its seat in the top-left. The second line
   *  fades: it has said what it came to say, and the explore screen will
   *  pick the thought up as "You don't know where you are." */
  const begin = () => {
    // `Any world` is a different world, so there is no stage to walk the title
    // off: the page is about to be replaced wholesale.
    if (!firstLook && wake === 'any') {
      startLinks.onStartAgain();
      return;
    }

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

  /** What BEGIN says it will do, under the word itself. A price list for a
   *  press: the one caption on the page that is allowed to change. */
  const beginSub = firstLook
    ? `A random life, in any of ${worldCount} worlds`
    : wake === 'any'
      ? 'Any world · a fresh start'
      : lastNode
        ? `The last name in ${worldTitle ?? 'this world'}`
        : // The world, and then what the dial above is set to — the artboard
          // prints both, and it is the second half that makes the caption
          // worth having: it is the only place the scale's reading is put
          // into words next to the thing that will act on it.
          `Another life in ${worldTitle ?? 'this world'}${
            hardness ? ` · ${hardnessWord(hardness)}` : ''
          }`;

  const wakeRow = (id: Wake, title: string, sub: string) => {
    const on = wake === id;
    return (
      <button
        key={id}
        type="button"
        role="radio"
        aria-checked={on}
        className="wake-row"
        onClick={() => setWake(id)}
        disabled={walking}
        style={{ color: on ? 'var(--ink)' : 'var(--annotation)' }}
      >
        <span
          aria-hidden
          style={{
            width: 8,
            height: 8,
            flexShrink: 0,
            borderRadius: '50%',
            background: on ? 'var(--accent)' : 'transparent',
          }}
        />
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="wake-title">{title}</span>
          <span className="annot" style={{ letterSpacing: '0.16em' }}>
            {sub}
          </span>
        </span>
      </button>
    );
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
        // The only screen with a fixed-width column of prose sitting alone
        // against the inset: everywhere else the inset is the edge of
        // something — a bar, a graph — so 64px reads as a margin. Here it is
        // the edge of a paragraph, which wants more air on a wide window.
        paddingLeft: 'calc(var(--pad-x) + clamp(0px, 6vw, 56px))',
      }}
    >
      {/* Neither the key nor the lab is a thing to do here, so neither is
          offered beside the thing to do. They go to the corner this game keeps
          everything that is not the page in, which is the same corner on every
          screen. No wordmark: the title two inches below is the wordmark, at
          four times the size, and printing it twice made the page look like it
          had two of them. */}
      <TopBar inset={false} wordmark={false} onOpenKey={onOpenKey} onOpenLab={onOpenGallery} disabled={walking} />

      <div className="start-cols">
        {/* The column of words. Left-aligned and hung from its title: the eye
            starts at the top and walks down to the one thing to press, which
            is why nothing here is centred. */}
        <div
          className="cold-main"
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}
        >
          <div
            ref={titleRef}
            className="brand"
            style={{
              fontSize: firstLook ? 'clamp(40px, 7vh, 76px)' : 'clamp(34px, 5.5vh, 60px)',
              letterSpacing: '0.01em',
              lineHeight: 1,
            }}
          >
            You are here.
          </div>

          <div
            className="title-sub"
            style={{
              fontSize: firstLook ? 'clamp(19px, 2.8vh, 28px)' : 'clamp(17px, 2.4vh, 24px)',
              color: 'var(--body)',
              marginTop: 12,
              lineHeight: 1.2,
              opacity: walking ? 0 : 1,
              transition: 'opacity 400ms ease',
            }}
          >
            {firstLook
              ? 'You don’t know where here is.'
              : // `Again` is the one word the returning page adds, and it is
                // only true on the second start onward. The world's own name
                // is not repeated here: it is two lines below, on the choice
                // it belongs to.
                `${again ? 'Again. ' : ''}Where would you like to wake?`}
          </div>

          {/* The verse, on the page that has room for it. A paragraph rather
              than three hand-broken lines: the lines were set for a centred
              column that no longer exists, and against a measure they broke
              twice — once where the writing meant them to and once where the
              box ran out. */}
          {firstLook && (
            <>
              <p
                style={{
                  margin: '44px 0 0 0',
                  fontSize: 'clamp(16px, 2vh, 20px)',
                  lineHeight: 1.5,
                  color: 'var(--body)',
                }}
              >
                We find our place in the universe by whom we follow, whom we find, whom we love, and
                whom we lose.
              </p>
              <p style={{ margin: '12px 0 0 0', fontSize: 'clamp(16px, 2vh, 20px)' }}>
                Find your coordinates. <em>Find yourself.</em>
              </p>
            </>
          )}

          {/* Coming back: the two ways to wake, and the door to the shelf
              beneath them as a third of the same kind. */}
          {!firstLook && (
            <div
              role="radiogroup"
              aria-label="Where to wake"
              style={{ marginTop: 30, width: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}
            >
              {/* `Where you left off` is a claim about a map that exists. A
                  world chosen a moment ago and never played has none, so the
                  caption says what is true of it instead; the title is the
                  artboard's either way. */}
              {wakeRow(
                'again',
                `Another life in ${worldTitle ?? 'this world'}`,
                mapped
                  ? `Where you left off · ${mapped.named.size} of ${cast} named`
                  : 'The world you chose',
              )}
              {wakeRow('any', 'Any world', `Let it pick, from all ${worldCount}`)}

              <button
                type="button"
                className="wake-row"
                onClick={startLinks.onChooseWorld}
                disabled={walking}
                style={{ color: 'var(--annotation)' }}
              >
                <span aria-hidden style={{ width: 8, flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span className="wake-title">Choose a world</span>
                  <span className="annot" style={{ letterSpacing: '0.16em' }}>
                    Browse all {worldCount}
                  </span>
                </span>
              </button>
            </div>
          )}

          {/* The scale, bounded by the map. It belongs to `Another life here`
              and nothing else: it picks which stranger in *this* book you are
              handed, so under `Any world` there is no book for it to pick
              from. Nothing is for sale before Begin, so the cold open's ledger
              is always empty and the dial may trade the stranger in here as
              freely as it does anywhere else. */}
          {!firstLook && wake === 'again' && residence && (
            <div style={{ marginTop: 22, width: '100%' }}>
              <EaseDial residence={residence} cast={cast} value={targetEase} onChange={onChooseEase} />
            </div>
          )}

          {/* The scale on a first look is gone for the reason in the note at
              the top of this file. What is left is the fork. */}
          <button
            type="button"
            className="begin-block"
            onClick={begin}
            disabled={walking}
            style={
              // A first look shrink-wraps it: the column is the measure the
              // prose is set to, and a block run to the full 440 of it reads
              // as a banner rather than a thing to press. Coming back it does
              // take the column, because by then it is the foot of a stack of
              // choices and wants their edge.
              firstLook
                ? { marginTop: 48, width: 'auto', minWidth: 280, alignSelf: 'flex-start' }
                : { marginTop: 26 }
            }
          >
            <span style={{ display: 'flex', flexDirection: 'column', gap: 4, textAlign: 'left' }}>
              <span className="begin-word">{lastNode && wake === 'again' ? 'This is the last' : 'Begin'}</span>
              <span className="begin-sub">{beginSub}</span>
            </span>
            <PlayMark />
          </button>

          {/* The other door. Under BEGIN rather than beside it, because the
              two are not peers: one is what this screen is for and the other
              is the way to a different screen. Coming back, it is already in
              the radiogroup above and is not repeated here. */}
          {firstLook && (
            <button
              type="button"
              className="action-quiet"
              onClick={startLinks.onChooseWorld}
              disabled={walking}
              style={{ gap: 8, fontSize: 10, letterSpacing: '0.2em', minHeight: 0, padding: '14px 0 0' }}
            >
              <span style={{ borderBottom: '1px solid var(--leader)' }}>Or choose the world</span>
              <Chevron />
            </button>
          )}
        </div>

        {/* The diagram. The opening ring has to hold every neighbour you have,
            and the stage zooms it to fit half the *smaller* side, so this
            height is what decides how many characters can stand around you
            before they touch. `COLD_OPEN_FIT` in layout.ts is calibrated
            against it. */}
        <div
          className="start-figure"
          style={{
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
            minHeight: 0,
            height: 'min(640px, 72vh)',
          }}
        >
          <div
            className="cold-stage"
            style={{
              flex: 1,
              minHeight: 0,
              overflow: 'visible',
              // Under `Any world` this map is not the one you are about to
              // wake in. It stays on the page — it is still the only drawing
              // here — but it steps back to say so.
              opacity: !firstLook && wake === 'any' ? 0.2 : 1,
              transition: 'opacity 400ms ease',
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

          {/* What the drawing is, when it is a map the player made. On a first
              look it is a stranger's ring and has nothing true to say about
              itself, so it says nothing. */}
          {mapped && worldTitle && (
            <div
              className="annot"
              style={{ textAlign: 'center', paddingTop: 10, letterSpacing: '0.18em' }}
            >
              Your map of {worldTitle} so far · {mapped.named.size} named ·{' '}
              {mapped.starts.length} {mapped.starts.length === 1 ? 'life' : 'lives'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
