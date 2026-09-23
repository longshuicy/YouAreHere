import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BackLink, BrandCluster, CHROME_PADDING, ChromeRight, type StartLinks } from '../render/MarginLinks';
import { FullGraph } from '../render/FullGraph';
import { fetchMeta, findByName } from '../data/loader';
import type { Universe, UniverseMeta } from '../types';
import { CARD_STRIP, DegreeBars, Fingerprint, HorizonStrip, StripLabel } from './Fingerprint';
import { CharacterIndex } from './CharacterIndex';
import { ReadingPage } from '../screens/ReadingPage';
import { NameLink } from '../render/NameLink';
import { Explain } from './Explain';
import { noteTooltip } from './notes';
import { RadioRow } from './RadioRow';
import { measureWorld, type CharacterMetrics, type WorldMetrics } from './metrics';
import type { Route } from '../engine/route';
import { progressLine, type WorldProgress } from '../engine/residence';

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
/** Drawn to land on the same height as the network beside them, so the two
 * columns finish together instead of the fingerprint stopping a third of the
 * way down. */
const DETAIL_GRAPH = 320;
const DETAIL_BARS = 116;
const DETAIL_TICKS = 126;
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

function CharacterRow({
  character,
  of,
  onOpen,
}: {
  character: CharacterMetrics;
  of: number;
  onOpen?: (i: number) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '6px 0' }}>
      <div style={{ width: 88, flexShrink: 0 }}>
        <StepCurve curve={character.horizonCurve} of={of} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--serif)', fontSize: 16, color: 'var(--ink)' }}>
          {onOpen ? <NameLink onClick={() => onOpen(character.i)}>{character.name}</NameLink> : character.name}
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
/** A column header. Deliberately carries nothing but its label: when one of a
 * pair held a control and the other did not, the button's padding made that
 * header taller and the two rules stopped lining up. */
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
  progress,
  onOpenCharacter,
}: {
  world: WorldMetrics;
  universe: Universe | undefined;
  progress: WorldProgress | undefined;
  onOpenCharacter: (i: number) => void;
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
      <div style={{ fontFamily: 'var(--serif)', fontSize: 'clamp(24px, 6.4vw, 34px)', lineHeight: 1.1 }}>
        {world.title}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 40, borderTop: '1px solid var(--rule)', paddingTop: 18 }}>
        {(
          [
            ['Cast', String(world.nodes)],
            ['Ties', String(world.edges)],
            ['Concentration', world.concentration.toFixed(2), 'concentration'],
            ['Camps', String(world.communities), 'camps'],
            ['Modularity', world.modularity.toFixed(2), 'camps'],
            ['Outermost', `${world.horizonSpread.toFixed(1)}×`, 'horizon'],
            ...(progress
              ? ([
                  ['Your map', progress.complete ? 'Finished' : `${progress.named}/${progress.cast}`],
                  ['Starts', String(progress.starts)],
                  ['Clues', String(progress.clues)],
                ] as [string, string][])
              : []),
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
              <DegreeBars histogram={world.degreeHistogram} width={DETAIL_STRIP} height={DETAIL_BARS} labelSize={8.5} />
            </div>
            <div title={noteTooltip('horizon')}>
              <StripLabel left="Horizon" right="One mark per character" width={DETAIL_STRIP} size={8.5} />
              <HorizonStrip world={world} width={DETAIL_STRIP} height={DETAIL_TICKS} labelMarks />
            </div>
          </div>
        </div>

        <div>
          <SectionHead>The whole network</SectionHead>
          <div style={{ height: DETAIL_GRAPH }}>
            {universe ? (
              <FullGraph universe={universe} role="subject" />
            ) : (
              <div className="annot">Not loaded</div>
            )}
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
          <SectionHead>Furthest from the world</SectionHead>
          {outermost.map((c) => (
            <CharacterRow key={c.i} character={c} of={world.nodes} onOpen={onOpenCharacter} />
          ))}
          <div className="annot" style={{ fontSize: 9, paddingTop: 8, lineHeight: 1.7 }}>
            A few ties, and the whole world standing behind them.
          </div>
        </div>

        <div>
          <SectionHead>At the centre</SectionHead>
          {innermost.map((c) => (
            <CharacterRow key={c.i} character={c} of={world.nodes} onOpen={onOpenCharacter} />
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
                {members.slice(0, CAMP_PREVIEW).map((m, k, arr) => (
                  <span key={m.i}>
                    <NameLink onClick={() => onOpenCharacter(m.i)}>{m.name}</NameLink>
                    {k < arr.length - 1 ? ', ' : ''}
                  </span>
                ))}
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
  /** How much of each world the player has mapped, where they have stayed. */
  progress: Map<string, WorldProgress>;
  startLinks: StartLinks;
  /** The address bar's idea of where in the gallery this is — `gallery`,
   * `gallery-world` or `gallery-character`. Which world card is open and
   * which character page is open both live here now, not in local state, so
   * either one is a real URL: back leaves it, and a link into the gallery
   * from the reveal lands on the page it named rather than on the index. */
  route: Route;
  navigate: (route: Route, opts?: { replace?: boolean }) => void;
}

export function Gallery({ universes, progress, startLinks, route, navigate }: Props) {
  const open = route.screen === 'gallery-world' ? route.worldId : null;
  /** A character page, which replaces the gallery the same way a world's does. */
  const character = route.screen === 'gallery-character' ? { worldId: route.worldId, i: route.i } : null;
  const openWorld = (id: string) => navigate({ screen: 'gallery-world', worldId: id });
  const closeWorld = () => navigate({ screen: 'gallery' });
  const goToCharacter = (worldId: string, i: number) => navigate({ screen: 'gallery-character', worldId, i });
  const closeCharacter = () => navigate({ screen: 'gallery' });
  // A character page only exists inside the "Characters" tab, so arriving on
  // one directly — a deep link, or a jump in from the reveal — should land
  // with that tab already selected. Read once from the route this component
  // mounted with, not synchronised to it afterwards: the gallery is remounted
  // fresh every time it becomes visible (see App.tsx), so "on mount" already
  // covers every way of arriving on a character page.
  const [view, setView] = useState<'worlds' | 'characters'>(character ? 'characters' : 'worlds');
  const [sort, setSort] = useState<SortKey>('concentration');
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
  const openCharacter = character
    ? {
        world: worlds.find((w) => w.id === character.worldId),
        universe: byId.get(character.worldId),
        meta: metas.get(character.worldId) ?? null,
        i: character.i,
      }
    : null;

  /**
   * An opened character is the reveal page, for somebody nobody played — the
   * same component, not a copy of its layout. It takes the whole screen rather
   * than sitting inside the gallery's padded column, because half of that
   * layout is a graph pinned to the right edge of the window.
   */
  if (openCharacter?.world && openCharacter.universe) {
    const worldId = openCharacter.world.id;
    return (
      <ReadingPage
        universe={openCharacter.universe}
        world={openCharacter.world}
        meta={openCharacter.meta}
        i={openCharacter.i}
        eyebrow="If you woke here, you would be"
        subtitle={openCharacter.world.title}
        linkToCharacter={(i) => goToCharacter(worldId, i)}
        linkToTwin={(twinWorld, name) => {
          const target = byId.get(twinWorld);
          const i = target ? findByName(target, name) : null;
          if (i != null) goToCharacter(twinWorld, i);
        }}
        onOpenWorld={() => openWorld(worldId)}
        chromeLeft={<BrandCluster {...startLinks} />}
        chromeRight={
          <ChromeRight>
            <BackLink label="All characters" onBack={closeCharacter} />
          </ChromeRight>
        }
      />
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        // Top and sides from the shared inset so the brand mark does not jump
        // coming into the gallery; only the bottom is this screen's own.
        padding: CHROME_PADDING,
        paddingBottom: 'max(56px, var(--pad-bottom))',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <BrandCluster {...startLinks} />
        {detail && (
          <ChromeRight>
            <BackLink label="All worlds" onBack={closeWorld} />
          </ChromeRight>
        )}
      </div>

      {detail ? (
        <WorldDetail
          world={detail}
          universe={byId.get(detail.id)}
          progress={progress.get(detail.id)}
          onOpenCharacter={(i) => goToCharacter(detail.id, i)}
        />
      ) : (
        <>
          <div style={{ paddingTop: 30, maxWidth: 620 }}>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 'clamp(24px, 6.4vw, 34px)', lineHeight: 1.1 }}>
              The topology gallery
            </div>
            <div style={{ fontSize: 'clamp(15px, 4vw, 18px)', color: 'var(--body)', lineHeight: 1.6, paddingTop: 12 }}>
              Every world you have loaded, measured the same way and drawn at the same scale. Nothing
              here is a puzzle, and nothing has a right answer.
            </div>
          </div>

          {/* One sticky row: view, then the tools that belong to it, then help. */}
          <div
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 5,
              background: 'var(--paper)',
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: 28,
              flexWrap: 'wrap',
              marginTop: 24,
              paddingTop: 16,
              paddingBottom: 12,
              borderBottom: '1px solid var(--rule)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 32, flexWrap: 'wrap' }}>
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
            {!showKey && (
              <button className="annot-link" onClick={() => setKey(true)}>
                How to interpret
              </button>
            )}
          </div>

          {showKey && (
            <div style={{ paddingTop: 22 }}>
              <Explain sample={sample} onDismiss={() => setKey(false)} />
            </div>
          )}

          {view === 'worlds' ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(auto-fill, minmax(min(${CARD_STRIP + 16}px, 100%), 1fr))`,
                gap: '34px 40px',
                paddingTop: 30,
              }}
            >
              {ordered.map((world) => {
                const p = progress.get(world.id);
                return (
                  <div key={world.id}>
                    <Fingerprint world={world} onOpen={openWorld} />
                    {p && (
                      <div className="annot" style={{ fontSize: 9, paddingTop: 6, color: 'var(--accent)' }}>
                        Your map · {progressLine(p)} · {p.clues} {p.clues === 1 ? 'clue' : 'clues'}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <CharacterIndex
                worlds={worlds}
                metas={metas}
                loading={loadingMetas}
                onOpen={goToCharacter}
              />
          )}
        </>
      )}
    </div>
  );
}
