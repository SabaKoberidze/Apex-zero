import { useCallback, useEffect, useMemo, useState } from 'react';
import { BlobCanvas } from './components/BlobCanvas';
import { Footer, Header } from './components/Chrome';
import type { Phase } from './components/Chrome';
import { Intro } from './components/Intro';
import { Quiz } from './components/Quiz';
import { Scoring } from './components/Scoring';
import { ResultsScreen } from './components/ResultsScreen';
import { activeSteps } from './quiz/steps';
import { randomPrefs } from './quiz/showreel';
import { CARS } from './data/cars';
import { DEFAULT_PREFS, reconcile } from './scoring/engine';
import { prefsToTraits } from './three/traits';
import type { Prefs, Scored } from './types';

type ViewSpec = { shiftX: number; shiftY: number; zoom: number };

/**
 * On a wide screen the stage is a full-bleed backdrop, so each phase nudges
 * the volume sideways into whatever gap the panels leave. Positive shiftX
 * moves it right, away from them.
 */
const VIEWS: Record<Phase, ViewSpec> = {
  intro:   { shiftX: 0.26, shiftY: 0.03, zoom: 0.78 },
  quiz:    { shiftX: 0.06, shiftY: 0.02, zoom: 0.58 },
  scoring: { shiftX: 0.00, shiftY: 0.02, zoom: 0.52 },
  results: { shiftX: 0.14, shiftY: -0.07, zoom: 0.62 },
};

/**
 * Below the breakpoint the stage is a band of its own with nothing on top of
 * it, so there is no gap to dodge: the volume is centred and framed tighter,
 * because the band is a good deal shorter than a full stage.
 */
const VIEWS_BAND: Record<Phase, ViewSpec> = {
  intro:   { shiftX: 0, shiftY: 0.02, zoom: 1.12 },
  quiz:    { shiftX: 0, shiftY: 0.02, zoom: 1.08 },
  scoring: { shiftX: 0, shiftY: 0.02, zoom: 0.98 },
  results: { shiftX: 0, shiftY: 0.02, zoom: 1.02 },
};

/** Must match the responsive breakpoint in styles.css. */
const BAND_QUERY = '(max-width: 1180px)';

function useBandLayout() {
  const [band, setBand] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(BAND_QUERY).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(BAND_QUERY);
    const on = () => setBand(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return band;
}

/** A stable-looking serial for the header, so a given brief always reads the same. */
function signature(prefs: Prefs) {
  const s = JSON.stringify(prefs);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `0x${h.toString(16).toUpperCase().slice(0, 4)}`;
}

export default function App() {
  const band = useBandLayout();
  const [phase, setPhase] = useState<Phase>('intro');
  const [step, setStep] = useState(0);
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [results, setResults] = useState<Scored[]>([]);
  // The intro runs a showreel: a new random brief every few seconds, so the
  // volume is already doing something before anyone has answered anything.
  // Kept separate from `prefs` so the quiz still starts from the defaults.
  const [demo, setDemo] = useState(randomPrefs);

  useEffect(() => {
    if (phase !== 'intro') return;
    const id = setInterval(() => setDemo(randomPrefs()), 4200);
    return () => clearInterval(id);
  }, [phase]);

  const steps = useMemo(() => activeSteps(prefs), [prefs]);
  // Dropping a step can leave the index past the end of the list.
  const safeStep = Math.min(step, steps.length - 1);
  const traits = useMemo(
    () => prefsToTraits(phase === 'intro' ? demo : prefs),
    [phase, demo, prefs],
  );
  const sig = useMemo(() => signature(prefs), [prefs]);

  const goStep = useCallback((i: number) => {
    if (i < 0) {
      if (step === 0) setPhase('intro');
      else setStep(step - 1);
    } else if (i >= steps.length) {
      setPhase('scoring');
    } else {
      setStep(i);
    }
  }, [step, steps.length]);

  const onScored = useCallback((r: Scored[]) => {
    setResults(r);
    setPhase('results');
  }, []);

  const percent = phase === 'intro' ? 0
    : phase === 'quiz' ? ((safeStep + 1) / steps.length) * 100
    : 100;

  const footLabel = phase === 'intro' ? 'STANDBY'
    : phase === 'quiz' ? steps[safeStep].label.toUpperCase()
    : phase === 'scoring' ? 'RUNNING'
    : 'COMPLETE';

  return (
    <div className="shell">
      <div className="grid-bg" />
      <span className="corner tl">+</span>
      <span className="corner tr">+</span>
      <span className="corner bl">+</span>
      <span className="corner br">+</span>

      <Header phase={phase} step={safeStep} steps={steps} count={CARS.length} sig={sig} onJump={setStep} />
      <div className={phase === 'scoring' ? 'hazard alert' : 'hazard'} />

      <div className={`stage-layer stage-${phase}`}>
        <BlobCanvas traits={traits} view={(band ? VIEWS_BAND : VIEWS)[phase]} />
      </div>

      {phase === 'intro' ? (
        <Intro count={CARS.length} onStart={() => { setPhase('quiz'); setStep(0); }} />
      ) : null}

      {phase === 'quiz' ? (
        <Quiz step={safeStep} steps={steps} prefs={prefs} traits={traits} onChange={(p) => setPrefs(reconcile(p))} onStep={goStep} />
      ) : null}

      {phase === 'scoring' ? <Scoring prefs={prefs} onDone={onScored} /> : null}

      {phase === 'results' ? (
        <ResultsScreen
          prefs={prefs}
          results={results}
          onRevise={() => { setPhase('quiz'); setStep(0); }}
          onRestart={() => { setPrefs(DEFAULT_PREFS); setPhase('intro'); setStep(0); }}
        />
      ) : null}

      <Footer percent={percent} label={footLabel} />
    </div>
  );
}
