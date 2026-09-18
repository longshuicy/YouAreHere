import { DegreeBars, HorizonStrip, StripLabel } from './Fingerprint';
import { degreeBarsBox, horizonStripHeightFor } from './stripBox';
import type { WorldMetrics } from './metrics';

const WIDE = 420;
const LABEL = 8.5;
/** Both charts are drawn to one box height, so the prose under them starts on
 * the same line. The degree strip carries two rows of labels and the horizon
 * strip one, so matching them by eye gets it wrong by about fourteen pixels —
 * the tick height is solved for instead. */
const CHART_BOX = degreeBarsBox(30, LABEL);
const TICKS = horizonStripHeightFor(CHART_BOX, true);

function Line({ term, body }: { term: string; body: string }) {
  return (
    <div style={{ display: 'flex', gap: 14, padding: '7px 0' }}>
      <span
        className="mono"
        style={{
          fontSize: 8.5,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: 'var(--unknown)',
          width: 92,
          flexShrink: 0,
          paddingTop: 3,
        }}
      >
        {term}
      </span>
      <span style={{ fontSize: 15, color: 'var(--body)', lineHeight: 1.55 }}>{body}</span>
    </div>
  );
}

/**
 * How to interpret a card, shown on a real one rather than described.
 *
 * The first version was a list of sentences at the foot of the page, which is
 * where an explanation goes to be ignored — the reader has to hold a paragraph
 * in mind and walk back up to the drawing it describes. Here the drawing is the
 * explanation, at the size it is legible, with its bands named and counted.
 *
 * The prose is deliberately plain. An earlier draft said things like "how
 * unequally access to the story is distributed", which is precise and tells a
 * reader nothing they can look at the picture and check.
 */
export function Explain({
  sample,
  onDismiss,
}: {
  sample: WorldMetrics | null;
  onDismiss: () => void;
}) {
  return (
    <div
      style={{
        background: 'var(--panel)',
        border: '1px solid var(--panel-edge)',
        padding: '22px 26px 18px 26px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16 }}>
        <span className="field-label">How to interpret</span>
        <button className="annot-link" onClick={onDismiss}>
          Close
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(330px, 100%), 1fr))',
          gap: 36,
        }}
      >
        <div>
          <StripLabel left="Ties each" width={WIDE} size={LABEL} />
          {sample && (
            <DegreeBars histogram={sample.degreeHistogram} width={WIDE} height={30} labelSize={LABEL} />
          )}
          <div style={{ fontSize: 15, color: 'var(--body)', lineHeight: 1.55, paddingTop: 12 }}>
            Each bar is a group of characters, sorted by how many people they appear with. The number
            on top is how many characters are in that group; the label underneath is how many people
            each of them knows. Weight on the left means a cast of bit-players around a few
            principals. Weight on the right means almost everyone meets almost everyone.
          </div>
        </div>

        <div>
          <StripLabel left="Horizon" right="One mark per character" width={WIDE} size={LABEL} />
          {sample && <HorizonStrip world={sample} width={WIDE} height={TICKS} labelMarks />}
          <div style={{ fontSize: 15, color: 'var(--body)', lineHeight: 1.55, paddingTop: 12 }}>
            One mark per character, asking: if you know a handful of people, how many more do you
            reach through them? A mark at <span className="mono" style={{ fontSize: 13 }}>1×</span>{' '}
            is someone who reaches nobody new — they already know everyone, which is where the leads
            sit. A mark at <span className="mono" style={{ fontSize: 13 }}>10×</span> is someone
            whose few acquaintances open onto ten times as many people again.
          </div>
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 4 }}>
        <Line
          term="Concentration"
          body="Whether the story is shared out or hoarded. Near 0, everyone gets roughly the same amount of it. Near 1, a few people carry the book and the rest are furniture. It cannot tell you who — a two-hander and a one-man tyranny score much the same."
        />
        <Line
          term="Camps"
          body="How many groups appear mostly with each other rather than with the rest of the cast: households, courts, armies. Small groups get swallowed by large ones, so this undercounts rather than over."
        />
        <Line
          term="Outermost"
          body="The furthest character's horizon divided by an ordinary one's. A big number means the world has genuine outsiders; near 1 means it has none. One person decides this figure, which is the point of it — that person is what you are being shown."
        />
        <div className="annot" style={{ fontSize: 9, paddingTop: 8, lineHeight: 1.8 }}>
          Every scale is fixed, so two cards are a comparison and not just a texture. Nothing is
          stored — it is measured from the graphs each time, so adding a book changes no figure that
          was already right.
        </div>
      </div>
    </div>
  );
}
