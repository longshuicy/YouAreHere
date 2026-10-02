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

export function Toggle(props: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      className={`mono xp-toggle${props.value ? ' on' : ''}`}
      onClick={() => props.onChange(!props.value)}
    >
      {props.label} · {props.value ? 'ON' : 'OFF'}
    </button>
  );
}

export function Controls(props: {
  params: Params;
  onChange: (next: Params) => void;
  seed: number;
  onSeed: (seed: number) => void;
}) {
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
      <Toggle label="Ramp cross-world" value={params.ramp} onChange={(v) => set('ramp', v)} />

      <h3 className="mono xp-group">Tie formation</h3>
      <Slider label="Formation pressure" value={params.p} min={0} max={1} step={0.01} format={(v) => v.toFixed(2)} onChange={(v) => set('p', v)} />
      <Slider label="Saturation d₀" value={params.d0} min={1} max={60} step={1} onChange={(v) => set('d0', v)} />
      <Slider label="Triadic bonus λ" value={params.lambda} min={0} max={1.5} step={0.01} format={(v) => v.toFixed(2)} onChange={(v) => set('lambda', v)} />
      <Slider label="Pref. attachment α" value={params.alpha} min={0} max={2} step={0.05} format={(v) => v.toFixed(2)} onChange={(v) => set('alpha', v)} />
      <Toggle label="Mutual consent" value={params.mutual} onChange={(v) => set('mutual', v)} />

      <h3 className="mono xp-group">Tie maintenance</h3>
      <Slider label="Strengthen rate" value={params.ps} min={0} max={0.6} step={0.01} format={(v) => v.toFixed(2)} onChange={(v) => set('ps', v)} />
      <Slider label="Decay per round" value={params.decay} min={0} max={20} step={0.5} format={(v) => v.toFixed(1)} onChange={(v) => set('decay', v)} />
      <Slider label="New tie strength" value={params.sInit} min={5} max={100} step={1} onChange={(v) => set('sInit', v)} />

      <h3 className="mono xp-group">Run</h3>
      <Slider label="Length in days" value={params.days} min={20} max={600} step={10} onChange={(v) => set('days', v)} />
      <Slider label="Seed" value={props.seed} min={1} max={99999} step={1} onChange={props.onSeed} />
    </div>
  );
}
