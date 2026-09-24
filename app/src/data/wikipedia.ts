/** Build a Wikipedia article URL from a sitelink page title. */

export function wikipediaUrl(title: string, lang = 'en'): string {
  const slug = title.trim().replace(/ /g, '_');
  return `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(slug)}`;
}
