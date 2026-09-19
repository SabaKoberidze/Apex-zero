import type { Car, Prefs, Scored, Use } from '../types';
import { USES } from '../scoring/profiles';

/**
 * The line under each pick, written from the scoring result rather than by a
 * model. The scorer already ranks every criterion by how much it moved this
 * car — first is what won it, last is what it cost — so the sentence is just
 * that ranking read back in English. Deterministic, instant, and it cannot
 * contradict the numbers next to it.
 */

const engineWord = (c: Car) =>
  c.cylinders === 0 ? 'an electric drivetrain'
  : c.cylinders === 2 ? 'a rotary'
  : `${c.displacement}L ${c.cylinders === 8 ? 'V8' : c.cylinders === 12 ? 'V12' : `${c.cylinders}-cylinder`}`;

const gearWord = (c: Car) =>
  c.trans === 'cvt' ? 'a CVT'
  : c.trans === 'single' ? 'a single speed'
  : `a ${c.gears}-speed ${c.trans === 'dct' ? 'twin-clutch' : c.trans}`;

const bodyWord = (b: string) => (b === 'suv' ? 'SUV' : b);
/** "an SUV", but "a pickup" — spoken as letters, so it takes the other article. */
const aBody = (b: string) => `${b === 'suv' ? 'an' : 'a'} ${bodyWord(b)}`;

const posWord = (c: Car) =>
  c.enginePos === 'front' ? 'up front' : c.enginePos === 'mid' ? 'amidships' : 'out the back';

const driveWord = (c: Car) =>
  c.drive === 'fwd' ? 'front-wheel drive'
  : c.drive === 'rwd' ? 'rear-wheel drive'
  : c.drive === 'awd' ? 'all-wheel drive'
  : 'a proper four-wheel-drive system';

/** How a criterion reads when this car won on it. */
function strength(label: string, c: Car): string {
  switch (label) {
    case 'Use': return `it was built for exactly this`;
    case 'Body': return `the ${bodyWord(c.body)} shape you wanted`;
    case 'Drivetrain': return driveWord(c);
    case 'Engine': return engineWord(c);
    case 'Engine bay': return `the engine ${posWord(c)}`;
    case 'Gearbox': return gearWord(c);
    case 'Seats': return `${c.seats} seats`;
    case 'Ground clearance': return `${c.clearance} mm underneath`;
    case 'Reliability': return `a ${c.reliability}/5 record`;
    case 'Power': return `${c.hp} hp`;
    case 'Looks': return `${c.looks}/5 on attitude`;
    case 'Efficiency': return `${c.mpg} mpg combined`;
    case 'Budget': return `about $${Math.round(c.price / 1000)}k used`;
    default: return label.toLowerCase();
  }
}

/** How the same criterion reads when it is the thing you give up. */
function compromise(label: string, c: Car, prefs: Prefs): string {
  switch (label) {
    case 'Use': return `it is not really a ${USES[prefs.use].label.toLowerCase()} car`;
    case 'Body': return `it is ${aBody(c.body)}, not the ${bodyWord(prefs.body ?? '')} you asked for`;
    case 'Drivetrain': return `it is ${driveWord(c)}`;
    case 'Engine': return `you get ${engineWord(c)}`;
    case 'Engine bay': return `the engine sits ${posWord(c)}`;
    case 'Gearbox': return `it comes with ${gearWord(c)}`;
    case 'Seats': return `it seats ${c.seats}`;
    case 'Ground clearance': return `${c.clearance} mm of clearance`;
    case 'Reliability': return `a ${c.reliability}/5 reputation`;
    case 'Power': return `${c.hp} hp is off your target`;
    case 'Looks': return `it looks ${c.looks}/5, quieter than you asked`;
    case 'Efficiency': return `${c.mpg} mpg`;
    case 'Budget': return c.price > prefs.budget[1]
      ? `at roughly $${Math.round(c.price / 1000)}k it is over your band`
      : `it sits under the money you were ready to spend`;
    default: return label.toLowerCase();
  }
}

/** The opening phrase. USES labels are menu items and do not read as prose. */
const WHERE: Record<Use, string> = {
  city: 'Around town',
  highway: 'For motorway miles',
  mountain: 'On a mountain road',
  trail: 'Off road',
  track: 'On track',
  haul: 'For hauling',
};

const join = (parts: string[]) =>
  parts.length < 2 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;

/** Two sentences for the headline pick. */
export function summarise({ car, reasons }: Scored, prefs: Prefs): string {
  // 'Use' is dropped: the opening phrase already says it, and "and it was
  // built for exactly this" reads badly in the middle of a list.
  const wins = reasons
    .filter((r) => r.ok && r.label !== 'Use')
    .slice(0, 3)
    .map((r) => strength(r.label, car));
  const missed = reasons.filter((r) => !r.ok);
  const worst = missed[missed.length - 1];

  const where = WHERE[prefs.use];
  const lead = wins.length
    ? `${where}, ${join(wins)} put it top of the list.`
    : `${where}, it came out top, if narrowly.`;

  const tail = worst
    ? `The trade is ${compromise(worst.label, car, prefs)}.`
    : missed.length === 0
      ? `Nothing on your list goes unmet.`
      : '';

  return [lead, tail].filter(Boolean).join(' ');
}

/**
 * One clause for a runner-up. `taken` carries the criteria already used
 * further up the list, so five cards do not all say the same thing — each one
 * volunteers the best reason nobody else has claimed yet.
 */
export function shortNote({ car, reasons }: Scored, taken?: Set<string>): string {
  const wins = reasons.filter((r) => r.ok);
  const win = wins.find((r) => !taken?.has(r.label)) ?? wins[0];
  if (!win) return '';
  taken?.add(win.label);
  const head = strength(win.label, car);
  return `${head.charAt(0).toUpperCase()}${head.slice(1)}.`;
}
