import { NameLink } from './NameLink';
import { WikiLink } from './WikiLink';

/**
 * The title of a page about one thing: a small line above, the name in the
 * accent, and under it what it belongs to, how many people are in it, and its
 * Wikipedia article. The reveal, a character page and a world page all open
 * with this, so the three cannot drift into three versions of the same head.
 */
export function PageTitle({
  eyebrow,
  title,
  worldTitle,
  onOpenWorld,
  cast,
  wiki,
}: {
  /** A line above the title, where the page needs one: the reveal's verdict. */
  eyebrow?: string;
  title: string;
  /** What the title stands in. Absent on a world's own page, which is the world. */
  worldTitle?: string;
  onOpenWorld?: () => void;
  cast: number;
  wiki?: { title: string; lang?: string } | null;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {eyebrow && (
        <div className="annot" style={{ fontSize: 10, letterSpacing: '0.24em', color: 'var(--annotation)' }}>
          {eyebrow}
        </div>
      )}
      <h1
        style={{
          margin: 0,
          fontWeight: 400,
          fontSize: 'clamp(30px, 6vw, 48px)',
          lineHeight: 1.02,
          color: 'var(--accent)',
        }}
      >
        {title}
      </h1>
      <div
        className="annot"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 18,
          flexWrap: 'wrap',
          paddingTop: 6,
          fontSize: 10,
          letterSpacing: '0.18em',
          color: 'var(--annotation)',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {worldTitle && (
            <>
              In{' '}
              {onOpenWorld ? (
                <NameLink onClick={onOpenWorld}>{worldTitle}</NameLink>
              ) : (
                <span style={{ color: 'var(--ink)' }}>{worldTitle}</span>
              )}{' '}
              ·{' '}
            </>
          )}
          {cast} characters
        </span>
        {wiki?.title && <WikiLink title={wiki.title} lang={wiki.lang ?? 'en'} />}
      </div>
    </div>
  );
}
