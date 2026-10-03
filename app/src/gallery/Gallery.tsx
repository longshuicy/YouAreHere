import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BackLink, BrandCluster, BrandMark, ChromeRight, StartLinkPair, type StartLinks } from '../render/MarginLinks';
import { Experiment } from '../experiment/Experiment';
import { FullGraph } from '../render/FullGraph';
import { fetchMeta, findByName } from '../data/loader';
import type { Universe, UniverseMeta } from '../types';
import { DegreeBars, HorizonStrip, StripLabel } from './Fingerprint';
import { CharacterIndex } from './CharacterIndex';
import { Ledger } from './Ledger';
import { ReadingPage } from '../screens/ReadingPage';
import { NameLink } from '../render/NameLink';
import { WikiLink } from '../render/WikiLink';
import { noteTooltip } from './metricNotes';
import { measureWorld, type CharacterMetrics, type WorldMetrics } from './metrics';
import type { Route } from '../engine/route';
import type { WorldProgress } from '../engine/residence';

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

const DETAIL_STRIP = 560;
/** The floor under the network, not its height.
 *
 * It used to be a fixed 320, chosen to land near the fingerprint beside it —
 * which it did until the strips grew their captions, and then the left column
 * ran a page further down than the right and the network sat in the top third
 * of its own half looking like a thumbnail. The two columns stretch to each
 * other now, so the network is as tall as the ties-each strip, the horizon
 * strip and both of their readings put together. This is only what it may not
 * go below, for a world whose fingerprint is unusually short. */
const DETAIL_GRAPH_MIN = 320;
const DETAIL_BARS = 116;
const DETAIL_TICKS = 126;
/** Long enough to see a camp's shape, short enough that the page is still a
 * page. The rest are a scroll away rather than four hundred names down. */
const CAMP_PREVIEW = 20;
/** How many characters each end of the horizon shows at most. Ten rather than
 * four: four is a podium, and in a world of several hundred a podium says
 * nothing about whether the fifth name was close behind or nowhere near. */
const HORIZON_ENDS = 10;

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
  figure,
  onOpen,
}: {
  character: CharacterMetrics;
  of: number;
  /** The column's own sort key, written out. Passed in rather than picked here
   * because the two columns no longer rank on the same quantity, and a row that
   * prints one number while its column is ordered by another reads as a bug. */
  figure: string;
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
        {figure}
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
/** A figure inside a caption — the one place a number appears in running prose
 * on this page, so it keeps the mono face it has everywhere else. */
function Fig({ children }: { children: ReactNode }) {
  return (
    <span className="mono" style={{ fontSize: 13 }}>
      {children}
    </span>
  );
}

/** What a strip is saying, under the strip. */
function StripNote({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        maxWidth: DETAIL_STRIP,
        paddingTop: 12,
        fontSize: 14,
        lineHeight: 1.6,
        color: 'var(--body)',
      }}
    >
      {children}
    </div>
  );
}

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
  meta,
  progress,
  onOpenCharacter,
}: {
  world: WorldMetrics;
  universe: Universe | undefined;
  meta: UniverseMeta | null;
  progress: WorldProgress | undefined;
  onOpenCharacter: (i: number) => void;
}) {
  const connected = world.characters.filter((c) => c.degree > 0);
  /** A third of each end on the small plays, so the two ends stay ends and
   * something is left in the middle. Ten of each is eight of *Othello*'s
   * twelve characters printed twice — not a finding but a cast list. */
  const ends = Math.min(HORIZON_ENDS, Math.max(1, Math.floor(connected.length / 3)));


  /**
   * The centre: harmonic centrality truncated at two hops — your friends at
   * full weight, their friends at a half — which is `(degree + reach) / 2`, so
   * it costs nothing beyond the two numbers already measured.
   *
   * Not gain ascending, which is what this was and which inverts itself in
   * every large world. Gain is `reach / degree` and names no cast size, so it
   * cannot tell *sees the whole world* from *sees a closed clique and will
   * never see more* — both score near 1. Where the world is small enough that
   * every second ring runs out of cast, the two are the same statement and
   * gain is a disguised degree; where it is not, gain measures neighbourhood
   * closure and nothing else. It put the Citadel novices at the centre of *A
   * Song of Ice and Fire* (they reach eight people of 592, and each other) and
   * the sons of Gad at the centre of the Bible, a genealogical clique with a
   * clustering coefficient of exactly 1. Jonothor Darry, the most peripheral
   * character in Westeros by closeness, was printed here.
   *
   * Raw reach was tried first and is too brittle near saturation: it is a
   * count, so one person's difference decides the order outright and the
   * tie-break is never consulted. In *Pride and Prejudice* that is enough for
   * Kitty Bennet — twenty-two ties, reaching 85 — to displace Elizabeth, who
   * has fifty and reaches 84. Weighting the first ring heavier makes the
   * comparison continuous, and the degree a character actually holds stops
   * being worth less than one incidental acquaintance.
   *
   * Measured against full harmonic closeness over the catalogue this ranks at
   * rho 0.89 to 1.00, median 0.996, and no character it shows anywhere is
   * outside that world's true top nine. It is also still exactly the old
   * ordering in the saturated worlds — reach is then `n - 1` for everyone, so
   * the score reduces to degree, which is what gain was standing in for. 30 of
   * the 52 worlds print an unchanged list, all of them plays.
   */
  const innermost = [...connected]
    .sort((a, b) => b.degree + b.reach - (a.degree + a.reach) || a.gain - b.gain)
    .slice(0, ends);

  /**
   * The widest horizons: gain descending, which is what gain is for — minus
   * anyone the centre has already claimed.
   *
   * The two columns sort on different keys now, so nothing about the arithmetic
   * keeps them apart: in a twelve-hander where everyone reaches everyone, gain
   * ranks by degree inverted and a character can be sixth from both ends at
   * once. *Othello* printed Bianca in both.
   */
  const claimed = new Set(innermost.map((c) => c.i));
  const outermost = [...connected]
    .filter((c) => !claimed.has(c.i))
    .sort((a, b) => b.gain - a.gain)
    .slice(0, ends);

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
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'baseline',
          gap: '12px 18px',
        }}
      >
        <div style={{ fontFamily: 'var(--serif)', fontSize: 'clamp(24px, 6.4vw, 34px)', lineHeight: 1.1 }}>
          {world.title}
        </div>
        {meta?.workWiki && (
          <WikiLink title={meta.workWiki} lang={meta.workWikiLang ?? 'en'} />
        )}
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
          // Stretch, so the network matches the fingerprint's full height
          // rather than a number guessed in advance.
          alignItems: 'stretch',
        }}
      >
        <div>
          <SectionHead>The fingerprint</SectionHead>
          {/* The reading sits under the drawing it reads, always, rather than
              behind a `How to interpret` toggle that opened a panel at the foot
              of the page — three sections below the thing it explained, so the
              reader had to hold a paragraph in mind and scroll back up to the
              picture. A caption is two lines of prose; it does not need a door
              in front of it. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 30 }}>
            <div title={noteTooltip('ties')}>
              <StripLabel left="Ties each" right="Few → many" width={DETAIL_STRIP} size={8.5} />
              <DegreeBars histogram={world.degreeHistogram} width={DETAIL_STRIP} height={DETAIL_BARS} labelSize={8.5} />
              <StripNote>
                Each bar is a group of characters, sorted by how many people they appear with. The
                number on top is how many characters are in that group; the label underneath is how
                many people each of them knows. Weight on the left means a cast of bit-players around
                a few principals. Weight on the right means almost everyone meets almost everyone.
              </StripNote>
            </div>
            <div title={noteTooltip('horizon')}>
              <StripLabel left="Horizon" right="One mark per character" width={DETAIL_STRIP} size={8.5} />
              <HorizonStrip world={world} width={DETAIL_STRIP} height={DETAIL_TICKS} labelMarks />
              <StripNote>
                One mark per character, asking: if you know a handful of people, how many more do you
                reach through them? A mark at <Fig>1×</Fig> is someone who reaches nobody new — in a
                small cast a lead who already knows everyone, in a large one more often somebody
                sealed inside a tight circle. A mark at <Fig>10×</Fig> is someone whose few
                acquaintances open onto ten times as many people again, which is a wide horizon
                rather than a distant one: they may still be two handshakes from half the world.
              </StripNote>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <SectionHead>The whole network</SectionHead>
          {/* A frame that takes exactly the space left over, and a drawing
              laid out inside it.
              `flex: 1 1 auto` was not enough on its own: the basis is the
              content, and the network's own svg draws past its box, so the
              frame grew to whatever the drawing wanted and the right column ran
              on a long way below the left. A zero basis means the frame can
              only ever be the leftover height, and the drawing is positioned
              against it rather than measured from it. */}
          <div
            style={{
              flex: '1 1 0',
              minHeight: DETAIL_GRAPH_MIN,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div style={{ position: 'absolute', inset: 0 }}>
              {universe ? (
                <FullGraph universe={universe} role="subject" />
              ) : (
                <div className="annot">Not loaded</div>
              )}
            </div>
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
        <div title={noteTooltip('horizon')}>
          <SectionHead>The widest horizon</SectionHead>
          {outermost.map((c) => (
            <CharacterRow
              key={c.i}
              character={c}
              of={world.nodes}
              figure={`${c.gain.toFixed(1)}×`}
              onOpen={onOpenCharacter}
            />
          ))}
          <div className="annot" style={{ fontSize: 9, paddingTop: 8, lineHeight: 1.7 }}>
            A few ties, and the whole world standing behind them.
          </div>
        </div>

        <div title={noteTooltip('centre')}>
          <SectionHead>At the centre</SectionHead>
          {innermost.map((c) => (
            <CharacterRow
              key={c.i}
              character={c}
              of={world.nodes}
              figure={`${Math.round(((c.degree + c.reach) / 2 / Math.max(1, world.nodes - 1)) * 100)}%`}
              onOpen={onOpenCharacter}
            />
          ))}
          <div className="annot" style={{ fontSize: 9, paddingTop: 8, lineHeight: 1.7 }}>
            Two hops from here is most of the cast.
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
  const open = route.screen === 'lab-world' ? route.worldId : null;
  /** A character page, which replaces the gallery the same way a world's does. */
  const character = route.screen === 'lab-character' ? { worldId: route.worldId, i: route.i } : null;
  const openWorld = (id: string) => navigate({ screen: 'lab-world', worldId: id });
  const closeWorld = () => navigate({ screen: 'lab-worlds' });
  const goToCharacter = (worldId: string, i: number) => navigate({ screen: 'lab-character', worldId, i });
  const closeCharacter = () => navigate({ screen: 'lab-worlds' });
  // A character page only exists inside the "Characters" tab, so arriving on
  // one directly — a deep link, or a jump in from the reveal — should land
  // with that tab already selected. Read once from the route this component
  // mounted with, not synchronised to it afterwards: the gallery is remounted
  // fresh every time it becomes visible (see App.tsx), so "on mount" already
  // covers every way of arriving on a character page.
  /**
   * Which room of the lab is open.
   *
   * The experiment used to be a separate surface with its own chrome, reached
   * and left by a link — which is most of why it read as a different product.
   * It is the first of three views of the same catalogue now: what happens to
   * these worlds when the walls come down, then the worlds standing still, then
   * everyone in them.
   */
  /*
   * Which room, read from the path on mount and written back on every change.
   *
   * `/lab` is the experiment, so that is what the lab opens on; the other two
   * are named under it. A character page only exists inside *Characters*, so
   * arriving on one directly lands with that view selected.
   */
  const [view, setView] = useState<'experiment' | 'worlds' | 'characters'>(() => {
    if (route.screen === 'lab-characters' || character) return 'characters';
    if (route.screen === 'lab-worlds' || route.screen === 'lab-world') return 'worlds';
    return 'experiment';
  });

  const chooseView = (next: 'experiment' | 'worlds' | 'characters') => {
    setView(next);
    navigate({
      screen: next === 'experiment' ? 'lab' : next === 'worlds' ? 'lab-worlds' : 'lab-characters',
    });
  };
  const [metas, setMetas] = useState<Map<string, UniverseMeta>>(new Map());
  /** Derived rather than stored: the sidecars are either all in or they are not,
   * and a second piece of state would only be a chance for the two to disagree. */
  const loadingMetas = view === 'characters' && metas.size < universes.length;
  const requested = useRef(new Set<string>());

  const worlds = useMemo(() => universes.map(measureWorld), [universes]);

  /**
   * What the catalogue adds up to, from the measurements already in hand.
   *
   * Every figure here is a sum or a maximum over `worlds`, so it costs a pass
   * over an array that has just been built and nothing else — no second metric,
   * no fetch, and no number that can disagree with the cards below it. It
   * changes when a world is added, which is the point: the sentence above it
   * promises "every world you have loaded" and this says how many that is.
   */
  const totals = useMemo(() => {
    const cast = worlds.reduce((sum, w) => sum + w.nodes, 0);
    const ties = worlds.reduce((sum, w) => sum + w.edges, 0);
    const camps = worlds.reduce((sum, w) => sum + w.communities, 0);
    // The world's name is deliberately not carried with it: this strip is set
    // in the annotation face, which is uppercase, and a title in it stops
    // being a title.
    const largest = worlds.reduce((most, w) => Math.max(most, w.nodes), 0);
    return { cast, ties, camps, largest };
  }, [worlds]);
  const byId = useMemo(() => new Map(universes.map((u) => [u.id, u])), [universes]);

  /** The facets live in the enrichment sidecars, which the game fetches one at a
   * time for whichever world is in play. The index needs all of them, so it
   * pulls the rest the first time it is opened rather than at boot — they are
   * mostly quoted lines it has no use for, and nobody should pay for them to
   * read a card. */
  useEffect(() => {
    if (view !== 'characters' && !open && !character) return;
    // Tracked in a ref rather than against `metas`, so a world whose sidecar
    // fails to load is not re-requested on every render for the rest of the
    // session. World detail also needs the sidecar for the story Wikipedia link.
    const needed =
      view === 'characters'
        ? universes
        : open
          ? universes.filter((u) => u.id === open)
          : character
            ? universes.filter((u) => u.id === character.worldId)
            : [];
    const missing = needed.filter((u) => !requested.current.has(u.id));
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
  }, [view, universes, open, character]);

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
    <div className={`lab${view === 'experiment' ? ' live' : ''}`}>
      {/* The wordmark and the ways back into the game, with what the catalogue
          adds up to in the corner opposite. */}
      <div className="lab-top">
        <div className="brand-cluster">
          <BrandMark />
          <StartLinkPair {...startLinks} />
        </div>
        {worlds.length > 0 && (
          <p className="annot lab-figures">
            {[
              `${worlds.length} ${worlds.length === 1 ? 'world' : 'worlds'}`,
              `${totals.cast.toLocaleString()} characters`,
              `${totals.ties.toLocaleString()} ties`,
            ].map((clause, i, all) => (
              <span key={clause}>
                <span style={{ whiteSpace: 'nowrap' }}>{clause}</span>
                {i < all.length - 1 ? ' · ' : ''}
              </span>
            ))}
          </p>
        )}
      </div>

      {/* The lab's name and its three rooms on one line, as tabs: the title
          sits on the same rule the tabs are underlined against, so the rule
          belongs to both and the header is one band rather than two. */}
      <div className="lab-bar">
        <h1 className="lab-title">The topology lab</h1>
        <nav className="lab-tabs" aria-label="Lab views">
          {(
            [
              ['experiment', 'The experiment'],
              ['worlds', 'Worlds'],
              ['characters', 'Characters'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`lab-tab${view === key ? ' on' : ''}`}
              aria-current={view === key ? 'page' : undefined}
              onClick={() => chooseView(key)}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      <main className="lab-main">
        {detail ? (
          <>
            <ChromeRight>
              <BackLink label="All worlds" onBack={closeWorld} />
            </ChromeRight>
            <WorldDetail
              world={detail}
              universe={byId.get(detail.id)}
              meta={metas.get(detail.id) ?? null}
              progress={progress.get(detail.id)}
              onOpenCharacter={(i) => goToCharacter(detail.id, i)}
            />
          </>
        ) : (
          <>
            {view === 'experiment' ? (
              /* The experiment is live rather than a document, so it fills the
                 column and manages its own inside — the drawing takes the
                 height left over and the transport sits at the foot of it. */
              <div className="lab-live">
                <Experiment />
              </div>
            ) : view === 'worlds' ? (
              <Ledger worlds={worlds} progress={progress} onOpen={openWorld} />
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
      </main>
    </div>
  );
}
