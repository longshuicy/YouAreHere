import type { Ledger as LedgerT } from '../engine/session';
import { clueBonus, clueTotal } from '../engine/session';
import { residenceTotal, startOrdinal, type Residence } from '../engine/residence';

export { clueTotal };

/**
 * A count, never a budget — no bar, no timer, no currency.
 *
 * One column, in the order a reader asks: what this start has cost, what that
 * was spent on, and — in a residence — where it stands in the whole map. The
 * itemised lines hang under the count they add up to, on its edge, rather
 * than under whatever link happens to sit beside it.
 */
export function Ledger({
  ledger,
  residence,
  itemised = false,
}: {
  ledger: LedgerT;
  /** When set, the map's running total closes the column. */
  residence?: Residence | null;
  /** List what the count is made of, under it. */
  itemised?: boolean;
}) {
  const clues = clueTotal(ledger);
  const rows = itemised ? breakdownOf(ledger) : [];
  const bonus = itemised ? clueBonus(ledger) : 0;
  const mapTotal = residence ? residenceTotal(residence) + clues : 0;

  return (
    <div style={{ textAlign: 'right' }}>
      <div className="chrome" style={{ color: 'var(--ink)' }}>
        {/* The sentence is dropped on a phone; the count never is. */}
        <span className="ledger-long" style={{ color: 'var(--annotation)' }}>
          Information used &nbsp;·&nbsp;{' '}
        </span>
        {clues} {clues === 1 ? 'clue' : 'clues'}
      </div>

      {(rows.length > 0 || bonus > 0) && (
        <div className="annot ledger-breakdown" style={{ lineHeight: 1.9, marginTop: 6 }}>
          {rows.map((r) => (
            <div key={r}>{r}</div>
          ))}
          {/* Set apart and signed, because it is the only line that subtracts. */}
          {bonus > 0 && <div style={{ color: 'var(--accent)' }}>-{bonus}</div>}
        </div>
      )}

      {residence && (
        <div
          className="annot"
          style={{
            // No rule above it. A hairline under tracked uppercase mono is how
            // this app draws an *action*, so one sitting over the map's total
            // made a readout look like a button — and, being inline-block, it
            // hugged its own text rather than the column, landing as a ragged
            // underline aligned with nothing and laddering against the help
            // link's rule just above. Distance separates it instead: the line
            // is already smaller and greyer than the count it follows, which
            // is the whole of the hierarchy it needs.
            marginTop: 16,
            color: 'var(--unknown)',
          }}
        >
          {startOrdinal(residence.selves.length + 1)}
          {/* The total, not the count of finished starts: clues spent in a
              start the player walked away from are on the map too, and a
              second start that opened with six of them already spent must not
              print an ordinal with no number after it. */}
          {residenceTotal(residence) > 0 && (
            <>
              {' '}
              · {mapTotal} {mapTotal === 1 ? 'clue' : 'clues'} in all
            </>
          )}
        </div>
      )}
    </div>
  );
}

function breakdownOf(ledger: LedgerT): string[] {
  const rows: string[] = [];
  if (ledger.expansions) rows.push(`${ledger.expansions} ${ledger.expansions === 1 ? 'expansion' : 'expansions'}`);
  if (ledger.facts) rows.push(`${ledger.facts} ${ledger.facts === 1 ? 'reading' : 'readings'}`);
  if (ledger.names) rows.push(`${ledger.names} ${ledger.names === 1 ? 'name' : 'names'}`);
  if (ledger.stories) rows.push('the world');
  if (ledger.answers) rows.push('the answer');
  return rows;
}
