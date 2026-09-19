import type { ReactNode } from 'react';

export function Pane({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`pane ${className}`}>{children}</div>;
}

export function PaneHead({ lime, boxes }: { lime: string; boxes?: string[] }) {
  return (
    <div className="pane-head">
      <span className="tagline tag-lime">{lime}</span>
      {boxes?.map((b) => <span key={b} className="tagline tag-box">{b}</span>)}
    </div>
  );
}

export function OptionGrid<T extends string>({ options, selected, onPick, columns = 3 }: {
  options: { value: T; name: string; hint?: string }[];
  selected: T[];
  onPick: (v: T) => void;
  columns?: 2 | 3;
}) {
  return (
    <div className={columns === 2 ? 'opts two' : 'opts'}>
      {options.map((o, i) => (
        <button
          key={o.value}
          className={selected.includes(o.value) ? 'opt on' : 'opt'}
          onClick={() => onPick(o.value)}
        >
          <span className="idx">{String(i + 1).padStart(2, '0')}</span>
          <span className="box" />
          <span className="name">{o.name}</span>
          {o.hint ? <span className="hint">{o.hint}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Meter({ label, value, min, max, step = 1, display, left, right, onChange, cells = 26 }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  display: string | number;
  left: string;
  right: string;
  onChange: (v: number) => void;
  cells?: number;
}) {
  const filled = Math.round(((value - min) / (max - min)) * cells);
  return (
    <div className="meter-block">
      <div className="meter-head">
        <span>{label}</span>
        <span className="meter-val">{display}</span>
      </div>
      <div className="meter-wrap">
        <div className="cells">
          {Array.from({ length: cells }, (_, i) => <i key={i} className={i < filled ? 'on' : ''} />)}
        </div>
        <input
          type="range"
          min={min} max={max} step={step} value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={label}
        />
      </div>
      <div className="meter-foot"><span>{left}</span><span>{right}</span></div>
    </div>
  );
}

export function Rows({ items }: { items: [string, string, boolean?][] }) {
  return (
    <div className="rows">
      {items.map(([k, v, hot]) => (
        <div className="rrow" key={k}>
          <span className="k">{k}</span>
          <span className={hot ? 'v hot' : 'v'}>{v}</span>
        </div>
      ))}
    </div>
  );
}

export function Note({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="note">
      <h4>{title}</h4>
      <p>{children}</p>
    </div>
  );
}
