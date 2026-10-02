import type { Params } from './sim';

/** A slider in the project's register: tracked mono label, value on the right,
 * hairline rule under it. Nothing is a boxed control. */
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

/** The rules. The run's own controls — length, seed, transport — are above
 * these in the panel, because they are what a visitor touches first. */
export function Controls(props: { params: Params; onChange: (next: Params) => void }) {
  const { params, onChange } = props;
  const set = <K extends keyof Params>(k: K, v: Params[K]) => onChange({ ...params, [k]: v });
  const mix = params.own + params.fof + params.cross || 1;
  const pct = (v: number) => `${Math.round((v / mix) * 100)}%`;

  return (
    <div className="xp-controls">
      <h3 className="mono xp-group">Encounter mix</h3>
      <Slider label="Own world" value={params.own} min={0} max={100} step={1} format={pct} onChange={(v) => set('own', v)} />
      <Slider label="Friend of a friend" value={params.fof} min={0} max={100} step={1} format={pct} onChange={(v) => set('fof', v)} />
      <Slider label="Cross world" value={params.cross} min={0} max={100} step={1} format={pct} onChange={(v) => set('cross', v)} />

      <h3 className="mono xp-group">Tie formation</h3>
      <Slider label="Formation pressure" value={params.p} min={0} max={1} step={0.01} format={(v) => v.toFixed(2)} onChange={(v) => set('p', v)} />
      <Slider label="Saturation d₀" value={params.d0} min={1} max={60} step={1} onChange={(v) => set('d0', v)} />
      <Slider label="Triadic bonus λ" value={params.lambda} min={0} max={1.5} step={0.01} format={(v) => v.toFixed(2)} onChange={(v) => set('lambda', v)} />
      <Slider label="Pref. attachment α" value={params.alpha} min={0} max={2} step={0.05} format={(v) => v.toFixed(2)} onChange={(v) => set('alpha', v)} />
      <p className="xp-note quiet">
        A tie forms only when both sides say so. Not optional: with structural
        rules the two sides genuinely differ, so consent is a mechanism rather
        than a rescale of formation pressure.
      </p>

      <h3 className="mono xp-group">Tie maintenance</h3>
      <Slider label="Strengthen rate" value={params.ps} min={0} max={0.6} step={0.01} format={(v) => v.toFixed(2)} onChange={(v) => set('ps', v)} />
      <Slider label="Decay per round" value={params.decay} min={0} max={20} step={0.5} format={(v) => v.toFixed(1)} onChange={(v) => set('decay', v)} />
      <Slider label="New tie strength" value={params.sInit} min={5} max={100} step={1} onChange={(v) => set('sInit', v)} />
    </div>
  );
}
