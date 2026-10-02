import type { ReactNode } from 'react';
import { CHROME_PADDING, hereLabel, type StartLinks } from './MarginLinks';

/**
 * The bar across the top of every screen.
 *
 * Three slots, and the middle one is centred on the *page* rather than on
 * whatever is left over between the other two. That is the whole reason this
 * is a component: the design centres the wordmark on the chooser, and a plain
 * `space-between` row puts it wherever the two side slots happen to leave it —
 * which moves as a back label gets longer, so the one fixed point on the page
 * drifts from screen to screen.
 *
 * Any slot may be empty. A screen that wants the wordmark on the left simply
 * passes it as `left` and leaves `center` out.
 *
 * It draws its own page inset, so a screen using it does not pad its own top:
 * see `inset`.
 */
export function TopBar({
  left,
  center,
  right,
  /** False when the screen already sits inside `CHROME_PADDING` and only wants
   *  the row. True — the default — makes the bar responsible for the inset, so
   *  the bar is in the same place on every screen that uses it. */
  inset = true,
}: {
  left?: ReactNode;
  center?: ReactNode;
  right?: ReactNode;
  inset?: boolean;
}) {
  return (
    <div
      className="top-bar"
      style={{
        padding: inset ? CHROME_PADDING : undefined,
        paddingBottom: inset ? 0 : undefined,
      }}
    >
      <div className="top-bar-side top-bar-left">{left}</div>
      {/* Absolutely placed so it is centred on the bar, not between the sides.
          It cannot take the pointer: at narrow widths it overlaps the slots
          beside it, and a wordmark is not a target. */}
      {center && <div className="top-bar-center">{center}</div>}
      <div className="top-bar-side top-bar-right">{right}</div>
    </div>
  );
}

/**
 * A link in the bar. Unruled, unlike `.annot-link` in the margins: up here the
 * row itself is the affordance, and the design draws these as plain tracked
 * mono. The hit area is the padding, not the words — 10px type needs the
 * difference.
 */
export function TopBarLink({
  children,
  onClick,
  disabled,
  icon,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  /** Set before the words, for a link that says which way it goes. */
  icon?: ReactNode;
}) {
  return (
    <button type="button" className="top-bar-link" onClick={onClick} disabled={disabled}>
      {icon}
      {children}
    </button>
  );
}

/** The way off a page that replaced another one. */
export function TopBarBack({
  label = 'Back',
  onBack,
}: {
  label?: string;
  onBack: () => void;
}) {
  return (
    <TopBarLink
      onClick={onBack}
      icon={
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
          <path d="M6.5 2l-3 3 3 3" />
        </svg>
      }
    >
      {label}
    </TopBarLink>
  );
}

/**
 * The right-hand slot: everything that is not this page.
 *
 * Named for what the design calls it — `Elsewhere` — because that is the rule
 * it enforces. Help and the lab are the two places you can go that are not a
 * move in the game, and they are in the same corner on every screen so a
 * player never has to look for them twice.
 */
export function Elsewhere({
  onOpenKey,
  onOpenLab,
  disabled,
  children,
}: {
  onOpenKey?: () => void;
  onOpenLab?: () => void;
  disabled?: boolean;
  /** Anything this screen adds to the corner, before the two standing links. */
  children?: ReactNode;
}) {
  return (
    <nav aria-label="Elsewhere" className="top-bar-nav">
      {children}
      {onOpenKey && (
        <TopBarLink onClick={onOpenKey} disabled={disabled}>
          How to play
        </TopBarLink>
      )}
      {onOpenLab && (
        <TopBarLink onClick={onOpenLab} disabled={disabled}>
          The topology lab
        </TopBarLink>
      )}
    </nav>
  );
}

/** A question mark in a ring, set before HOW TO PLAY on the screens that are
 *  busy enough to need the link found rather than read. */
export function HelpMark() {
  return (
    <span
      aria-hidden
      style={{
        width: 18,
        height: 18,
        flexShrink: 0,
        borderRadius: '50%',
        border: '1px solid var(--unknown)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 10,
        letterSpacing: 0,
      }}
    >
      ?
    </span>
  );
}

/**
 * The three ways on, in the bar.
 *
 * The same three everywhere, in the same order and the same words — see
 * `hereLabel` for why there are exactly three. The last is in the accent
 * because it is the one that keeps the map you are looking at; the other two
 * leave it.
 */
export function StartNav({ onStartAgain, onChooseWorld, onStartHere, hereTitle }: StartLinks) {
  return (
    <nav aria-label="Ways on" className="top-bar-nav start-nav">
      <TopBarLink onClick={onStartAgain}>Any world</TopBarLink>
      <TopBarLink onClick={onChooseWorld}>Choose a world</TopBarLink>
      <button type="button" className="top-bar-link start-nav-here" onClick={onStartHere}>
        {hereLabel(hereTitle)}
      </button>
    </nav>
  );
}
