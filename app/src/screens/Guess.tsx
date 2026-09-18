import { useEffect, useMemo, useState } from 'react';
import { Stage } from '../render/Stage';
import { Ledger } from '../render/Ledger';
import { MarginLinks } from '../render/MarginLinks';
import type { VisibleGraph } from '../graph/project';
import type { LaidOutNode } from '../graph/layout';
import type { Session } from '../engine/session';
import { worldIsKnown } from '../engine/session';
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

  /**
   * Suggestions are drawn from EVERY loaded story, never just the selected one.
   * That is the point: a list scoped to one book would tell the player how large
   * that book's cast is, which is the one real leak in the guess screen. Names
   * are deduplicated and carry no hint of which story they came from.
   */
  const suggestions = useMemo(() => {
    if (query.trim().length < 3) return [];
    const q = query.trim().toLowerCase();
    const seen = new Set<string>();
    const out: string[] = [];
    for (const u of stories) {
      for (const n of u.nodes) {
        if (out.length >= 6) break;
        const hit =
          n.n.toLowerCase().includes(q) || (n.a ?? []).some((a) => a.toLowerCase().includes(q));
        if (!hit) continue;
        const key = n.n.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(n.n);
      }
    }
    return out;
  }, [query, stories]);

  /** Resolved against the SELECTED story: the guess is a pair, and a name that
   * exists in another book is simply not this book's answer. */
  const resolve = (text: string, storyId: string): number | null => {
    const u = loaded.get(storyId);
    if (!u) return null;
    const q = text.trim().toLowerCase();
    const found = u.nodes.find((n) => n.n.toLowerCase() === q);
    if (found) return found.i;
    const byAlias = u.nodes.find((n) => (n.a ?? []).some((a) => a.toLowerCase() === q));
    return byAlias ? byAlias.i : null;
  };

  const last = session.lastGuess;
  const rejected = last && !last.characterCorrect ? last.characterQuery : null;
  const canSubmit = query.trim().length > 0 && story !== '';

  const headline = !last
    ? null
    : last.storyCorrect && !last.characterCorrect
      ? 'Right story. Wrong person.'
      : !last.storyCorrect
        ? 'Not this story.'
        : null;

  return (
    <div style={{ position: 'relative', height: '100vh', overflow: 'hidden' }}>
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
          padding: '44px 64px 56px 64px',
          display: 'flex',
          flexDirection: 'column',
          pointerEvents: 'none',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div className="chrome">YOU ARE HERE</div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 18 }}>
            <Ledger ledger={session.ledger} />
            <MarginLinks onOpenKey={onOpenKey} onReveal={onReveal} />
          </div>
        </div>

        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 44,
            pointerEvents: 'auto',
          }}
        >
          {headline && <div style={{ fontSize: 27 }}>{headline}</div>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 470 }}>
            <label className="field-label" htmlFor="story">
              What story are you in?
            </label>
            <select
              id="story"
              className="field"
              value={story}
              onChange={(e) => setStory(e.target.value)}
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 470 }}>
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
                    onClick={() => setQuery(name)}
                    style={{ fontFamily: 'var(--serif)', fontSize: 19, color: 'var(--body)', textAlign: 'left' }}
                  >
                    {name}
                  </button>
                ))}
              </div>
            ) : (
              <div className="annot">Suggests after 3 letters · drawn from every story loaded</div>
            )}

            {/* The commit sits under the field it commits, with its way out beside
                it — not stranded at the far edge of the screen. */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 28, marginTop: 22 }}>
              <button
                onClick={() => onGuess(story, query, resolve(query, story))}
                disabled={!canSubmit}
                className="mono"
                style={{
                  fontSize: 13,
                  letterSpacing: '0.3em',
                  textTransform: 'uppercase',
                  padding: '14px 10px 10px 10px',
                  minHeight: 44,
                  color: canSubmit ? 'var(--accent)' : 'var(--unknown)',
                  borderBottom: `2px solid ${canSubmit ? 'var(--accent)' : 'var(--rule)'}`,
                  cursor: canSubmit ? 'pointer' : 'default',
                }}
              >
                This is me
              </button>
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
