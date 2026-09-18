import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BrandMark } from '../render/MarginLinks';
import { FullGraph } from '../render/FullGraph';
import { fetchMeta } from '../data/loader';
import type { Universe, UniverseMeta } from '../types';
import { CARD_STRIP, DegreeBars, Fingerprint, HorizonStrip, StripLabel } from './Fingerprint';
import { CharacterIndex } from './CharacterIndex';
import { Explain } from './Explain';
import { noteTooltip } from './notes';
import { RadioRow } from './RadioRow';
import { measureWorld, type CharacterMetrics, type WorldMetrics } from './metrics';

/**
 * The gallery: one card per loaded world, and an index of every character in
 * all of them.
 *
 * Anonymising *worlds* rather than characters, which is what the earlier draft
 * proposed and what made it wallpaper — a grid of unlabelled ego networks has no
 * reason for its sequence and nothing to compare one cell against another with.
 * A world's card carries figures on fixed scales, so two cards side by side are
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

const DETAIL_STRIP = 560;
/** Long enough to see a camp's shape, short enough that the page is still a
 * page. The rest are a scroll away rather than four hundred names down. */
const CAMP_PREVIEW = 20;
const KEY_STORAGE = 'you-are-here:gallery-key';

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

/** A column header, identical on both sides so two columns start on the same
 * line — the fingerprint and the network it measures were drifting apart by
 * however tall their captions happened to be. */
function SectionHead({ children }: { children: ReactNode }) {
  return (
    <div
      className="field-label"
      style={{ borderBottom: '1px solid var(--rule)', paddingBottom: 8, marginBottom: 18 }}
    >
      {children}
    </div>
  );
}

function WorldDetail({
  world,
  universe,
  onBack,
}: {
  world: WorldMetrics;
  universe: Universe | undefined;
  onBack: () => void;
}) {
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 30, paddingTop: 10 }}>
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

      {/* The fingerprint again, at a size it can be read, beside the network it
          is a measurement of. Both columns carry the same header so they start
          on the same line. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(440px, 100%), 1fr))',
          gap: 44,
          alignItems: 'start',
        }}
      >
        <div>
          <SectionHead>The fingerprint</SectionHead>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
            <div title={noteTooltip('ties')}>
              <StripLabel left="Ties each" right="Few → many" width={DETAIL_STRIP} size={8.5} />
              <DegreeBars histogram={world.degreeHistogram} width={DETAIL_STRIP} height={40} labelSize={8.5} />
            </div>
            <div title={noteTooltip('horizon')}>
              <StripLabel left="Horizon" right="One mark per character" width={DETAIL_STRIP} size={8.5} />
              <HorizonStrip world={world} width={DETAIL_STRIP} height={40} labelMarks />
            </div>
          </div>
        </div>

        <div>
          <SectionHead>The whole network</SectionHead>
          <div style={{ height: 320 }}>
            {universe ? <FullGraph universe={universe} /> : <div className="annot">Not loaded</div>}
          </div>
          <div className="annot" style={{ fontSize: 9, paddingTop: 10 }}>
            Drag to pan, scroll to zoom, hover to name anyone.
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))',
          gap: 44,
          alignItems: 'start',
        }}
      >
        <div>
          <SectionHead>Furthest from the story</SectionHead>
          {outermost.map((c) => (
            <CharacterRow key={c.i} character={c} of={world.nodes} />
          ))}
          <div className="annot" style={{ fontSize: 9, paddingTop: 8, lineHeight: 1.7 }}>
            A few ties, and the whole world standing behind them.
          </div>
        </div>

        <div>
          <SectionHead>At the centre</SectionHead>
          {innermost.map((c) => (
            <CharacterRow key={c.i} character={c} of={world.nodes} />
          ))}
          <div className="annot" style={{ fontSize: 9, paddingTop: 8, lineHeight: 1.7 }}>
            The second ring adds nobody. They already see everyone.
          </div>
        </div>
      </div>

      <div>
        <SectionHead>Camps · {camps.length}</SectionHead>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(240px, 100%), 1fr))',
            gap: 28,
            alignItems: 'start',
          }}
        >
          {camps.map((members, i) => (
            <div key={i}>
              <div className="annot" style={{ fontSize: 9, paddingBottom: 6 }}>
                Camp {i + 1} · {members.length} {members.length === 1 ? 'character' : 'characters'}
              </div>
              <div
                className="world-list"
                style={{
                  maxHeight: 132,
                  overflowY: 'auto',
                  paddingRight: 8,
                  fontFamily: 'var(--serif)',
                  fontSize: 14,
                  lineHeight: 1.55,
                  color: 'var(--body)',
                }}
              >
                {members.slice(0, CAMP_PREVIEW).map((m) => m.name).join(', ')}
                {members.length > CAMP_PREVIEW && (
                  <span style={{ color: 'var(--unknown)' }}>
                    {' '}… and {members.length - CAMP_PREVIEW} more
                  </span>
                )}
              </div>
            </div>
          ))}
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
  const [view, setView] = useState<'worlds' | 'characters'>('worlds');
  const [sort, setSort] = useState<SortKey>('concentration');
  const [open, setOpen] = useState<string | null>(null);
  /** Open until dismissed, and then dismissed until asked for again. Nobody can
   * read the cards without it the first time, and everybody can after a while. */
  const [showKey, setShowKey] = useState(() => {
    try {
      return localStorage.getItem(KEY_STORAGE) !== 'closed';
    } catch {
      return true;
    }
  });
  const [metas, setMetas] = useState<Map<string, UniverseMeta>>(new Map());
  /** Derived rather than stored: the sidecars are either all in or they are not,
   * and a second piece of state would only be a chance for the two to disagree. */
  const loadingMetas = view === 'characters' && metas.size < universes.length;
  const requested = useRef(new Set<string>());

  const setKey = (next: boolean) => {
    setShowKey(next);
    try {
      if (next) localStorage.removeItem(KEY_STORAGE);
      else localStorage.setItem(KEY_STORAGE, 'closed');
    } catch {
      // A private window simply gets the key on every visit.
    }
  };

  const worlds = useMemo(() => universes.map(measureWorld), [universes]);
  const byId = useMemo(() => new Map(universes.map((u) => [u.id, u])), [universes]);

  /** The facets live in the enrichment sidecars, which the game fetches one at a
   * time for whichever world is in play. The index needs all of them, so it
   * pulls the rest the first time it is opened rather than at boot — they are
   * mostly quoted lines it has no use for, and nobody should pay for them to
   * read a card. */
  useEffect(() => {
    if (view !== 'characters') return;
    // Tracked in a ref rather than against `metas`, so a world whose sidecar
    // fails to load is not re-requested on every render for the rest of the
    // session.
    const missing = universes.filter((u) => !requested.current.has(u.id));
    if (missing.length === 0) return;
    for (const u of missing) requested.current.add(u.id);
    Promise.all(
      missing.map((u) =>
        fetchMeta(u.id)
          .then((meta) => [u.id, meta] as const)
          .catch(() => null),
      ),
    ).then((loaded) => {
      setMetas((prev) => {
        const next = new Map(prev);
        for (const entry of loaded) if (entry) next.set(entry[0], entry[1]);
        return next;
      });
    });
  }, [view, universes]);

  const ordered = useMemo(() => {
    const by = SORTS.find((s) => s.key === sort)!;
    return [...worlds].sort((a, b) => {
      const left = by.of(a);
      const right = by.of(b);
      return typeof left === 'string' ? left.localeCompare(right as string) : left - (right as number);
    });
  }, [worlds, sort]);

  /** A representative card for the explanation — the world whose cast is
   * closest to the median, so the specimen is typical rather than a chosen
   * favourite, and it keeps being typical as the catalogue grows. */
  const sample = useMemo(() => {
    if (worlds.length === 0) return null;
    const sizes = [...worlds].sort((a, b) => a.nodes - b.nodes);
    return sizes[Math.floor(sizes.length / 2)];
  }, [worlds]);

  const detail = open ? worlds.find((w) => w.id === open) : null;

  // On a world's own page the key is drawn on that world, so the reader is
  // looking at the explanation and the thing explained at once.
  const keyPanel = showKey ? (
    <div style={{ paddingTop: 22 }}>
      <Explain sample={detail ?? sample} onDismiss={() => setKey(false)} />
    </div>
  ) : null;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', padding: '44px 64px 72px 64px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <BrandMark onStartAgain={onStartAgain} />
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 22 }}>
          {!showKey && (
            <button className="annot-link" onClick={() => setKey(true)}>
              How to read this
            </button>
          )}
          <button className="annot-link" onClick={onClose}>
            Back to the game
          </button>
        </div>
      </div>

      {detail ? (
        <>
          {keyPanel}
          <WorldDetail world={detail} universe={byId.get(detail.id)} onBack={() => setOpen(null)} />
        </>
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

          {/* Sticky, because thirty cards is a long way to scroll back to change
              the ordering. */}
          <div
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 5,
              background: 'var(--paper)',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              marginTop: 24,
              paddingTop: 16,
              paddingBottom: 8,
              borderBottom: '1px solid var(--rule)',
            }}
          >
            <RadioRow
              label="Show"
              value={view}
              onChange={setView}
              options={[
                { key: 'worlds', label: 'Worlds' },
                { key: 'characters', label: 'Characters' },
              ]}
            />
            {view === 'worlds' && (
              <RadioRow
                label="Order by"
                value={sort}
                onChange={setSort}
                options={SORTS.map((s) => ({ key: s.key, label: s.label }))}
              />
            )}
          </div>

          {keyPanel}

          {view === 'worlds' ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(auto-fill, minmax(min(${CARD_STRIP + 16}px, 100%), 1fr))`,
                gap: '34px 40px',
                paddingTop: 30,
              }}
            >
              {ordered.map((world) => (
                <Fingerprint key={world.id} world={world} onOpen={setOpen} />
              ))}
            </div>
          ) : (
            <CharacterIndex worlds={worlds} metas={metas} loading={loadingMetas} />
          )}
        </>
      )}
    </div>
  );
}
