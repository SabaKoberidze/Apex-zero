import type { Body, Prefs } from '../types';
import { USES } from '../scoring/profiles';
import { clearanceFor } from '../scoring/engine';

/**
 * Everything the blob shader needs. Every field is a plain number (or a colour
 * triple) so the renderer can lerp the whole struct frame by frame and get a
 * liquid morph for free.
 *
 * The body is not built from boxes. It is a swept profile: a roofline curve
 * and a plan-view width curve, extruded through a superellipse cross-section.
 * That is what gives it a hood, a windscreen, a haunch over each axle and a
 * tail, instead of a stack of bricks.
 */
export interface Traits {
  // --- swept-profile body -------------------------------------------------
  len: number;         // half length
  width: number;       // half width at the widest point
  taper: number;       // how much the plan narrows toward the ends
  haunch: number;      // muscle over each axle
  rocker: number;      // floor height (ride height)
  upsweep: number;     // how much the underside lifts at the ends
  deck: number;        // belt line above the floor — glass starts here
  nose: number;        // how far the bonnet drops at the front
  tailDrop: number;    // how far the deck drops at the back
  bedDrop: number;     // how far the deck falls away behind the cab (pickups)
  blunt: number;       // 0 = ends taper to a point, 1 = ends stay full width
  boxy: number;        // rear of the cabin: 0 = sloped, 1 = flat then a steep tailgate
  boxyFront: number;   // front of the cabin: 0 = curved screen, 1 = upright screen
  cabH: number;        // greenhouse height above the belt
  cabZ: number;        // where the roof peak sits, -1 (rear) .. 1 (front)
  cabFront: number;    // windscreen rake: how far forward the roof falls away
  cabRear: number;     // backlight rake: small = fastback, large = estate
  round: number;       // cross-section exponent: 2 = ellipse, 4 = boxy
  tumble: number;      // tumblehome — how far the glass pulls in as it rises

  wheelR: number; wheelW: number; track: number; wheelbase: number;
  rake: number;

  cloud: number;       // domain-warp amount
  turb: number;        // instability (inverse of reliability)
  sharp: number;       // edge hardness
  glitch: number;      // post-pass displacement
  shake: number;       // unreliability -> rigid-body tremble
  dropout: number;     // unreliability -> patches of the scan blink out
  fault: number;       // unreliability -> red warning flecks
  vel: number;         // how fast it is meant to feel
  blur: number;        // motion smear in the post pass
  quant: number;       // glitch block count (gearbox stepping)
  pulse: number;       // idle throb amplitude
  pulseRate: number;   // throb speed (cylinder count)
  fluid: number;       // smooth-union radius for the add-ons
  gloss: number;       // attitude -> specular sheen
  soft: number;        // attitude -> soft focus in the post pass
  smoke: number;       // economy -> exhaust plume (combustion)
  battThick: number;   // economy -> how deep the pack is (electric)
  camDist: number;
  camY: number;
  bound: number;
  cylPerBank: number;
  banks: number;
  battery: number;
  engineSize: number;  // overall scale of the engine mass
  engineZ: number;     // where the powertrain sits, -1 (rear) .. 1 (front)
  driveF: number;
  driveR: number;
  slices: number;
  wire: number;
  sweep: number;
  polish: number;
  colorA: [number, number, number];
  colorB: [number, number, number];
  colorW: [number, number, number];
  colorE: [number, number, number];   // powertrain, deliberately not a body colour
}

type Shape = Pick<Traits,
  'len' | 'width' | 'taper' | 'haunch' | 'upsweep' | 'deck' | 'nose' | 'tailDrop' |
  'cabH' | 'cabZ' | 'cabFront' | 'cabRear' | 'round' | 'tumble' | 'bedDrop' | 'blunt' | 'boxy' | 'boxyFront'>;

/** A normal car is about 4.4 units long here. */
const ARCHETYPES: Record<Body, Shape> = {
  sedan:       { len: 2.15, width: 0.90, taper: 0.55, haunch: 0.10, upsweep: 0.06, deck: 0.48, nose: 0.10, tailDrop: 0.07, cabH: 0.50, cabZ: -0.06, cabFront: 0.40, cabRear: 0.50, round: 2.47, tumble: 0.20, bedDrop: 0, blunt: 0.18, boxy: 0.15, boxyFront: 0.15 },
  wagon:       { len: 2.25, width: 0.92, taper: 0.45, haunch: 0.09, upsweep: 0.05, deck: 0.50, nose: 0.10, tailDrop: 0.02, cabH: 0.52, cabZ: -0.18, cabFront: 0.44, cabRear: 0.95, round: 2.63, tumble: 0.16, bedDrop: 0, blunt: 0.5, boxy: 0.45, boxyFront: 0.32 },
  hatch:       { len: 1.80, width: 0.89, taper: 0.46, haunch: 0.12, upsweep: 0.06, deck: 0.52, nose: 0.06, tailDrop: 0.01, cabH: 0.50, cabZ: 0.02, cabFront: 0.46, cabRear: 0.88, round: 2.60, tumble: 0.17, bedDrop: 0, blunt: 0.70, boxy: 0.78, boxyFront: 0.12 },
  suv:         { len: 2.20, width: 0.97, taper: 0.38, haunch: 0.12, upsweep: 0.10, deck: 0.70, nose: 0.10, tailDrop: 0.02, cabH: 0.56, cabZ: -0.12, cabFront: 0.46, cabRear: 0.88, round: 2.86, tumble: 0.12, bedDrop: 0, blunt: 0.58, boxy: 0.62, boxyFront: 0.55 },
  coupe:       { len: 2.10, width: 0.92, taper: 0.60, haunch: 0.17, upsweep: 0.05, deck: 0.44, nose: 0.13, tailDrop: 0.10, cabH: 0.38, cabZ: -0.22, cabFront: 0.36, cabRear: 0.62, round: 2.3, tumble: 0.26, bedDrop: 0, blunt: 0.06, boxy: 0, boxyFront: 0 },
  pickup:      { len: 2.50, width: 1.00, taper: 0.22, haunch: 0.16, upsweep: 0.16, deck: 0.74, nose: 0.03, tailDrop: 0.00, cabH: 0.44, cabZ: 0.08, cabFront: 0.34, cabRear: 0.34, round: 4.3, tumble: 0.08, bedDrop: 0.22, blunt: 0.93, boxy: 0.92, boxyFront: 0.86 },
  van:         { len: 2.30, width: 0.95, taper: 0.28, haunch: 0.07, upsweep: 0.06, deck: 0.66, nose: 0.06, tailDrop: 0.01, cabH: 0.70, cabZ: -0.05, cabFront: 0.55, cabRear: 1.05, round: 2.91, tumble: 0.10, bedDrop: 0, blunt: 0.8, boxy: 0.78, boxyFront: 0.72 },
  // Not offered any more; kept so any convertible in the catalogue still has
  // a shape to fall back on.
  convertible:  { len: 2.10, width: 0.92, taper: 0.60, haunch: 0.17, upsweep: 0.05, deck: 0.44, nose: 0.13, tailDrop: 0.10, cabH: 0.30, cabZ: -0.22, cabFront: 0.36, cabRear: 0.62, round: 2.3, tumble: 0.26, bedDrop: 0, blunt: 0.06, boxy: 0, boxyFront: 0 },
};

const SHAPE_KEYS = Object.keys(ARCHETYPES.sedan) as (keyof Shape)[];

/** With no body picked, blend the shapes the chosen use actually suits. */
function blendShapes(p: Prefs): Shape {
  if (p.body) return { ...ARCHETYPES[p.body] };

  const affinity = USES[p.use].bodies;
  const entries = (Object.keys(ARCHETYPES) as Body[])
    .map((b) => [b, affinity[b] ?? 0.25] as const)
    .filter(([, w]) => w > 0.3);
  const total = entries.reduce((s, [, w]) => s + w, 0) || 1;

  const out = {} as Shape;
  for (const k of SHAPE_KEYS) {
    out[k] = entries.reduce((s, [b, w]) => s + ARCHETYPES[b][k] * w, 0) / total;
  }
  return out;
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

type RGB = [number, number, number];
const mixRGB = (a: RGB, b: RGB, t: number): RGB =>
  [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

/** Each use gets its own reading on the scanner, inside the brand range. */
const USE_PALETTE: Record<Prefs['use'], [RGB, RGB]> = {
  city:     [[0.78, 0.98, 0.30], [0.26, 0.48, 0.30]],
  highway:  [[0.60, 0.95, 0.55], [0.20, 0.44, 0.44]],
  mountain: [[0.92, 0.92, 0.22], [0.62, 0.30, 0.10]],
  trail:    [[0.94, 0.72, 0.20], [0.42, 0.34, 0.12]],
  track:    [[1.00, 0.36, 0.10], [0.62, 0.10, 0.06]],
  haul:     [[0.88, 0.86, 0.26], [0.44, 0.30, 0.10]],
};

/**
 * Where a car lives changes more than its ride height. These are proportion
 * multipliers on top of the body style: a city car is short and upright, a
 * motorway car is long and low, a track car is wide with huge haunches and
 * almost no overhang. Without these, four of the six uses looked identical
 * because they happened to share a clearance band.
 */
interface UseShape {
  len: number; width: number; deck: number; track: number;
  haunch: number; upsweep: number; overhang: number; rake: number;
  wheel: number; taper: number;
  word: string;
}

const USE_SHAPE: Record<Prefs['use'], UseShape> = {
  city:     { len: 0.86, width: 0.95, deck: 1.08, track: 0.95, haunch: 0.75, upsweep: 1.0, overhang: 0.80, rake: 0.000, wheel: 0.93, taper: 1.15, word: 'Short and upright' },
  highway:  { len: 1.12, width: 1.02, deck: 0.95, track: 1.00, haunch: 0.85, upsweep: 0.85, overhang: 1.30, rake: -0.012, wheel: 1.00, taper: 0.95, word: 'Long and low' },
  mountain: { len: 0.95, width: 1.07, deck: 0.90, track: 1.09, haunch: 1.60, upsweep: 0.80, overhang: 0.78, rake: -0.030, wheel: 1.02, taper: 1.05, word: 'Compact and wide' },
  trail:    { len: 1.00, width: 1.05, deck: 1.14, track: 1.06, haunch: 1.25, upsweep: 2.10, overhang: 0.72, rake: 0.000, wheel: 1.12, taper: 0.85, word: 'Tall, stubby ends' },
  track:    { len: 0.98, width: 1.12, deck: 0.86, track: 1.16, haunch: 1.90, upsweep: 0.70, overhang: 0.70, rake: -0.048, wheel: 1.05, taper: 1.10, word: 'Wide and slammed' },
  haul:     { len: 1.16, width: 1.06, deck: 1.10, track: 1.05, haunch: 0.85, upsweep: 1.15, overhang: 1.05, rake: 0.000, wheel: 1.10, taper: 0.80, word: 'Long and tall' },
};

/** How the chosen use restates the proportions, for the readout panel. */
export const useShapeWord = (use: Prefs['use']) => USE_SHAPE[use].word;

const ELECTRIC: [RGB, RGB] = [[0.52, 0.96, 1.00], [0.80, 1.00, 0.58]];

export function prefsToTraits(p: Prefs): Traits {
  const s = blendShapes(p);

  // --- one input, one channel ---------------------------------------------
  // Each control owns a single thing you can see, and its weight slider only
  // decides how loudly that one thing is expressed. Nothing is wired into two
  // places, because that is how a render turns into noise.
  //
  //   use          palette, ride height
  //   body         silhouette
  //   seats        length
  //   drive        which axles are lit
  //   cylinders    pistons in the nose, idle throb
  //   power        how fast the floor runs, and the motion smear
  //   gearbox      scan sweep speed
  //   cabin        cross-section, box to ellipse
  //   attitude     shine vs soft focus
  //   budget       grain and lattice fineness
  //   reliability  glitch and shatter
  //   economy      exhaust smoke, or pack depth on an electric

  // Each question drives its own channel directly now. The one marked
  // decisive gets a little extra emphasis in the render too.
  const loud = (key: string) => (p.decisive === key ? 1.25 : 1);
  const attitude = Math.min(1, (p.sporty / 100) * loud('looks'));
  const speed = Math.min(1, (p.power / 100) * loud('power'));
  const instability = Math.min(1, (1 - (p.minReliability - 1) / 4) * loud('reliability'));
  // Slightly fuller through the low and middle bands so the difference
  // between "not a factor" and "frugal" is obvious, and still exactly zero
  // at the top so the air goes properly clean.
  // One question, one channel, in two forms: an exhaust plume on a car that
  // burns something, and the depth of the floor pack on one that does not.
  // Both run off the same answer, and neither is ever drawn at the same time.
  const wantsRange = Math.min(1, (p.economy / 100) * loud('economy'));
  const smoke = p.cylinders === 'electric'
    ? 0
    : Math.min(1, Math.pow(1 - p.economy / 100, 0.85) * loud('economy'));
  const battThick = p.cylinders === 'electric' ? wantsRange : 0;
  const thrift = Math.min(1, (p.budget[1] / 60000));
  const isEv = p.cylinders === 'electric';

  const clearance = clearanceFor(p);
  const rocker = { low: 0.05, normal: 0.15, high: 0.30 }[clearance];
  const wheelR = { low: 0.34, normal: 0.38, high: 0.46 }[clearance];
  const rugged = clearance === 'high' ? 1 : clearance === 'normal' ? 0.25 : 0;

  // Seat count is read as length, but the length goes where the seats are.
  // The nose and tail overhangs keep the size the body style gave them and
  // the whole of the stretch lands in the wheelbase and the greenhouse, so a
  // nine-seater grows a cabin rather than a longer bonnet and boot.
  const u = USE_SHAPE[p.use];
  const baseLen = s.len * u.len;
  const stretch = (p.seats - 5) * 0.085;
  const len = Math.max(baseLen * 0.72, baseLen + stretch);
  const overhang = baseLen * 0.35 * u.overhang;
  const width = s.width * u.width;
  const cabH = s.cabH + (p.seats - 5) * 0.012;
  const deck = s.deck * u.deck;

  // Cross-section belongs to the body style alone.
  const round = Math.max(1.9, s.round + 0.25 * rugged);

  // Colour belongs to where the car lives. The only thing that overrides it is
  // having no engine at all.
  let colorA = USE_PALETTE[p.use][0];
  let colorB = USE_PALETTE[p.use][1];
  if (isEv) {
    colorA = mixRGB(colorA, ELECTRIC[0], 0.75);
    colorB = mixRGB(colorB, ELECTRIC[1], 0.75);
  }

  const big = p.cylinders === '8+';
  const cylPulse = isEv ? 0.04 : big ? 0.16 : p.cylinders === '5-6' ? 0.10 : 0.07;
  const cylRate = isEv ? 0.6 : big ? 2.1 : p.cylinders === '5-6' ? 3.2 : 4.6;
  // Small engines were reading far too large. This is half what it was, and
  // a V8 is only a fifth bigger than a small four rather than twice the size.
  const engineSize = isEv ? 1.0 : big ? 1.2 : p.cylinders === '5-6' ? 1.1 : 1.0;
  const banks = big || p.cylinders === '5-6' ? 2 : 1;
  const cylPerBank = isEv ? 0 : big ? 4 : p.cylinders === '3-4' ? 4 : p.cylinders === '5-6' ? 3 : 2;

  // Both of these used to be the ratio count. That question is gone, and
  // handing them to the gearbox type instead would give one answer two
  // channels, so they are fixed: part of the scanner, not a readout.
  const quant = 22;
  const slices = 3;
  const sweep = p.trans === 'manual' ? 0.55 : p.trans === 'dct' ? 1.1 : 0.8;

  const totalH = rocker + deck + cabH;
  const reach = Math.max(len * 1.25, totalH * 1.7, width * 2.6);

  return {
    len,
    width,
    taper: Math.min(0.9, s.taper * u.taper),
    haunch: s.haunch * u.haunch,
    rocker,
    upsweep: s.upsweep * (1 + 1.2 * rugged) * u.upsweep,
    deck,
    nose: s.nose,
    tailDrop: s.tailDrop,
    bedDrop: s.bedDrop,
    blunt: s.blunt,
    boxy: s.boxy,
    boxyFront: s.boxyFront,
    cabH,
    cabZ: s.cabZ,
    cabFront: (s.cabFront * baseLen + stretch * 0.45) / len,
    cabRear: (s.cabRear * baseLen + stretch * 0.55) / len,
    round,
    tumble: s.tumble,

    wheelR: wheelR * u.wheel,
    wheelW: 0.16 + 0.06 * rugged,
    track: width * 1.92 * u.track,
    // Constant overhangs, so the extra length is all between the axles.
    wheelbase: Math.max(len * 0.9, 2.0 * (len - overhang)),
    rake: -0.02 + u.rake,


    // --- reliability owns instability, and nothing else does ---------------
    // It is expressed as faults, not as destruction: a tremble, patches of the
    // scan dropping out, red flecks, and screen-space glitch. The silhouette
    // stays a car at every setting.
    cloud: 0.18 + 0.22 * instability,
    turb: 0.05 + 0.35 * instability,
    glitch: 0.02 + 0.45 * instability,
    shake: instability * 0.030,
    dropout: instability,
    fault: instability,

    // --- attitude owns shine vs soft focus ---------------------------------
    sharp: 0.35 + 0.55 * attitude,
    gloss: attitude,
    soft: Math.pow(1 - attitude, 1.4),

    // --- power owns speed --------------------------------------------------
    vel: speed,
    blur: speed,

    // --- economy owns smoke, or the pack ----------------------------------
    smoke,
    battThick,

    // --- budget owns grain and lattice fineness ----------------------------
    polish: 0.25 + 0.75 * thrift,

    quant,
    pulse: cylPulse,
    pulseRate: cylRate,
    fluid: 0.16,
    camDist: 0.5 + reach * 3.7,
    camY: totalH * 0.52,
    // The plume trails well past the car, so the marched volume has to grow
    // with it or the smoke gets clipped off at the bounding sphere.
    bound: reach * 0.62 + 1.1 + smoke * 1.9,
    cylPerBank,
    banks,
    battery: isEv ? 1 : 0,
    engineSize,
    // Front is the default because almost everything is front-engined.
    engineZ: p.enginePos === 'rear' ? -0.62 : p.enginePos === 'mid' ? -0.06 : 0.54,
    // No preference means every corner idles at half power rather than dark.
    driveF: !p.drive ? 0.35 : p.drive !== 'rwd' ? 1 : 0,
    driveR: !p.drive ? 0.35 : p.drive !== 'fwd' ? 1 : 0,
    slices,
    wire: 0.9,
    sweep,
    colorA,
    colorB,
    colorW: isEv ? [0.62, 0.98, 1.0] : [0.83, 0.98, 0.24],
    // Hot orange against a lime body, or white-blue against a cyan one: the
    // engine has to read as a different thing, not a brighter patch of car.
    colorE: isEv ? [0.70, 0.95, 1.00] : [1.00, 0.46, 0.10],
  };
}
