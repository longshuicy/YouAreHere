import type { CSSProperties, ReactNode } from 'react';

/**
 * A name in running prose that happens to be a link.
 *
 * `annot-link` is the chrome's own voice — tracked mono, uppercase, a rule
 * under it — right for "Start again" and wrong for a person's name sitting in
 * a sentence set in the serif. This inherits whatever type it lands in and
 * marks itself with an underline rather than a shout, so a reading stays a
 * reading with a few of its names turned clickable rather than turning into a
 * list of buttons.
 */
export function NameLink({
  children,
  onClick,
  style,
}: {
  children: ReactNode;
  onClick: () => void;
  /** For the rare row that needs the link to behave like the plain span it
   * replaced — an ellipsis-truncated cell wants `display: inline` rather than
   * a button's default `inline-block`. */
  style?: CSSProperties;
}) {
  return (
    <button type="button" className="name-link" onClick={onClick} style={style}>
      {children}
    </button>
  );
}
