import { useEffect, useRef, useState } from 'react';
import type { Prefs, Scored } from '../types';
import { CRITERIA_COUNT, rank } from '../scoring/engine';
import { CARS } from '../data/cars';

const LINES = [
  'Parsing criteria',
  'Filtering by body and seats',
  'Matching powertrain',
  'Weighing budget band',
  'Ranking the shortlist',
];

/**
 * Scoring five hundred cars takes about a millisecond, so this is a paced
 * reveal rather than a wait — long enough to read the criteria going past,
 * short enough not to feel like a stall.
 */
const RUN_MS = 2200;

export function Scoring({ prefs, onDone }: {
  prefs: Prefs;
  onDone: (results: Scored[]) => void;
}) {
  const [pct, setPct] = useState(0);
  const done = useRef(false);

  useEffect(() => {
    const started = performance.now();
    const results = rank(prefs);

    let raf = 0;
    const tick = () => {
      const t = Math.min(1, (performance.now() - started) / RUN_MS);
      setPct(t * 100);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else if (!done.current) {
        done.current = true;
        setTimeout(() => onDone(results), 260);
      }
    };
    raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(raf);
  }, [prefs, onDone]);

  const live = Math.min(LINES.length - 1, Math.floor((pct / 100) * LINES.length));

  return (
    <div className="view scoring">
      <div className="pane">
        <div className="scoring-top">
          <span className="label">Scoring the catalogue</span>
          <span className="scoring-pct">{Math.round(pct)}</span>
        </div>

        <div className="bar" style={{ marginTop: 14 }}>
          {Array.from({ length: 30 }, (_, i) => (
            <i key={i} className={i < Math.round((pct / 100) * 30) ? 'on' : ''} />
          ))}
        </div>

        <div className="checks">
          {LINES.map((l, i) => (
            <div key={l} className={i < live ? 'ok' : i === live ? 'live' : ''}>
              <span>{i <= live ? (i < live ? '+' : '>') : ' '} {l}</span>
              {i < live ? <span>OK</span> : null}
            </div>
          ))}
        </div>

        <div className="scoring-foot">
          <span className="tagline tag-box">{CRITERIA_COUNT} CRITERIA</span>
          <span className="tagline tag-box">{CARS.length} INDEXED MODELS</span>
          <b>SCORING</b>
        </div>
      </div>
    </div>
  );
}
