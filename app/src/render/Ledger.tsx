import { useEffect, useLayoutEffect, useRef } from 'react';
import type { Ledger as LedgerT } from '../engine/session';
import { clueBonus, clueSpent, clueTotal } from '../engine/session';
import { residenceTotal, startOrdinal, type Residence } from '../engine/residence';
import { clearSpendTarget, flashLit, flySpend, registerSpendTarget } from './spendFlight';

export { clueTotal };

/**
 * A count, never a budget — no bar, no timer, no currency.
 *
 * One column, in the order a reader asks: what this start has cost, what that
 * was spent on, and — in a residence — where it stands in the whole map. The
 * itemised lines hang under the count they add up to, on its edge, rather
 * than under whatever link happens to sit beside it.
 *
 * It is also the only thing that knows what an action truly cost, so it is
 * the thing that reports one: when its own total moves it lights the count,
 * lights the line that moved, and sends a mark up from wherever the click was
 * made. See `spendFlight` for why the click site cannot do this itself.
 */
export function Ledger({
  ledger,
  residence,
  itemised = false,
  variant = 'margin',
}: {
  ledger: LedgerT;
  /** When set, the map's running total closes the column. */
  residence?: Residence | null;
  /** List what the count is made of, under it. */
  itemised?: boolean;
  /** `margin` — a right-aligned column in the corner of a screen, which is
   *  what the guess screen wants. `panel` — the heading of the panel the
   *  spending actions sit in, which is what the play screen wants: what it was
   *  spent on at the left, the figure large on the right, over a rule. The count is the
   *  heading of the thing that moves it rather than a readout in the opposite
   *  corner from it. */
  variant?: 'margin' | 'panel';
}) {
  const clues = clueTotal(ledger);
  const rows = itemised ? breakdownOf(ledger) : [];
  const bonus = itemised ? clueBonus(ledger) : 0;
  const mapTotal = residence ? residenceTotal(residence) + clues : 0;

  const countRef = useRef<HTMLSpanElement>(null);
  const breakdownRef = useRef<HTMLDivElement>(null);
  const previous = useRef<LedgerT | null>(null);

  // The marks fly to the count, so the count must be findable before a click
  // can send one. Layout, not effect: a spend on the very first frame after a
  // screen change would otherwise have nowhere to land.
  useLayoutEffect(() => {
    const el = countRef.current;
    registerSpendTarget(el);
    return () => clearSpendTarget(el);
  }, []);

  useEffect(() => {
    const before = previous.current;
    previous.current = ledger;

    // Nothing to compare against on the first paint, and nothing that has
    // happened for the player to have caused.
    if (!before) return;

    // A new start inside a residence hands back a fresh, empty ledger. Spends
    // only ever accumulate within a round, so a total that has gone *down* is
    // a reset and not a refund — light nothing.
    if (clueSpent(ledger) < clueSpent(before)) return;

    const moved = movedKeys(before, ledger);
    if (moved.length === 0) return;

    // The corner answers the mark's arrival. Both the count and the line that
    // moved light together, so the eye that followed the mark up finds the
    // whole of the answer waiting: how much, and what for.
    const light = (countMoved: boolean) => {
      // Only when the number actually changed. An action can cost something
      // and move the count by nothing — the total floors at zero — and a
      // count that flashes while reading what it read before is a lie about
      // where the clue went. The itemised line still lights; it is the one
      // that has something true to say.
      if (countMoved) flashLit(countRef.current, 'var(--accent)');

      // What it was spent on, lit alongside how much — the itemised lines are
      // the part that makes a second, cheaper run thinkable.
      const list = breakdownRef.current;
      if (!list) return;
      for (const key of moved) {
        const line = list.querySelector<HTMLElement>(`[data-ledger-row="${key}"]`);
        // The credit is the one line already set in accent, so it cannot be
        // lit by accent. It lifts to ink instead.
        flashLit(line, key === 'recognitions' ? 'var(--ink)' : 'var(--accent)');
      }
    };

    // The figure on the mark is the change in the count, which is not the
    // price of the action: a correct claim is a credit, and the total floors
    // at zero, so an action can cost something and move the count by less.
    const delta = clues - clueTotal(before);
    const flying = delta !== 0 && flySpend(delta > 0 ? `+${delta}` : `−${-delta}`, () => light(true));

    // Nothing was sent, so nothing will arrive to be answered.
    if (!flying) light(delta !== 0);
  }, [ledger, clues]);

  if (variant === 'panel') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: 12,
            borderBottom: '1px solid var(--ink)',
            paddingBottom: 10,
          }}
        >
          {/* One line, not a column, and in the label's place: the breakdown
              is a gloss on the figure beside it, and a stack of five put the
              actions below out of reach on a short window. Until something
              has been spent there is nothing to break down, and the line says
              what the figure is instead. */}
          {rows.length > 0 || bonus > 0 ? (
            <div
              ref={breakdownRef}
              className="annot"
              style={{ fontSize: 9, letterSpacing: '0.16em', lineHeight: 1.6, color: 'var(--annotation)' }}
            >
              {rows.map((r, i) => (
                <span key={r.key} data-ledger-row={r.key}>
                  {i > 0 ? ' · ' : ''}
                  {r.text}
                </span>
              ))}
              {bonus > 0 && (
                <span className="ledger-credit" data-ledger-row="recognitions">
                  {rows.length > 0 ? ' · ' : ''}-{bonus}
                </span>
              )}
            </div>
          ) : (
            <span className="annot" style={{ fontSize: 9, letterSpacing: '0.2em', color: 'var(--annotation)' }}>
              Information used
            </span>
          )}
          <span
            className="mono"
            style={{ fontSize: 11, letterSpacing: '0.12em', color: 'var(--ink)', whiteSpace: 'nowrap' }}
          >
            <span ref={countRef} style={{ fontSize: 24, letterSpacing: 0 }}>
              {clues}
            </span>{' '}
            {clues === 1 ? 'clue' : 'clues'}
          </span>
        </div>

        {residence && residenceTotal(residence) > 0 && (
          <div className="annot" style={{ fontSize: 9, letterSpacing: '0.16em', color: 'var(--unknown)' }}>
            {startOrdinal(residence.selves.length + 1)} · {mapTotal}{' '}
            {mapTotal === 1 ? 'clue' : 'clues'} in all
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ textAlign: 'right' }}>
      <div className="chrome" style={{ color: 'var(--ink)' }}>
        {/* The sentence is dropped on a phone; the count never is. */}
        <span className="ledger-long" style={{ color: 'var(--annotation)' }}>
          Information used &nbsp;·&nbsp;{' '}
        </span>
        <span ref={countRef}>
          {clues} {clues === 1 ? 'clue' : 'clues'}
        </span>
      </div>

      {(rows.length > 0 || bonus > 0) && (
        <div ref={breakdownRef} className="annot ledger-breakdown" style={{ lineHeight: 1.9, marginTop: 6 }}>
          {rows.map((r) => (
            <div key={r.key} data-ledger-row={r.key}>
              {r.text}
            </div>
          ))}
          {/* Set apart and signed, because it is the only line that subtracts.
              Its colour is a class rather than an inline style so that lighting
              it — which writes an inline colour, then clears it — leaves it
              accent again rather than dropping it to the grey of its siblings. */}
          {bonus > 0 && (
            <div className="ledger-credit" data-ledger-row="recognitions">
              -{bonus}
            </div>
          )}
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

/** Which entries moved. Keyed, because the lit line has to be found again in
 *  the DOM after the text it is made of has already changed. */
function movedKeys(before: LedgerT, after: LedgerT): (keyof LedgerT)[] {
  const keys = Object.keys(after) as (keyof LedgerT)[];
  return keys.filter((k) => after[k] > before[k]);
}

function breakdownOf(ledger: LedgerT): { key: keyof LedgerT; text: string }[] {
  const rows: { key: keyof LedgerT; text: string }[] = [];
  const add = (key: keyof LedgerT, text: string) => rows.push({ key, text });
  if (ledger.expansions)
    add('expansions', `${ledger.expansions} ${ledger.expansions === 1 ? 'expansion' : 'expansions'}`);
  if (ledger.facts) add('facts', `${ledger.facts} ${ledger.facts === 1 ? 'reading' : 'readings'}`);
  if (ledger.names) add('names', `${ledger.names} ${ledger.names === 1 ? 'name' : 'names'}`);
  if (ledger.stories) add('stories', 'the world');
  if (ledger.declutters) add('declutters', 'the carried map');
  if (ledger.answers) add('answers', 'the answer');
  return rows;
}
