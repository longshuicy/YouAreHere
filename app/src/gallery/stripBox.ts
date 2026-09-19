/**
 * The drawn height of each strip, including the rows of labels around it.
 *
 * Callers that place the two strips side by side have to make them the same
 * height, or the prose underneath starts on two different lines. The degree
 * strip carries two rows of labels and the horizon strip one, so matching them
 * by eye is wrong by about fourteen pixels. Solved here rather than guessed at
 * the call site, so the drawn box and the reported box cannot drift apart.
 */

export function degreeBarsBox(height: number, labelSize = 7, showCounts = true, showBands = true) {
  return (showCounts ? labelSize + 4 : 0) + height + 1 + (showBands ? labelSize + 6 : 0);
}

export function horizonStripBox(height: number, labelMarks = false) {
  return height + (labelMarks ? 14 : 0);
}

/** The bar height that makes a degree strip exactly `box` tall. */
export function degreeBarsHeightFor(box: number, labelSize = 7, showCounts = true, showBands = true) {
  return box - degreeBarsBox(0, labelSize, showCounts, showBands);
}

/** The tick height that makes a horizon strip exactly `box` tall. */
export function horizonStripHeightFor(box: number, labelMarks = false) {
  return box - horizonStripBox(0, labelMarks);
}
