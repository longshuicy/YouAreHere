import type { ReactNode } from 'react';
import { BrandMark, CHROME_PADDING, StartNav, TopBarLink, type StartLinks } from './MarginLinks';

/**
 * The bar across the top of every screen. There is exactly one of these.
 *
 * Screens do not assemble it out of parts — they say what this screen is, and
 * the bar decides what that means: whether the wordmark is on the left or
 * centred, whether the ways on are beside it, whether the left slot is a way
 * back instead. Four screens were each building their own row, which is how
 * `What can I do` and `How to play` ended up being the same link under two
 * names, and how one of them got the ringed mark and the others did not.
 *
 * The middle slot is centred on the *page*, not on the gap the sides leave, so
 * the wordmark does not drift as a back label changes length. That is the only
 * part a plain flex row cannot do.
 *
 * It sits above the diagram and takes the pointer. Screens that float their
 * chrome over a full-bleed drawing set `pointer-events: none` on the layer so
 * the graph underneath stays draggable; everything in this bar is a target, so
 * it turns the pointer back on for itself.
 */
export function TopBar({
  startLinks,
  onBack,
  backLabel = 'Back',
  onOpenKey,
  keyOpen = false,
  onOpenLab,
  aside,
  wordmark = true,
  inset = true,
  disabled = false,
}: {
  /** The three ways on, beside the wordmark. Omitted where they are already on
   *  the page — the cold open has them as its whole content. */
  startLinks?: StartLinks;
  /** A page that replaced another one. Takes the left slot, which sends the
   *  wordmark to the middle. */
  onBack?: () => void;
  backLabel?: string;
  /** Elsewhere: what you can reach that is not a move in the game. */
  onOpenKey?: () => void;
  /** The bar is drawn on How to play itself, so that link says where you are. */
  keyOpen?: boolean;
  onOpenLab?: () => void;
  /** A readout this screen keeps in the corner, before the standing links —
   *  the guess screen puts the clue count there, because on that screen the
   *  count is the thing a guess is weighed against. */
  aside?: ReactNode;
  /** False on the cold open's first look, where the title *is* the wordmark at
   *  four times the size and printing it twice gave the page two of them. */
  wordmark?: boolean;
  /** False when the screen already sits inside `CHROME_PADDING`. */
  inset?: boolean;
  disabled?: boolean;
}) {
  const back = onBack != null;
  const mark = wordmark ? <BrandMark /> : null;

  return (
    <div
      className="top-bar"
      style={{
        padding: inset ? CHROME_PADDING : undefined,
        paddingBottom: inset ? 0 : undefined,
      }}
    >
      <div className="top-bar-side top-bar-left">
        {back ? (
          <TopBarLink onClick={onBack} disabled={disabled} icon={<Chevron back />}>
            {backLabel}
          </TopBarLink>
        ) : (
          <>
            {mark}
            {startLinks && <StartNav {...startLinks} disabled={disabled} />}
          </>
        )}
      </div>

      {/* Only when the left slot is spoken for. It cannot take the pointer: at
          narrow widths it overlaps the slots beside it, and a wordmark is not
          a target. */}
      {back && mark && <div className="top-bar-center">{mark}</div>}

      <nav aria-label="Elsewhere" className="top-bar-side top-bar-nav top-bar-elsewhere">
        {aside}
        {onOpenKey && (
          <TopBarLink onClick={onOpenKey} disabled={disabled} current={keyOpen}>
            How to play
          </TopBarLink>
        )}
        {onOpenLab && (
          <TopBarLink onClick={onOpenLab} disabled={disabled}>
            Observatory
          </TopBarLink>
        )}
      </nav>
    </div>
  );
}

function Chevron({ back = false }: { back?: boolean }) {
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
      <path d={back ? 'M6.5 2l-3 3 3 3' : 'M3.5 2l3 3-3 3'} />
    </svg>
  );
}
