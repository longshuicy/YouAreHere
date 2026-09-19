import { useState } from 'react';
import type { StrongestTie, VisibleNode } from '../graph/project';
import type { LaidOutNode } from '../graph/layout';
import { applyZoom, type ZoomState } from '../graph/zoom';
import { COST } from '../engine/session';
import type { ActionKey, Session } from '../engine/session';
import type { NodeIndex } from '../types';
import { availableActionsFor, canClaim } from '../engine/session';
import { nodeRadius } from './scales';
import { cardinal, timesTogether } from '../graph/project';

interface Props {
  node: VisibleNode | null;
  positions: Map<number, LaidOutNode>;
  /** Current pan/zoom, so the menu tracks its node on screen. */
  zoom: ZoomState;
  /** Half the stage width, used to flip the menu before it runs off the paper. */
  halfWidth: number;
  session: Session;
  /** The bought fact line for this node, if any. */
  factLine: string | null;
  onExpand: (i: number) => void;
  onFacts: (i: number) => void;
  onName: (i: number) => void;
  /** Put a name to this node and find out. */
  onClaim: (i: number, query: string) => void;
  /** Names matching what has been typed so far, drawn from every loaded story.
   * The same list the guess screen offers, for the same reason. */
  suggest: (query: string) => string[];
  /** Whether the sidecar holds a reading for a node. Nodes it has nothing for
   * do not offer one. */
  hasFacts: (i: number) => boolean;
  /** The heaviest tie drawn from this node, if it has more than one. Null when
   * there is nothing to pick between. */
  strongest: StrongestTie | null;
  /** How to write a neighbour on the menu: their name, their monogram, or
   * nothing yet. The menu never learns more about them than the paper shows. */
  labelOf: (i: NodeIndex) => string;
  /** Light the tie without committing to it — for hover. */
  onLightStrongest: (on: boolean) => void;
  /** Follow it: light it for good, and open the menu of whoever is on the far
   * end, so the next move is one click away. */
  onPickStrongest: () => void;
  /** True while this node's strongest tie is lit. */
  lit: boolean;
  /** Your own node's only offer: the guess. */
  onOpenGuess: () => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}

const GLOSS: Record<ActionKey, string> = {
  expand: 'show its neighbours',
  facts: 'what is known of them',
  name: 'one name, nothing more',
};

const MENU_W = 244;

/**
 * The free move.
 *
 * Every other row on this menu buys information. This one asserts it: you say
 * who you think the node is, and the graph tells you whether you were right.
 * It is the only thing in the game that gives a clue back, and the only
 * feedback the player can get without spending — which is the whole reason it
 * exists. A puzzle whose one signal is "solved / not solved" is not hard, it is
 * closed, and nothing here could be tested against anything until this row.
 *
 * It cannot cost anything. A free move that charges for being wrong is not
 * free, and the player it would charge is the one with a hypothesis and no
 * other way to test it — which is the player this row was built for.
 */
function ClaimRow({
  node,
  onClaim,
  suggest,
  ruled,
}: {
  node: VisibleNode;
  onClaim: (i: number, query: string) => void;
  suggest: (query: string) => string[];
  ruled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');

  // A free move that demands you spell a half-remembered name from cold is not
  // free, it is a spelling test. The guess screen has always suggested; there
  // was never a reason for this field not to, and the list is drawn from every
  // loaded story so it gives away no more here than it does there.
  const suggestions = suggest(text);

  const submit = (value = text) => {
    if (!value.trim()) return;
    onClaim(node.i, value);
    setText('');
  };

  return (
    <div style={{ borderBottom: ruled ? '1px solid var(--rule)' : 'none' }}>
      {/* Names already refused here stay on the page, struck through, so the
          same wrong answer is never paid for twice by accident. */}
      {node.rejected.length > 0 && (
        <div style={{ padding: '8px 0 0 0' }}>
          {node.rejected.map((r) => (
            <div
              key={r}
              style={{
                fontFamily: 'var(--serif)',
                fontSize: 14,
                color: 'var(--unknown)',
                textDecoration: 'line-through',
              }}
            >
              {r}
            </div>
          ))}
        </div>
      )}

      {!open ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
          }}
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 12,
            width: '100%',
            padding: '9px 0',
            textAlign: 'left',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--accent)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '';
          }}
        >
          <span className="mono" style={{ fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase' }}>
            claim
          </span>
          <span style={{ fontFamily: 'var(--serif)', fontSize: 14, color: 'var(--body)' }}>
            say who they are · free
          </span>
        </button>
      ) : (
        <div style={{ padding: '9px 0 12px 0' }} onClick={(e) => e.stopPropagation()}>
          <div className="mono" style={{ fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', paddingBottom: 7 }}>
            claim
          </div>
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') submit();
              if (e.key === 'Escape') setOpen(false);
            }}
            placeholder="a name"
            style={{
              width: '100%',
              font: '16px var(--serif)',
              color: 'var(--ink)',
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid var(--ink)',
              padding: '2px 0 5px 0',
              outline: 'none',
            }}
          />
          {/* Return commits, but a field whose only way forward is a key you
              have to know about is a field with no way forward. */}
          {suggestions.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 9 }}>
              {suggestions.map((name) => (
                <button
                  key={name}
                  onClick={(e) => {
                    e.stopPropagation();
                    setText(name);
                  }}
                  style={{
                    fontFamily: 'var(--serif)',
                    fontSize: 14,
                    color: 'var(--body)',
                    textAlign: 'left',
                    whiteSpace: 'normal',
                    lineHeight: 1.3,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'var(--ink)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--body)';
                  }}
                >
                  {name}
                </button>
              ))}
            </div>
          ) : (
            <div className="annot" style={{ paddingTop: 8 }}>right gives a clue back</div>
          )}
          <div style={{ paddingTop: 11 }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                submit();
              }}
              className="mono"
              style={{
                fontSize: 11,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
                color: text.trim() ? 'var(--accent)' : 'var(--unknown)',
                borderBottom: `1px solid ${text.trim() ? 'var(--accent)' : 'var(--rule)'}`,
                paddingBottom: 3,
                cursor: text.trim() ? 'pointer' : 'default',
              }}
            >
              That's them
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function NodeMenu({
  node,
  positions,
  zoom,
  halfWidth,
  session,
  factLine,
  onExpand,
  onFacts,
  onName,
  onClaim,
  suggest,
  hasFacts,
  strongest,
  labelOf,
  onLightStrongest,
  onPickStrongest,
  lit,
  onOpenGuess,
  onPointerEnter,
  onPointerLeave,
}: Props) {
  if (!node) return null;
  const p = positions.get(node.i);
  if (!p) return null;
  const actions = availableActionsFor(session, node.i, hasFacts);
  // Said plainly rather than left as a gap in the menu: a node whose row simply
  // vanished would read as a bug, and "nothing is recorded" is itself worth
  // knowing — it is why there is nothing to buy.
  const factsEmpty = !node.isYou && !session.known.facts.has(node.i) && !hasFacts(node.i);
  const claimable = canClaim(session, node.i);
  // Offered only where it settles something: one tie needs no picking out, and
  // on a node with none there is nothing drawn to read.
  const picker = strongest && strongest.degree > 1 ? strongest : null;
  if (actions.length === 0 && !claimable && !factsEmpty && !factLine && !node.isYou && !picker)
    return null;

  const handlers = { expand: onExpand, facts: onFacts, name: onName };

  const [cx, cy] = applyZoom(zoom, p.x, p.y);
  const ring = (nodeRadius(node.presence) + 10.5) * zoom.k;
  const GAP = 26;

  // Prefer the right of the node, flip left when that would overflow — then
  // clamp either way, because near the edge of a small stage neither side fits
  // and a menu half off the paper is worse than one that has been nudged.
  const preferLeft = cx + ring + GAP + MENU_W > halfWidth - 8;
  const rawX = preferLeft ? cx - ring - GAP - MENU_W : cx + ring + GAP;
  const menuX = Math.max(-halfWidth + 8, Math.min(rawX, halfWidth - MENU_W - 8));
  // The leader runs to whichever edge of the menu now faces the node.
  const leaderEnd = menuX > cx ? menuX : menuX + MENU_W;
  const flip = leaderEnd < cx;

  return (
    <g style={{ pointerEvents: 'none' }}>
      <line
        x1={flip ? cx - ring : cx + ring}
        y1={cy}
        x2={leaderEnd}
        y2={cy}
        stroke="var(--leader)"
        strokeWidth={1}
        strokeDasharray="2 3"
      />
      <foreignObject x={menuX} y={cy - 26} width={MENU_W} height={440} style={{ overflow: 'visible' }}>
        <div
          onMouseEnter={onPointerEnter}
          onMouseLeave={onPointerLeave}
          style={{
            pointerEvents: 'auto',
            background: 'var(--panel)',
            border: '1px solid var(--panel-edge)',
            boxShadow: '2px 3px 0 rgba(22, 19, 15, 0.07)',
            padding: '4px 12px',
            width: MENU_W,
          }}
        >
          {/* Your own node sells nothing. It offers the one thing it can. */}
          {node.isYou && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenGuess();
              }}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 12,
                width: '100%',
                padding: '11px 0',
                color: 'var(--accent)',
                textAlign: 'left',
                whiteSpace: 'nowrap',
              }}
            >
              <span className="mono" style={{ fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase' }}>
                I've found myself
              </span>
              <span style={{ fontFamily: 'var(--serif)', fontSize: 14, fontStyle: 'italic' }}>free</span>
            </button>
          )}

          {factLine && (
            <div
              style={{
                fontFamily: 'var(--serif)',
                fontSize: 14,
                lineHeight: 1.45,
                color: 'var(--body)',
                padding: '10px 0',
                whiteSpace: 'normal',
                borderBottom:
                  picker || actions.length > 0 || claimable || factsEmpty
                    ? '1px solid var(--rule)'
                    : 'none',
              }}
            >
              {factLine}
            </div>
          )}

          {/*
            * The thickest tie, said in words.
            *
            * On a node with three ties the diagram answers this by itself. On a
            * hub it does not: a fan of twenty strokes drawn between one and
            * three and a half pixels cannot be ranked by eye, so the strongest
            * tie — the single most useful thing the diagram knows about who
            * this person is — was free and unreadable. This row reads it out,
            * lights the tie on the paper with its figure beside it, and opens
            * the far node's own menu, because knowing which neighbour it is, is
            * only worth anything if the next move lands on them.
            *
            * It costs nothing, and it must not: it buys no new fact, it decodes
            * a mark already drawn. Ties are shown by default everywhere for the
            * same reason.
            *
            * When the heaviest ties are exactly equal the diagram declines to
            * choose. All of them light, every far end is ringed, and the player
            * picks the one they want — a menu
            * that silently took the first of two identical ties would be
            * answering a question it had not been asked.
            */}
          {picker && (
            <div
              style={{
                borderBottom:
                  claimable || factsEmpty || actions.length > 0 ? '1px solid var(--rule)' : 'none',
              }}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onPickStrongest();
                }}
                onMouseEnter={(e) => {
                  onLightStrongest(true);
                  e.currentTarget.style.color = 'var(--accent)';
                }}
                onMouseLeave={(e) => {
                  onLightStrongest(false);
                  e.currentTarget.style.color = '';
                }}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  gap: 12,
                  width: '100%',
                  padding: '9px 0',
                  textAlign: 'left',
                  color: lit ? 'var(--accent)' : undefined,
                }}
              >
                <span
                  className="mono"
                  style={{
                    fontSize: 11,
                    letterSpacing: '0.2em',
                    textTransform: 'uppercase',
                    whiteSpace: 'nowrap',
                  }}
                >
                  shares most
                </span>
                {/* The only row whose right-hand side can run long — a bought
                    name and a figure together — so it is the only one allowed
                    to wrap rather than push past the edge of the panel. */}
                <span
                  style={{
                    fontFamily: 'var(--serif)',
                    fontSize: 14,
                    color: 'var(--body)',
                    textAlign: 'right',
                    lineHeight: 1.3,
                  }}
                >
                  {picker.neighbours.length === 1
                    ? labelOf(picker.neighbours[0])
                    : `${cardinal(picker.neighbours.length)} equal`}{' '}
                  · {timesTogether(picker.weight)}
                </span>
              </button>
              {lit && picker.neighbours.length > 1 && (
                <div className="annot" style={{ padding: '0 0 9px 0', whiteSpace: 'normal' }}>
                  Nothing separates them. Take whichever you like.
                </div>
              )}
            </div>
          )}

          {claimable && (
            <ClaimRow
              key={node.i}
              node={node}
              onClaim={onClaim}
              suggest={suggest}
              ruled={actions.length > 0 || factsEmpty}
            />
          )}

          {factsEmpty && (
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 12,
                padding: '9px 0',
                borderBottom: actions.length > 0 ? '1px solid var(--rule)' : 'none',
                whiteSpace: 'nowrap',
                color: 'var(--unknown)',
              }}
            >
              <span className="mono" style={{ fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase' }}>
                facts
              </span>
              <span style={{ fontFamily: 'var(--serif)', fontSize: 14 }}>nothing is recorded</span>
            </div>
          )}

          {actions.map((a, idx) => (
            <button
              key={a}
              onClick={(e) => {
                e.stopPropagation();
                handlers[a](node.i);
              }}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 12,
                width: '100%',
                padding: '9px 0',
                // Rules separate rows; there is nothing below the last one.
                borderBottom: idx < actions.length - 1 ? '1px solid var(--rule)' : 'none',
                textAlign: 'left',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--accent)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = '';
              }}
            >
              <span className="mono" style={{ fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase' }}>
                {a}
              </span>
              <span style={{ fontFamily: 'var(--serif)', fontSize: 14, color: 'var(--body)' }}>
                {GLOSS[a]} · {COST[a]}
              </span>
            </button>
          ))}
        </div>
      </foreignObject>
    </g>
  );
}
