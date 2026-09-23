import { scaleLinear } from 'd3-scale';

/** Presence is encoded as size, but within a tight range — the style sheet
 * draws nodes between 6 and 9.5 units, so the diagram reads as one family of
 * marks rather than a bubble chart.
 *
 * The input is `VisibleNode.presence`, 0 to 1, already log-normalised against
 * the world's fullest presence, so the curve here is linear. It used to be a
 * square root over a raw count of ties, which is the measure that draws the
 * Bible's genealogy fillers larger than Moses. */
export const nodeRadius = scaleLinear().domain([0, 1]).range([6, 9.5]).clamp(true);

/** A residence's earlier map, outside this start's own walk: present but set
 * back. */
export const REMOTE_OPACITY = 0.1;

/** Hairline to 3.4px, per the style sheet's tie scale. */
export const tieWidth = scaleLinear().domain([0, 1]).range([1, 3.4]).clamp(true);

/** Ties darken as they thicken: #9A9287 hairline → #7C756A strong. */
export const tieColor = scaleLinear<string>()
  .domain([0, 1])
  .range(['#9a9287', '#7c756a'])
  .clamp(true);
