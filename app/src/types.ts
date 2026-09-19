// Types matching the REAL committed data shape emitted by pipeline/emit/writer.py,
// not the (partly aspirational) shapes described in docs/Data & puzzle pipeline.md.
// See docs/Data & puzzle pipeline.md for the reconciled description.

export type UniverseId = string;
export type NodeIndex = number;

/** data/index.json — loaded at boot. */
export interface PlayableCounts {
  total: number;
  /** How this world's starts are spread along the difficulty scale, in
   * `IndexFile.easeBuckets` equal buckets from 0 to 1. Lets the client choose
   * which world to fetch for a given slider position, before it has fetched any. */
  histogram?: number[];
}

export interface IndexUniverseEntry {
  id: UniverseId;
  file: string;
  /** The world's name. Present so the story list can be offered before the
   * universes themselves have been fetched. */
  title: string;
  nodes: number;
  edges: number;
  playable: PlayableCounts;
}

export interface IndexFile {
  pipelineVersion: string;
  /** Resolution of every `PlayableCounts.histogram`. */
  easeBuckets?: number;
  universes: IndexUniverseEntry[];
}

/** A node as emitted in <universe>.json. `a` (aliases) is omitted when empty. */
export interface UniverseNode {
  i: NodeIndex;
  n: string;
  x: number;
  y: number;
  a?: string[];
}

/** [sourceIdx, targetIdx, weight, rankFromSource, rankFromTarget] */
export type UniverseEdge = [NodeIndex, NodeIndex, number, number, number];

export interface PuzzleRecord {
  id: string;
  you: NodeIndex;
  startRadius: number;
  /** How findable this start is, 0 (obscure) to 1 (recognisable). Scored at
   * build time; the difficulty slider selects along it. */
  ease?: number;
  reveal?: {
    line: string;
    stat: { kind: string; value: number };
  };
}

export interface Provenance {
  dataset: string;
  edgeDefinition: string;
  sourceUnit: string;
  weightSemantics: string;
  filters?: Record<string, unknown>;
  license?: Record<string, unknown>;
  attribution?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface Universe {
  id: UniverseId;
  title: string;
  accent: string;
  /** A one-line introduction to the world, shown when Locate is bought. Not yet
   * emitted by the pipeline; see data/worlds.ts for the interim source. */
  blurb?: string;
  nodes: UniverseNode[];
  edges: UniverseEdge[];
  playable: NodeIndex[];
  puzzles: PuzzleRecord[];
  provenance: Provenance;
}

/** <universe>.meta.json — reveal-only, fetched only when the reveal fires. */
export interface MetaRecord {
  facts: Record<string, unknown>;
  line?: string;
  /** The signals behind the difficulty score, carried for playable starts only.
   * Withheld from the universe file, where they would be a far sharper hint
   * than `ease`; shipped here because this file is the reveal's. */
  signals?: {
    /** Characters anywhere in the catalogue presenting the same shape as this
     * one. Zero means the shape is unique across all 32 worlds. */
    lookAlikes: number;
    prominence: number;
    company: number;
  };
}

/** The discrete attributes the sidecar holds for a character. Every field is
 * optional and most are absent outside the six enriched worlds. */
export interface NodeFacts {
  books?: string[];
  unit?: string;
  corpusSize?: number;
  gender?: string;
  houses?: string[];
  titles?: string[];
  culture?: string;
  born?: string;
  died?: string;
  pov?: unknown;
}

export interface UniverseMeta {
  id: UniverseId;
  revealOnly: true;
  nodes: Record<string, MetaRecord>;
  /** keys are "i-j" strings matching edge source/target order as emitted */
  edges: Record<string, MetaRecord>;
  sources: unknown[];
}
