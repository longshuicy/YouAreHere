import type { ReactNode } from 'react';

/** Shared page inset so the brand mark does not jump when the screen changes.
 *  A screen may override only the bottom; top and sides stay put.
 *  The values are tokens rather than literals so a phone gets its own, narrower
 *  margins from one place in index.css. */
export const CHROME_PADDING = 'var(--pad-top) var(--pad-x) var(--pad-bottom) var(--pad-x)';

/**
 * Chrome zones:
 * 1. Identity: the wordmark, with start-again as a quiet action beside it
 * 2. Reference: the top-right, holding help and the way back out
 * 3. Give-up: next to the screen's primary action, never labeled
 *
 * Everything that is not the page belongs in zone 2, in the same corner on
 * every screen. A back link printed at the top of the content instead, which
 * is where the gallery's used to be, is a different place on every page it
 * appears on and reads as the first line of the thing it leaves.
 */

/** The product name. Serif and ink — the narrative voice, not a chrome label. */
export function BrandMark() {
  return <div className="brand">You are here.</div>;
}

/** The three ways on, offered together on every screen. */
export interface StartLinks {
  /** Somebody else, somewhere else. */
  onStartAgain: () => void;
  /** Somebody else in the world the player is in, keeping its map. */
  onStartHere: () => void;
  /** The shelf. It used to be reachable only from the cold open, which made it
   * the one door of the three that was not in the margin — so a player who
   * wanted a particular world from anywhere else had to take a random one
   * first and go back. The chooser is drawn over whatever screen is current
   * now (see `choosing` in App.tsx), so there is no longer a reason for it to
   * be missing from two thirds of the game. */
  onChooseWorld: () => void;
  /** Null until the world is known: printing it earlier would answer half the
   * question, so the link reads "Stay here" instead. */
  hereTitle: string | null;
}

/** Wordmark plus the quieter ways on, in the bar's own register — so a page
 * that assembles its own header still reads as the same bar as the rest of
 * the game, not a second design wearing the same wordmark. */
export function BrandCluster(links: StartLinks) {
  return (
    <div className="top-bar-side top-bar-left" style={{ pointerEvents: 'auto' }}>
      <BrandMark />
      <StartNav {...links} />
    </div>
  );
}

/**
 * What "somebody else in this world" is called, in the one place that decides.
 *
 * The other half of the pair is `Any world`, named the same here as on the
 * chooser's own way out, because it is the same act: a stranger in a book
 * nobody picked. It was briefly `Another world`, which sat beside `Choose a
 * world` saying almost the same words for the opposite thing. *Any* against
 * *choose* is the distinction, so those are the words.
 *
 * *Life* and *world* rather than two kinds of "somewhere else": the two choices
 * are on different axes — who you are, and which book you are in — and a pair
 * that both began "Someone else…/Somewhere else…" read as two shades of the
 * same act. They also state the wrong thing first. What a player is choosing
 * between is another life or another world, so that is the word each one opens
 * on.
 *
 * The same act used to be `Stay in <world>` in the top bar, `Choose another
 * world` on the cold open and `Start anywhere instead` in the chooser — three
 * vocabularies for two actions, which is how one button ended up wearing a
 * label belonging to another. There are only three things a player can want —
 * begin as this stranger, be somebody else here, or go somewhere else — and
 * they are named the same on every screen.
 *
 * `Choose a world` is the third, and is now in the margin with the other two
 * rather than only on the cold open. Naming *which* world is a refinement of
 * going somewhere else, so it stands next to `Any world`: let it pick, or pick
 * it yourself.
 */
export function hereLabel(hereTitle: string | null): string {
  return hereTitle ? `Another life in ${hereTitle}` : 'Another life here';
}

/** A link in the bar's own register: unruled, unlike `.annot-link` — up here
 *  the row itself is the affordance, and the design draws these as plain
 *  tracked mono. The hit area is the padding, not the words — 10px type does
 *  not make a 44px target on its own. */
export function TopBarLink({
  children,
  onClick,
  disabled,
  icon,
  className = '',
  current = false,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  icon?: ReactNode;
  className?: string;
  /** The page this link leads to is the one open. */
  current?: boolean;
}) {
  return (
    <button
      type="button"
      className={`top-bar-link ${className}`.trim()}
      onClick={onClick}
      disabled={disabled}
      aria-current={current ? 'page' : undefined}
    >
      {icon}
      {children}
    </button>
  );
}

/**
 * The three ways on, in the bar.
 *
 * The same three everywhere, in the same order and the same words — see
 * `hereLabel` for why there are exactly three. The last is ink, like the
 * other two: it is the main action beside them, not where-you-are, which is
 * the one thing in this row that reads in the accent.
 */
export function StartNav({
  onStartAgain,
  onChooseWorld,
  onStartHere,
  hereTitle,
  disabled,
}: StartLinks & { disabled?: boolean }) {
  return (
    <nav aria-label="Ways on" className="top-bar-nav start-nav">
      <TopBarLink onClick={onStartAgain} disabled={disabled}>
        Any world
      </TopBarLink>
      <TopBarLink onClick={onChooseWorld} disabled={disabled}>
        Choose a world
      </TopBarLink>
      <TopBarLink onClick={onStartHere} disabled={disabled} className="start-nav-here">
        {hereLabel(hereTitle)}
      </TopBarLink>
    </nav>
  );
}
