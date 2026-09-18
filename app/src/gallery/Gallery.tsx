import { useMemo, useState } from 'react';
import { BrandMark } from '../render/MarginLinks';
import type { Universe } from '../types';
import { Fingerprint } from './Fingerprint';
import { METRIC_NOTES, noteTooltip } from './notes';
import { measureWorld, type CharacterMetrics, type WorldMetrics } from './metrics';

/**
 * The gallery's front page: one card per loaded world, drawn identically.
 *
 * Anonymising *worlds* rather than characters, which is what the earlier draft
 * proposed and what made it wallpaper — a grid of unlabelled ego networks has no
 * reason for its sequence, and nothing to compare one cell against another with.
 * A world's card has four figures on fixed scales, so two cards side by side are
 * a comparison rather than a texture.
 *
 * Everything is computed here, from the graphs already in memory. See
 * `metrics.ts` for why nothing is fetched, cached or baked.
 */

type SortKey = 'title' | 'size' | 'concentration' | 'modularity' | 'horizon';

const SORTS: { key: SortKey; label: string; of: (w: WorldMetrics) => number | string }[] = [
  { key: 'title', label: 'Title', of: (w) => w.title },
  { key: 'size', label: 'Cast', of: (w) => -w.nodes },
  { key: 'concentration', label: 'Concentration', of: (w) => -w.concentration },
  { key: 'modularity', label: 'Camps', of: (w) => -w.modularity },
  { key: 'horizon', label: 'Horizon', of: (w) => -w.horizonSpread },
];

function StepCurve({ curve, of }: { curve: number[]; of: number }) {
  const width = 88;
  const height = 22;
  const span = Math.max(1, of - 1);
  const stepWidth = width / (curve.length - 1);
  const points: string[] = [];
  curve.forEach((value, hop) => {
    const y = height - (Math.min(value, span) / span) * (height - 2) - 1;
    points.push(`${hop * stepWidth},${y}`);
    if (hop < curve.length - 1) points.push(`${(hop + 1) * stepWidth},${y}`);
  });
  return (
    <svg width={width} height={height + 1} aria-hidden style={{ display: 'block' }}>
      <polyline points={points.join(' ')} fill="none" stroke="var(--tie-strong)" strokeWidth={1.4} />
      <line x1={0} y1={height + 0.5} x2={width} y2={height + 0.5} stroke="var(--rule)" strokeWidth={1} />
    </svg>
  );
}

function CharacterRow({ character, of }: { character: CharacterMetrics; of: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '6px 0' }}>
      <div style={{ width: 88, flexShrink: 0 }}>
        <StepCurve curve={character.horizonCurve} of={of} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--serif)', fontSize: 16, color: 'var(--ink)' }}>
          {character.name}
        </div>
        <div className="annot" style={{ fontSize: 9 }}>
          knows {character.degree} · reaches {character.reach}
        </div>
      </div>
      <div className="mono" style={{ fontSize: 13, color: 'var(--body)', flexShrink: 0 }}>
        {character.gain.toFixed(1)}×
      </div>
    </div>
  );
}

function WorldDetail({ world, onBack }: { world: WorldMetrics; onBack: () => void }) {
  const connected = world.characters.filter((c) => c.degree > 0);
  const byGain = [...connected].sort((a, b) => b.gain - a.gain);
  const outermost = byGain.slice(0, 4);
  const innermost = byGain.slice(-4).reverse();

  const camps = useMemo(() => {
    const groups = new Map<number, CharacterMetrics[]>();
    for (const c of world.characters) {
      const bucket = groups.get(c.community);
      if (bucket) bucket.push(c);
      else groups.set(c.community, [c]);
    }
    return [...groups.values()]
      .map((members) => [...members].sort((a, b) => b.prominence - a.prominence))
      .sort((a, b) => b.length - a.length);
  }, [world]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28, paddingTop: 10 }}>
      <div>
        <button className="annot-link" onClick={onBack}>
          All worlds
        </button>
      </div>

      <div style={{ fontFamily: 'var(--serif)', fontSize: 34, lineHeight: 1.1 }}>{world.title}</div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 40, borderTop: '1px solid var(--rule)', paddingTop: 18 }}>
        {(
          [
            ['Cast', String(world.nodes)],
            ['Ties', String(world.edges)],
            ['Concentration', world.concentration.toFixed(2), 'concentration'],
            ['Camps', String(world.communities), 'camps'],
            ['Modularity', world.modularity.toFixed(2), 'camps'],
            ['Outermost', `${world.horizonSpread.toFixed(1)}×`, 'horizon'],
          ] as [string, string, string?][]
        ).map(([label, value, note]) => (
          <div
            key={label}
            style={{ display: 'flex', flexDirection: 'column', gap: 5 }}
            title={note ? noteTooltip(note) : undefined}
          >
            <span className="annot" style={{ fontSize: 9 }}>{label}</span>
            <span className="mono" style={{ fontSize: 19, color: 'var(--ink)' }}>{value}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 44 }}>
        <div>
          <div className="field-label" style={{ borderBottom: '1px solid var(--rule)', paddingBottom: 8 }}>
            Furthest from the story
          </div>
          <div style={{ paddingTop: 6 }}>
            {outermost.map((c) => (
              <CharacterRow key={c.i} character={c} of={world.nodes} />
            ))}
          </div>
          <div className="annot" style={{ fontSize: 9, paddingTop: 8, lineHeight: 1.7 }}>
            A few ties, and the whole world standing behind them.
          </div>
        </div>

        <div>
          <div className="field-label" style={{ borderBottom: '1px solid var(--rule)', paddingBottom: 8 }}>
            At the centre
          </div>
          <div style={{ paddingTop: 6 }}>
            {innermost.map((c) => (
              <CharacterRow key={c.i} character={c} of={world.nodes} />
            ))}
          </div>
          <div className="annot" style={{ fontSize: 9, paddingTop: 8, lineHeight: 1.7 }}>
            The second ring adds nobody. They already see everyone.
          </div>
        </div>
      </div>

      <div>
        <div className="field-label" style={{ borderBottom: '1px solid var(--rule)', paddingBottom: 8 }}>
          Camps
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32, paddingTop: 14 }}>
          {camps.map((members, i) => (
            <div key={i} style={{ maxWidth: 260 }}>
              <div className="annot" style={{ fontSize: 9, paddingBottom: 4 }}>
                {members.length} {members.length === 1 ? 'character' : 'characters'}
              </div>
              <div style={{ fontFamily: 'var(--serif)', fontSize: 14, lineHeight: 1.5, color: 'var(--body)' }}>
                {members.map((m) => m.name).join(', ')}
              </div>
            </div>
          ))}
        </div>
        <div className="annot" style={{ fontSize: 9, paddingTop: 14, lineHeight: 1.7, maxWidth: 560 }}>
          {METRIC_NOTES.camps.measures} Blind to: {METRIC_NOTES.camps.blind}
        </div>
      </div>
    </div>
  );
}

interface Props {
  universes: Universe[];
  onClose: () => void;
  onStartAgain: () => void;
}

export function Gallery({ universes, onClose, onStartAgain }: Props) {
  const [sort, setSort] = useState<SortKey>('concentration');
  const [open, setOpen] = useState<string | null>(null);

  const worlds = useMemo(() => universes.map(measureWorld), [universes]);

  const ordered = useMemo(() => {
    const by = SORTS.find((s) => s.key === sort)!;
    return [...worlds].sort((a, b) => {
      const left = by.of(a);
      const right = by.of(b);
      return typeof left === 'string' ? left.localeCompare(right as string) : left - (right as number);
    });
  }, [worlds, sort]);

  const detail = open ? worlds.find((w) => w.id === open) : null;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', padding: '44px 64px 72px 64px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <BrandMark onStartAgain={onStartAgain} />
        <button className="annot-link" onClick={onClose}>
          Back to the game
        </button>
      </div>

      {detail ? (
        <WorldDetail world={detail} onBack={() => setOpen(null)} />
      ) : (
        <>
          <div style={{ paddingTop: 30, maxWidth: 620 }}>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 34, lineHeight: 1.1 }}>
              The topology gallery
            </div>
            <div style={{ fontSize: 18, color: 'var(--body)', lineHeight: 1.6, paddingTop: 12 }}>
              Every world you have loaded, measured the same way and drawn at the same scale. Nothing
              here is a puzzle, and nothing has a right answer.
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 18,
              flexWrap: 'wrap',
              paddingTop: 26,
              marginTop: 18,
              borderTop: '1px solid var(--rule)',
            }}
          >
            <span className="annot" style={{ fontSize: 9 }}>Order by</span>
            {SORTS.map((option) => (
              <button
                key={option.key}
                onClick={() => setSort(option.key)}
                className="mono"
                style={{
                  fontSize: 10,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color: sort === option.key ? 'var(--accent)' : 'var(--annotation)',
                  borderBottom: sort === option.key ? '1px solid var(--accent)' : '1px solid transparent',
                  padding: '6px 2px 4px 2px',
                }}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(268px, 1fr))',
              gap: '34px 40px',
              paddingTop: 30,
            }}
          >
            {ordered.map((world) => (
              <Fingerprint key={world.id} world={world} onOpen={setOpen} />
            ))}
          </div>

          <div style={{ borderTop: '1px solid var(--rule)', marginTop: 40, paddingTop: 20, maxWidth: 720 }}>
            <div className="field-label" style={{ paddingBottom: 12 }}>What the figures mean</div>
            {Object.entries(METRIC_NOTES).map(([key, note]) => (
              <div key={key} style={{ display: 'flex', gap: 18, padding: '7px 0' }}>
                <span
                  className="mono"
                  style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--unknown)', width: 92, flexShrink: 0, paddingTop: 3 }}
                >
                  {key}
                </span>
                <span style={{ fontSize: 15, color: 'var(--body)', lineHeight: 1.55 }}>
                  {note.measures} <span style={{ color: 'var(--unknown)' }}>Blind to: {note.blind}</span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
