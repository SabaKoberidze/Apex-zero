/**
 * Sanity-checks the catalogue and writes it out as a spreadsheet.
 *
 * This cannot tell you whether a horsepower figure is right — only a source
 * can do that. What it does catch is the kind of error that creeps in when a
 * row is typed by hand: an electric car with cylinders, a CVT with eight
 * gears, a duplicate entry, a price with a digit missing.
 *
 *   node tools/check-cars.mjs          check only
 *   node tools/check-cars.mjs --csv    check, then write cars.csv
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

// The dataset is TypeScript, so read the rows out of the source rather than
// pulling in a compiler just for this.
const src = readFileSync(join(root, 'src/data/cars.ts'), 'utf8');
const body = src.slice(src.indexOf('const ROWS'), src.indexOf('\n];', src.indexOf('const ROWS')));

const COLS = [
  'make', 'model', 'yearFrom', 'yearTo', 'body', 'drive', 'cylinders', 'displacement',
  'hp', 'trans', 'gears', 'seats', 'clearanceMm', 'reliability', 'mpg', 'priceUsd', 'looks', 'tags',
];

const rows = [];
for (const line of body.split('\n')) {
  const t = line.trim();
  if (!t.startsWith("['")) continue;
  const cells = [...t.matchAll(/'((?:[^'\\]|\\.)*)'|(-?\d+(?:\.\d+)?)/g)]
    .map((m) => (m[1] !== undefined ? m[1] : Number(m[2])));
  if (cells.length !== COLS.length) {
    console.error(`! wrong column count (${cells.length}): ${t.slice(0, 70)}`);
    continue;
  }
  rows.push(Object.fromEntries(COLS.map((c, i) => [c, cells[i]])));
}

const BODIES = new Set(['sedan', 'wagon', 'hatch', 'suv', 'coupe', 'pickup', 'van', 'convertible']);
const DRIVES = new Set(['fwd', 'rwd', 'awd', '4x4']);
const TRANS = new Set(['manual', 'auto', 'cvt', 'dct', 'single']);

const problems = [];
const seen = new Map();
const flag = (r, msg) => problems.push(`${r.make} ${r.model} (${r.yearFrom}): ${msg}`);

for (const r of rows) {
  const key = `${r.make}|${r.model}|${r.yearFrom}`;
  if (seen.has(key)) flag(r, 'duplicate entry');
  seen.set(key, true);

  if (!BODIES.has(r.body)) flag(r, `unknown body "${r.body}"`);
  if (!DRIVES.has(r.drive)) flag(r, `unknown drive "${r.drive}"`);
  if (!TRANS.has(r.trans)) flag(r, `unknown gearbox "${r.trans}"`);

  const ev = r.cylinders === 0;
  if (ev) {
    if (r.displacement !== 0) flag(r, 'electric but has displacement');
    if (r.trans !== 'single') flag(r, `electric but gearbox is "${r.trans}"`);
    // Almost every electric is single-speed; the Taycan's two-speed rear axle
    // is the one production exception worth allowing through.
    if (r.gears < 1 || r.gears > 2) flag(r, `electric with ${r.gears} ratios`);
  } else {
    if (r.displacement <= 0) flag(r, 'combustion but no displacement');
    if (r.trans === 'single') flag(r, 'single-speed but not electric');
    if (r.cylinders < 2 || r.cylinders > 12) flag(r, `odd cylinder count ${r.cylinders}`);
  }

  if (r.trans === 'cvt' && r.gears !== 1) flag(r, 'CVT with a ratio count');
  if (r.gears < 1 || r.gears > 10) flag(r, `gear count out of range (${r.gears})`);
  if (r.yearFrom > r.yearTo) flag(r, 'years are backwards');
  if (r.yearFrom < 1970 || r.yearTo > 2026) flag(r, 'years out of range');
  if (r.seats < 2 || r.seats > 9) flag(r, `seat count out of range (${r.seats})`);
  if (r.hp < 50 || r.hp > 900) flag(r, `power looks wrong (${r.hp} hp)`);
  if (r.mpg < 10 || r.mpg > 140) flag(r, `economy looks wrong (${r.mpg})`);
  if (r.clearanceMm < 90 || r.clearanceMm > 400) flag(r, `clearance looks wrong (${r.clearanceMm} mm)`);
  if (r.priceUsd < 3000 || r.priceUsd > 120000) flag(r, `price looks wrong ($${r.priceUsd})`);
  if (r.reliability < 1 || r.reliability > 5) flag(r, 'reliability outside 1-5');
  if (r.looks < 1 || r.looks > 5) flag(r, 'looks outside 1-5');
  if (!String(r.tags).trim()) flag(r, 'no tags');
}

// --- coverage: every answer in the quiz needs something to match ----------
const tally = (key) => rows.reduce((m, r) => m.set(r[key], (m.get(r[key]) ?? 0) + 1), new Map());
const show = (label, m) =>
  `${label.padEnd(9)} ${[...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join('  ')}`;

console.log(`${rows.length} cars\n`);
console.log(show('body', tally('body')));
console.log(show('drive', tally('drive')));
console.log(show('gearbox', tally('trans')));
console.log(show('seats', tally('seats')));

const cylBands = rows.reduce((m, r) => {
  const b = r.cylinders === 0 ? 'electric' : r.cylinders <= 4 ? '3-4' : r.cylinders <= 6 ? '5-6' : '8+';
  return m.set(b, (m.get(b) ?? 0) + 1);
}, new Map());
console.log(show('engine', cylBands));

// Engine position is derived in cars.ts rather than stored, so derive it the
// same way here — it is the answer with the thinnest pool, and worth watching.
const rearIds = new Set(
  [...src.slice(src.indexOf('REAR_ENGINED'), src.indexOf(']);', src.indexOf('REAR_ENGINED'))).matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]),
);
const slug = (v) => String(v).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const posBands = rows.reduce((m, r) => {
  const id = `${slug(r.make)}-${slug(r.model)}-${r.yearFrom}`;
  const b = rearIds.has(id) ? 'rear' : String(r.tags).split(',').includes('mid') ? 'mid' : 'front';
  return m.set(b, (m.get(b) ?? 0) + 1);
}, new Map());
console.log(show('enginePos', posBands));

const priceBands = rows.reduce((m, r) => {
  const b = r.priceUsd < 12000 ? '<12k' : r.priceUsd < 25000 ? '12-25k'
    : r.priceUsd < 45000 ? '25-45k' : r.priceUsd < 75000 ? '45-75k' : '75k+';
  return m.set(b, (m.get(b) ?? 0) + 1);
}, new Map());
console.log(show('price', priceBands));

if (process.argv.includes('--csv')) {
  const esc = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const csv = [COLS.join(','), ...rows.map((r) => COLS.map((c) => esc(r[c])).join(','))].join('\n');
  writeFileSync(join(root, 'cars.csv'), csv, 'utf8');
  console.log('\nwrote cars.csv');
}

console.log(`\n${problems.length} problems`);
for (const p of problems) console.log('  ! ' + p);
process.exitCode = problems.length ? 1 : 0;
