import { useEffect, useMemo, useState } from 'react';
import { Stage } from '../render/Stage';
import { Ledger } from '../render/Ledger';
import { BrandCluster, CHROME_PADDING, GiveUpLinks, HelpLink } from '../render/MarginLinks';
import type { VisibleGraph } from '../graph/project';
import type { LaidOutNode } from '../graph/layout';
import type { Session } from '../engine/session';
import { worldIsKnown } from '../engine/session';
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
  onRevealStory: () => void;
  onStartAgain: () => void;
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
  onRevealStory,
  onStartAgain,
}: Props) {
  // Deliberately NOT the universe being played — defaulting to the real answer
  // hands over the half of the question the dropdown exists to ask. Unless a
  // previous guess already got the story right, in which case re-picking what
  // they have established is busywork.
  const [story, setStory] = useState(worldIsKnown(session) ? session.universe : '');
  const [query, setQuery] = useState('');

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

  /** Drawn from EVERY loaded story, never just the selected one — see
   * `suggestNames`, which the claim field now shares. */
  const suggestions = useMemo(() => suggestNames(stories, query), [query, stories]);

  /** Resolved against the SELECTED story: the guess is a pair, and a name that
   * exists in another book is simply not this book's answer. */
  const resolve = (text: string, storyId: string): number | null => {
    const u = loaded.get(storyId);
    return u ? resolveName(u, text) : null;
  };

  /** The world, when there is nothing left to ask about it. */
  const settled = worldIsKnown(session) ? loaded.get(session.universe) ?? null : null;

  const last = session.lastGuess;
  const rejected = last && !last.characterCorrect ? last.characterQuery : null;
  const canSubmit = query.trim().length > 0 && story !== '';

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

  /** When the misnamed character was already on the paper, the reducer labelled
   * them. Say so, because the graph is behind a dimmed screen and the player
   * will not see it happen. */
  const placed =
    last && last.storyCorrect && !last.characterCorrect && last.characterIndex !== null
      ? session.known.recognised.has(last.characterIndex)
      : false;

  return (
    <div style={{ position: 'relative', height: '100dvh', overflow: 'hidden' }}>
      {/* The graph stays visible — it is the evidence, not the subject. */}
      <div style={{ position: 'absolute', inset: 0 }}>
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
        <div
          className="chrome-row"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
        >
          <BrandCluster onStartAgain={onStartAgain} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 'clamp(12px, 4vw, 28px)' }}>
              <Ledger ledger={session.ledger} />
              <HelpLink onOpenKey={onOpenKey} />
            </div>
            <GiveUpLinks
              onReveal={onReveal}
              onRevealStory={worldIsKnown(session) ? undefined : onRevealStory}
            />
          </div>
        </div>

        <div
          style={{
            flex: '1 0 auto',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 'clamp(22px, 5vh, 44px)',
            paddingTop: 24,
            pointerEvents: 'auto',
          }}
        >
          {headline && (
            <div style={{ textAlign: 'center', maxWidth: 520 }}>
              <div style={{ fontSize: 'clamp(21px, 6vw, 27px)' }}>{headline}</div>
              {bearing && (
                <div style={{ fontSize: 'clamp(15px, 4vw, 18px)', color: 'var(--body)', marginTop: 12, lineHeight: 1.5 }}>
                  {bearing}
                </div>
              )}
              {placed && (
                <div className="annot" style={{ marginTop: 10 }}>
                  Right name. They are on your graph, now labelled.
                </div>
              )}
            </div>
          )}

          {/* Once the world is settled — named correctly, or chosen before play —
              the question stops being asked. Leaving a dropdown open on a
              settled answer invites the player to re-pick what they have already
              established, and makes the screen look like it is still asking. */}
          {settled ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 'min(470px, 100%)' }}>
              <div className="field-label">The world</div>
              <div style={{ fontSize: 'clamp(19px, 5vw, 23px)' }}>{settled.title}</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 'min(470px, 100%)' }}>
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
                  // A name already picked from the list, then a world: that is
                  // the other half of the same confirm as clicking a suggestion
                  // after the world is known.
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 'min(470px, 100%)' }}>
            <label className="field-label" htmlFor="character">
              Who are you?
            </label>
            {rejected && (
              <div style={{ fontSize: 20, color: 'var(--unknown)', textDecoration: 'line-through' }}>
                {rejected}
              </div>
            )}
            <input
              id="character"
              className="field"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canSubmit) onGuess(story, query, resolve(query, story));
              }}
            />

            {suggestions.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9, paddingTop: 2 }}>
                {suggestions.map((name) => (
                  <button
                    key={name}
                    onClick={() => {
                      setQuery(name);
                      if (story) onGuess(story, name, resolve(name, story));
                    }}
                    style={{ fontFamily: 'var(--serif)', fontSize: 19, color: 'var(--body)', textAlign: 'left' }}
                  >
                    {name}
                  </button>
                ))}
              </div>
            ) : (
              <div className="annot">Suggests after 2 letters · drawn from every world loaded</div>
            )}

            <div style={{ marginTop: 22 }}>
              <button className="action-quiet" onClick={onCancel} style={{ padding: '14px 0 10px 0' }}>
                Keep looking
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
