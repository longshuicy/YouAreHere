/**
 * The rule, as controls.
 *
 * These are tier four: you set them, then you watch. They live behind a drawer
 * whose closed line states the settings that matter, so the screen is not
 * eleven sliders deep by default.
 */

import { useRef } from 'react';
import type { Params } from './sim';

/** A slider in the project's register — a tracked mono label, the value on the
 * right, and the hairline-with-a-mark rail the cold open's difficulty scale
 * already uses. Nothing here is a boxed control, and nothing here is a track
 * with a fill. */
export function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const { label, value, min, max, step, format, onChange } = props;
  return (
    <label className="xp-slider">
      <span className="xp-slider-head">
        <span className="mono xp-label">{label}</span>
        <span className="mono xp-value">{format ? format(value) : value}</span>
      </span>
      <input
        className="ease"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

/**
 * The encounter mix: one bar, not three sliders.
 *
 * The three channels are exhaustive, disjoint and normalised before they are
 * used, so as three independent sliders they were lying about their own
 * arithmetic — moving one silently restated the other two, and the only way to
 * read the mix was the three percentages beside them. Drawn as a split bar it
 * is a single quantity being divided, which is what it is: how far a character
 * reaches for the next person they meet.
 */
export function MixBar(props: {
  own: number;
  fof: number;
  cross: number;
  onChange: (next: { own: number; fof: number; cross: number }) => void;
}) {
  const { own, fof, cross, onChange } = props;
  const total = own + fof + cross || 1;
  const a = own / total;
  const b = (own + fof) / total;
  const railRef = useRef<HTMLDivElement | null>(null);

  /** Both handles write the whole mix, in percentage points summing to 100, so
   * the stored numbers always read the way the bar looks. */
  function setSplit(nextA: number, nextB: number) {
    const lo = Math.max(0, Math.min(1, nextA));
    const hi = Math.max(lo, Math.min(1, nextB));
    onChange({
      own: Math.round(lo * 100),
      fof: Math.round((hi - lo) * 100),
      cross: Math.round((1 - hi) * 100),
    });
  }

  function drag(which: 0 | 1) {
    return (event: React.PointerEvent) => {
      const rail = railRef.current;
      if (!rail) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      const move = (e: PointerEvent) => {
        const rect = rail.getBoundingClientRect();
        const t = (e.clientX - rect.left) / Math.max(rect.width, 1);
        if (which === 0) setSplit(Math.min(t, b), b);
        else setSplit(a, Math.max(t, a));
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    };
  }

  function keys(which: 0 | 1) {
    return (event: React.KeyboardEvent) => {
      const d = event.key === 'ArrowLeft' ? -0.01 : event.key === 'ArrowRight' ? 0.01 : 0;
      if (d === 0) return;
      event.preventDefault();
      if (which === 0) setSplit(Math.min(a + d, b), b);
      else setSplit(a, Math.max(b + d, a));
    };
  }

  const pct = (v: number) => `${Math.round((v / total) * 100)}%`;

  return (
    <div className="xp-mix">
      <div className="xp-mix-rail" ref={railRef}>
        <span className="xp-mix-seg own" style={{ left: 0, width: `${a * 100}%` }} />
        <span className="xp-mix-seg fof" style={{ left: `${a * 100}%`, width: `${(b - a) * 100}%` }} />
        <span className="xp-mix-seg cross" style={{ left: `${b * 100}%`, width: `${(1 - b) * 100}%` }} />
        <button
          type="button"
          className="xp-mix-handle"
          style={{ left: `${a * 100}%` }}
          onPointerDown={drag(0)}
          onKeyDown={keys(0)}
          role="slider"
          aria-label="Own world share"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(a * 100)}
        />
        <button
          type="button"
          className="xp-mix-handle"
          style={{ left: `${b * 100}%` }}
          onPointerDown={drag(1)}
          onKeyDown={keys(1)}
          role="slider"
          aria-label="Cross world share"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(100 - b * 100)}
        />
      </div>
      <div className="xp-mix-keys">
        <span className="mono xp-label">
          <i className="xp-swatch own" /> own {pct(own)}
        </span>
        <span className="mono xp-label">
          <i className="xp-swatch fof" /> friend of a friend {pct(fof)}
        </span>
        <span className="mono xp-label">
          <i className="xp-swatch cross" /> cross {pct(cross)}
        </span>
      </div>
    </div>
  );
}

/** Everything behind the rule drawer. The run's own controls — play, step, the
 * day — are on the rail across the bottom of the field, because they are what
 * a visitor touches constantly and must never scroll away. */
export function Controls(props: { params: Params; onChange: (next: Params) => void }) {
  const { params, onChange } = props;
  const set = <K extends keyof Params>(k: K, v: Params[K]) => onChange({ ...params, [k]: v });

  return (
    <div className="xp-controls">
      <h4 className="mono xp-group">How far anyone reaches</h4>
      <MixBar
        own={params.own}
        fof={params.fof}
        cross={params.cross}
        onChange={(mix) => onChange({ ...params, ...mix })}
      />

      <h4 className="mono xp-group">Tie formation</h4>
      <Slider label="Formation pressure" value={params.p} min={0} max={1} step={0.01} format={(v) => v.toFixed(2)} onChange={(v) => set('p', v)} />
      <Slider label="Saturation d₀" value={params.d0} min={1} max={60} step={1} onChange={(v) => set('d0', v)} />
      <Slider label="Triadic bonus λ" value={params.lambda} min={0} max={1.5} step={0.01} format={(v) => v.toFixed(2)} onChange={(v) => set('lambda', v)} />
      <Slider label="Pref. attachment α" value={params.alpha} min={0} max={2} step={0.05} format={(v) => v.toFixed(2)} onChange={(v) => set('alpha', v)} />
      <p className="xp-note quiet">
        A tie forms only when both sides say so. Not optional: with structural
        rules the two sides genuinely differ, so consent is a mechanism rather
        than a rescale of formation pressure.
      </p>

      <h4 className="mono xp-group">Tie maintenance</h4>
      <Slider label="Strengthen rate" value={params.ps} min={0} max={0.6} step={0.01} format={(v) => v.toFixed(2)} onChange={(v) => set('ps', v)} />
      <Slider label="Decay per round" value={params.decay} min={0} max={20} step={0.5} format={(v) => v.toFixed(1)} onChange={(v) => set('decay', v)} />
      <Slider label="New tie strength" value={params.sInit} min={5} max={100} step={1} onChange={(v) => set('sInit', v)} />
    </div>
  );
}
