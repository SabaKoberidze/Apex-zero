import type { Car, Prefs, Scored } from '../types';
import { CARS } from '../data/cars';
import { clearanceFor, desiredHp } from '../scoring/engine';
import { USES } from '../scoring/profiles';
import { shortNote, summarise } from '../results/summary';
import { Pane, PaneHead, Rows } from './ui';

const engineWord = (c: Car) =>
  c.cylinders === 0 ? 'ELECTRIC'
  : c.cylinders === 2 ? 'ROTARY'
  : c.cylinders === 3 ? 'THREE CYLINDER'
  : c.cylinders === 4 ? 'FOUR CYLINDER'
  : c.cylinders === 5 ? 'FIVE CYLINDER'
  : c.cylinders === 6 ? 'SIX CYLINDER'
  : c.cylinders === 8 ? 'V8' : 'V12';

const gearWord = (c: Car) =>
  c.trans === 'cvt' ? 'CVT'
  : c.trans === 'single' ? 'SINGLE SPEED'
  : `${c.gears} SPEED ${c.trans.toUpperCase()}`;

const specLine = (c: Car) =>
  [c.body, `${c.seats} seats`, engineWord(c), gearWord(c), c.drive]
    .join(' / ').toUpperCase();

const priceClass = (c: Car) => `$${Math.round(c.price / 1000)}k class`;

export function ResultsScreen({ prefs, results, onRevise, onRestart }: {
  prefs: Prefs;
  results: Scored[];
  onRevise: () => void;
  onRestart: () => void;
}) {
  const [best, ...rest] = results;
  // Shared across the runner-ups so no two cards lead with the same reason.
  const taken = new Set<string>();

  const recap: [string, string, boolean?][] = [
    ['Use', USES[prefs.use].label, true],
    ['Body', prefs.body ?? 'Open'],
    ['Seats', `${prefs.seats}+`],
    ['Driven', prefs.drive ? prefs.drive.toUpperCase() : 'Open'],
    ['Engine', prefs.cylinders === 'any' ? 'Open' : prefs.cylinders],
    ['Power', `~${desiredHp(prefs.power)} hp`],
    ['Gearbox', prefs.trans === 'any' ? 'Open' : prefs.trans],
    ['Clearance', clearanceFor(prefs)],
    ['Budget', `$${(prefs.budget[0] / 1000).toFixed(0)}k – $${(prefs.budget[1] / 1000).toFixed(0)}k`, true],
    ['Reliability floor', `${prefs.minReliability}/5`],
  ];

  return (
    <div className="view view-scroll">
      <div className="results">
        <div>
          <div className="kicker">
            <b>BEST MATCH · {best.score.toFixed(0)}%</b>
            <span>{priceClass(best.car).toUpperCase()}</span>
          </div>

          <h1 className="best-name">{best.car.make} {best.car.model}</h1>
          <div className="spec-line">{specLine(best.car)} / {best.car.yearFrom}–{best.car.yearTo}</div>

          <p className="best-blurb">{summarise(best, prefs)}</p>

          <div className="pill-row">
            {best.reasons.slice(0, 7).map((r) => (
              <span key={r.label} className={r.ok ? 'pill ok' : 'pill'}>{r.label}: {r.detail}</span>
            ))}
          </div>

          <Pane className="recap">
            <PaneHead lime="WHAT YOU SEARCHED FOR" />
            <Rows items={recap} />
          </Pane>

          <div className="q-nav">
            <button className="btn" onClick={onRevise}>CHANGE CRITERIA</button>
            <button className="btn ghost" onClick={onRestart}>START OVER</button>
          </div>
        </div>

        <Pane>
          <PaneHead lime="ALSO WORTH DRIVING" />
          <div className="rows">
            <p className="fineprint" style={{ marginTop: 0 }}>
              NEXT BEST OF {CARS.length} INDEXED MODELS
            </p>
            {rest.map((r, i) => {
              const miss = r.reasons.find((x) => !x.ok);
              const note = shortNote(r, taken);
              return (
                <div key={r.car.id} className={i === 0 ? 'alt-card top' : 'alt-card'}>
                  <div className="alt-head">
                    <span className="n">{String(i + 2).padStart(2, '0')}</span>
                    <h3>{r.car.make} {r.car.model}</h3>
                    <span className="score">{r.score.toFixed(0)}</span>
                  </div>
                  <p className="alt-spec">{specLine(r.car)}</p>
                  <p className="alt-price">{priceClass(r.car)}</p>
                  {note ? <p className="alt-note">{note}</p> : null}
                  {miss ? <p className="alt-warn">! {miss.label}: {miss.detail}</p> : null}
                </div>
              );
            })}
            <p className="fineprint">
              INDICATIVE USED PRICING / CHECK LOCAL SPEC, TRIM AND AVAILABILITY
            </p>
          </div>
        </Pane>
      </div>
    </div>
  );
}
