import { wikipediaUrl } from '../data/wikipedia';

/** Quiet external link to a Wikipedia article, when enrichment shipped a title. */
export function WikiLink({
  title,
  lang = 'en',
  label = 'Wikipedia',
}: {
  title: string;
  lang?: string;
  label?: string;
}) {
  return (
    <a
      className="wiki-pill"
      href={wikipediaUrl(title, lang)}
      target="_blank"
      rel="noopener noreferrer"
      style={{ pointerEvents: 'auto' }}
    >
      {label}
    </a>
  );
}
