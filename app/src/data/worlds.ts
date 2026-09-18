/**
 * A one-line introduction to each world, shown once the player has named the
 * world correctly.
 *
 * These belong in the universe file — the emitter should grow a `blurb` field
 * and the client should prefer it (see `blurbFor`). Until the pipeline writes
 * one, they live here.
 *
 * A blurb names no character. It describes the shape and texture of a world, to
 * confirm and colour in a world the player has just correctly named — without
 * handing them the cast they are still trying to place themselves in.
 */
const FALLBACK: Record<string, string> = {
  asoiaf:
    'Seven kingdoms and a dozen great houses, told across five volumes and a great many rival points of view.',
  shakespeare:
    'Every play counted as a single world — courts, battlefields, households, and the occasional forest.',
  starwars: 'A galaxy of pilots, senators and smugglers, across nine films.',
};

export function blurbFor(universe: { id: string; blurb?: string }): string | null {
  return universe.blurb ?? FALLBACK[universe.id] ?? null;
}
