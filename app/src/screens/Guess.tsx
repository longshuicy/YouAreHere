import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Stage } from '../render/Stage';
import { clueTotal } from '../render/Ledger';
import { type StartLinks, CHROME_PADDING } from '../render/MarginLinks';
import { TopBar } from '../render/TopBar';
import type { VisibleGraph } from '../graph/project';
import type { LaidOutNode } from '../graph/layout';
import type { Session } from '../engine/session';
import { COST, worldIsKnown } from '../engine/session';
import { resolveName, suggestNames } from '../engine/names';
import type { Universe } from '../types';

interface Props {
  graph: VisibleGraph;
  positions: Map<number, LaidOutNode>;
  session: Session;
  /** Every story fetched so far, keyed by id. */
  loaded: Map<string, Universe>;
  onGuess: (universeId: string, characterQuery: string, characterIndex: number | null) => void;
  onCancel: () => void;
  onOpenKey: () => void;
  onReveal: () => void;
  startLinks: StartLinks;
}

export function Guess({
  graph,
  positions,
  session,
  loaded,
  onGuess,
  onCancel,
  onOpenKey,
  onReveal,
  startLinks,
}: Props) {
  // Deliberately NOT the universe being played — defaulting to the real answer
  // hands over the half of the question the dropdown exists to ask. Unless a
  // previous guess already got the story right, in which case re-picking what
  // they have established is busywork.
  const [story, setStory] = useState(worldIsKnown(session) ? session.universe : '');
  const [query, setQuery] = useState('');
  /** Which suggestion the arrow keys are on. */
  const [hot, setHot] = useState(0);

  // Per the design's wrong-guess screen: the rejected name is struck through
  // above a cleared field.
  useEffect(() => {
    if (session.lastGuess && !session.lastGuess.characterCorrect) {
      setQuery('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.guesses.length]);

  const stories = useMemo(
    () => [...loaded.values()].sort((a, b) => a.title.localeCompare(b.title)),
    [loaded],
  );

  /** The world, when there is nothing left to ask about it. */
  const settled = worldIsKnown(session) ? loaded.get(session.universe) ?? null : null;

  /** Drawn from EVERY loaded story while the world is still in question — a
   * list scoped to one book would report that book's cast size before the
   * player has earned it. Once the world is settled, narrowed to it: nothing
   * left to leak, and no false leads from a book that is not this one. */
  const suggestions = useMemo(
    () => suggestNames(settled ? [settled] : stories, query),
    [query, stories, settled],
  );

  /** Resolved against the SELECTED story: the guess is a pair, and a name that
   * exists in another book is simply not this book's answer. */
  const resolve = (text: string, storyId: string): number | null => {
    const u = loaded.get(storyId);
    return u ? resolveName(u, text) : null;
  };

  const last = session.lastGuess;
  const rejected = last && !last.characterCorrect ? last.characterQuery : null;

  const headline = !last
    ? null
    : last.storyCorrect && !last.characterCorrect
      ? settled && session.worldChosen
        ? 'Not this person.'
        : 'Right world. Wrong person.'
      : !last.storyCorrect
        ? 'Not this world.'
        : null;

  /**
   * What a wrong guess is worth.
   *
   * The screen used to mark the field right or wrong and stop there. That is
   * austere, and it is also the reason a run could not be worked: with no
   * signal between waking and winning there was nothing to reason against, so
   * the only way forward was to buy a name. A distance changes that without
   * giving anything away about identity — it is a fact about the shape, which
   * is the register the whole game is written in.
   *
   * It is only ever offered once the story is right, which is the guard: you
   * cannot use the box as a rangefinder until you have established the book.
   */
  const bearing = !last || last.characterCorrect || !last.storyCorrect
    ? null
    : last.characterIndex === null
      ? 'No one by that name is in this world.'
      : last.hops === null
        ? 'They are in this world, but no run of ties reaches them from you.'
        : last.hops === 1
          ? 'They are standing right next to you, one tie away.'
          : `They are ${last.hops} ties away from you.`;

  const clues = clueTotal(session.ledger);

  /** Your ties, counted off the graph. The opening ring is every one of them,
   *  so this is a fact the player already has in front of them rather than
   *  something the screen is giving away. */
  const ties = graph.edges.filter((e) => e.source === session.you || e.target === session.you).length;

  /** The names you have earned, which are the names that cannot be yours. */
  const namedTies = [...session.known.named.entries()]
    .filter(([i]) => i !== session.you)
    .map(([, n]) => n);

  /** A suggestion you have already put a face to is not a candidate — you know
   *  where that person is standing, and it is not where you are. Struck out
   *  rather than hidden: a name vanishing as you type it reads as the field
   *  failing, and the strike is the answer to `why not them?`. */
  const isTie = (name: string) => namedTies.includes(name);

  /** Which world a suggested name comes from, when the world is still open. */
  const sourceOf = (name: string) =>
    settled ? null : (stories.find((u) => resolveName(u, name) !== null)?.title ?? null);

  const live = suggestions.filter((n) => !isTie(n));
  const at = Math.min(hot, Math.max(0, live.length - 1));
  const chosen = query.trim() && live.includes(query.trim()) ? query.trim() : (live[at] ?? null);

  const submit = (name: string | null) => {
    const text = name ?? query.trim();
    if (!text || !story || isTie(text)) return;
    onGuess(story, text, resolve(text, story));
  };

  return (
    <div style={{ position: 'relative', height: '100dvh', overflow: 'hidden' }}>
      {/* The graph stays visible — it is the evidence, not the subject. */}
      <div style={{ position: 'absolute', inset: 0, top: 'var(--chrome-band)' }}>
        <Stage
          graph={graph}
          positions={positions}
          session={session}
          onExpand={() => {}}
          onFacts={() => {}}
          onName={() => {}}
          dimmed
          interactive={false}
          pannable={false}
          hideBackground={session.hideBackground}
        />
      </div>

      <div
        style={{
          position: 'absolute',
          inset: 0,
          padding: CHROME_PADDING,
          display: 'flex',
          flexDirection: 'column',
          // The form is taller than a phone. The overlay is what scrolls —
          // the graph behind it stays put, which is the point of keeping it.
          overflowY: 'auto',
          pointerEvents: 'none',
        }}
      >
        <TopBar
          inset={false}
          startLinks={startLinks}
          onOpenKey={onOpenKey}
          aside={
            <span
              className="mono"
              style={{
                display: 'inline-flex',
                alignItems: 'baseline',
                gap: 10,
                fontSize: 10,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'var(--annotation)',
              }}
            >
              Information used
              <span style={{ fontSize: 18, letterSpacing: 0, color: 'var(--ink)' }}>{clues}</span>
              {clues === 1 ? 'clue' : 'clues'}
            </span>
          }
        />

        {/* A column, not a centred stack: the drawing is the other half of the
            page and the question is asked beside it. */}
        <div className="guess-column">
          {settled ? (
            <div className="annot" style={{ fontSize: 10, letterSpacing: '0.22em', color: 'var(--annotation)' }}>
              In {settled.title}
            </div>
          ) : null}

          <h1 style={{ margin: '8px 0 0 0', fontWeight: 400, fontSize: 'clamp(32px, 7vw, 60px)', lineHeight: 1 }}>
            {headline ?? 'Who are you?'}
          </h1>
          <div style={{ marginTop: 10, fontSize: 'clamp(15px, 4vw, 18px)', color: 'var(--body)' }}>
            {bearing ?? 'Guessing is free. A wrong name costs nothing.'}
          </div>

          {/* The world is only asked about while it is still a question. */}
          {!settled && (
            <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label className="field-label" htmlFor="story">
                What world are you in?
              </label>
              <select
                id="story"
                className="field"
                value={story}
                onChange={(e) => {
                  const next = e.target.value;
                  setStory(next);
                  const q = query.trim();
                  if (next && q && suggestions.includes(q)) onGuess(next, q, resolve(q, next));
                }}
              >
                <option value="" disabled>
                  —
                </option>
                {stories.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div style={{ marginTop: 30, position: 'relative' }}>
            <label htmlFor="character" className="sr-only">
              Your name
            </label>
            {/* The struck name above the field, so a rejected guess stays
                readable while the next one is typed. */}
            {rejected && (
              <div style={{ fontSize: 20, color: 'var(--unknown)', textDecoration: 'line-through', marginBottom: 6 }}>
                {rejected}
              </div>
            )}
            <div className="guess-field">
              <input
                id="character"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setHot(0);
                }}
                placeholder="Type a name"
                autoComplete="off"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setHot((h) => Math.min(h + 1, Math.max(0, live.length - 1)));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setHot((h) => Math.max(0, h - 1));
                  } else if (e.key === 'Enter') {
                    submit(chosen);
                  } else if (e.key === 'Escape') {
                    onCancel();
                  }
                }}
              />
              <span className="annot" style={{ fontSize: 9, letterSpacing: '0.16em', color: 'var(--unknown)' }}>
                ↑↓ to pick
              </span>
            </div>

            {suggestions.length > 0 && (
              <div role="listbox" aria-label="Suggestions" className="guess-list">
                {suggestions.map((name) => {
                  const tie = isTie(name);
                  const on = !tie && name === chosen;
                  return (
                    <button
                      key={name}
                      role="option"
                      aria-selected={on}
                      disabled={tie}
                      onClick={() => submit(name)}
                      onMouseEnter={() => {
                        const i = live.indexOf(name);
                        if (i >= 0) setHot(i);
                      }}
                      className={`guess-option${on ? ' on' : ''}`}
                    >
                      <span className={`guess-option-name${tie ? ' struck' : ''}`}>{name}</span>
                      <span className="annot" style={{ fontSize: 9, letterSpacing: '0.14em' }}>
                        {tie ? 'One of your ties' : (sourceOf(name) ?? '')}
                      </span>
                    </button>
                  );
                })}
                <div className="guess-list-note annot" style={{ fontSize: 9, letterSpacing: '0.14em' }}>
                  {settled
                    ? 'Names from this world · your known ties are struck out'
                    : 'Names from every world · your known ties are struck out'}
                </div>
              </div>
            )}
          </div>

          <div style={{ marginTop: 22, display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="guess-submit"
              disabled={!chosen || !story}
              onClick={() => submit(chosen)}
            >
              I am {chosen ?? '…'}
            </button>
            <button type="button" className="guess-back" onClick={onCancel}>
              <span style={{ borderBottom: '1px solid var(--leader)' }}>Keep looking</span>
              <span style={{ color: 'var(--unknown)' }}>Esc</span>
            </button>
          </div>

          {/* What the round has established, which is what a guess is reasoned
              from. The named ties are here because they are the names ruled
              out — the list and this line are the same fact twice. */}
          <div className="guess-known">
            <div className="annot" style={{ fontSize: 9, letterSpacing: '0.2em', color: 'var(--annotation)' }}>
              What you know
            </div>
            <KnownRow label="Ties">{ties}</KnownRow>
            {namedTies.length > 0 && (
              <KnownRow label="Named">
                {namedTies.join(' · ')}{' '}
                {/* The whole point of the line: these are the names the
                    round has ruled out. `none of them is not you` is what the
                    two halves made when they were written as one — and the em
                    dash in front of it was a second clause pretending to be an
                    aside, when it is the sentence's own point. */}
                <span style={{ color: 'var(--annotation)' }}>
                  {namedTies.length === 1 ? 'they are not you' : 'none of them is you'}
                </span>
              </KnownRow>
            )}
          </div>
        </div>

        {/* The way out that costs, kept in the corner opposite the way out
            that does not. */}
        <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'flex-end', pointerEvents: 'auto' }}>
          <button type="button" className="guess-giveup" onClick={onReveal}>
            <span style={{ borderBottom: '1px solid var(--rule)' }}>Give up and see the answer</span>
            <span style={{ color: 'var(--accent)' }}>
              Costs {clueWord(COST.answer)}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

/** A price, in the one unit this game has. Takes a plain number so a cost that
 *  is a literal in the table does not make the comparison look impossible. */
function clueWord(n: number): string {
  return `${n} ${n === 1 ? 'clue' : 'clues'}`;
}

/** One thing the round has established: what kind of knowing, and what it
 *  says. The label is a fixed column so the lines read as a list. */
function KnownRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
      <span
        className="mono"
        style={{
          width: 70,
          flexShrink: 0,
          fontSize: 9,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--accent)',
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: 17, lineHeight: 1.35 }}>{children}</span>
    </div>
  );
}
