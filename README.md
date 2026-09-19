# APEX // ZERO — Production Car Finder

An eleven-question car quiz with a liquid, glitching volume in the middle of it.
You describe the car in your head; a cloud in the tunnel takes on its
proportions as you answer; then the whole catalogue is scored locally and you
get one best match plus four runners-up.

The volume is deliberately **not** a car. It is a raymarched density field that
has been told a car's proportions and left to drift.

## Running it

```bash
npm install
npm run dev
```

Then open <http://localhost:5173>. That is the whole thing: a static front end
with no server, no API key and no network calls. It runs offline.

## How it fits together

| Path | What it is |
| --- | --- |
| `src/data/cars.ts` | The catalogue. 497 hand-entered cars, 18 fields each. Run `node tools/check-cars.mjs --csv` to validate it and export `cars.csv`. |
| `src/scoring/engine.ts` | Weighted scorer: hard criteria (body, drive, engine, gearbox, seats, clearance) plus the soft weights you set on question 09. Near-misses get partial credit from the kinship tables. |
| `src/three/traits.ts` | Preferences → blob parameters. The archetype table is where a wagon becomes long-roofed and a coupe gets a fastback. |
| `src/three/shaders.ts` | Pass 1 raymarches the SDF as a volume; pass 2 does the slab displacement, chromatic split and grain. |
| `src/three/BlobRenderer.ts` | Plain three.js. Smooths every parameter toward its target each frame — that smoothing is what makes the shape pour instead of snap. |
| `src/quiz/steps.tsx` | The questions and their live readout panels. `activeSteps` is what drops the gearbox question for an electric. |
| `src/results/summary.ts` | Turns a scored result into the sentence under each pick. Reads the criterion ranking the scorer already produced, so the prose and the percentage can never disagree. |

## The eleven questions

Written the way someone actually chooses a car, not the way a spec sheet is
organised. Every question is a single choice — the only multi-value controls
are the sliders.

| # | Question | What it drives |
| --- | --- | --- |
| 01 | Where does it actually live? | City, highway, mountain roads, trail, track or hauling. Sets ride height, the power band, how much economy counts, and roughly half the score. Ride height is not a separate question because nobody thinks in millimetres. |
| 02 | What shape is it? | One body style, or leave it open and the volume averages whichever shapes suit the way you drive. |
| 03 | Who else is in it? | Seat floor, read as length — and the length lands where the seats are. Overhangs stay the size the body style gave them; the stretch all goes into the wheelbase and the greenhouse. |
| 04 | Which wheels are driven? | Driven axles light up on the volume. |
| 05 | What is under the bonnet? | Cylinder count and engine position. Pistons you can count in a block, a propshaft running to whichever axle is driven, and half shafts out to the driven wheels. Front, mid or rear moves the whole lot. Electric swaps the block for a floor slab and a motor. |
| 06 | How much go do you want? | Power appetite, as a band rather than a number. Sets how fast the floor runs underneath and how hard the shape smears. |
| 07 | How does it change gear? | Gearbox type, and nothing else. A ratio count was a spec-sheet question nobody actually shops on. Skipped entirely for electrics, so an electric run is ten questions. |
| 08 | How loud should it look? | Visual attitude. Scores how aggressive the car reads, and sets shine against soft focus. |
| 09 | How much can it break? | The reliability floor, expressed as faults in the scan rather than as damage. |
| 10 | Does fuel cost matter? | How much running cost weighs in the score. On an electric the same question is asked as "does charging cost matter", with the same four weights, so the scorer never has to know which version was answered. It is the one question that changes its words and its channel with the powertrain. |
| 11 | What can you spend? | Used price band. Also buys crispness: cheap comes through the scanner noisy. |

Any one of them can be marked **this decides it**, and only one at a time. That
roughly doubles its weight in the score and leans on its channel in the render.

The intro screen runs a showreel instead of sitting still: a random brief every
few seconds, pushed through the same reconcile a real answer gets, so an
electric never turns up there holding a gearbox. It drives the volume only.
The quiz still starts from the defaults, whatever the showreel was last
showing.

## On a small screen

There is one breakpoint, at 1180px, and it changes what the stage *is*.

Above it the stage is a full-bleed backdrop and every panel is kept to a
column that leaves it a clear gap. Below it there is no gap left to leave, so
the stage stops being a backdrop and becomes a band in a grid row of its own,
with the questions stacked underneath and scrolling independently. The volume
is the point of the page, so on a narrow screen the only way to guarantee a
panel never covers it is to give it space nothing else is allowed into.

The camera framing is swapped with the layout: on a wide screen each phase
nudges the volume sideways into whatever gap the panels leave, and in the band
it is centred and framed tighter, because the band is much shorter than a full
stage.

The canvas takes its size from the box it sits in rather than from the
viewport, so changing the chrome cannot stretch the render, and a
`ResizeObserver` catches the CSS-driven changes a window resize misses. The
adaptive resolution is allowed to sink further on a small screen, because a
phone GPU needs the headroom and a soft volume survives being coarse far
better than it survives running at 20fps.

## How the render responds

One input, one channel. Each control owns a single thing you can see, and its
weight slider only decides how loudly that one thing is expressed. Nothing is
wired into two places, because that is how a render turns into noise.

| Control | What it, and only it, changes |
| --- | --- |
| Use | Palette and ride height |
| Body | Silhouette |
| Seats | Length, wheelbase and how far the roof runs back |
| Driven wheels | Which axles light up and spin |
| Cylinders | Pistons in the nose (or a battery slab), and the idle throb |
| Power appetite | How fast the floor runs underneath, a tunnel of animated speed lines streaming past the car, and the motion smear |
| Gearbox type | How fast the scan plane sweeps the car |
| Cabin character | Cross-section, from elliptical to boxy |
| Visual attitude | Shine: a hard specular band and crisp edges at the top, soft focus and dull surfaces at the bottom |
| Budget | Grain and how fine the x-ray lattice is |
| Reliability floor | Faults: at 5/5 the volume is clean and still; at 1/5 it develops a rigid tremble, patches of the scan blink out, red warning flecks crawl over it and the screen-space glitch rises. The silhouette stays a car at every setting |
| Fuel economy | Exhaust smoke, inverted: ignore economy and it pours off the tail, make it decisive and the air goes clean. On an electric there is no exhaust, so the same answer moves the floor pack instead, from a sliver to a deep long-range slab. One answer, one channel, in two forms, and the two are never drawn at once |

A single hairline traces the silhouette, and nothing in the quiz moves it. It
is there because a soft volume on a dark page has no edge to read: the line
gives the eye the shape, and the cloud inside it stays as loose as it was. It
is measured in screen pixels rather than world units, so it holds the same
weight whether the car is a van or a coupe, near or far.

The body is a shell rather than a solid: opacity peaks at the surface band and
falls away inside, so the powertrain reads through the panels. Wheels stay
mostly solid, because hollowing something that small just deletes it.

## How the shape is built

The body is not a stack of boxes. It is a swept profile: a roofline curve, an
underside curve and a plan-view width curve, extruded through a superellipse
cross-section.

- The roofline is a skewed gaussian. Narrow behind the peak is a fastback,
  wide behind it is an estate — that one curve is most of the silhouette.
- The plan view tapers toward the nose and tail and bulges over each axle, so
  the car has haunches instead of slab sides.
- The cross-section exponent runs from a pure ellipse (a sports car's flanks)
  to nearly square (a van), and the cabin question moves it.
- The greenhouse is not a separate object. It is whatever sits above the belt
  line, with tumblehome pulling the glass in as it rises.

## Tuning the look

Most of the character lives in two places:

- `ARCHETYPES` in `src/three/traits.ts` — the proportions of each body style.
- The bottom of `prefsToTraits` — how sportiness, power, reliability and
  clearance map to cloudiness, turbulence, glitch, colour and framing.

Rendering is heavy on the fragment shader. `BlobRenderer.setQuality(0.5)`
halves the internal resolution if a machine struggles.

## Caveats on the data

The catalogue is hand-entered, and the fields are not all equally solid.

**Reliable.** Body style, driven wheels, cylinder count, displacement,
horsepower, gearbox type, gear count, seats and engine position are stable
published facts for a common trim of the generation listed.

**Approximate.** `mpg` is a rounded combined figure (MPGe for electrics),
`clearanceMm` is a nominal unladen figure, and `priceUsd` is a rough used
value that moves with the market, the mileage and the country. Treat all
three as indicative.

**Subjective.** `reliability` and `looks` are 1-5 opinions, not measurements.
They exist so the scorer has something to sort on, and you should feel free to
disagree with them.

`tools/check-cars.mjs` enforces what can be enforced — internal consistency
(an electric with cylinders, a CVT with a gear count, a duplicate row, a price
missing a digit) and coverage across every answer the quiz can produce. It
cannot tell you whether a horsepower figure is correct; only a source can.
Export `cars.csv` and check anything you care about.

**Thin answers.** Engine position is derived rather than stored — a car is
rear-engined if it is on the explicit list in `cars.ts`, mid-engined if it
carries the `mid` tag, front otherwise. That leaves 467 front, 17 mid and 13
rear, so picking mid or rear narrows the shortlist hard by design; the scorer
gives partial credit rather than emptying the list.
