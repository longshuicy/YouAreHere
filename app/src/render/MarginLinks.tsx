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

/** The two ways to start over, offered together on every screen. */
export interface StartLinks {
  /** Somebody else, somewhere else. */
  onStartAgain: () => void;
  /** Somebody else in the world the player is in, keeping its map. */
  onStartHere: () => void;
  /** Null until the world is known: printing it earlier would answer half the
   * question, so the link reads "Stay here" instead. */
  hereTitle: string | null;
}

/** Wordmark plus the quieter restarts, so the name is not itself a hidden
 * button. */
export function BrandCluster(links: StartLinks) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 22,
        pointerEvents: 'auto',
        flexWrap: 'wrap',
      }}
    >
      <BrandMark />
      <StartLinkPair {...links} />
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
 */
export function hereLabel(hereTitle: string | null): string {
  return hereTitle ? `Another life in ${hereTitle}` : 'Another life here';
}

function StartLinkPair({ onStartAgain, onStartHere, hereTitle }: StartLinks) {
  return (
    <>
      <button type="button" className="annot-link" onClick={onStartAgain}>
        Any world
      </button>
      <button type="button" className="annot-link" onClick={onStartHere} style={{ color: 'var(--accent)' }}>
        {hereLabel(hereTitle)}
      </button>
    </>
  );
}

/** The top-right slot. One cluster so the corner looks the same everywhere. */
export function ChromeRight({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 22, pointerEvents: 'auto' }}>
      {children}
    </div>
  );
}

/** The way out of a page that replaced another one. */
export function BackLink({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <button type="button" className="annot-link" onClick={onBack} style={{ pointerEvents: 'auto' }}>
      {label}
    </button>
  );
}

/** Persistent help. */
export function HelpLink({ onOpenKey }: { onOpenKey: () => void }) {
  return (
    <button
      type="button"
      className="annot-link"
      onClick={onOpenKey}
      style={{ pointerEvents: 'auto' }}
    >
      What can I do
    </button>
  );
}

/** Paid spoil and give-up, as a quiet pair. No heading — the placement is the hierarchy. */
export function GiveUpLinks({
  onReveal,
  onRevealStory,
  answerCost = 0,
}: {
  onReveal?: () => void;
  onRevealStory?: () => void;
  /** What giving up costs, when it costs anything. Printed beside the link for
   * the same reason every other price is printed beside its action: a charge
   * the player meets only after paying it is a trap, not a price. */
  answerCost?: number;
}) {
  if (!onReveal && !onRevealStory) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 22,
        pointerEvents: 'auto',
      }}
    >
      {onRevealStory && (
        <button type="button" className="annot-link" onClick={onRevealStory}>
          Reveal world
        </button>
      )}
      {onReveal && (
        <button type="button" className="annot-link" onClick={onReveal}>
          Reveal answer{answerCost > 0 ? ` · ${answerCost}` : ''}
        </button>
      )}
    </div>
  );
}
