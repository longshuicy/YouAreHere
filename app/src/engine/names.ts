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

/** Whether every character of `q`, in order, occurs somewhere in `text` — not
 * necessarily together. Cheap (linear in `text`'s length) typo tolerance:
 * "hmlt" still finds "Hamlet". Kept apart from `resolveName`'s exact match on
 * purpose — a suggestion may guess at what you meant, but whether a claim is
 * right or wrong never does. */
function isSubsequence(q: string, text: string): boolean {
  if (!q) return false;
  let i = 0;
  for (const ch of text) {
    if (ch === q[i]) i += 1;
    if (i === q.length) return true;
  }
  return false;
}

/**
 * Name suggestions, shared by the guess screen and the claim field.
 *
 * Drawn from every universe passed in, which is EVERY loaded story unless the
 * caller has already narrowed it. That narrowing matters: a list scoped to one
 * book, offered before the player has any business knowing which book they are
 * in, would tell them how large that book's cast is — the one real leak either
 * field has. Once the world is already known (told, guessed, or chosen up
 * front), scoping to it costs nothing further and the caller does so.
 *
 * The threshold is two characters rather than three. Three was set with Latin
 * names in mind and quietly excluded 紅樓夢, where a great many names are two
 * characters long and the field would never have suggested them at all.
 *
 * A first pass matches substrings, which is exact enough to rank above a
 * typo-tolerant guess. Only once that pass has not filled the list does a
 * second, subsequence-fuzzy pass run over what is left — a query a plain
 * substring search would have missed still turns something up, without ever
 * pushing a precise match down to make room for a loose one.
 */
export function suggestNames(
  universes: Iterable<Universe>,
  query: string,
  { limit = 6, minLength = 2 }: { limit?: number; minLength?: number } = {},
): string[] {
  const q = normalizeName(query);
  if ([...q].length < minLength) return [];
  const list = [...universes];
  const seen = new Set<string>();
  const out: string[] = [];

  const collect = (match: (candidate: string) => boolean) => {
    for (const u of list) {
      for (const n of u.nodes) {
        if (out.length >= limit) return;
        const key = normalizeName(n.n);
        if (seen.has(key)) continue;
        const hit = match(key) || (n.a ?? []).some((a) => match(normalizeName(a)));
        if (!hit) continue;
        seen.add(key);
        out.push(n.n);
      }
    }
  };

  collect((candidate) => candidate.includes(q));
  if (out.length < limit) collect((candidate) => isSubsequence(q, candidate));
  return out;
}
