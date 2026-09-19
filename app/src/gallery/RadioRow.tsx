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
  options: { key: T; label: string; title?: string }[];
  value: T;
  onChange: (key: T) => void;
  /** Options that are real but cannot carry the weight the others can. */
  dim?: (key: T) => boolean;
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
          </button>
        );
      })}
    </div>
  );
}
