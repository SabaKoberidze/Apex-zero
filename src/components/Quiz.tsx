import { useEffect } from 'react';
import type { Prefs } from '../types';
import type { Traits } from '../three/traits';
import type { Step } from '../quiz/steps';
import { Note, Pane, PaneHead, Rows } from './ui';

export function Quiz({ step, steps, prefs, traits, onChange, onStep }: {
  step: number;
  steps: Step[];
  prefs: Prefs;
  traits: Traits;
  onChange: (p: Prefs) => void;
  onStep: (i: number) => void;
}) {
  const s = steps[step];
  const set = <K extends keyof Prefs>(k: K, v: Prefs[K]) => onChange({ ...prefs, [k]: v });
  const readout = s.readout(prefs, traits);
  const last = step === steps.length - 1;

  // Enter walks forward, Escape walks back — the panel is all buttons otherwise.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A focused button already handles Enter itself. Without this guard,
      // clicking NEXT and then pressing Enter fires the button and this
      // handler, and the quiz jumps two steps at once.
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'BUTTON' || el.tagName === 'INPUT')) return;
      if (e.key === 'Enter') onStep(step + 1);
      if (e.key === 'Escape') onStep(step - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, onStep]);

  return (
    <div className="view quiz">
      <div className="quiz-side view-scroll">
        <Pane>
          <span className="ghost-num">{String(step + 1).padStart(2, '0')}</span>
          <PaneHead lime={`${String(step + 1).padStart(2, '0')} / ${String(steps.length).padStart(2, '0')}`} boxes={[s.label.toUpperCase()]} />
          <div className="q-body">
            <h2 className="q-title">{s.title}</h2>
            <p className="q-sub">{s.sub}</p>
            <s.Body prefs={prefs} set={set} />
            {/* One question, and only one, can be marked as the thing that
                really decides it. Picking it here clears it everywhere else. */}
            <button
              className={prefs.decisive === s.key ? 'decisive on' : 'decisive'}
              onClick={() => onChange({ ...prefs, decisive: prefs.decisive === s.key ? null : s.key })}
            >
              {prefs.decisive === s.key ? '\u25A0 THIS DECIDES IT' : '\u25A1 THIS DECIDES IT'}
            </button>

            <div className="q-nav">
              <button className="btn sm ghost" onClick={() => onStep(step - 1)}>
                {'< BACK'}
              </button>
              <button className="btn sm" onClick={() => onStep(step + 1)}>
                {last ? 'SCORE THE CATALOGUE >' : 'NEXT >'}
              </button>
            </div>
          </div>
        </Pane>
      </div>

      <div className="quiz-read">
        <Pane>
          <PaneHead lime={readout.title.toUpperCase()} />
          <Rows items={readout.rows} />
          {readout.note ? <Note title={readout.note.title}>{readout.note.body}</Note> : null}
        </Pane>
      </div>
    </div>
  );
}
