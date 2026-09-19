import type { Ledger as LedgerT } from '../engine/session';
import { clueTotal } from '../engine/session';

export { clueTotal };

/** A count, never a budget — no bar, no timer, no currency. */
export function Ledger({ ledger }: { ledger: LedgerT }) {
  const clues = clueTotal(ledger);
  return (
    <div className="chrome">
      {/* The sentence is dropped on a phone; the count never is. */}
      <span className="ledger-long">Information used &nbsp;·&nbsp; </span>
      {clues} {clues === 1 ? 'clue' : 'clues'}
    </div>
  );
}

/** The itemised version that sits under the header while exploring. */
export function LedgerBreakdown({ ledger }: { ledger: LedgerT }) {
  const rows: string[] = [];
  if (ledger.expansions) rows.push(`${ledger.expansions} ${ledger.expansions === 1 ? 'expansion' : 'expansions'}`);
  if (ledger.facts) rows.push(`${ledger.facts} ${ledger.facts === 1 ? 'reading' : 'readings'}`);
  if (ledger.names) rows.push(`${ledger.names} ${ledger.names === 1 ? 'name' : 'names'}`);
  if (ledger.stories) rows.push('the world');
  if (rows.length === 0 && !ledger.recognitions) return null;

  return (
    <div className="annot ledger-breakdown" style={{ textAlign: 'right', lineHeight: 2 }}>
      {rows.map((r) => (
        <div key={r}>{r}</div>
      ))}
      {/* Set apart and signed, because it is the only line that subtracts. */}
      {ledger.recognitions > 0 && (
        <div style={{ color: 'var(--accent)' }}>
          −{ledger.recognitions} recognised
        </div>
      )}
    </div>
  );
}
