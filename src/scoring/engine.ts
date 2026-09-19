import type { Car, Clearance, Drive, EnginePos, Prefs, Scored, Trans } from '../types';
import { CARS } from '../data/cars';
import { USES } from './profiles';

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

const DRIVE_KIN: Record<Drive, Partial<Record<Drive, number>>> = {
  fwd: { awd: 0.5, rwd: 0.2, '4x4': 0.15 },
  rwd: { awd: 0.45, '4x4': 0.3, fwd: 0.2 },
  awd: { '4x4': 0.8, fwd: 0.45, rwd: 0.45 },
  '4x4': { awd: 0.8, rwd: 0.3, fwd: 0.1 },
};

const TRANS_KIN: Record<Trans, Partial<Record<Trans, number>>> = {
  manual: { dct: 0.45, auto: 0.15, cvt: 0.05, single: 0.1 },
  auto: { dct: 0.75, cvt: 0.6, single: 0.7, manual: 0.2 },
  dct: { manual: 0.45, auto: 0.7, cvt: 0.3, single: 0.4 },
  cvt: { auto: 0.6, single: 0.7, dct: 0.3, manual: 0.05 },
  single: { auto: 0.7, cvt: 0.7, dct: 0.4, manual: 0.1 },
};

const CLEARANCE_TARGET: Record<Clearance, number> = { low: 128, normal: 175, high: 235 };

/** Mid and rear at least share the idea of mass behind you; front does not. */
const POS_KIN: Record<EnginePos, Partial<Record<EnginePos, number>>> = {
  front: { mid: 0.25, rear: 0.15 },
  mid: { rear: 0.55, front: 0.25 },
  rear: { mid: 0.55, front: 0.15 },
};

/** Ride height is not a question any more — it falls out of how you drive. */
export function clearanceFor(prefs: Prefs): Clearance {
  return USES[prefs.use].clearance;
}

/** Slider 0-100 -> a horsepower wish, log-ish so the low end stays useful. */
export function desiredHp(power: number) {
  return Math.round(85 * Math.pow(600 / 85, power / 100));
}

/** Sum of tag bonuses, squashed into 0..1 around a neutral midpoint. */
function tagScore(car: Car, table: Record<string, number>) {
  let sum = 0;
  for (const t of car.tags) sum += table[t] ?? 0;
  return clamp01(0.5 + sum * 0.35);
}

function useScore(car: Car, prefs: Prefs) {
  const u = USES[prefs.use];
  const body = u.bodies[car.body] ?? 0.25;
  const tags = tagScore(car, u.tags);

  const [lo, hi] = u.hp;
  const hp = car.hp < lo ? clamp01(1 - (lo - car.hp) / lo)
    : car.hp > hi ? clamp01(1 - ((car.hp - hi) / hi) * 0.7)
    : 1;

  const economy = clamp01((Math.min(car.mpg, 60) - 12) / 40);

  return clamp01(body * 0.42 + tags * 0.33 + hp * 0.15 + economy * u.economy * 0.10);
}

function bodyScore(car: Car, prefs: Prefs) {
  if (!prefs.body) return 1;
  if (car.body === prefs.body) return 1;
  // A near-miss still counts for something, judged by how well it suits the use.
  return Math.max(0.08, (USES[prefs.use].bodies[car.body] ?? 0.25) * 0.55);
}

function driveScore(car: Car, prefs: Prefs) {
  if (!prefs.drive) return 1;
  if (car.drive === prefs.drive) return 1;
  return DRIVE_KIN[prefs.drive][car.drive] ?? 0.1;
}

function cylScore(car: Car, prefs: Prefs) {
  const c = car.cylinders;
  switch (prefs.cylinders) {
    case 'any': return 1;
    case '3-4': return c === 0 ? 0.25 : c <= 4 ? 1 : c === 5 ? 0.6 : c === 6 ? 0.3 : 0.05;
    case '5-6': return c === 0 ? 0.2 : c === 5 || c === 6 ? 1 : c === 4 ? 0.45 : c === 8 ? 0.5 : 0.2;
    case '8+': return c === 0 ? 0.3 : c >= 8 ? 1 : c === 6 ? 0.5 : 0.08;
    case 'electric': return c === 0 ? 1 : 0.05;
  }
}

function posScore(car: Car, prefs: Prefs) {
  if (!prefs.enginePos) return 1;
  if (car.enginePos === prefs.enginePos) return 1;
  return POS_KIN[prefs.enginePos][car.enginePos] ?? 0.15;
}

function transScore(car: Car, prefs: Prefs) {
  if (prefs.trans === 'any') return 1;
  return car.trans === prefs.trans ? 1 : TRANS_KIN[prefs.trans][car.trans] ?? 0.1;
}

function seatScore(car: Car, prefs: Prefs) {
  if (car.seats >= prefs.seats) return clamp01(1 - (car.seats - prefs.seats) * 0.05);
  return clamp01(1 - (prefs.seats - car.seats) * 0.4);
}

function clearanceScore(car: Car, prefs: Prefs) {
  const want = clearanceFor(prefs);
  const target = CLEARANCE_TARGET[want];
  if (want === 'high' && car.clearance >= target) return 1;
  if (want === 'low' && car.clearance <= target) return 1;
  return clamp01(1 - Math.abs(car.clearance - target) / 150);
}

function reliabilityScore(car: Car, prefs: Prefs) {
  const base = (car.reliability - 1) / 4;
  return car.reliability < prefs.minReliability ? base * 0.3 : base;
}

function powerScore(car: Car, prefs: Prefs) {
  const want = desiredHp(prefs.power);
  const ratio = Math.log(car.hp / want) / Math.log(2.4);
  // Overshooting power is more forgivable than falling short.
  return clamp01(1 - (ratio < 0 ? Math.abs(ratio) : ratio * 0.65));
}

function sportyScore(car: Car, prefs: Prefs) {
  return clamp01(1 - Math.abs((car.looks - 1) * 25 - prefs.sporty) / 100);
}

function efficiencyScore(car: Car) {
  return clamp01((Math.min(car.mpg, 60) - 12) / 40);
}

function budgetScore(car: Car, prefs: Prefs) {
  const [lo, hi] = prefs.budget;
  if (car.price >= lo && car.price <= hi) return 1;
  const span = Math.max(4000, hi - lo);
  const miss = car.price < lo ? lo - car.price : car.price - hi;
  // Being under budget barely hurts; being over it does.
  return clamp01(1 - miss / (car.price < lo ? span * 1.6 : span * 0.6));
}

interface Crit {
  label: string;
  weight: number;
  score: number;
  detail: (car: Car) => string;
}

/** Which criteria a given question is responsible for. */
const DECIDES: Record<string, string[]> = {
  use: ['Use'],
  body: ['Body'],
  seats: ['Seats'],
  drive: ['Drivetrain'],
  engine: ['Engine', 'Engine bay'],
  power: ['Power'],
  gearbox: ['Gearbox'],
  looks: ['Looks'],
  reliability: ['Reliability'],
  economy: ['Efficiency'],
  budget: ['Budget'],
};

function criteria(car: Car, prefs: Prefs): Crit[] {
  return [
    { label: 'Use', weight: 110, score: useScore(car, prefs), detail: () => USES[prefs.use].label.toLowerCase() },
    { label: 'Body', weight: prefs.body ? 85 : 0, score: bodyScore(car, prefs), detail: (c) => c.body },
    { label: 'Drivetrain', weight: prefs.drive ? 55 : 0, score: driveScore(car, prefs), detail: (c) => c.drive.toUpperCase() },
    {
      label: 'Engine',
      weight: prefs.cylinders === 'any' ? 0 : 65,
      score: cylScore(car, prefs),
      detail: (c) => (c.cylinders === 0 ? 'electric' : `${c.cylinders}-cyl ${c.displacement}L`),
    },
    {
      label: 'Engine bay',
      weight: prefs.enginePos ? 50 : 0,
      score: posScore(car, prefs),
      detail: (c) => c.enginePos + ' engine',
    },
    // Electrics have no gearbox to choose, so it is neither asked nor scored.
    {
      label: 'Gearbox',
      weight: prefs.trans === 'any' || prefs.cylinders === 'electric' ? 0 : 55,
      score: transScore(car, prefs),
      detail: (c) => c.trans,
    },
    { label: 'Seats', weight: 55, score: seatScore(car, prefs), detail: (c) => `${c.seats} seats` },
    { label: 'Ground clearance', weight: 45, score: clearanceScore(car, prefs), detail: (c) => `${c.clearance} mm` },
    { label: 'Reliability', weight: 62, score: reliabilityScore(car, prefs), detail: (c) => `${c.reliability}/5 reputation` },
    { label: 'Power', weight: 58, score: powerScore(car, prefs), detail: (c) => `${c.hp} hp` },
    { label: 'Looks', weight: 48, score: sportyScore(car, prefs), detail: (c) => `${c.looks}/5 attitude` },
    // How much economy counts is the economy question itself.
    { label: 'Efficiency', weight: prefs.economy * 0.85, score: efficiencyScore(car), detail: (c) => `${c.mpg} mpg` },
    { label: 'Budget', weight: 66, score: budgetScore(car, prefs), detail: (c) => `$${c.price.toLocaleString()}` },
  ];
}

export function scoreCar(car: Car, prefs: Prefs): Scored {
  const loud = prefs.decisive ? DECIDES[prefs.decisive] ?? [] : [];
  const crits = criteria(car, prefs)
    .map((c) => (loud.includes(c.label) ? { ...c, weight: c.weight * 2.6 } : c))
    .filter((c) => c.weight > 0);
  const totalW = crits.reduce((s, c) => s + c.weight, 0) || 1;
  const score = crits.reduce((s, c) => s + c.weight * c.score, 0) / totalW;
  return {
    car,
    score: Math.round(score * 1000) / 10,
    reasons: crits
      .slice()
      .sort((a, b) => b.weight * (b.score - 0.5) - a.weight * (a.score - 0.5))
      .map((c) => ({ label: c.label, ok: c.score >= 0.65, detail: c.detail(car) })),
  };
}

export function rank(prefs: Prefs, limit = 5, maxPerMake = 2): Scored[] {
  const all = CARS.map((c) => scoreCar(c, prefs)).sort((a, b) => b.score - a.score);
  const seen = new Map<string, number>();
  const out: Scored[] = [];
  for (const s of all) {
    const n = seen.get(s.car.make) ?? 0;
    if (n >= maxPerMake) continue;
    seen.set(s.car.make, n + 1);
    out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Answers that stop making sense once another answer has been given.
 *
 * Kept in one place and applied on every change, rather than having each
 * screen remember to hide its own controls: the two would drift apart and a
 * stale value would still be sitting in the preferences, being scored.
 *
 *   electric  -> no gearbox, no engine position
 */
export function reconcile(p: Prefs): Prefs {
  const out = { ...p };

  if (out.cylinders === 'electric') {
    out.enginePos = null;
    out.trans = 'any';
    if (out.decisive === 'gearbox') out.decisive = null;
  }

  return out;
}



export const DEFAULT_PREFS: Prefs = {
  use: 'mountain',
  body: 'wagon',
  seats: 5,
  drive: 'awd',
  cylinders: '5-6',
  enginePos: null,
  trans: 'manual',
  power: 55,
  sporty: 60,
  economy: 40,
  minReliability: 4,
  budget: [8000, 35000],
  decisive: null,
};

/**
 * How many things the scorer weighs, counted rather than remembered: the
 * badge on the scoring screen reads this, and a hand-typed number there went
 * stale the moment a criterion was dropped.
 */
export const CRITERIA_COUNT = criteria(CARS[0], DEFAULT_PREFS).length;
