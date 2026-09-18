import { scaleLinear, scaleSqrt } from 'd3-scale';

/** Degree is encoded as size, but within a tight range — the style sheet draws
 * nodes between 6 and 9.5 units, so the diagram reads as one family of marks
 * rather than a bubble chart. */
export const nodeRadius = scaleSqrt().domain([1, 40]).range([6, 9.5]).clamp(true);

/** Hairline to 3.4px, per the style sheet's tie scale. */
export const tieWidth = scaleLinear().domain([0, 1]).range([1, 3.4]).clamp(true);

/** Ties darken as they thicken: #9A9287 hairline → #7C756A strong. */
export const tieColor = scaleLinear<string>()
  .domain([0, 1])
  .range(['#9a9287', '#7c756a'])
  .clamp(true);
