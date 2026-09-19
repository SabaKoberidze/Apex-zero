import type { Body, Drive, EnginePos, Prefs, Use } from '../types';
import { reconcile } from '../scoring/engine';

const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];

const USES: readonly Use[] = ['city', 'highway', 'mountain', 'trail', 'track', 'haul'];
const BODIES: readonly Body[] = ['sedan', 'wagon', 'hatch', 'suv', 'coupe', 'pickup', 'van', 'convertible'];
const DRIVES: readonly Drive[] = ['fwd', 'rwd', 'awd', '4x4'];
// Front three times over, because mid and rear are rare and a showreel that
// hands them out evenly stops looking like a catalogue of real cars.
const POSITIONS: readonly EnginePos[] = ['front', 'front', 'front', 'mid', 'rear'];
const BUDGETS: readonly [number, number][] = [
  [4000, 12000], [10000, 25000], [22000, 45000], [40000, 75000],
];

/**
 * A plausible brief, drawn at random, for the intro to cycle through. It is
 * run through the same reconcile as a real answer, so an electric never comes
 * out of here holding a gearbox.
 *
 * This never touches the preferences the quiz actually starts from: it drives
 * the volume and nothing else.
 */
export function randomPrefs(): Prefs {
  return reconcile({
    use: pick(USES),
    body: pick(BODIES),
    seats: pick([2, 4, 5, 7]),
    drive: pick(DRIVES),
    cylinders: pick(['3-4', '5-6', '8+', 'electric'] as const),
    enginePos: pick(POSITIONS),
    trans: pick(['manual', 'auto', 'dct', 'cvt'] as const),
    power: pick([20, 45, 70, 92]),
    sporty: pick([10, 38, 66, 92]),
    economy: pick([5, 35, 70, 100]),
    minReliability: pick([1, 3, 4, 5]),
    budget: pick(BUDGETS),
    decisive: null,
  });
}
