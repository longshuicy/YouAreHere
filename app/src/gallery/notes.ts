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
      'How much of a world is invisible from where a character stands. A protagonist sits at 1× and already sees everyone; the far end is someone with a few ties and the whole world standing behind them.',
    blind:
      'Everyone but the outermost character, who decides the figure alone, and characters with a single tie, where one neighbour decides theirs.',
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
