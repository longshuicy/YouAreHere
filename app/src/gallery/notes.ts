/**
 * What each figure measures, and what it cannot see.
 *
 * The gallery doc makes this a shipping requirement rather than a courtesy: a
 * number with no stated blind spot reads as authority it has not earned, and
 * every figure here is a measurement of a co-appearance graph — a proxy for a
 * story rather than the story itself.
 */
export interface MetricNote {
  measures: string;
  blind: string;
}

export const METRIC_NOTES: Record<string, MetricNote> = {
  concentration: {
    measures: 'How much of a world a few people carry. Low is an ensemble, high is a star system.',
    blind: 'Who. A two-hander and a tyranny score alike.',
  },
  camps: {
    measures: 'How cleanly the cast splits into groups that mostly appear among themselves.',
    blind: 'Small factions, which get swallowed by larger ones.',
  },
  horizon: {
    measures:
      'How much a character\u2019s second ring multiplies their first: knowing two people and reaching nineteen is 9.5×. The far end is someone with a few ties and a great deal of world standing behind them.',
    blind:
      'How much world that is. The ratio names no cast size, so 9.5× in a twenty-hander and 74.5× in a world of six hundred both describe a bit part — in one case reaching everyone, in the other a quarter of them. Also everyone but the outermost character, who decides the card\u2019s figure alone.',
  },
  centre: {
    measures:
      'How much of the cast a character holds within two hops, counting the people they know themselves at full weight and the people those people know at half. 100% would be knowing the entire world personally. Plain two-hop reach was tried for this column and is unreadable: in half the catalogue every character reaches everyone, and the figure is 100% all the way down.',
    blind:
      'Anything past two hops, and who those people are — a character at the heart of one camp and a go-between who holds two camps apart can score alike. In a small play, where every second ring runs out of cast, it reduces to who simply knows the most people.',
  },
  ties: {
    measures: 'How many people each character appears with, in fixed bands.',
    blind: 'Everything about who those people are.',
  },
};

export function noteTooltip(key: string): string | undefined {
  const note = METRIC_NOTES[key];
  return note ? `${note.measures}\n\nBlind to: ${note.blind}` : undefined;
}
