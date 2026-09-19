import type { ReactElement } from 'react';
import type { Body, Drive, EnginePos, Prefs, Use } from '../types';
import { clearanceFor, desiredHp } from '../scoring/engine';
import { USES } from '../scoring/profiles';
import type { Traits } from '../three/traits';
import { useShapeWord } from '../three/traits';
import { Meter, OptionGrid } from '../components/ui';

export interface StepCtx {
  prefs: Prefs;
  set: <K extends keyof Prefs>(k: K, v: Prefs[K]) => void;
}

export interface Readout {
  title: string;
  rows: [string, string, boolean?][];
  note?: { title: string; body: string };
}

export interface Step {
  key: string;
  label: string;
  title: string;
  sub: string;
  Body: (ctx: StepCtx) => ReactElement;
  readout: (prefs: Prefs, traits: Traits) => Readout;
}

const USE_OPTS = (Object.keys(USES) as Use[]).map((v) => ({
  value: v, name: USES[v].label, hint: USES[v].hint,
}));

const BODY_OPTS: { value: Body | 'any'; name: string; hint: string }[] = [
  { value: 'any', name: 'Open', hint: 'shape is not the point' },
  { value: 'hatch', name: 'Hatch', hint: 'short tail' },
  { value: 'sedan', name: 'Sedan', hint: 'three box' },
  { value: 'wagon', name: 'Wagon', hint: 'long roof' },
  { value: 'suv', name: 'SUV', hint: 'tall, upright' },
  { value: 'coupe', name: 'Coupe', hint: 'two door' },
  { value: 'pickup', name: 'Pickup', hint: 'open bed' },
  { value: 'van', name: 'Van', hint: 'people box' },
];

const DRIVE_OPTS: { value: Drive | 'any'; name: string; hint: string }[] = [
  { value: 'any', name: 'Open', hint: 'no preference' },
  { value: 'fwd', name: 'Front', hint: 'pulls, packages well' },
  { value: 'rwd', name: 'Rear', hint: 'pushes, balances' },
  { value: 'awd', name: 'All wheel', hint: 'traction, on road' },
  { value: '4x4', name: 'Four wheel', hint: 'lockable, off road' },
];

const ENGINE_OPTS: { value: Prefs['cylinders']; name: string; hint: string }[] = [
  { value: 'any', name: 'Open', hint: 'no preference' },
  { value: '3-4', name: 'Small', hint: '3-4 cylinders' },
  { value: '5-6', name: 'Middle', hint: '5-6 cylinders' },
  { value: '8+', name: 'V8 and up', hint: 'eight or more' },
  { value: 'electric', name: 'Electric', hint: 'no cylinders' },
];

const POS_OPTS: { value: EnginePos | 'any'; name: string; hint: string }[] = [
  { value: 'any', name: 'Open', hint: 'no preference' },
  { value: 'front', name: 'Front', hint: 'over the front axle' },
  { value: 'mid', name: 'Mid', hint: 'behind the seats' },
  { value: 'rear', name: 'Rear', hint: 'behind the axle' },
];

const TRANS_OPTS: { value: Prefs['trans']; name: string; hint: string }[] = [
  { value: 'any', name: 'Open', hint: 'no preference' },
  { value: 'manual', name: 'Manual', hint: 'third pedal' },
  { value: 'auto', name: 'Automatic', hint: 'torque converter' },
  { value: 'dct', name: 'Dual clutch', hint: 'paddles' },
  { value: 'cvt', name: 'CVT', hint: 'no steps' },
];

/**
 * The soft criteria are picked from named bands rather than set on a 0-100
 * slider. Nobody thinks "my reliability weighting is 63".
 */
const POWER_OPTS = [
  { value: 20, name: 'Enough', hint: 'gets out of its own way' },
  { value: 45, name: 'Brisk', hint: 'never feels short' },
  { value: 70, name: 'Fast', hint: 'quick in any gear' },
  { value: 92, name: 'Silly', hint: 'more than is sensible' },
];

const LOOKS_OPTS = [
  { value: 10, name: 'Invisible', hint: 'nobody looks twice' },
  { value: 38, name: 'Clean', hint: 'quietly good' },
  { value: 66, name: 'Sharp', hint: 'clearly trying' },
  { value: 92, name: 'Shouty', hint: 'wings and vents' },
];

const RELIABILITY_OPTS = [
  { value: 1, name: 'Gamble', hint: 'I can fix things' },
  { value: 3, name: 'Sensible', hint: 'nothing alarming' },
  { value: 4, name: 'Solid', hint: 'known to last' },
  { value: 5, name: 'Bulletproof', hint: 'it will outlive me' },
];

const ECONOMY_OPTS = [
  { value: 5, name: 'Not a factor', hint: 'fuel is fuel' },
  { value: 35, name: 'Reasonable', hint: 'nothing outrageous' },
  { value: 70, name: 'Frugal', hint: 'it should sip' },
  { value: 100, name: 'Top of the list', hint: 'cheapest to run, full stop' },
];

// The same four weights as ECONOMY_OPTS, said the way an electric would say
// them. Keeping the values identical means the scorer never has to know which
// set the answer came from.
const CHARGE_OPTS = [
  { value: 5, name: 'Not a factor', hint: 'there is always a plug' },
  { value: 35, name: 'Reasonable', hint: 'nothing awkward' },
  { value: 70, name: 'Long legged', hint: 'few stops on a trip' },
  { value: 100, name: 'Top of the list', hint: 'furthest per charge, full stop' },
];

const BUDGET_OPTS: { name: string; hint: string; band: [number, number] }[] = [
  { name: 'Shoestring', hint: 'under $12k', band: [4000, 12000] },
  { name: 'Sensible', hint: '$10k – $25k', band: [10000, 25000] },
  { name: 'Comfortable', hint: '$22k – $45k', band: [22000, 45000] },
  { name: 'Serious', hint: '$40k – $75k', band: [40000, 75000] },
  { name: 'No ceiling', hint: 'anything indexed', band: [4000, 100000] },
];

const money = (n: number) => `$${(n / 1000).toFixed(0)}k`;

const bandIndex = (b: [number, number]) => {
  const hit = BUDGET_OPTS.findIndex((o) => o.band[0] === b[0] && o.band[1] === b[1]);
  return hit < 0 ? 1 : hit;
};

type Banded = { value: number; name: string; hint: string };

const nearest = (opts: Banded[], v: number) =>
  opts.reduce((best, o) => (Math.abs(o.value - v) < Math.abs(best.value - v) ? o : best), opts[0]);

/** Turns a band list into option tiles keyed by their own value. */
const banded = (opts: Banded[]) =>
  opts.map((o) => ({ value: String(o.value), name: o.name, hint: o.hint }));

const rooflineWord = (prefs: Prefs, t: Traits) =>
  // A hatch and an estate now share a roof that runs to the tail; what tells
  // them apart is which one you asked for.
  prefs.body === 'hatch' ? 'Hatchback'
  : t.bedDrop > 0.1 ? 'Cab and bed'
  : t.cabRear > 0.85 ? 'Estate'
  : t.cabRear > 0.5 && t.boxy > 0.5 ? 'Hatchback'
  : t.cabRear > 0.55 ? 'Notchback'
  : t.cabRear > 0.4 ? 'Hatchback' : 'Fastback';

const ALL_STEPS: Step[] = [
  {
    key: 'use',
    label: 'Use',
    title: 'Where does it actually live?',
    sub: 'Not where you dream of driving, but where the car will spend most of its week. This sets the ride height and a good deal of the scoring.',
    Body: ({ prefs, set }) => (
      <OptionGrid options={USE_OPTS} selected={[prefs.use]} onPick={(v) => set('use', v)} columns={2} />
    ),
    readout: (prefs) => {
      const u = USES[prefs.use];
      return {
        title: 'Duty readout',
        rows: [
          ['Environment', u.label, true],
          ['Proportions', useShapeWord(prefs.use), true],
          ['Ride height', clearanceFor(prefs)],
          ['Power band', `${u.hp[0]}–${u.hp[1]} hp`],
        ],
        note: { title: 'What this means', body: u.blurb },
      };
    },
  },

  {
    key: 'body',
    label: 'Silhouette',
    title: 'What shape is it?',
    sub: 'One shape. Leave it open and the scorer picks whichever shapes suit the way you drive.',
    Body: ({ prefs, set }) => (
      <OptionGrid
        options={BODY_OPTS}
        selected={[prefs.body ?? 'any']}
        onPick={(v) => set('body', v === 'any' ? null : v)}
      />
    ),
    readout: (prefs, t) => ({
      title: 'Form readout',
      rows: [
        ['Shape', prefs.body ?? 'open', true],
        ['Roofline', rooflineWord(prefs, t)],
        ['Section', t.round > 3.2 ? 'Square' : t.round > 2.7 ? 'Soft square' : 'Elliptical'],
        ['Length', `${(t.len * 2).toFixed(2)} u`],
      ],
    }),
  },

  {
    key: 'seats',
    label: 'Occupancy',
    title: 'Who else is in it?',
    sub: 'A floor, not a target. More seats still qualify, they just lose a little for being bigger than you asked for.',
    Body: ({ prefs, set }) => (
      <Meter
        label="Seats required"
        value={prefs.seats} min={2} max={9}
        display={prefs.seats}
        left="Just me" right="Everyone"
        onChange={(v) => set('seats', v)}
        cells={8}
      />
    ),
    readout: (prefs, t) => ({
      title: 'Cabin readout',
      rows: [
        ['Seats', `${prefs.seats} minimum`, true],
        ['Length', `${(t.len * 2).toFixed(2)} u`, true],
        ['Wheelbase', `${t.wheelbase.toFixed(2)} u`],
      ],
      note: prefs.seats >= 7
        ? { title: 'Third row', body: 'Seven seats rules out most of the catalogue and pushes the shortlist toward vans and large SUVs.' }
        : undefined,
    }),
  },

  {
    key: 'drive',
    label: 'Traction',
    title: 'Which wheels are driven?',
    sub: 'Near misses still score: all-wheel drive picks up most of the credit for four-wheel drive, and the other way round.',
    Body: ({ prefs, set }) => (
      <OptionGrid
        options={DRIVE_OPTS}
        selected={[prefs.drive ?? 'any']}
        onPick={(v) => set('drive', v === 'any' ? null : v)}
      />
    ),
    readout: (prefs) => ({
      title: 'Driveline readout',
      rows: [
        ['Layout', prefs.drive ? prefs.drive.toUpperCase() : 'Open', true],
        ['Wet grip', prefs.drive === 'awd' || prefs.drive === '4x4' ? 'Strong' : 'Normal'],
        ['Loose surface', prefs.drive === '4x4' ? 'Intended' : prefs.drive === 'awd' ? 'Tolerated' : 'Careful'],
      ],
      note: prefs.use === 'trail' && (prefs.drive === 'fwd' || prefs.drive === 'rwd')
        ? { title: 'Mismatch', body: 'Trail use with two driven wheels will fight itself. The shortlist will compromise one way or the other.' }
        : undefined,
    }),
  },

  {
    key: 'engine',
    label: 'Engine',
    title: 'What is under the bonnet?',
    sub: 'Cylinder count sets the sound and the service bill. Where it sits changes how the whole car is packaged.',
    Body: ({ prefs, set }) => (
      <>
        <OptionGrid options={ENGINE_OPTS} selected={[prefs.cylinders]} onPick={(v) => set('cylinders', v)} />
        <div className="q-gap" />
        {prefs.cylinders === 'electric' ? (
          <p className="q-na">
            Motor position is not asked for an electric car. There is no engine
            bay to put anything in.
          </p>
        ) : (
          <OptionGrid
            options={POS_OPTS}
            selected={[prefs.enginePos ?? 'any']}
            onPick={(v) => set('enginePos', v === 'any' ? null : v)}
            columns={2}
          />
        )}
      </>
    ),
    readout: (prefs) => ({
      title: 'Block readout',
      rows: [
        ['Configuration', prefs.cylinders === 'electric' ? 'Motor' : prefs.cylinders === 'any' ? 'Open' : prefs.cylinders, true],
        ['Position', prefs.cylinders === 'electric' ? 'n/a' : prefs.enginePos ?? 'open'],
        ['Use wants', `${USES[prefs.use].hp[0]}–${USES[prefs.use].hp[1]} hp`],
      ],
    }),
  },

  {
    key: 'power',
    label: 'Power',
    title: 'How much go do you want?',
    sub: 'What you want to feel when you ask for it. It also sets how fast the world goes past.',
    Body: ({ prefs, set }) => (
      <OptionGrid
        options={banded(POWER_OPTS)}
        selected={[String(nearest(POWER_OPTS, prefs.power).value)]}
        onPick={(v) => set('power', Number(v))}
        columns={2}
      />
    ),
    readout: (prefs) => ({
      title: 'Output readout',
      rows: [
        ['Appetite', nearest(POWER_OPTS, prefs.power).name, true],
        ['Target', `${desiredHp(prefs.power)} hp`, true],
        ['Use wants', `${USES[prefs.use].hp[0]}–${USES[prefs.use].hp[1]} hp`],
      ],
      note: prefs.power > 80 && USES[prefs.use].economy > 0.6
        ? { title: 'Conflict', body: `That much power and ${USES[prefs.use].label.toLowerCase()} use pull in opposite directions.` }
        : undefined,
    }),
  },

  {
    key: 'gearbox',
    label: 'Gearbox',
    title: 'How does it change gear?',
    sub: 'How it puts the power down. Near misses still score, since a twin-clutch is not far from an automatic.',
    Body: ({ prefs, set }) => (
      <OptionGrid options={TRANS_OPTS} selected={[prefs.trans]} onPick={(v) => set('trans', v)} />
    ),
    readout: (prefs) => ({
      title: 'Transmission readout',
      rows: [
        ['Type', prefs.trans === 'any' ? 'Open' : prefs.trans, true],
      ],
      note: prefs.trans === 'manual'
        ? { title: 'Availability', body: 'Manual gearboxes are thinning out. Expect the shortlist to lean older, cheaper or more sporting than it otherwise would.' }
        : undefined,
    }),
  },

  {
    key: 'looks',
    label: 'Looks',
    title: 'How loud should it look?',
    sub: 'Purely visual. This scores how the car looks parked, not how fast it is.',
    Body: ({ prefs, set }) => (
      <OptionGrid
        options={banded(LOOKS_OPTS)}
        selected={[String(nearest(LOOKS_OPTS, prefs.sporty).value)]}
        onPick={(v) => set('sporty', Number(v))}
        columns={2}
      />
    ),
    readout: (prefs, t) => ({
      title: 'Surface readout',
      rows: [
        ['Attitude', nearest(LOOKS_OPTS, prefs.sporty).name, true],
        ['Shine', `${Math.round(t.gloss * 100)}%`],
        ['Finish', t.polish > 0.8 ? 'Crisp' : t.polish > 0.6 ? 'Clean' : 'Coarse'],
      ],
    }),
  },

  {
    key: 'reliability',
    label: 'Reliability',
    title: 'How much can it break?',
    sub: 'A floor, not a wish. Anything below the line you pick gets marked down hard.',
    Body: ({ prefs, set }) => (
      <OptionGrid
        options={banded(RELIABILITY_OPTS)}
        selected={[String(nearest(RELIABILITY_OPTS, prefs.minReliability).value)]}
        onPick={(v) => set('minReliability', Number(v))}
        columns={2}
      />
    ),
    readout: (prefs) => ({
      title: 'Confidence readout',
      rows: [
        ['Floor', `${prefs.minReliability}/5`, true],
        ['Stance', nearest(RELIABILITY_OPTS, prefs.minReliability).name],
      ],
      note: prefs.minReliability <= 1
        ? { title: 'Your funeral', body: 'With no floor at all the shortlist will happily hand you something characterful and fragile.' }
        : undefined,
    }),
  },

  {
    key: 'economy',
    label: 'Economy',
    title: 'Does fuel cost matter?',
    sub: 'How hard running costs should count against everything else.',
    Body: ({ prefs, set }) => (
      <OptionGrid
        options={banded(ECONOMY_OPTS)}
        selected={[String(nearest(ECONOMY_OPTS, prefs.economy).value)]}
        onPick={(v) => set('economy', Number(v))}
        columns={2}
      />
    ),
    readout: (prefs) => ({
      title: 'Running cost readout',
      rows: [
        ['Priority', nearest(ECONOMY_OPTS, prefs.economy).name, true],
        ['Weight', `${Math.round(prefs.economy)}/100`],
        ['Exhaust', prefs.economy > 70 ? 'Clean' : prefs.economy > 35 ? 'Hazy' : 'Filthy'],
      ],
    }),
  },

  {
    key: 'budget',
    label: 'Budget',
    title: 'What can you spend?',
    sub: 'Used prices, roughly, in dollars. Coming in under the band is nearly free; going over it is not.',
    Body: ({ prefs, set }) => (
      <OptionGrid
        options={BUDGET_OPTS.map((o, i) => ({ value: String(i), name: o.name, hint: o.hint }))}
        selected={[String(bandIndex(prefs.budget))]}
        onPick={(v) => set('budget', BUDGET_OPTS[Number(v)].band)}
        columns={2}
      />
    ),
    readout: (prefs) => ({
      title: 'Market readout',
      rows: [
        ['Band', `${money(prefs.budget[0])} – ${money(prefs.budget[1])}`, true],
        ['Segment', BUDGET_OPTS[bandIndex(prefs.budget)].name],
      ],
      note: prefs.budget[1] <= 12000
        ? { title: 'Running costs', body: 'Down here the purchase price stops being the expensive part. Budget for the first year of repairs.' }
        : undefined,
    }),
  },
];

export const STEPS = ALL_STEPS;

/**
 * The gearbox question only exists if there is a gearbox. An electric car has
 * one ratio and no choice to make, so the step is dropped rather than shown
 * greyed out.
 */
/**
 * The running-cost question, for a car with no exhaust. Same key and the same
 * four weights as the petrol version, so the scorer and the decisive marker
 * carry across untouched; only the words and the channel change. It grows the
 * battery instead of making smoke.
 */
const CHARGE_STEP: Step = {
  key: 'economy',
  label: 'Charge',
  title: 'Does charging cost matter?',
  sub: 'How hard the cost of a charge should count against everything else. The efficient ones also go further on the same pack.',
  Body: ({ prefs, set }) => (
    <OptionGrid
      options={banded(CHARGE_OPTS)}
      selected={[String(nearest(CHARGE_OPTS, prefs.economy).value)]}
      onPick={(v) => set('economy', Number(v))}
      columns={2}
    />
  ),
  readout: (prefs) => ({
    title: 'Battery readout',
    rows: [
      ['Priority', nearest(CHARGE_OPTS, prefs.economy).name, true],
      ['Weight', `${Math.round(prefs.economy)}/100`],
      ['Pack', prefs.economy > 70 ? 'Long range' : prefs.economy > 35 ? 'Standard' : 'Slim'],
    ],
  }),
};

export function activeSteps(prefs: Prefs): Step[] {
  if (prefs.cylinders !== 'electric') return ALL_STEPS;
  // No gearbox to pick, so that one goes. Running cost still matters, it is
  // just charge rather than fuel.
  return ALL_STEPS
    .filter((s) => s.key !== 'gearbox')
    .map((s) => (s.key === 'economy' ? CHARGE_STEP : s));
}
