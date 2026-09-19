/**
 * Choosing one of a set, marked as one.
 *
 * These were styled as tabs, which was wrong twice over: a tab implies a
 * separate surface behind it, and an ordering control is plainly not that. They
 * are radio groups — `role` says so to anyone not looking at the screen, and the
 * mark before the chosen label says so to anyone who is. The mark is the same
 * small accent dot the difficulty scale uses for its thumb, so "this one" reads
 * the same way everywhere.
 */
export function RadioRow<T extends string>({
  label,
  options,
  value,
  onChange,
  dim,
}: {
  label: string;
  /**
   * `T` is inferred from `value` alone, and from nothing else.
   *
   * Every call site passes its options as an inline array literal, where the
   * `key` strings widen to `string`. TypeScript was taking that as a candidate
   * for `T`, settling on `string`, and then rejecting the `useState` setter
   * handed to `onChange` — which is narrowed to the real union and cannot
   * accept an arbitrary string. `NoInfer` takes the other positions out of the
   * running, so `T` comes from the value being displayed, which is the one
   * place it is unambiguous.
   */
  options: { key: NoInfer<T>; label: string; title?: string; detail?: string }[];
  value: T;
  onChange: (key: NoInfer<T>) => void;
  /** Options that are real but cannot carry the weight the others can. */
  dim?: (key: NoInfer<T>) => boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}
    >
      <span className="annot" style={{ fontSize: 9, minWidth: 54 }}>
        {label}
      </span>
      {options.map((option) => {
        const active = value === option.key;
        return (
          <button
            key={option.key}
            role="radio"
            aria-checked={active}
            title={option.title}
            onClick={() => onChange(option.key)}
            className="mono"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 10,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: active ? 'var(--accent)' : 'var(--annotation)',
              padding: '6px 2px 4px 2px',
              opacity: !active && dim?.(option.key) ? 0.55 : 1,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                flexShrink: 0,
                background: active ? 'var(--accent)' : 'transparent',
                border: `1px solid ${active ? 'var(--accent)' : 'var(--leader)'}`,
              }}
            />
            {option.label}
            {option.detail != null && (
              <span style={{ color: 'var(--unknown)', letterSpacing: '0.08em' }}>{option.detail}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
