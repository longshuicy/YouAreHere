/**
 * A one-line introduction to each world, shown once the world is settled —
 * named correctly, or chosen before play.
 *
 * These belong in the universe file — the emitter should grow a `blurb` field
 * and the client should prefer it (see `blurbFor`). Until the pipeline writes
 * one, they live here.
 *
 * A blurb names no character. It describes the shape and texture of a world, to
 * confirm and colour in a world the player has just settled — without handing
 * them the cast they are still trying to place themselves in. It also avoids
 * saying how large the cast is, which the guess screen goes to some trouble to
 * keep hidden.
 */
const FALLBACK: Record<string, string> = {
  asoiaf:
    'Seven kingdoms and a dozen great houses, told across five volumes and a great many rival points of view.',
  bible:
    'Sixty-six books of genealogy, exile and prophecy, where a tie means two people share a single verse.',
  starwars: 'A galaxy of pilots, senators and smugglers, across seven films.',

  // Shakespeare, one world per play — except where the plays genuinely
  // interlock, and the world is the cycle rather than the evening.
  'shakespeare-english-histories':
    'A single dynastic quarrel running through eight reigns, with a tavern comedy hanging off the side of it.',
  'shakespeare-rome': 'A republic turning into an empire, across two plays and three continents.',
  'shakespeare-hamlet': 'A cold northern court, a garrison on the walls, and a household coming apart inside it.',
  'shakespeare-macbeth': 'A Scottish war camp and a castle, where the guest list keeps getting shorter.',
  'shakespeare-king-lear': 'A kingdom divided three ways, and two families ruined in parallel.',
  'shakespeare-othello': 'A garrison posting on a Mediterranean island, small enough that everyone is in earshot.',
  'shakespeare-romeo-and-juliet': 'One Italian town, two households, and a street feud with a body count.',
  'shakespeare-the-tempest': 'An island with a very short list of inhabitants, and a shipwreck that lengthens it.',
  'shakespeare-twelfth-night': 'A seaside household of mourners and hangers-on, disordered by a mistaken identity.',
  'shakespeare-much-ado-about-nothing': 'A country house after a war, given over to matchmaking and slander.',
  'shakespeare-a-midsummer-nights-dream': 'A wood outside a city, with a court, a fairy court, and a troupe of amateurs in it.',
  'shakespeare-as-you-like-it': 'A usurped dukedom and the forest its exiles run to.',
  'shakespeare-the-merchant-of-venice': 'A trading city where friendship, money and law are the same conversation.',
  'shakespeare-the-taming-of-the-shrew': 'A merchant town of fathers, daughters and suitors in disguise.',
  'shakespeare-the-comedy-of-errors': 'A port city in which two sets of twins are repeatedly mistaken for each other.',
  'shakespeare-two-gentlemen-of-verona': 'Two friends, one court, and a journey that puts them in love with the same person.',
  'shakespeare-loves-labors-lost': 'A court that swears off company, and the embassy that arrives the next day.',
  'shakespeare-measure-for-measure': 'A city under a sudden enforcement of old laws, seen from the prison and the convent.',
  'shakespeare-alls-well-that-ends-well': 'A sickbed, a court, and a war abroad, tied together by an unwanted marriage.',
  'shakespeare-the-winters-tale': 'Two kingdoms and sixteen years, half tragedy at court and half pastoral.',
  'shakespeare-cymbeline': 'A British court under Roman pressure, with an exile, a wager and a forest.',
  'shakespeare-pericles': 'A voyage through several Mediterranean cities, each with its own small cast.',
  'shakespeare-troilus-and-cressida': 'The Trojan war in its tenth year, told from both camps at once.',
  'shakespeare-coriolanus': 'Rome and its enemy city, and a soldier who cannot be a politician.',
  'shakespeare-titus-andronicus': 'A victorious general, a captive royal family, and a revenge that consumes both.',
  'shakespeare-timon-of-athens': 'A rich man, his creditors and his flatterers, then the same city without him.',
  'shakespeare-king-john': 'An English reign contested from France, with a papal legate and a disputed heir.',
  'shakespeare-henry-viii': 'A Tudor court of cardinals, queens and commissions, where the falls are the plot.',
};

export function blurbFor(universe: { id: string; blurb?: string }): string | null {
  return universe.blurb ?? FALLBACK[universe.id] ?? null;
}
