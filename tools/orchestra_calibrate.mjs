// Balance the orchestra: render every preset playing the same short phrase at mf, dry, measure its loudness, and
// write the gain (dB) that brings it to its family's target into engine/orchestra-presets.json. The targets and the
// measurement live in tools/calibration.mjs; test/presets.test.mjs checks the written gains stay within 2 LU.
// usage: node tools/orchestra_calibrate.mjs [--write] [--only name,name] (--only: measure and write just those, so a
// new preset's gain is set without touching the others')
import { readFileSync, writeFileSync } from 'node:fs';
import { TARGET, KIT_TARGET, measure } from './calibration.mjs';

const PATH = 'engine/orchestra-presets.json';
const P = JSON.parse(readFileSync(PATH, 'utf8'));
const write = process.argv.includes('--write');
const oi = process.argv.indexOf('--only');
const only = oi > 0 ? new Set(process.argv[oi + 1].split(',')) : null;
const rows = [];
for (const [name, p] of Object.entries(P.instruments)) {
  if (only && !only.has(name)) continue;
  if (name === 'percussion') {
    for (const tok of Object.keys(p.spec.kit)) {
      const L = measure(P, name, tok);
      const g = +(KIT_TARGET[tok] - L).toFixed(1);
      rows.push([`percussion.${tok}`, L, KIT_TARGET[tok], g]);
      if (write) p.spec.kit[tok].gain = +Math.pow(10, g / 20).toFixed(4);
    }
    continue;
  }
  const L = measure(P, name);
  const t = TARGET[name] ?? -22;
  const g = +(t - L).toFixed(1);
  rows.push([name, L, t, g]);
  if (write) p.gain = g;
}
for (const [n, L, t, g] of rows) console.log(`${n.padEnd(22)} measured ${L.toFixed(1).padStart(6)} LUFS  target ${t}  gain ${g > 0 ? '+' : ''}${g} dB`);
if (write) {
  writeFileSync(PATH, JSON.stringify(P, null, 1));
  console.log('wrote', PATH);
}
