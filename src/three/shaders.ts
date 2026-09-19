export const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/**
 * Pass 1 — volumetric raymarch of a parametric car.
 *
 * It is still a cloud, not a model: nothing is watertight and every surface is
 * read as density rather than as a hit. What it does carry is the structure of
 * a car — body, greenhouse, arches, wheels and powertrain — so the silhouette
 * reads, plus an x-ray lattice so it reads as a
 * scan of one rather than a lump of fog.
 *
 * carSDF returns vec2(distance, partId):
 *   0 body   1 greenhouse   2 wheel   3 powertrain
 */
export const BLOB_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;

uniform vec2  uRes;
uniform float uTime;
uniform vec2  uOrbit;
uniform vec2  uShift;
uniform float uZoom;

uniform float uLen, uWidth, uTaper, uHaunch, uRocker, uUpsweep;
uniform float uDeck, uNose, uTailDrop, uBedDrop, uBlunt;
uniform float uCabH, uCabZ, uCabFront, uCabRear, uRound, uTumble, uBoxy, uBoxyFront;
uniform float uRake, uWheelR, uWheelW, uTrack, uWheelbase;
uniform float uCloud, uTurb, uSharp, uPulse, uPulseRate, uFluid;
uniform float uGloss, uSmoke;
uniform float uCamDist, uCamY, uBound;
uniform float uCylPerBank, uBanks, uBattery, uEngineZ, uEngineSize;
uniform float uBattThick;
uniform float uDriveF, uDriveR;
uniform float uSlices, uWire, uSweep, uPolish;
uniform float uShake, uDropout, uFault, uVel;
uniform float uOutline, uOutlineW;
// Distance travelled, accumulated a frame at a time. Scrolling off
// time * rate means every change of rate also jumps the phase, which is
// why switching power band made the streaks teleport rather than ease.
uniform float uFlow;
uniform vec3  uColorA, uColorB, uColorW, uColorE;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.11, 0.17, 0.23));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
        mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
        mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}

float fbm(vec3 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 3; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; }
  return s;
}

/** Smooth union that carries the part id of whichever surface dominates. */
vec2 sunion(vec2 a, vec2 b, float k) {
  float h = clamp(0.5 + 0.5 * (b.x - a.x) / k, 0.0, 1.0);
  return vec2(mix(b.x, a.x, h) - k * h * (1.0 - h), h > 0.5 ? a.y : b.y);
}

/** The scalar form of the same blend, for fields with no part id to carry. */
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / max(k, 0.0001), 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float ssub(float d, float cut, float k) {
  float h = clamp(0.5 - 0.5 * (d + cut) / k, 0.0, 1.0);
  return mix(d, -cut, h) + k * h * (1.0 - h);
}

float sdRoundBox(vec3 p, vec3 b, float r) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}

float sdEllipsoid(vec3 p, vec3 r) {
  float k0 = length(p / r);
  return k0 * (k0 - 1.0) / max(length(p / (r * r)), 0.0001);
}

/** Cylinder lying across the car, used for both wheels and their arches. */
float sdAxle(vec3 p, float track, float base, float radius, float halfWidth) {
  vec3 w = vec3(abs(p.x) - track * 0.5, p.y - base, p.z);
  return max(length(w.yz) - radius, abs(w.x) - halfWidth);
}

/** The belt line: where sheet metal stops and glass starts. */
float beltAt() { return uRocker + uDeck; }

/**
 * The roofline, as one continuous curve along the car. A skewed gaussian makes
 * the greenhouse: narrow behind the peak is a fastback, wide behind it is an
 * estate. This single function is most of why the thing looks like a car.
 */
float topAt(float zn) {
  float t = beltAt();
  t -= uNose * smoothstep(0.28, 1.05, zn);
  t -= uTailDrop * smoothstep(0.28, 1.05, -zn);
  // Behind the cab the deck falls away to a load bed. Without this step a
  // pickup is just a saloon with the roof in the wrong place.
  t -= uBedDrop * smoothstep(uCabZ - 0.08, uCabZ - 0.50, zn);

  // Each end of the cabin is shaped separately, so a car can have a curved
  // windscreen and a flat tailgate — which is what a hatchback is.
  float wid = zn > uCabZ ? uCabFront : uCabRear;
  float boxiness = zn > uCabZ ? uBoxyFront : uBoxy;
  float cd = (zn - uCabZ) / max(wid, 0.06);

  // A gaussian gives a domed roof, which is right for a coupe and wrong for
  // anything with a cab: those want a flat top and pillars that stand up.
  float domed = exp(-cd * cd);
  // Falling away from 55% of the cabin length made even a "squared" roof a
  // long slope, which reads as a boot lid. Holding it flat to 82% and then
  // dropping gives an upright tailgate instead.
  float squared = 1.0 - smoothstep(0.82, 1.00, abs(cd));
  t += uCabH * mix(domed, squared, boxiness);
  return t;
}

/** The underside, lifting toward each end so it does not read as a slab. */
float botAt(float zn) {
  float a = abs(zn);
  return uRocker + uUpsweep * a * a * a;
}

/** Plan view: wide over the axles, drawn in at the nose and tail. */
float halfWidthAt(float zn) {
  float a = abs(zn);
  // a*a*a stands in for a^3.4 and two sqrts for x^0.28: the shape difference
  // is invisible and this is the single hottest line in the whole renderer.
  // How fast the plan closes at the ends. a^3 draws in early and gently, a^8
  // holds full width almost to the very end — the difference between a
  // sports car tapering to a point and a pickup bed meeting a tailgate.
  float a2 = a * a;
  float a4 = a2 * a2;
  float fall = mix(a2 * a, a4 * a4, uBlunt);
  float w = uWidth * sqrt(sqrt(max(1.0 - fall, 0.0)));
  w *= 1.0 - uTaper * 0.30 * a * a;
  float axle = uWheelbase * 0.5 / max(uLen, 0.001);
  float hd = (a - axle) / 0.20;
  w += uHaunch * exp(-hd * hd);
  return max(w, 0.02);
}

/**
 * The body itself: a superellipse cross-section swept along those three
 * curves. uRound takes it from a pure ellipse (2) to nearly a box (4), which
 * is the difference between a sports car's flanks and a van's.
 */
vec2 bodyField(vec3 p, float throb) {
  float zn = p.z / max(uLen * throb, 0.001);
  float belt = beltAt();

  float w = halfWidthAt(zn) * throb;
  float top = topAt(zn);
  float bot = botAt(zn);

  // Tumblehome: the glass pulls in as it rises. Eased rather than clamped, so
  // the belt line is a transition instead of a crease across the flank.
  float g = smoothstep(0.0, 1.0, (p.y - belt) / max(top - belt, 0.03));
  w *= 1.0 - uTumble * g;

  float cy = 0.5 * (top + bot);
  float ch = max(0.5 * (top - bot), 0.03);

  vec2 q = vec2(p.x / w, (p.y - cy) / ch);
  // A blend between an ellipse and a box stands in for the superellipse. The
  // exact form costs three pow() calls per sample and looks the same.
  float el = length(q);
  // Smooth max, not max: a hard one gives the shoulder a zero-radius corner.
  // The noise warp used to hide that; the outline traces the shape exactly and
  // turned it into a square. A real section has a radius there, and this is
  // small enough that a van's flat sides stay flat.
  float bx = -smin(-abs(q.x), -abs(q.y), 0.28);
  float e = mix(el, bx, clamp((max(uRound, 1.6) - 2.0) / 1.6, 0.0, 1.0) * 0.96);

  // The scale has a floor: where the plan has tapered to nothing, min(w, ch)
  // would otherwise make far-off points read as near ones and trail ghosts off
  // the nose and tail.
  float d = (e - 1.0) * max(min(w, ch), 0.12) * 0.75;

  // Hard stop just past the ends, for the same reason.
  d = max(d, abs(p.z) - uLen * 1.03);
  return vec2(d, p.y > belt ? 1.0 : 0.0);
}

/**
 * The silhouette alone: body, mirrors and wheels. No noise warp, no
 * powertrain, no scaffolding. The outline is drawn from this rather than from
 * what the volume actually renders, which is the whole point — the cloud stays
 * soft and drifting while the line around it stays exactly where the car is.
 */
float outlineSDF(vec3 p) {
  p.y += uRake * p.z;
  p.x += sin(uTime * 23.0) * uShake;
  p.y += sin(uTime * 31.0 + 1.7) * uShake * 0.8;
  p.z += sin(uTime * 19.0 + 3.1) * uShake * 0.6;
  float throb = 1.0 + uPulse * sin(uTime * uPulseRate) * 0.10;

  float d = bodyField(p, throb).x;

  // Blended in, not min()'d. carSDF smooth-unions these, and the noise warp
  // then hides whatever crease is left; the line has no noise to hide behind,
  // so a hard union showed up as a corner where the render has a curve.
  vec3 mr = p - vec3(0.0, beltAt() + uCabH * 0.34, uCabZ * uLen + uLen * 0.28);
  mr.x = abs(mr.x) - uWidth * 0.98;
  d = smin(d, sdEllipsoid(mr, vec3(0.11, 0.05, 0.07)), uFluid * 0.9);

  // A rounded tyre rather than a flat-ended drum. sdAxle is max(cylinder,
  // slab), which is square at the shoulders and, worse, only a bound on the
  // distance outside — and outside is the only place the line is drawn.
  vec3 ax = vec3(p.x, p.y, abs(p.z) - uWheelbase * 0.5);
  vec3 w = vec3(abs(ax.x) - uTrack * 0.5, ax.y - uWheelR, ax.z);
  float rr = min(uWheelR, uWheelW) * 0.45;
  vec2 cyl = vec2(length(w.yz) - uWheelR + rr, abs(w.x) - uWheelW + rr);
  float wheel = min(max(cyl.x, cyl.y), 0.0) + length(max(cyl, 0.0)) - rr;

  return smin(d, wheel, uFluid * 0.9);
}

vec2 carSDF(vec3 p) {
  p.y += uRake * p.z;

  // Unreliability is a rattle, not a disintegration: the whole body trembles
  // as one rigid thing, so the silhouette survives it.
  p.x += sin(uTime * 23.0) * uShake;
  p.y += sin(uTime * 31.0 + 1.7) * uShake * 0.8;
  p.z += sin(uTime * 19.0 + 3.1) * uShake * 0.6;
  float throb = 1.0 + uPulse * sin(uTime * uPulseRate) * 0.10;

  vec2 shape = bodyField(p, throb);

  float belt = beltAt();

  // --- mirrors: tiny, and they say "car" louder than anything else here ----
  vec3 mr = p - vec3(0.0, belt + uCabH * 0.34, uCabZ * uLen + uLen * 0.28);
  mr.x = abs(mr.x) - uWidth * 0.98;
  float mirror = sdEllipsoid(mr, vec3(0.11, 0.05, 0.07));
  shape = sunion(shape, vec2(mirror, 0.0), uFluid * 0.9);

  // --- arches are cut before the wheels go in ------------------------------
  vec3 ax = vec3(p.x, p.y, abs(p.z) - uWheelbase * 0.5);
  shape.x = ssub(shape.x, sdAxle(ax, uTrack, uWheelR, uWheelR * 1.22, uWidth * 1.4), 0.09);
  shape = sunion(shape, vec2(sdAxle(ax, uTrack, uWheelR, uWheelR, uWheelW), 2.0), uFluid * 0.9);

  // --- powertrain. This is the answer to question 05, so it is drawn big
  // enough to count: cylinders you can actually count, a shaft down the spine
  // and half shafts out to whichever wheels are driven. -------------------
  float shaftY = uRocker + uDeck * 0.18;
  float axleZ = uWheelbase * 0.5;
  float engZ = uEngineZ * uLen;

  float engD = 1e6;

  if (uBattery > 0.5) {
    // A slab in the floor instead of a block up front.
    // A skateboard pack: a slab running most of the floor, not a block. How
    // deep it is answers the charging question — ask for range and it fills
    // out, say it does not matter and it slims down to almost nothing. It
    // grows upward off a fixed floor, so it always reads as sitting in the
    // platform rather than hovering in the middle of the car.
    float packHalf = uDeck * mix(0.035, 0.130, uBattThick);
    float packY = uRocker + uDeck * 0.05 + packHalf;
    float pack = sdRoundBox(p - vec3(0.0, packY, 0.0),
                            vec3(uWidth * 0.84, packHalf, uLen * 0.70), 0.04);
    engD = min(engD, pack);
    shape = sunion(shape, vec2(pack, 3.0), uFluid * 1.5);

    // The motor is a separate lump, so the position choice still reads.
    vec3 m = p - vec3(0.0, uRocker + uDeck * 0.45, engZ);
    float motor = max(length(m.yz) - 0.10 * uEngineSize, abs(m.x) - 0.14 * uEngineSize);
    engD = min(engD, motor);
    shape = sunion(shape, vec2(motor, 3.0), uFluid * 0.6);
  } else {
    vec3 e = p - vec3(0.0, uRocker + uDeck * 0.68, engZ);
    e.x = abs(e.x) - (uBanks > 1.5 ? 0.085 * uEngineSize : 0.0);
    float span = (uCylPerBank - 1.0) * 0.5;
    float zi = clamp(floor(e.z / 0.125 + 0.5), -span, span);
    e.z -= zi * 0.125;
    float pistons = length(vec3(e.x, e.y * 0.80, e.z)) - 0.052 * uEngineSize;
    engD = min(engD, pistons);
    shape = sunion(shape, vec2(pistons, 3.0), uFluid * 0.45);

    // The block they sit in.
    float block = sdRoundBox(p - vec3(0.0, uRocker + uDeck * 0.60, engZ),
                             vec3(uWidth * 0.18 * uEngineSize, uDeck * 0.13 * uEngineSize,
                                  (0.06 + 0.065 * uCylPerBank) * uEngineSize), 0.04);
    engD = min(engD, block);
    shape = sunion(shape, vec2(block, 3.0), uFluid * 0.7);
  }

  // Propshaft: only a car driving its rear wheels needs one running back.
  if (uDriveR > 0.2) {
    // Spans from the engine to the rear axle, so a rear-engined car barely
    // has one and a front-engined car has a long propshaft.
    float mid = (engZ - axleZ) * 0.5;
    vec3 sh = p - vec3(0.0, shaftY, mid);
    float shaft = max(length(sh.xy) - 0.055, abs(sh.z) - abs(engZ + axleZ) * 0.5);
    engD = min(engD, shaft);
    shape = sunion(shape, vec2(shaft, 3.0), uFluid * 0.35);

    vec3 r2 = p - vec3(0.0, shaftY, -axleZ);
    float halfShaft = max(length(r2.yz) - 0.042, abs(r2.x) - uTrack * 0.46);
    float diff = length(r2) - 0.13;
    engD = min(engD, min(halfShaft, diff));
    shape = sunion(shape, vec2(min(halfShaft, diff), 3.0), uFluid * 0.35);
  }

  if (uDriveF > 0.2) {
    float midF = (engZ + axleZ) * 0.5;
    vec3 shF = p - vec3(0.0, shaftY, midF);
    float shaftF = max(length(shF.xy) - 0.055, abs(shF.z) - abs(engZ - axleZ) * 0.5);
    engD = min(engD, shaftF);
    shape = sunion(shape, vec2(shaftF, 3.0), uFluid * 0.35);

    vec3 f2 = p - vec3(0.0, shaftY, axleZ);
    float halfShaft = max(length(f2.yz) - 0.042, abs(f2.x) - uTrack * 0.46);
    float diff = length(f2) - 0.11;
    engD = min(engD, min(halfShaft, diff));
    shape = sunion(shape, vec2(min(halfShaft, diff), 3.0), uFluid * 0.35);
  }

  // A smooth union hands the part id to whichever surface dominates, and deep
  // inside the body that is always the bodywork — which is why a mid-mounted
  // engine went dark while a front one did not. Anything inside the
  // powertrain belongs to the powertrain, wherever it happens to sit.
  if (engD < 0.0) shape.y = 3.0;

  return shape;
}

/**
 * Shadow taps do not need wheels, powertrain, mirrors or the noise warp — only
 * the big mass that does the occluding. This halves the cost of the march.
 */
float shadowDensity(vec3 p) {
  float edge = mix(0.24, 0.045, clamp(uSharp, 0.0, 1.0));
  return smoothstep(edge, -edge * 0.35, bodyField(p, 1.0).x);
}

vec2 density(vec3 p) {
  vec3 q = p;
  // One fbm for the big drift plus a single extra octave for the fine chatter.
  // A second full fbm here doubled the cost of the whole renderer.
  q += (fbm(p * 1.5 + vec3(0.0, 0.0, uTime * 0.12)) - 0.5) * uCloud * 0.32;
  q += (noise(p * 3.4 - vec3(uTime * 0.35)) - 0.5) * uTurb * 0.20;

  vec2 s = carSDF(q);
  float edge = mix(0.24, 0.045, clamp(uSharp, 0.0, 1.0));
  return vec2(smoothstep(edge, -edge * 0.35, s.x), s.y);
}

/** Vapour on the floor, so the thing reads as standing somewhere. */
float mistAt(vec3 p) {
  // Most of a ray is well above the floor; leave before paying for noise.
  if (abs(p.y + 0.03) > 0.30) return 0.0;
  float slab = smoothstep(0.30, 0.0, abs(p.y + 0.03));
  float pool = smoothstep(uBound * 0.88, uBound * 0.28, length(p.xz));
  float churn = 0.55 + 0.45 * noise(p * 1.1 + vec3(uTime * 0.07, 0.0, 0.0));
  return slab * pool * churn * 0.45;
}

/**
 * Speed lines: a tunnel of thin dashes running along the car's axis and
 * shooting past it. Nothing in this scene actually moves, so these do the
 * work of saying how fast it is meant to be going.
 *
 * Lanes are quantised in angle and radius around the car, which is what makes
 * them read as discrete lines rather than as noise. Each lane carries a dash
 * that scrolls along z at a speed set by the power appetite.
 */
float streakAt(vec3 p) {
  if (uVel < 0.04) return 0.0;

  vec2 rp = vec2(p.x, p.y - (uRocker + uDeck * 0.7));
  float r = length(rp);

  // A shell around the car: clear of the bodywork, inside the marched volume.
  float ring = smoothstep(uWidth * 1.00, uWidth * 1.45, r)
             * smoothstep(uBound * 1.00, uBound * 0.55, r);
  if (ring < 0.01) return 0.0;

  // One lane per angular slice, thin across its width.
  float lanes = 30.0;
  float ang = atan(rp.y, rp.x) / 6.2832 + 0.5;
  float li = floor(ang * lanes);
  float across = 1.0 - smoothstep(0.0, 0.11, abs(fract(ang * lanes) - 0.5));

  // And quantised in radius too, so they sit at discrete distances.
  float ri = floor(r * 1.6);
  float radial = 1.0 - smoothstep(0.0, 0.20, abs(fract(r * 1.6) - 0.5));

  // Each lane gets its own length, phase and speed.
  float seed = hash(vec3(li, ri, 11.0));
  float period = 2.4 + seed * 3.0;
  // Air flows from the nose to the tail, i.e. toward -z. Getting this sign
  // wrong makes the car look like it is reversing at speed.
  float z = p.z / period + uTime * 0.5 + uFlow * 3.2 + seed * 17.0;
  float f = fract(z);
  float dash = smoothstep(0.50, 0.44, f) * smoothstep(0.30, 0.36, f);

  // Opacity eases off as the speed climbs. A flat 2.4 saturated every lane to
  // fully opaque, and at full power there are enough of them lit at once to
  // bury the car behind its own slipstream. The lane count, their speed and
  // their length are untouched — each line just stops being solid, so you can
  // see the shape through the storm.
  float amp = uVel * mix(2.4, 1.10, smoothstep(0.0, 1.0, uVel));
  return ring * across * radial * dash * amp;
}

/**
 * Exhaust. The less you care about fuel economy, the more of it there is; turn
 * economy up to decisive and the air behind the car goes clean.
 */
float smokeAt(vec3 p) {
  if (uSmoke < 0.02) return 0.0;

  // How far behind the tail we are, measured in car lengths.
  float back = (-p.z - uLen * 0.70) / max(uLen, 0.001);
  if (back < -0.30 || back > 3.2) return 0.0;
  float t = clamp(back, 0.0, 3.2);

  // The plume leaves the tailpipe tight, then widens and climbs. It comes off
  // the centre line: hanging it off one flank read as a leak rather than an
  // exhaust, and swung the whole car's weight to one side.
  float widen = 0.09 + 0.62 * t;
  float climb = uRocker + uDeck * 0.10 + t * 0.46;
  vec2 off = vec2(p.x, p.y - climb) / widen;
  float core = exp(-dot(off, off));

  // Soot as discrete chunks rather than a photographic cloud: space is
  // quantised into cells, each cell is either lit or not, and each lit cell is
  // a little cube. Drifting the grid rather than the car is what makes them
  // stream backwards.
  vec3 q = p;
  q.z += uTime * 1.5;
  q.y -= uTime * 0.45;

  float cells = 6.5;
  vec3 id = floor(q * cells);
  float h = hash(id);

  // Only some cells carry a particle, and the fuller the plume the more of
  // them light up.
  float lit = step(1.0 - (0.30 + 0.55 * uSmoke), h);

  // A cube, not a sphere, so it sits with the lattice and the scan bands.
  vec3 f = abs(fract(q * cells) - 0.5);
  float box = max(max(f.x, f.y), f.z);
  float size = 0.16 + 0.22 * fract(h * 7.31);
  float chunk = 1.0 - smoothstep(size, size + 0.10, box);

  return core * chunk * lit * smoothstep(3.2, 0.12, t) * uSmoke * 2.3;
}


/** Thin planes on all three axes — the x-ray scaffolding. */
float lattice(vec3 p, float n, float w) {
  vec3 f = abs(fract(p * n) - 0.5) / n;
  return smoothstep(w, 0.0, min(min(f.x, f.y), f.z));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);
  uv = (uv - uShift) / max(uZoom, 0.05);

  float yaw = uOrbit.x, pitch = uOrbit.y;
  vec3 ro = vec3(sin(yaw) * cos(pitch), sin(pitch), cos(yaw) * cos(pitch)) * uCamDist;
  vec3 ta = vec3(0.0, uCamY, 0.0);
  vec3 f = normalize(ta - ro);
  vec3 r = normalize(cross(f, vec3(0.0, 1.0, 0.0)));
  vec3 u = cross(r, f);
  vec3 rd = normalize(uv.x * r + uv.y * u + 2.0 * f);

  vec3 col = vec3(0.0);
  float alpha = 0.0;

  // Collected outside the alpha accumulation: how much body happens to sit
  // between the camera and the engine should not decide whether you can see it.
  // A mid or rear engine was being swallowed by the cabin in front of it.
  vec3 through = vec3(0.0);

  // How close this ray ever came to the body, and where. Negative means it
  // went through; zero means it grazed, which is the silhouette. A grazing ray
  // runs almost parallel to the surface, so even these coarse fixed steps
  // read the near-miss distance accurately — that is what makes a crisp line
  // possible without a second pass.
  float minD = 1e6;
  float tMin = uCamDist;

  vec3 oc = ro - vec3(0.0, uCamY, 0.0);
  float bq = dot(oc, rd);
  float cq = dot(oc, oc) - uBound * uBound;
  float h = bq * bq - cq;

  // The scan plane climbs the car and resets, like a bed scanner.
  float sweepY = mod(uTime * uSweep, max(uCamY * 2.6, 0.5));

  if (h > 0.0) {
    h = sqrt(h);
    float t0 = max(-bq - h, 0.0);
    float t1 = -bq + h;
    const int STEPS = 56;
    const vec3 L = vec3(0.40, 0.86, 0.32);
    float dt = (t1 - t0) / float(STEPS);
    vec3 p = ro + rd * t0;
    float tcur = t0;

    for (int i = 0; i < STEPS; i++) {
      // Most of a ray is nowhere near the car. Six comparisons here save the
      // whole field evaluation, its noise warp and its scaffolding out there,
      // which is the single biggest win in the march.
      bool near = abs(p.x) < uWidth * 2.2 && abs(p.z) < uLen * 1.45
               && p.y > -0.5 && p.y < uCamY * 2.9;

      if (near && uOutline > 0.001) {
        float od = outlineSDF(p);
        if (od < minD) { minD = od; tMin = tcur; }
      }

      float body = 0.0;
      float part = 0.0;
      float scaffold = 0.0;
      if (near) {
        vec2 d = density(p);
        body = d.x;
        part = d.y;

        // --- x-ray scaffolding ---------------------------------------------
        // Spatial frequency scaled by zoom: the grid and slice lines are laid
        // out in world units, so a tighter framing (as on a phone's narrower
        // stage) magnifies the same handful of lines into widely separated
        // bands that read as the car being drawn several times over. Scaling
        // by zoom keeps the on-screen line density the same at any framing.
        float scaffoldZoom = max(uZoom, 0.05);
        float wire = lattice(p, 3.0 * scaffoldZoom, 0.016 + 0.010 * (1.0 - uPolish));
        float sliceFreq = uSlices * scaffoldZoom;
        float slice = smoothstep(0.018, 0.0, abs(fract(p.y * sliceFreq) - 0.5) / sliceFreq);
        float swd = (p.y - sweepY) * 13.0;
        float sweep = exp(-swd * swd);
        scaffold = (wire * 0.50 + slice * 0.80 + sweep * 1.40) * uWire * body;
      }

      float mist = mistAt(p);
      float streak = streakAt(p);
      float smoke = smokeAt(p);

      // The panels are a shell, not a solid: opacity peaks at the surface and
      // falls away inside, so the hardware under them stays visible. Wheels are
      // small enough that hollowing them makes them disappear, so they stay
      // mostly solid; the powertrain is fully solid.
      // A gaussian on the surface band, not a broad ramp: this is what keeps
      // the silhouette crisp instead of hazy.
      float shd = (body - 0.5) * 3.4;
      float shell = exp(-shd * shd);
      float isWheel = (part > 1.5 && part < 2.5) ? 1.0 : 0.0;
      float solid = part > 2.5 ? body : 0.0;
      // Glass is thinner than sheet metal, which matters because a mid or rear
      // engine sits behind the cabin and has to read through it.
      float glassy = (part > 0.5 && part < 1.5) ? 0.68 : 1.0;
      float surf = part > 2.5 ? 0.0 : mix(shell, body, isWheel * 0.7) * glassy;

      // Signal dropout: patches of the scan blink out, more of them the less
      // you trust the car. The shape stays; the reading of it fails.
      if (uDropout > 0.01) {
        float n = fbm(p * 3.0 + vec3(0.0, uTime * 0.8, 0.0));
        float gap = smoothstep(0.52, 0.76, n);
        float blink = step(0.30, fract(uTime * 3.1 + hash(floor(p * 1.8)) * 5.0));
        surf *= 1.0 - gap * blink * uDropout * 0.85;
      }

      float carVis = max(max(surf * 0.46, solid * 1.00), scaffold * 0.50);
      float airVis = min(1.0, max(mist * 0.90, streak * 0.75) + smoke * 0.80);
      float vis = max(carVis, airVis);

      if (vis > 0.004) {
        float a = clamp(vis * dt * 2.6, 0.0, 1.0);

        // One sample toward the key light: enough self-shadowing to give the
        // cloud a readable top, flank and underside. Air does not need it, and
        // most steps along a ray are air.
        float lit = 1.0;
        if (carVis > 0.01) lit = 0.12 + 0.88 * exp(-shadowDensity(p + L * 0.5) * 2.4);
        float up = clamp((p.y - uRocker) / max(uCamY * 2.2, 0.5), 0.0, 1.0);
        float ramp = clamp(up * 0.78 + p.z * 0.09 + 0.14, 0.0, 1.0);

        vec3 base = mix(uColorA, uColorB, ramp);

        // Glass goes cool, wheels go dark, the powertrain glows because it is
        // what the shell is there to reveal.
        if (part > 0.5 && part < 1.5) base = base * 0.55 + uColorW * 0.18;
        else if (part > 1.5 && part < 2.5) base *= 0.72;
        else if (part > 2.5) {
          float fire = 0.55 + 0.45 * sin(uTime * uPulseRate * 2.0);
          base = uColorE * (0.85 + 0.85 * fire);
        }

        vec3 emit = base * lit * (0.45 + 0.55 * up) * (surf * 1.9 + solid * 2.5);

        // --- lamps. Two up front, a bar across the back. Nothing else here
        // tells you which way the thing is pointing. ----------------------
        // --- light signature ---------------------------------------------
        // Sleeker and angrier as the visual attitude climbs: the main pods
        // narrow to slits, a second pair lights up, then a full-width bar.
        // Wind the power up and the whole signature runs red.
        float lampY = beltAt() - uNose * 0.5;
        float slit = mix(0.115, 0.030, uGloss);
        vec3 lampCol = mix(vec3(1.00, 0.97, 0.86), vec3(1.00, 0.20, 0.06),
                           smoothstep(0.40, 0.95, uVel));

        vec3 pod = vec3(abs(p.x) - uWidth * 0.62, p.y - lampY, p.z - uLen * 0.88);
        vec3 pq = pod / vec3(mix(0.20, 0.30, uGloss), slit, 0.085);
        float lamp = exp(-dot(pq, pq));

        vec3 pod2 = vec3(abs(p.x) - uWidth * 0.26, p.y - lampY + slit * 1.9, p.z - uLen * 0.86);
        vec3 pq2 = pod2 / vec3(0.16, slit * 0.8, 0.075);
        lamp += exp(-dot(pq2, pq2)) * smoothstep(0.30, 0.75, uGloss);

        vec3 bar = vec3(p.x, p.y - lampY - slit * 2.6, p.z - uLen * 0.87);
        vec3 bq = bar / vec3(uWidth * 0.80, slit * 0.55, 0.06);
        lamp += exp(-dot(bq, bq)) * smoothstep(0.55, 1.0, uGloss);

        emit += lampCol * lamp * (2.2 + 1.6 * uGloss) * body;

        // The tail answers the nose: a bar, thinner and wider as attitude rises.
        vec3 tl = vec3(p.x, p.y - (beltAt() - uTailDrop * 0.4), p.z + uLen * 0.90);
        vec3 tq = tl / vec3(mix(uWidth * 0.55, uWidth * 0.92, uGloss), slit * 0.8, 0.075);
        float tail = exp(-dot(tq, tq));
        emit += vec3(1.00, 0.16, 0.07) * tail * (1.8 + 1.4 * uGloss) * body;

        emit += uColorW * scaffold * (0.35 + 0.65 * uPolish) * 1.1;

        // Driven wheels run hot and show spokes; idle ones stay grey.
        if (part > 1.5 && part < 2.5) {
          float driven = p.z > 0.0 ? uDriveF : uDriveR;
          vec2 wl = vec2(p.y - uWheelR, p.z - sign(p.z) * uWheelbase * 0.5);
          float r = length(wl);

          // Spokes turn faster the more power was asked for.
          float spin = 0.5 + 0.5 * sin(atan(wl.y, wl.x) * 6.0 - uTime * (2.2 + 9.0 * uVel));
          float spokes = spin * smoothstep(uWheelR * 0.92, uWheelR * 0.20, r);
          float rim = smoothstep(0.085, 0.0, abs(r - uWheelR * 0.74));
          float tyre = smoothstep(0.070, 0.0, abs(r - uWheelR * 0.99));

          emit += uColorW * driven * (0.30 + 0.75 * spokes + 2.2 * rim + 1.1 * tyre) * body * 1.5;
        }

        // Fault flecks: sparse red warnings crawling over an unreliable car.
        if (uFault > 0.01) {
          vec3 fc = floor(p * 7.0);
          float f = hash(fc);
          float on = step(1.0 - uFault * 0.09, f);
          float blink = step(0.45, fract(uTime * 2.3 + f * 7.0));
          emit += vec3(1.00, 0.18, 0.07) * on * blink * body * 2.2;
        }

        // Attitude is shine: a hard specular band right on the surface, and a
        // soft sheen off the edge. At zero it is a flat, dull volume.
        emit += uColorW * shell * shell * shell * uGloss * 1.8;
        float rim3 = 1.0 - body;
        emit += base * (0.20 + 0.80 * uGloss) * 0.32 * rim3 * rim3 * rim3 * step(0.03, body);

        // Air: dim vapour on the floor, hot streaks tearing past, smoke behind.
        vec3 airCol = mix(uColorA * 0.22, uColorW, clamp(streak / max(airVis, 0.001), 0.0, 1.0) * 0.8);
        // Smoke is dark. You see it by what it blots out — the lattice, the
        // floor grid and the tail of the car all go behind it — not by what it
        // gives off, so it stays nearly black and leans on its own opacity.
        float sooty = clamp(smoke * 0.80 / max(airVis, 0.001), 0.0, 1.0);
        airCol = mix(airCol, vec3(0.30, 0.32, 0.23), sooty);
        emit = mix(airCol * airVis * 1.6, emit, clamp(carVis / max(vis, 0.001), 0.0, 1.0));

        if (solid > 0.01) {
          float fire = 0.6 + 0.4 * sin(uTime * uPulseRate * 2.0);
          // A floor-wide pack presents several times the area a block does, so at
          // an engine rate it washes the whole car out, and the deeper it gets the
          // worse that is. Rate falls as it fills out, so a slim pack still reads
          // and a long-range one does not become a white slab.
          float packGlow = mix(0.58, 0.26, uBattThick);
          through += uColorE * solid * dt * (uBattery > 0.5 ? packGlow : 1.5) * fire;
        }

        col += emit * a * (1.0 - alpha);
        alpha += a * (1.0 - alpha);
        if (alpha > 0.985) break;
      }
      p += rd * dt;
      tcur += dt;
    }
  }

  // Floor grid, so ride height is something you can see against the ground.
  if (rd.y < -0.0001 && alpha < 0.98) {
    float gt = -ro.y / rd.y;
    if (gt > 0.0) {
      vec3 gp = ro + rd * gt;
      float within = smoothstep(uBound * 1.6, uBound * 0.3, length(gp.xz));

      // The grid runs backwards under the car, faster the more power was asked
      // for. Standing still, it sits.
      vec2 gsz = vec2(gp.x, gp.z + uTime * 0.4 + uFlow * 9.0);
      vec2 gf = abs(fract(gsz * 0.8) - 0.5) / 0.8;
      float g = smoothstep(0.05, 0.0, min(gf.x, gf.y)) * within * 0.30 * uWire;

      // A scan ring leaving the car every few seconds.
      float rad = mod(uTime * 1.3, uBound * 1.7);
      float rd2 = (length(gp.xz) - rad) * 2.6;
      g += exp(-rd2 * rd2) * within * 0.35 * uWire;

      col += uColorW * g * (1.0 - alpha);
      alpha += g * (1.0 - alpha);
    }
  }

  // The powertrain glow is laid over the top, unoccluded.
  through = min(through, vec3(1.15));
  col += through;
  alpha += (1.0 - alpha) * clamp(max(through.r, max(through.g, through.b)) * 0.9, 0.0, 0.85);

  // --- silhouette outline -------------------------------------------------
  // A 2D line rather than a 3D rim light: the width is set in pixels and
  // divided back out into world units, so it stays the same weight whatever
  // the shape does and however far away it sits.
  if (uOutline > 0.001 && minD < 1e5) {
    // World size of one pixel at the closest approach. rd carries a focal
    // length of 2, hence the 2 here.
    float pxw = tMin / (2.0 * min(uRes.x, uRes.y) * max(uZoom, 0.05));
    // bodyField returns a distance scaled by about 0.75, not a unit one.
    float d = abs(minD) / 0.75;
    float w = uOutlineW * pxw;
    float aa = 0.6 * pxw;
    float line = 1.0 - smoothstep(w - aa, w + aa, d);

    // Composited over, not added: adding it would blow out to white against
    // the bright flank and vanish against the dark page.
    float la = line * uOutline;
    col = uColorW * la + col * (1.0 - la);
    alpha = la + alpha * (1.0 - la);
  }

  gl_FragColor = vec4(col, alpha);
}
`;

/** Pass 2 — slab displacement, chromatic split, grain. */
export const POST_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;

uniform sampler2D uScene;
uniform vec2  uRes;
uniform float uTime;
uniform float uGlitch;
uniform float uQuant;
uniform float uPolish;
uniform float uBlur;
uniform float uSoft;

float h11(float n) { return fract(sin(n * 78.233) * 43758.5453); }

void main() {
  vec2 uv = vUv;

  float band = floor(uv.y * uQuant);
  float tick = floor(uTime * 9.0);
  float r1 = h11(band * 13.7 + tick * 0.37);
  float r2 = h11(band * 3.13 + tick * 1.71);
  float slab = step(1.0 - uGlitch * 0.30, r1);
  vec2 suv = uv + vec2((r2 - 0.5) * uGlitch * 0.10 * slab, 0.0);

  vec4 sb = texture2D(uScene, suv);
  vec4 sa = sb;
  vec4 sc = sb;
  // Two extra full-screen taps are not worth paying for when there is no
  // chromatic split to draw.
  if (uGlitch > 0.06) {
    float ca = uGlitch * 0.007 + 0.0012;
    sa = texture2D(uScene, suv + vec2(ca, 0.0));
    sc = texture2D(uScene, suv - vec2(ca, 0.0));
  }
  vec3 col = vec3(sa.r, sb.g, sc.b);

  // One set of taps, used twice: as a halo, and as the soft focus that a dull
  // visual attitude gets instead of shine.
  vec2 px = (3.5 + 9.0 * uSoft) / uRes;
  vec4 t1 = texture2D(uScene, suv + vec2( px.x,  px.y));
  vec4 t2 = texture2D(uScene, suv + vec2(-px.x,  px.y));
  vec4 t3 = texture2D(uScene, suv + vec2( px.x, -px.y));
  vec4 t4 = texture2D(uScene, suv + vec2(-px.x, -px.y));
  vec4 blurred = (t1 + t2 + t3 + t4) * 0.25;

  col = mix(col, blurred.rgb, uSoft * 0.75);
  vec3 bloom = max(blurred.rgb - sb.rgb, vec3(0.0));

  // Motion smear: a trail dragged off the back of the shape, length set by how
  // much power was asked for. Nothing actually moves, so this sells the speed.
  vec4 smear = vec4(0.0);
  if (uBlur > 0.03) {
    // Six taps stepped evenly leave six copies of anything with a hard edge,
    // which the silhouette line very much has. Jittering each pixel's taps
    // within its step spreads those copies into grain instead — same cost.
    float jit = h11(gl_FragCoord.x * 1.7 + gl_FragCoord.y * 37.0 + tick);
    float sw = 0.0;
    for (int i = 1; i <= 6; i++) {
      float t = (float(i) - jit) / 6.0;
      float wgt = 1.0 - t;
      smear += texture2D(uScene, suv - vec2(t * uBlur * 0.055, 0.0)) * wgt;
      sw += wgt;
    }
    smear /= max(sw, 0.001);
  }

  // Premultiplied, so the page's own grid and vignette show through the mist.
  vec3 outc = col + bloom * 2.0 + smear.rgb * uBlur * 0.5;
  float a = clamp(mix(max(max(sa.a, sb.a), sc.a), blurred.a, uSoft * 0.75)
                + (bloom.r + bloom.g + bloom.b) * 0.6
                + smear.a * uBlur * 0.7, 0.0, 1.0);

  outc = vec3(1.0) - exp(-outc * 1.5);
  outc *= 1.0 - 0.035 * sin(uv.y * uRes.y * 1.5);
  outc += (h11(floor(uv.x * uRes.x) + floor(uv.y * uRes.y) * 7.0 + tick) - 0.5)
        * (0.075 - 0.05 * uPolish) * a;

  gl_FragColor = vec4(outc, a);
}
`;
