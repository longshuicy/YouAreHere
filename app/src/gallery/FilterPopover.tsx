import { useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';

/**
 * A ledger's filter: one button beside the search, and behind it a panel of
 * chips grouped by kind.
 *
 * Choices are drafted inside the panel and applied by its button, which names
 * how many rows the draft would leave — so a reader can try a filter, see that
 * it leaves nine, and back out without the table redrawing under them each
 * time. What the chips are is up to the ledger; this owns the button, the
 * panel, the draft and the closing.
 */

function FilterIcon() {
  return (
    <svg width={12} height={10} viewBox="0 0 12 10" aria-hidden>
      <line x1={0} y1={1} x2={12} y2={1} stroke="currentColor" strokeWidth={1.2} />
      <line x1={2} y1={5} x2={10} y2={5} stroke="currentColor" strokeWidth={1.2} />
      <line x1={4} y1={9} x2={8} y2={9} stroke="currentColor" strokeWidth={1.2} />
    </svg>
  );
}

export function FilterPopover<D>({
  label,
  title,
  applied,
  empty,
  active,
  countFor,
  noun,
  onApply,
  footnote,
  children,
}: {
  /** What the panel is called to a screen reader. */
  label: string;
  title: string;
  applied: D;
  /** The draft Clear resets to. */
  empty: D;
  /** How many choices are in force, printed on the button. */
  active: number;
  countFor: (draft: D) => number;
  /** Singular and plural of what is being counted. */
  noun: [string, string];
  onApply: (next: D) => void;
  footnote?: string;
  children: (draft: D, setDraft: Dispatch<SetStateAction<D>>) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<D>(applied);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = () => {
    if (!open) setDraft(applied);
    setOpen(!open);
  };

  const count = countFor(draft);

  return (
    <div className="filter-wrap" ref={wrap}>
      <button
        type="button"
        className="filter-button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={toggle}
      >
        <FilterIcon />
        Filter
        {active > 0 && <span className="filter-button-count">{active}</span>}
      </button>

      {open && (
        <div className="filter-pop" role="dialog" aria-label={label}>
          <div className="filter-pop-head">
            <span className="filter-pop-title">{title}</span>
            <button
              type="button"
              className="annot-link"
              style={{ fontSize: 9, padding: '4px 2px 3px' }}
              onClick={() => {
                setDraft(empty);
                onApply(empty);
              }}
            >
              Clear
            </button>
          </div>

          {children(draft, setDraft)}

          <div className="filter-pop-foot">
            <span className="annot filter-pop-key">{footnote}</span>
            <button
              type="button"
              className="filter-apply"
              onClick={() => {
                onApply(draft);
                setOpen(false);
              }}
            >
              Show {count.toLocaleString()} {count === 1 ? noun[0] : noun[1]}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="filter-group">
      <span className="annot filter-group-label">{label}</span>
      <div>{children}</div>
    </div>
  );
}

export function FilterChip({
  on,
  dim,
  title,
  count,
  onClick,
  children,
}: {
  on: boolean;
  dim?: boolean;
  title?: string;
  count?: number;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      className={`filter-chip${on ? ' on' : ''}${dim ? ' dim' : ''}`}
      title={title}
      onClick={onClick}
    >
      {children}
      {count !== undefined && <span className="filter-chip-count">{count.toLocaleString()}</span>}
    </button>
  );
}
