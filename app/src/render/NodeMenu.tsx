import type { VisibleNode } from '../graph/project';
import type { LaidOutNode } from '../graph/layout';
import { applyZoom, type ZoomState } from '../graph/zoom';
import { COST } from '../engine/session';
import type { ActionKey, Session } from '../engine/session';
import { availableActionsFor } from '../engine/session';
import { nodeRadius } from './scales';

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
  onOpenGuess,
  onPointerEnter,
  onPointerLeave,
}: Props) {
  if (!node) return null;
  const p = positions.get(node.i);
  if (!p) return null;
  const actions = availableActionsFor(session, node.i);
  if (actions.length === 0 && !factLine && !node.isYou) return null;

  const handlers = { expand: onExpand, facts: onFacts, name: onName };

  const [cx, cy] = applyZoom(zoom, p.x, p.y);
  const ring = (nodeRadius(node.degree) + 10.5) * zoom.k;
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
      <foreignObject x={menuX} y={cy - 26} width={MENU_W} height={260} style={{ overflow: 'visible' }}>
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
                I know who I am
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
                borderBottom: actions.length > 0 ? '1px solid var(--rule)' : 'none',
              }}
            >
              {factLine}
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
