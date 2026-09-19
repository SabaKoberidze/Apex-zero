import type { Body, Clearance, Use } from '../types';

/**
 * What each way of using a car actually asks for. These are the shared source
 * of truth: the scorer reads them, the readout panels quote them, and the blob
 * takes its stance and attitude from them.
 */
export interface UseProfile {
  label: string;
  hint: string;
  blurb: string;
  /** Body affinity, 0-1. Anything unlisted scores 0.25. */
  bodies: Partial<Record<Body, number>>;
  /** Tag bonuses. Positive rewards, negative punishes. */
  tags: Record<string, number>;
  clearance: Clearance;
  /** The horsepower band this use actually wants. */
  hp: [number, number];
  /** How much fuel economy matters here, 0-1. */
  economy: number;
  /** Visual attitude this use leans toward, 0-100. */
  attitude: number;
}

export const USES: Record<Use, UseProfile> = {
  city: {
    label: 'City',
    hint: 'short hops, tight parking',
    blurb: 'Small footprint, light controls, cheap to leave on a street.',
    bodies: { hatch: 1, sedan: 0.7, suv: 0.5, wagon: 0.5, coupe: 0.45, van: 0.3, pickup: 0.15 },
    tags: { small: 0.9, tiny: 1, frugal: 0.8, ev: 0.7, cheap: 0.5, practical: 0.5, 'cheap-parts': 0.5, big: -0.8, truck: -0.7, tow: -0.4 },
    clearance: 'normal',
    hp: [100, 220],
    economy: 0.85,
    attitude: 35,
  },
  highway: {
    label: 'Highway',
    hint: 'long hauls, motorway miles',
    blurb: 'Quiet at speed, comfortable for hours, happy to cover distance.',
    bodies: { sedan: 1, wagon: 0.9, suv: 0.75, hatch: 0.55, coupe: 0.5, van: 0.5, pickup: 0.35 },
    tags: { comfort: 1, quiet: 0.9, touring: 0.8, diesel: 0.6, luxury: 0.6, frugal: 0.5, hybrid: 0.4, track: -0.4, tiny: -0.5 },
    clearance: 'normal',
    hp: [180, 380],
    economy: 0.7,
    attitude: 40,
  },
  mountain: {
    label: 'Mountain roads',
    hint: 'corners, not commutes',
    blurb: 'Light, balanced, and keen to change direction. Weight is the enemy.',
    bodies: { coupe: 1, convertible: 0.95, hatch: 0.8, sedan: 0.7, wagon: 0.5, suv: 0.25, van: 0.1, pickup: 0.1 },
    tags: { sporty: 1, fun: 1, light: 0.9, balanced: 0.8, rwd: 0.6, mid: 0.6, jdm: 0.4, big: -0.7, tow: -0.5, van: -0.8 },
    clearance: 'low',
    hp: [180, 420],
    economy: 0.3,
    attitude: 75,
  },
  trail: {
    label: 'Trail',
    hint: 'gravel, ruts, weather',
    blurb: 'Ground clearance, short overhangs and parts you can find anywhere.',
    bodies: { suv: 1, pickup: 0.95, wagon: 0.5, van: 0.35, hatch: 0.2, sedan: 0.1, coupe: 0.05 },
    tags: { offroad: 1, tough: 0.9, boxy: 0.6, diesel: 0.5, truck: 0.5, legend: 0.4, track: -0.6, light: -0.2 },
    clearance: 'high',
    hp: [150, 400],
    economy: 0.25,
    attitude: 65,
  },
  track: {
    label: 'Track days',
    hint: 'lap times, not laps of town',
    blurb: 'Brakes, grip and a shape that stays planted. Comfort is optional.',
    bodies: { coupe: 1, hatch: 0.75, sedan: 0.65, convertible: 0.6, wagon: 0.25, suv: 0.1, pickup: 0.05, van: 0.05 },
    tags: { track: 1, fast: 0.95, sporty: 0.9, light: 0.8, balanced: 0.6, comfort: -0.3, van: -0.9, tow: -0.6 },
    clearance: 'low',
    hp: [260, 600],
    economy: 0.05,
    attitude: 92,
  },
  haul: {
    label: 'Hauling',
    hint: 'people, gear, trailers',
    blurb: 'Space and towing capacity first; everything else is a bonus.',
    bodies: { pickup: 1, van: 0.95, suv: 0.9, wagon: 0.6, sedan: 0.25, hatch: 0.2, coupe: 0.05 },
    tags: { tow: 1, truck: 0.9, '3row': 0.8, practical: 0.7, cargo: 0.7, big: 0.6, tough: 0.5, light: -0.4, track: -0.6 },
    clearance: 'high',
    hp: [200, 450],
    economy: 0.3,
    attitude: 45,
  },
};
