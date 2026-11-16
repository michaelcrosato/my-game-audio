// Orchestra roll call: every instrument preset plays the same one-bar phrase in turn, family by family, the
// unpitched percussion plays a bar of its own, and then the whole orchestra plays three closing chords together.
// The level of each instrument comes straight from engine/orchestra-presets.json, so this is also the balance test.
import PRESETS from '../engine/orchestra-presets.json' with { type: 'json' };

const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const nm = (m) => NAMES[m % 12] + (Math.floor(m / 12) - 1);

const FAMILIES = [
  ['violins', 'violas', 'cellos', 'basses', 'violin_solo', 'viola_solo', 'cello_solo', 'contrabass_solo',
    'violins_pizz', 'violas_pizz', 'cellos_pizz', 'basses_pizz'],
  ['piccolo', 'flute', 'recorder', 'oboe', 'english_horn', 'clarinet', 'bass_clarinet', 'bassoon', 'contrabassoon',
    'soprano_sax', 'alto_sax', 'tenor_sax', 'baritone_sax'],
  ['horn', 'trumpet', 'cornet', 'muted_trumpet', 'trombone', 'bass_trombone', 'euphonium', 'tuba'],
  ['timpani', 'glockenspiel', 'xylophone', 'marimba', 'vibraphone', 'tubular_bells', 'celesta', 'crotales'],
  ['piano', 'harp', 'harpsichord', 'organ'],
  ['soprano_choir', 'alto_choir', 'tenor_choir', 'bass_choir', 'soprano_voice', 'alto_voice', 'tenor_voice', 'bass_voice'],
];
const ALL = FAMILIES.flat();

// the C an instrument starts its phrase on: an octave and a bit of room above it, as near the middle as possible
function tonic(name) {
  const [lo, hi] = PRESETS.instruments[name].range;
  const want = (lo + hi) / 2 - 7;
  let best = null;
  for (let m = 0; m <= 120; m += 12) if (m >= lo && m + 12 <= hi && (best === null || Math.abs(m - want) < Math.abs(best - want))) best = m;
  return best ?? lo;
}

// up the C major arpeggio slurred, two short notes back down, and a held third; voices sing it to words ("hear the
// voices sing in tune", spelled as sung), so their consonants can be heard
function phrase(name) {
  const T = tonic(name);
  if (name === 'timpani') return `| C3:4 G2:4 C3:2 C3:2 G2:2 C3:2~ |`;
  if (PRESETS.instruments[name].family === 'voices') {
    return `| ${nm(T)}:2@hir ${nm(T + 2)}:2@the ${nm(T + 4)}:2@voi ${nm(T + 7)}:2@ses ${nm(T + 12)}:2^@sing ${nm(T + 7)}:2^@in ${nm(T + 4)}:4@tun |`;
  }
  return `| ${nm(T)}:2 ${nm(T + 2)}:2_ ${nm(T + 4)}:2_ ${nm(T + 7)}:2_ ${nm(T + 12)}:2^ ${nm(T + 7)}:2^ ${nm(T + 4)}:4 |`;
}

// closing chords: IV and V7 for two beats each, then I; the low instruments take the root, the rest the chord tone
// nearest the middle of their range
const CHORDS = [[5, 9, 0], [7, 11, 2, 5], [0, 4, 7]];
function chordNote(name, pcs, k) {
  const [lo, hi] = PRESETS.instruments[name].range;
  const low = (lo + hi) / 2 < 48;
  const mid = (lo + hi) / 2 + (low ? -4 : 2);
  const pool = low ? [pcs[0]] : pcs;
  let best = null;
  for (let m = lo; m <= hi; m++) {
    if (!pool.includes(m % 12)) continue;
    const d = Math.abs(m - mid) + ((m % 12) === pcs[k % pcs.length] ? -2.5 : 0);
    if (best === null || d < best.d) best = { m, d };
  }
  return best.m;
}
function tutti(name, k) {
  if (name === 'timpani') return `| F2:8 G2:8 | C3:16~ | .:16 |`;
  const [a, b, c] = CHORDS.map((pcs) => nm(chordNote(name, pcs, k)));
  return `| ${a}:8! ${b}:8! | ${c}:16 | .:16 |`;
}

const instruments = {}, parts = {}, sections = {}, form = [];
for (const name of [...ALL, 'percussion']) {
  const p = PRESETS.instruments[name];
  instruments[name] = { ...p.spec, rangeName: name };
  parts[name] = { inst: name, gain: p.gain, pan: p.pan, sends: { hall: p.send }, fx: p.fx, humanize: 0.006, velVar: 0.05 };
}
for (const name of ALL) {
  sections[name] = { bars: 1, parts: { [name]: phrase(name) }, dyn: { [name]: '| mf |' } };
  form.push(name);
}
sections.percussion = {
  bars: 3,
  parts: { percussion: '| bd:4 sd sd sd sd cym:4 scym:4~ | tri:2 tri:2 tam:4 tamb tamb tamb tamb wb:2 wb:2 | cast cast cast cast sleigh:4 cowbell:2 cowbell:2 whip:4 |' },
  dyn: { percussion: '| mf | - | - |' },
};
form.push('percussion');
sections.tutti = {
  bars: 3, rit: [108, 84],
  parts: Object.fromEntries([...ALL.map((n, k) => [n, tutti(n, k)]), ['percussion', '| .:8 .:4 sd:4~ | cym:16 | .:16 |']]),
  dyn: Object.fromEntries([...ALL, 'percussion'].map((n) => [n, '| f< | ff | - |'])),
};
form.push('tutti');

export default {
  title: 'Orchestra roll call',
  style: 'Orchestra: every instrument preset',
  bpm: 108, meter: [4, 4], grid: 16, key: 'C major', seed: 11, tail: 5,
  instruments, parts,
  buses: { hall: PRESETS.hall },
  master: PRESETS.master,
  sections, form,
};
