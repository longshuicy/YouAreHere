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
  congress:
    'The House and Senate across sixteen Congresses (~1973–2004), tied by the bills they put their names on.',
  friends:
    'Six people in a Manhattan orbit, ten seasons of apartments, coffee shop and guest stars.',
  hongloumeng:
    '一個繁华家族走向衰败，一场青春与爱情终成大梦。',
  iliad:
    'A ten-year siege in its last weeks, two camps on a plain, and a quarrel in one of them.',
  lesmiserables:
    'Paris after the Restoration, a hunt that lasts twenty years, and a barricade that lasts one night.',
  odyssey:
    'A ten-year voyage home, a household of suitors waiting at the other end of it.',
  sanguoyanyi:
    '一個帝國分裂為三，一場連續百年的戰爭與計謀。',
  shiji:
    '從黃帝到漢武，本紀世家列傳連成一部通史。',
  shuihuzhuan:
    '一百零八個好漢被逼上梁山，一座水泊裡的義軍朝廷。',
  starwars: 'A galaxy of pilots, senators and smugglers, across seven films.',
  xiyouji:
    '取經的路上，一僧三徒，一路上的神佛與妖魔。',

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

/**
 * How likely a player is to be able to *name* this world, which is a different
 * question from how hard the diagram is to read.
 *
 * `ease` in the pipeline measures structural distinctiveness — how many other
 * characters wear the same shape. It is a measurement, and `difficulty.py` is
 * right to refuse to cut it into bands. This is the opposite kind of number: a
 * judgement about audiences, with no measurement under it anywhere, so decimals
 * here would be a precision that does not exist. Three levels, and the boundary
 * between them is admittedly arguable.
 *
 *   2  a player could plausibly name it unprompted
 *   1  they have heard of it and have probably not read it
 *   0  they have not heard of it
 *
 * The scale is written for an English-speaking player, which is a choice and not
 * a fact about the books — see `CHINESE_CLASSICS`. Keyed by universe id rather
 * than by source, because `shakespeare` is one source holding both ends of the
 * range: Hamlet and Pericles come out of the same entry in `sources.py`.
 *
 * Lives here for the same reason the blurbs do, and should move into the
 * emitter with them.
 */
const FAMILIARITY: Record<string, 0 | 1 | 2> = {
  asoiaf: 2,
  bible: 2,
  congress: 2,
  friends: 2,
  starwars: 2,
  lesmiserables: 2,
  iliad: 1,
  odyssey: 1,

  // Read as an English-speaking player: a syllabus most of them never sat.
  hongloumeng: 0,
  sanguoyanyi: 0,
  shuihuzhuan: 0,
  xiyouji: 0,
  shiji: 0,

  // Shakespeare. The ones everyone can name, then the ones they have heard of,
  // then the ones that are a surprise even to people who like the plays.
  'shakespeare-hamlet': 2,
  'shakespeare-macbeth': 2,
  'shakespeare-romeo-and-juliet': 2,
  'shakespeare-a-midsummer-nights-dream': 2,
  'shakespeare-king-lear': 2,
  'shakespeare-othello': 1,
  'shakespeare-the-tempest': 1,
  'shakespeare-twelfth-night': 1,
  'shakespeare-much-ado-about-nothing': 1,
  'shakespeare-the-merchant-of-venice': 1,
  'shakespeare-the-taming-of-the-shrew': 1,
  'shakespeare-as-you-like-it': 1,
  'shakespeare-the-comedy-of-errors': 1,
  'shakespeare-rome': 1,
  'shakespeare-english-histories': 1,
  'shakespeare-titus-andronicus': 0,
  'shakespeare-troilus-and-cressida': 0,
  'shakespeare-coriolanus': 0,
  'shakespeare-timon-of-athens': 0,
  'shakespeare-pericles': 0,
  'shakespeare-cymbeline': 0,
  'shakespeare-the-winters-tale': 0,
  'shakespeare-measure-for-measure': 0,
  'shakespeare-alls-well-that-ends-well': 0,
  'shakespeare-two-gentlemen-of-verona': 0,
  'shakespeare-loves-labors-lost': 0,
  'shakespeare-king-john': 0,
  'shakespeare-henry-viii': 0,
};

/** Worlds whose band above is an accident of which language the player reads,
 * not of how famous the book is. 三國演義 is a household story for a great many
 * people; it scores 0 above only because the default audience is an
 * English-speaking one. The knob raises these a band and lowers nothing: a
 * reader of the Chinese classics still knows Hamlet. */
const CHINESE_CLASSICS: ReadonlySet<string> = new Set([
  'hongloumeng',
  'sanguoyanyi',
  'shuihuzhuan',
  'xiyouji',
  'shiji',
]);

/** The band `pickWorld` should weigh, for this player. Unknown worlds — a source
 * added and not yet scored — come back at the top band, so a new world is
 * offered freely rather than quietly buried. */
export function familiarityFor(universeId: string, readsChineseClassics = false): number {
  const band = FAMILIARITY[universeId] ?? 2;
  if (readsChineseClassics && CHINESE_CLASSICS.has(universeId)) return Math.min(2, band + 1);
  return band;
}

/** Worlds in the catalogue that nobody has given a band. Not thrown at build
 * time — the pipeline does not know about this file yet — but reported at the
 * console on boot, so world 42 cannot ship unscored in silence. */
export function unscoredWorlds(ids: readonly string[]): string[] {
  return ids.filter((id) => !(id in FAMILIARITY));
}
