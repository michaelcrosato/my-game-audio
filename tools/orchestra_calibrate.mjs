// Balance the orchestra: render every preset playing the same short phrase at mf, dry, measure its loudness, and
// write the gain (dB) that brings it to its family's target into engine/orchestra-presets.json.
// usage: node tools/orchestra_calibrate.mjs [--write]
import { readFileSync, writeFileSync } from 'node:fs';
import { renderSong } from '../engine/render.mjs';
import { lufs } from '../engine/fx.mjs';
import { midiToName } from '../engine/score.mjs';

const PATH = 'engine/orchestra-presets.json';
const P = JSON.parse(readFileSync(PATH, 'utf8'));
// target loudness (LUFS) of one part playing mf on its own, dry
const TARGET = {
  violins: -20, violas: -21, cellos: -20, basses: -21, violin_solo: -24, viola_solo: -24, cello_solo: -23, contrabass_solo: -24,
  violins_pizz: -24, violas_pizz: -24, cellos_pizz: -23, basses_pizz: -23,
  flute: -24, piccolo: -23, recorder: -26, oboe: -23, english_horn: -24, clarinet: -24, bass_clarinet: -24, bassoon: -24,
  contrabassoon: -24, soprano_sax: -22, alto_sax: -22, tenor_sax: -22, baritone_sax: -22,
  horn: -21, trumpet: -20, cornet: -21, trombone: -20, bass_trombone: -20, tuba: -21, euphonium: -21, muted_trumpet: -24,
  timpani: -26, glockenspiel: -25, xylophone: -23, marimba: -24, vibraphone: -24, tubular_bells: -22, celesta: -26, crotales: -26,
  piano: -21, harp: -23, harpsichord: -24, organ: -20,
  soprano_choir: -21, alto_choir: -21, tenor_choir: -21, bass_choir: -21, soprano_voice: -22, alto_voice: -22, tenor_voice: -22, bass_voice: -22,
};
const KIT_TARGET = { bd: -21, sd: -23, cym: -21, scym: -24, tri: -28, tam: -22, tamb: -26, wb: -26, cast: -27, sleigh: -27, cowbell: -26, whip: -25 };

function measure(name, spec, line, drum = false, extraFx = []) {
  const song = {
    bpm: 80, meter: [4, 4], grid: 16, seed: 3, tail: 2,
    instruments: { x: { ...spec, ...(drum ? {} : { range: [0, 127] }) } },
    parts: { p: { inst: 'x', gain: 0, fx: extraFx } },
    sections: { a: { bars: 2, parts: { p: line }, dyn: { p: '| mf | mf |' } } },
    form: ['a'], master: { lufs: false },
  };
  const r = renderSong(song);
  return lufs(r.L, r.R);
}

const write = process.argv.includes('--write');
const rows = [];
for (const [name, p] of Object.entries(P.instruments)) {
  if (name === 'percussion') {
    for (const tok of Object.keys(p.spec.kit)) {
      const kit = { ...p.spec.kit, [tok]: { ...p.spec.kit[tok], gain: 1 } };
      const L = measure(name, { ...p.spec, kit }, `| ${tok}:4 ${tok}:4 ${tok}:4 ${tok}:4 | .:16 |`, true);
      const g = +(KIT_TARGET[tok] - L).toFixed(1);
      rows.push([`percussion.${tok}`, L, KIT_TARGET[tok], g]);
      if (write) P.instruments.percussion.spec.kit[tok].gain = +Math.pow(10, g / 20).toFixed(4);
    }
    continue;
  }
  const [lo, hi] = p.range;
  const mid = Math.round((lo + hi) / 2) - 3;
  const notes = [mid, mid + 4, mid + 7, mid + 12].map((m) => midiToName(Math.min(hi, m)));
  const line = `| ${notes[0]}:4 ${notes[1]}:4 ${notes[2]}:4 ${notes[3]}:4 | [${notes[0]} ${notes[2]}]:8 .:8 |`;
  const L = measure(name, p.spec, line, false, p.fx);
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
