import type { NodeIndex, Universe } from '../types';

/**
 * Name matching, shared by the guess screen and by CLAIM.
 *
 * Claiming a neighbour costs a clue when it is wrong, so a misspelling must not
 * be charged as a mistaken reading of the graph. The normalisation is therefore
 * generous: case, accents, punctuation and doubled spaces are all noise. It
 * stops short of fuzzy distance — "wrong by one letter" and "wrong person" are
 * not the same claim, and guessing which one the player meant would be the game
 * answering for them.
 */
export function normalizeName(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[.'’`"“”_,;:!?()[\]-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The node this text names in this universe, or null. Aliases count. */
export function resolveName(universe: Universe, text: string): NodeIndex | null {
  const q = normalizeName(text);
  if (!q) return null;
  for (const n of universe.nodes) {
    if (normalizeName(n.n) === q) return n.i;
  }
  for (const n of universe.nodes) {
    if ((n.a ?? []).some((a) => normalizeName(a) === q)) return n.i;
  }
  return null;
}

/**
 * The monogram an expansion reveals: the first character of a name, and how
 * long the name is.
 *
 * This is the hypothesis generator the economy was missing. Structure alone can
 * confirm a guess but cannot produce one — nobody recognises a novel by its
 * degree distribution — so expanding used to add hollow circles and nothing a
 * reader could think with. An initial is enormous human-legible signal at no
 * cost in data, and it is still a long way short of a name.
 */
export function monogramOf(name: string): { initial: string; length: number } {
  const trimmed = name.trim();
  return { initial: [...trimmed][0] ?? '?', length: [...trimmed].length };
}

/**
 * Name suggestions, shared by the guess screen and the claim field.
 *
 * Drawn from EVERY loaded story, never just the one being played. That is the
 * point: a list scoped to one book would tell the player how large that book's
 * cast is, which is the only real leak either field has. Names are deduplicated
 * and carry no hint of which story they came from, so the same list is safe to
 * offer anywhere.
 *
 * The threshold is two characters rather than three. Three was set with Latin
 * names in mind and quietly excluded 紅樓夢, where a great many names are two
 * characters long and the field would never have suggested them at all.
 */
export function suggestNames(
  universes: Iterable<Universe>,
  query: string,
  { limit = 6, minLength = 2 }: { limit?: number; minLength?: number } = {},
): string[] {
  const q = normalizeName(query);
  if ([...q].length < minLength) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of universes) {
    for (const n of u.nodes) {
      if (out.length >= limit) return out;
      const hit =
        normalizeName(n.n).includes(q) || (n.a ?? []).some((a) => normalizeName(a).includes(q));
      if (!hit) continue;
      const key = normalizeName(n.n);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(n.n);
    }
  }
  return out;
}
