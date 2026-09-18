// Types matching the REAL committed data shape emitted by pipeline/emit/writer.py,
// not the (partly aspirational) shapes described in docs/Data & puzzle pipeline.md.
// See docs/Data & puzzle pipeline.md for the reconciled description.

export type UniverseId = string;
export type NodeIndex = number;

/** data/index.json — loaded at boot. */
export interface PlayableCounts {
  total: number;
  /** Present today: difficulty scoring has not run, so every playable start is unbanded. */
  unbanded?: number;
  /** Not present in the current data. Kept optional so the app degrades gracefully
   * once a real pipeline run adds band counts. */
  approachable?: number;
  hard?: number;
}

export interface IndexUniverseEntry {
  id: UniverseId;
  file: string;
  nodes: number;
  edges: number;
  playable: PlayableCounts;
}

export interface IndexFile {
  pipelineVersion: string;
  banded: boolean;
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

/** Puzzle records currently carry no `band` or `reveal` — those fields are added
 * by a difficulty-scoring pipeline stage that has not been run yet. Both are
 * optional so the app works today and picks them up automatically once emitted. */
export interface PuzzleRecord {
  id: string;
  you: NodeIndex;
  startRadius: number;
  band?: 'approachable' | 'hard';
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
}

export interface UniverseMeta {
  id: UniverseId;
  revealOnly: true;
  nodes: Record<string, MetaRecord>;
  /** keys are "i-j" strings matching edge source/target order as emitted */
  edges: Record<string, MetaRecord>;
  sources: unknown[];
}
