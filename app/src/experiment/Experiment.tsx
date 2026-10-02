/**
 * The experiment: fifty-two worlds with no ties between them, and one rule.
 *
 * This file is only the wiring. The rules are in sim.ts, every constant they
 * stand on is in constants.ts with the argument for its value, the drawing is
 * in Field.tsx, the live figures in metrics.ts and the expensive ones in
 * report.ts. docs/The experiment.md is what all of it is for.
 *
 * Three things run at once and on different clocks: the simulation, on a fixed
 * ten rounds a second; the force layout, in a worker, posting positions back
 * whenever it has them; and the drawing, once per animation frame from whatever
 * arrived last. Nothing waits for anything else.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchIndex, fetchUniverse } from '../data/loader';
import { SIX_WORLDS, mergeWorlds, worldHomes } from './world';
import { DAYS_PER_SECOND, MAX_STEPS_PER_FRAME } from './constants';
import { DEFAULT_PARAMS, initState, step, type Params, type SimState } from './sim';
import { measure, type LiveMetrics } from './metrics';
import { buildReport, type Report } from './report';
import { Field, type Positions, type TieView } from './Field';
import { Controls, Slider } from './Controls';
import type { FromWorker, ToWorker } from './layout.worker';
import type { Universe } from '../types';

function randomSeed(): number {
  return 1 + Math.floor(Math.random() * 99998);
}

export function Experiment({ onExit }: { onExit: () => void }) {
  /**
   * Every shipped world, fetched once.
   *
   * All fifty-two universe files together are about four megabytes — the bulk
   * of `data/` is the reveal-only sidecars, which nothing here reads. Fetching
   * the lot up front means changing the selection is a merge rather than a
   * round trip, which is what makes the picker usable as a thing to fiddle with
   * rather than a thing to commit to.
   */
  const [catalogue, setCatalogue] = useState<Universe[] | null>(null);
  /** Which worlds are in. Every one of them, until someone says otherwise. */
  const [chosen, setChosen] = useState<Set<string> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const [seed, setSeed] = useState(48291);
  const [runId, setRunId] = useState(0);
  const [running, setRunning] = useState(false);
  const [tieView, setTieView] = useState<TieView>('all');
  const [refit, setRefit] = useState(0);

  const [metrics, setMetrics] = useState<LiveMetrics | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [follow, setFollow] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  /** Bumped every round so the followed character's panel redraws. */
  const [tick, setTick] = useState(0);

  const stateRef = useRef<SimState | null>(null);
  const posRef = useRef<Positions | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const paramsRef = useRef(params);
  const runningRef = useRef(running);
  paramsRef.current = params;
  runningRef.current = running;

  // ── Loading ───────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const index = await fetchIndex();
        const universes = await Promise.all(index.universes.map((e) => fetchUniverse(e.file)));
        if (!cancelled) {
          setCatalogue(universes);
          setChosen(new Set(universes.map((u) => u.id)));
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const world = useMemo(() => {
    if (!catalogue || !chosen) return null;
    const picked = catalogue.filter((u) => chosen.has(u.id));
    if (picked.length === 0) return null;
    return mergeWorlds(picked);
  }, [catalogue, chosen]);

  // ── The layout worker ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!world) return;
    const worker = new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<FromWorker>) => {
      if (event.data.type === 'pos') posRef.current = { x: event.data.x, y: event.data.y };
    };
    const homes = worldHomes(world);
    const init: ToWorker = {
      type: 'init',
      x: world.x0,
      y: world.y0,
      world: world.world,
      homeX: homes.x,
      homeY: homes.y,
    };
    // Copies, not transfers: `world` keeps its own starting coordinates so a
    // reset can put every character back where the story left them.
    worker.postMessage(init);
    posRef.current = { x: Float32Array.from(world.x0), y: Float32Array.from(world.y0) };
    return () => {
      worker.postMessage({ type: 'stop' } satisfies ToWorker);
      worker.terminate();
      workerRef.current = null;
    };
  }, [world]);

  function sendLinks() {
    const state = stateRef.current;
    const worker = workerRef.current;
    if (!state || !worker) return;
    let count = 0;
    for (const row of state.adj) count += row.size;
    const triples = new Float32Array((count / 2) * 3);
    let k = 0;
    for (let u = 0; u < state.adj.length; u++) {
      for (const [v, s] of state.adj[u]) {
        if (v <= u) continue;
        triples[k++] = u;
        triples[k++] = v;
        triples[k++] = s;
      }
    }
    worker.postMessage({ type: 'links', triples } satisfies ToWorker, [triples.buffer]);
  }

  // ── Building a run ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!world) return;
    const state = initState(world, seed);
    state.follow = follow;
    stateRef.current = state;
    sendLinks();
    setMetrics(measure(state, world));
    setReport(null);
    setRunning(false);
    setRefit((r) => r + 1);
    setTick((t) => t + 1);
    // `follow` is read once to carry a chosen character across a reset; it must
    // not itself rebuild the run, which is what this list says.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world, seed, runId]);

  // A different set of worlds is a different index space: whoever was being
  // followed is not that character any more, and may not be a character at all.
  useEffect(() => {
    setFollow(null);
    setHover(null);
  }, [world]);

  // Following changes nothing about the run — same seed, same history — so it
  // is pushed into the live state rather than rebuilding anything. The log
  // belongs to the character, so it starts empty when the character changes.
  useEffect(() => {
    const state = stateRef.current;
    if (!state) return;
    state.follow = follow;
    state.log = [];
    setTick((t) => t + 1);
  }, [follow]);

  function advance() {
    const state = stateRef.current;
    if (!state || !world) return;
    step(state, world, paramsRef.current);
    sendLinks();
    workerRef.current?.postMessage({ type: 'kick', alpha: 0.12 } satisfies ToWorker);
    setMetrics(measure(state, world));
    setTick((t) => t + 1);
  }

  function finish() {
    const state = stateRef.current;
    if (!state || !world) return;
    setRunning(false);
    setReport(buildReport(state, world, initState(world, seed)));
  }

  // ── The clock ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!world) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const frame = (now: number) => {
      const state = stateRef.current;
      const dt = Math.min(now - last, 250);
      last = now;
      if (state && runningRef.current) {
        acc += dt;
        const interval = 1000 / DAYS_PER_SECOND;
        let steps = 0;
        let done = false;
        while (acc >= interval && steps < MAX_STEPS_PER_FRAME) {
          acc -= interval;
          steps++;
          step(state, world, paramsRef.current);
          if (state.round >= paramsRef.current.days) {
            done = true;
            break;
          }
        }
        if (steps > 0) {
          sendLinks();
          workerRef.current?.postMessage({ type: 'kick', alpha: 0.12 } satisfies ToWorker);
          setMetrics(measure(state, world));
          setTick((t) => t + 1);
        }
        if (done) finish();
      } else {
        acc = 0;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world]);

  const matches = useMemo(() => {
    if (!world || query.trim().length < 2) return [];
    const q = query.trim().toLowerCase();
    const out: number[] = [];
    for (let i = 0; i < world.n && out.length < 8; i++) {
      if (world.name[i].toLowerCase().includes(q)) out.push(i);
    }
    return out;
  }, [world, query]);

  if (error) return <p className="xp-note">{error}</p>;

  const state = stateRef.current;
  // Belt as well as braces: a render can land between the world changing and
  // the effect above clearing the followed character.
  const followed = follow !== null && state && follow < state.adj.length ? follow : null;
  const followTies =
    followed !== null && state ? [...state.adj[followed].entries()].sort((a, b) => b[1] - a[1]) : [];
  const followLog = followed !== null && state ? state.log : [];

  /**
   * The log, by day.
   *
   * Flat, it is unreadable: a character with sixty ties strengthens about ten
   * of them a round, so FORM and CUT — the only two entries that change the
   * topology — scroll past under a wall of maintenance. That is the same
   * failure WEAKEN was left out of the log to avoid, arriving by another door.
   * So maintenance is counted rather than listed.
   */
  const followDays: { day: number; events: typeof followLog; kept: number }[] = [];
  for (const e of followLog) {
    let cur = followDays[followDays.length - 1];
    if (!cur || cur.day !== e.day) {
      cur = { day: e.day, events: [], kept: 0 };
      followDays.push(cur);
    }
    if (e.action === 'STRENGTHEN') cur.kept++;
    else cur.events.push(e);
  }

  return (
    <div className="xp" data-tick={tick}>
      {world ? (
        <Field
          world={world}
          stateRef={stateRef}
          positionsRef={posRef}
          follow={followed}
          tieView={tieView}
          refit={refit}
          onHover={setHover}
          onPick={setFollow}
        />
      ) : (
        <div className="xp-field" />
      )}

      <div className="xp-panel xp-left">
        <button type="button" className="mono xp-link" onClick={onExit}>
          ← Back
        </button>
        <h2 className="mono xp-title">The experiment</h2>
        <p className="xp-note">
          Every world, with no ties between them. Press run and see what is left of the walls.
        </p>

        <h3 className="mono xp-group">Worlds</h3>
        <div className="xp-transport">
          <button
            type="button"
            className="mono xp-link"
            onClick={() => catalogue && setChosen(new Set(catalogue.map((u) => u.id)))}
          >
            All
          </button>
          <button type="button" className="mono xp-link" onClick={() => setChosen(new Set())}>
            None
          </button>
          <button
            type="button"
            className="mono xp-link"
            onClick={() => setChosen(new Set(SIX_WORLDS))}
          >
            The six
          </button>
        </div>
        <p className="xp-note quiet">
          {!catalogue
            ? 'Loading every world…'
            : world
              ? `${world.worldIds.length} worlds · ${world.n.toLocaleString()} characters · ${world.edges.length.toLocaleString()} ties`
              : 'Choose at least one world.'}
        </p>
        {catalogue && chosen && (
          <div className="xp-worldlist">
            {catalogue.map((u) => (
              <label key={u.id} className="xp-pick">
                <input
                  type="checkbox"
                  checked={chosen.has(u.id)}
                  onChange={() => {
                    const next = new Set(chosen);
                    if (next.has(u.id)) next.delete(u.id);
                    else next.add(u.id);
                    setChosen(next);
                  }}
                />
                <span className="xp-world-name">{u.title}</span>
                <span className="mono xp-value">{u.nodes.length}</span>
              </label>
            ))}
          </div>
        )}

        <h3 className="mono xp-group">Run</h3>
        <div className="xp-transport">
          <button type="button" className="mono xp-link" onClick={() => setRunning((r) => !r)}>
            {running ? '❙❙ Pause' : '▶ Run'}
          </button>
          <button type="button" className="mono xp-link" onClick={advance}>
            Step
          </button>
          <button type="button" className="mono xp-link" onClick={() => setRunId((r) => r + 1)}>
            Reset
          </button>
          <button type="button" className="mono xp-link" onClick={() => setRefit((r) => r + 1)}>
            Refit
          </button>
        </div>
        <Slider
          label="Length in days"
          value={params.days}
          min={20}
          max={600}
          step={10}
          onChange={(v) => setParams({ ...params, days: v })}
        />
        <label className="xp-slider">
          <span className="xp-slider-head">
            <span className="mono xp-label">Seed</span>
            <button type="button" className="mono xp-link" onClick={() => setSeed(randomSeed())}>
              New
            </button>
          </span>
          <input
            className="mono xp-number"
            type="number"
            min={1}
            max={99999}
            value={seed}
            onChange={(e) => setSeed(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
          />
        </label>

        <h3 className="mono xp-group">Ties drawn</h3>
        <div className="xp-transport">
          {(['all', 'cross', 'none'] as TieView[]).map((v) => (
            <button
              key={v}
              type="button"
              className={`mono xp-link${tieView === v ? ' on' : ''}`}
              onClick={() => setTieView(v)}
            >
              {v}
            </button>
          ))}
        </div>

        <Controls params={params} onChange={setParams} />
      </div>

      <div className="xp-panel xp-right">
        {metrics && (
          <>
            <Figure label="Day" value={`${metrics.round} / ${params.days}`} />
            <Figure label="World loyalty" value={`${(metrics.worldLoyalty * 100).toFixed(1)}%`} big />
            <Figure label="Cross-world ties" value={`${(metrics.crossShare * 100).toFixed(1)}%`} big />
            <Figure label="Ties" value={metrics.ties.toLocaleString()} />
            <Figure label="Mean degree" value={metrics.meanDegree.toFixed(2)} />
            <Figure label="Max degree" value={String(metrics.maxDegree)} />
            <Figure label="Components" value={String(metrics.components)} />
            <Figure label="Formed / cut" value={`+${metrics.formed} / −${metrics.cut}`} />

            <h3 className="mono xp-group">Loyalty by world</h3>
            {/* No colour. Fifty-two accents down a column is a paint chart, and
                the ordering is the information: who is holding, who is going. */}
            {world &&
              metrics.loyaltyByWorld
                .map((value, w) => ({ value, w }))
                .sort((a, b) => a.value - b.value)
                .map(({ value, w }) => (
                  <div key={w} className="xp-world">
                    <span className="xp-world-name">{world.worldTitles[w]}</span>
                    <span className="xp-bar">
                      <span className="xp-bar-fill" style={{ width: `${value * 100}%` }} />
                    </span>
                    <span className="mono xp-value">{(value * 100).toFixed(0)}%</span>
                  </div>
                ))}
          </>
        )}

        {report && world && (
          <>
            <h3 className="mono xp-group">When it stopped</h3>
            <Figure label="Clustering" value={report.clustering.toFixed(3)} />
            <Figure label="Modularity" value={report.modularity.toFixed(3)} />
            <Figure label="Communities" value={String(report.communities)} />
            <Figure label="Left alone" value={report.singletons.toLocaleString()} />
            <Figure label="Mean path" value={report.meanPathLength.toFixed(2)} />
            <Figure label="Unreachable" value={`${(report.unreachable * 100).toFixed(1)}%`} />
            <Figure label="Assortativity" value={report.assortativity.toFixed(3)} />
            <h4 className="mono xp-group">Drifted furthest from its own shape</h4>
            {report.drift.slice(0, 8).map((d) => (
              <div key={d.world} className="xp-figure">
                <span className="xp-world-name">{world.worldTitles[d.world]}</span>
                <span className="mono xp-figure-value">{d.value.toFixed(2)}</span>
              </div>
            ))}
          </>
        )}

        <h3 className="mono xp-group">Over one shoulder</h3>
        <div className="xp-transport">
          <button
            type="button"
            className="mono xp-link"
            onClick={() => {
              const st = stateRef.current;
              if (!st || !world) return;
              // Someone with ties. A character sitting alone has no history to
              // read, and decay produces more of them than you would guess.
              const candidates: number[] = [];
              for (let i = 0; i < world.n; i++) if (st.adj[i].size > 0) candidates.push(i);
              if (candidates.length) {
                setFollow(candidates[Math.floor(Math.random() * candidates.length)]);
              }
            }}
          >
            Someone at random
          </button>
          {follow !== null && (
            <button type="button" className="mono xp-link" onClick={() => setFollow(null)}>
              Stop
            </button>
          )}
        </div>
        <input
          className="mono xp-number"
          type="search"
          placeholder="or find by name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {matches.length > 0 && world && (
          <div className="xp-matches">
            {matches.map((i) => (
              <button
                key={i}
                type="button"
                className="mono xp-link"
                onClick={() => {
                  setFollow(i);
                  setQuery('');
                }}
              >
                {world.name[i]} · {world.worldTitles[world.world[i]]}
              </button>
            ))}
          </div>
        )}

        {followed !== null && world && (
          <div className="xp-watch">
            <div className="xp-hover-name">{world.name[followed]}</div>
            <div className="mono xp-label">
              {world.worldTitles[world.world[followed]]} · {followTies.length} ties ·{' '}
              {followTies.filter(([v]) => world.world[v] !== world.world[followed]).length} outside
            </div>

            <h4 className="mono xp-group">Ties now</h4>
            <div className="xp-tielist">
              {followTies.slice(0, 14).map(([v, s]) => (
                <div key={v} className="xp-tie">
                  <span className="xp-tie-name">
                    {world.name[v]}
                    {world.world[v] !== world.world[followed] ? ' ✦' : ''}
                  </span>
                  <span className="xp-bar">
                    <span className="xp-bar-fill" style={{ width: `${s}%` }} />
                  </span>
                </div>
              ))}
              {followTies.length === 0 && <p className="xp-note">No ties left.</p>}
            </div>

            <h4 className="mono xp-group">What happened</h4>
            <div className="xp-log">
              {followDays.length === 0 && (
                <p className="xp-note quiet">
                  Nothing yet. Weakening is continuous and is not logged — watch the bars above
                  shrink.
                </p>
              )}
              {followDays.slice(0, 25).map((d) => (
                <div key={d.day} className="xp-log-day">
                  {d.events.map((e, k) => (
                    <div key={`${e.other}-${k}`} className="xp-log-row">
                      <span className="mono xp-label">{d.day}</span>
                      <span className={`mono xp-act ${e.action.toLowerCase()}`}>{e.action}</span>
                      <span className="xp-tie-name">
                        {world.name[e.other]}
                        {world.world[e.other] !== world.world[followed] ? ' ✦' : ''}
                      </span>
                    </div>
                  ))}
                  {d.kept > 0 && (
                    <div className="xp-log-row quiet">
                      <span className="mono xp-label">{d.events.length === 0 ? d.day : ''}</span>
                      <span className="mono xp-act strengthen">·</span>
                      <span className="mono xp-label">{d.kept} kept up</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {hover !== null && hover !== followed && world && state && hover < state.adj.length && (
          <div className="xp-hover">
            <div className="xp-hover-name">{world.name[hover]}</div>
            <div className="mono xp-label">{world.worldTitles[world.world[hover]]}</div>
            <div className="mono xp-label">{state.adj[hover].size} ties</div>
          </div>
        )}
      </div>
    </div>
  );
}

function Figure({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className={`xp-figure${big ? ' big' : ''}`}>
      <span className="mono xp-label">{label}</span>
      <span className="mono xp-figure-value">{value}</span>
    </div>
  );
}
