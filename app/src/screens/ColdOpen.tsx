import { Stage } from '../render/Stage';
import { MarginLinks } from '../render/MarginLinks';
import type { VisibleGraph } from '../graph/project';
import type { LaidOutNode } from '../graph/layout';
import type { Session } from '../engine/session';

interface Props {
  graph: VisibleGraph;
  positions: Map<number, LaidOutNode>;
  session: Session;
  onBegin: () => void;
  onOpenKey: () => void;
}

export function ColdOpen({ graph, positions, session, onBegin, onOpenKey }: Props) {

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '44px 64px 56px 64px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div className="chrome">YOU ARE HERE</div>
        <MarginLinks onOpenKey={onOpenKey} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 34 }}>
        <div style={{ fontSize: 31, letterSpacing: '0.01em' }}>
          You wake up here.
        </div>

        <div style={{ width: 'min(520px, 70vw)', height: 300 }}>
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

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 22,
            fontSize: 19,
            color: 'var(--body)',
            lineHeight: 1.7,
            textAlign: 'center',
          }}
        >
          <div>
            <div>We find our place in the universe</div>
            <div>by whom we follow, whom we find,</div>
            <div>whom we love, and whom we lose.</div>
          </div>
          <div style={{ color: 'var(--ink)' }}>
            <div>Find your coordinates.</div>
            <div>Find yourself.</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <button className="action" onClick={onBegin}>
          Begin
        </button>
      </div>
    </div>
  );
}
