import type { Step } from '../quiz/steps';

export type Phase = 'intro' | 'quiz' | 'scoring' | 'results';

const STATUS: Record<Phase, { text: string; alert?: boolean }> = {
  intro: { text: 'catalogue loaded' },
  quiz: { text: 'x-ray active' },
  scoring: { text: 'scoring catalogue', alert: true },
  results: { text: 'shortlist ready' },
};

export function Header({ phase, step, steps, count, sig, onJump }: {
  phase: Phase;
  step: number;
  steps: Step[];
  count: number;
  sig: string;
  onJump: (i: number) => void;
}) {
  const status = STATUS[phase];
  const interactive = phase === 'quiz';

  return (
    <header className="top">
      <div className="brand">
        APEX <span className="slash">//</span> ZERO
        <small>PRODUCTION CAR FINDER</small>
      </div>

      <div className="steps">
        {steps.map((s, i) => {
          const state = phase === 'quiz' && i === step ? 'now' : (phase === 'results' || i < step) ? 'done' : '';
          return (
            <button
              key={s.key}
              className={`step-chip ${state} ${interactive ? 'clickable' : ''}`}
              onClick={() => interactive && onJump(i)}
              title={s.label}
              disabled={!interactive}
            >{String(i + 1).padStart(2, '0')}</button>
          );
        })}
      </div>

      <div className="status">
        <span>
          <i className={status.alert ? 'dot alert' : 'dot'} />
          {phase === 'intro' ? `${count} models indexed` : status.text}
        </span>
        <span className="hex">{sig}</span>
      </div>
    </header>
  );
}

export function Footer({ percent, label }: { percent: number; label: string }) {
  const cells = 28;
  const on = Math.round((percent / 100) * cells);
  return (
    <div className="bottom">
      <span>{label}</span>
      <div className="bar">
        {Array.from({ length: cells }, (_, i) => <i key={i} className={i < on ? 'on' : ''} />)}
      </div>
      <span>{Math.round(percent)}%</span>
      <a className="contact" href="mailto:koberidzesaba@gmail.com">
        WANT A FEATURE? KOBERIDZESABA@GMAIL.COM
      </a>
    </div>
  );
}
