import type { CSSProperties, ReactNode } from 'react';
import type { VisibleGraph } from '../graph/project';
import type { Session } from '../engine/session';

/**
 * What the round has established, which is what a guess is reasoned from.
 *
 * One list, drawn the same on the play screen and the guess screen, because it
 * is the same evidence in both places: the play screen keeps it beside the
 * diagram it was bought from, and the guess screen keeps it beside the
 * question it is for.
 *
 * Only what *this* round turned up is logged line by line. Inside a residence
 * `session.known` opens already holding every name and refusal the
 * map carries, and printing those as things this walk had found told the
 * player something false — the carried knowledge is already drawn on the
 * diagram, where it belongs. It is counted, so the ruled-out line stays true.
 * What was carried comes from `known.inherited`, not the residence, because
 * the residence takes on this round's finds as soon as the world is known.
 *
 * Yours is never among the names. It is not a tie of yours, and it arrives in
 * `named` by being answered rather than by being bought.
 */
export function KnownLog({
  graph,
  session,
  standing,
  style,
}: {
  graph: VisibleGraph;
  session: Session;
  /** Your place in this world by number of ties, said in words. Free. */
  standing: string;
  style?: CSSProperties;
}) {
  const nodeById = new Map(graph.nodes.map((n) => [n.i, n]));
  // Written as the paper writes them: a name, the monogram an expansion left,
  // or nobody yet.
  const whoOf = (i: number) => {
    const named = session.known.named.get(i);
    if (named) return named;
    const monogram = nodeById.get(i)?.monogram;
    return monogram ? `${monogram.initial}\u2014` : 'Someone';
  };

  /** Your ties, counted off the graph. The opening ring is every one of them,
   *  so this is a fact the player already has in front of them rather than
   *  something the list is giving away. */
  const ties = graph.edges.filter((e) => e.source === session.you || e.target === session.you).length;

  const inherited = session.known.inherited;
  const named = [...session.known.named].filter(([i]) => i !== session.you);
  const earnedNames = named.filter(([i]) => !inherited?.named.has(i)).map(([, name]) => name);
  const carriedNames = named.length - earnedNames.length;
  const earnedRefusals = [...session.known.rejected].flatMap(([i, names]) => {
    const carried = new Set(inherited?.rejected.get(i) ?? []);
    return names.filter((name) => !carried.has(name)).map((name) => ({ i, name }));
  });

  return (
    <div className="known-log" style={style}>
      <div className="annot" style={{ fontSize: 9, letterSpacing: '0.2em', color: 'var(--annotation)' }}>
        What you know so far
      </div>
      {/* The free reading is always the first line: it is the one the game
          gives without being asked. */}
      <KnownRow label="Reading">{standing}</KnownRow>
      <KnownRow label="Ties">
        You have {ties} {ties === 1 ? 'tie' : 'ties'}.
      </KnownRow>
      {/* The names you have earned are the names that cannot be yours — the
          guess list strikes them out, and this line is the same fact. */}
      {named.length > 0 && (
        <KnownRow label="Named">
          {earnedNames.join(' · ')}
          {carriedNames > 0 && (
            <>
              {earnedNames.length > 0 ? ' · ' : ''}
              {carriedNames} from earlier lives
            </>
          )}{' '}
          <span style={{ color: 'var(--annotation)' }}>
            {named.length === 1 ? 'they are not you' : 'none of them is you'}
          </span>
        </KnownRow>
      )}
      {/* Wrong claims cost nothing, but they are still evidence: who somebody
          is not. Struck, as they are on the node itself. */}
      {earnedRefusals.map(({ i, name }) => (
        <KnownRow key={`not-${i}-${name}`} label="Claim">
          {whoOf(i)} is not{' '}
          <span style={{ textDecoration: 'line-through', color: 'var(--unknown)' }}>{name}</span>.
        </KnownRow>
      ))}
    </div>
  );
}

/** One thing the round has told you: what kind of knowing it was, and what it
 *  said. The label is a fixed column so the sentences line up as a list rather
 *  than a ragged paragraph. */
function KnownRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
      <span
        className="mono"
        style={{
          width: 64,
          flexShrink: 0,
          fontSize: 9,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: 'var(--accent)',
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: 'clamp(15px, 3.8vw, 18px)', fontStyle: 'italic', lineHeight: 1.35 }}>
        {children}
      </span>
    </div>
  );
}
