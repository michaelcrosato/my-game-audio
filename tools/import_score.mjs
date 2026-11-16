// node tools/import_score.mjs imports/moonlight.json [--out songs/x.mjs]: a piano or small-ensemble score, laid out
// by a config, to a song file: the JavaScript port of tools/import_score.py for Humdrum **kern sources, with no
// Python. The config names the source, the tempo, how each staff splits into parts (by note length: Moonlight's
// melody and triplets), the pedal rule and the sound (see imports/*.json). It writes the file import_score.py writes
// (test/import-score.test.mjs compares them). Other formats: node tools/convert.mjs (MusicXML, MIDI, ABC).
// Score files are untrusted input: they are only read.
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readKern } from '../engine/kern.mjs';

const TPQ = 20160;
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
const LEVELS = ['pppp', 'ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff'];
const ENGINE_LEVELS = { pppp: 'ppp', sfp: 'p', fp: 'p' };
// note names as music21 spells a MIDI number (sharps but for E-flat and B-flat), written with b for flat
const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
const nameOf = (m) => `${NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
// a number as the config wrote it (Python keeps 1.0 a float and prints it so; JavaScript would print 1)
class Raw {
  constructor(s) {
    this.s = s;
  }
}
/** A config's text parsed with every number kept as written, for printing as Python prints it. */
export const parseRaw = (text) => JSON.parse(text, (k, v, ctx) => (typeof v === 'number' ? new Raw(ctx?.source ?? String(v)) : v));
// Python's json.dumps: ", " and ": " separators, non-ASCII escaped, numbers as written
const pystr = (x) => JSON.stringify(x).replace(/[\u007f-\uffff]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
const pyjson = (v) => (v instanceof Raw ? v.s : v === null ? 'null' : typeof v === 'string' ? pystr(v) : typeof v !== 'object' ? String(v)
  : Array.isArray(v) ? `[${v.map(pyjson).join(', ')}]` : `{${Object.entries(v).map(([k, x]) => `${pystr(k)}: ${pyjson(x)}`).join(', ')}}`);
const pyval = (v) => (v instanceof Raw ? v.s : String(v)); // as an f-string prints it
// a fraction of a quarter note as Python's Fraction prints it (the classes' "dur": "1/3")
const frac = (s) => {
  const [a, b] = String(s).split('/').map(Number);
  return b ? Math.round((a * TPQ) / b) : Math.round(a * TPQ);
};

/** Write a trill out as alternating notes, starting on the upper note, in 32nd notes (as kern.py's trill_notes). */
function trillNotes(nt) {
  const step = TPQ / 8, up = nt.midi + (nt.trill === 1 ? 1 : 2);
  const n = Math.max(2, Math.floor(nt.dur / step));
  const out = [];
  let t = nt.on;
  for (let k = 0; k < n; k++) {
    const d = k < n - 1 ? step : nt.dur - step * (n - 1);
    out.push({ ...nt, on: t, dur: d, midi: k % 2 === 0 ? up : nt.midi, name: null, grace: k === 0 ? nt.grace : [], trill: 0 });
    t += d;
  }
  return out;
}

// a staff's notes as chord groups { on, dur, pitches, names, arts, grace }: trills written out, equal notes merged
function kernGroups(notes, shift) {
  const flat = notes.flatMap((nt) => (nt.trill ? trillNotes(nt) : [nt]));
  const merged = new Map();
  for (const nt of flat) {
    const k = `${nt.on}:${nt.dur}:${nt.arts}`;
    const name = nt.name ?? nameOf(nt.midi);
    const g = merged.get(k) ?? merged.set(k, { on: nt.on + shift, dur: nt.dur, pitches: [], names: [], arts: nt.arts, grace: [] }).get(k);
    if (!g.pitches.includes(nt.midi)) {
      g.pitches.push(nt.midi);
      g.names.push(name);
    }
    for (const x of nt.grace) if (!g.grace.includes(x)) g.grace.push(x);
  }
  const groups = [...merged.values()];
  for (const g of groups) {
    const order = g.pitches.map((_, i) => i).sort((a, b) => g.pitches[a] - g.pitches[b]);
    g.pitches = order.map((i) => g.pitches[i]);
    g.names = order.map((i) => g.names[i]);
  }
  return groups.sort((a, b) => a.on - b.on || b.dur - a.dur || b.pitches[b.pitches.length - 1] - a.pitches[a.pitches.length - 1]);
}

// greedy voice lanes: each lane a line of notes and chords that do not overlap
function lanes(groups) {
  const out = [];
  for (const g of groups) {
    const L = out.find((x) => x.end <= g.on);
    if (L) {
      L.items.push(g);
      L.end = g.on + g.dur;
    } else out.push({ end: g.on + g.dur, items: [g] });
  }
  return out.map((L) => L.items);
}

const classify = (g, rules) => (rules.find(([, rule]) => !('dur' in rule) || g.dur === frac(rule.dur)) ?? rules[rules.length - 1])[0];

// one lane as bar strings
function barTokens(items, spq, spb, nbars) {
  const bars = Array.from({ length: nbars }, () => []), used = new Array(nbars).fill(0);
  const put = (body, arts, start, length, prefix = '') => {
    let s = start, left = length, first = true;
    while (left > 0) {
      const b = Math.floor(s / spb), n = Math.min(left, (b + 1) * spb - s);
      if (first) {
        bars[b].push((n !== 1 ? `${prefix + body}:${n}` : prefix + body) + arts);
        first = false;
      } else bars[b].push(n !== 1 ? `-:${n}` : '-');
      used[b] += n;
      s += n;
      left -= n;
    }
  };
  const rest = (start, length) => {
    let s = start, left = length;
    while (left > 0) {
      const b = Math.floor(s / spb), n = Math.min(left, (b + 1) * spb - s);
      bars[b].push(n !== 1 ? `.:${n}` : '.');
      used[b] += n;
      s += n;
      left -= n;
    }
  };
  let pos = 0;
  for (const g of items) {
    const st = Math.floor((g.on * spq) / TPQ), ln = Math.max(1, Math.floor((g.dur * spq) / TPQ));
    if (st > pos) rest(pos, st - pos);
    const body = g.names.length === 1 ? g.names[0] : `[${g.names.join(' ')}]`;
    const prefix = g.grace.length ? `{${g.grace.map(nameOf).join(' ')}}` : '';
    put(body, g.arts, st, ln, prefix);
    pos = st + ln;
  }
  if (pos < nbars * spb) rest(pos, nbars * spb - pos);
  used.forEach((u, b) => {
    if (u !== spb) throw new Error(`bar ${b + 1}: ${u} steps, expected ${spb}`);
  });
  return bars.map((x) => x.join(' '));
}

/** A config's text (imports/*.json) to the song file's text. `read` reads the source (by default from disk). */
export function importScore(cfgText, { read = (p) => readFileSync(p, 'utf8'), log = () => {} } = {}) {
  const cfg = JSON.parse(cfgText), raw = parseRaw(cfgText);
  if (!cfg.source.endsWith('.krn')) throw new Error(`${cfg.source}: this tool reads Humdrum **kern; for MusicXML, MIDI or ABC use tools/convert.mjs`);
  const staffNames = cfg.staves ?? ['rh', 'lh'];
  const k = readKern(read(cfg.source), cfg.list ?? '');
  const shift = k.pickup ? k.barLen - k.pickup : 0;
  log(`order ${k.order}; bar ${k.barLen / TPQ} q; pickup ${k.pickup / TPQ} q; music ends at ${k.end / TPQ} q`);
  const staffGroups = Object.keys(k.notes).sort((a, b) => +a - +b).map((st) => kernGroups(k.notes[st], shift)); // staff 1 the top
  const marks = k.dyn.map(([t, v]) => [t + shift, v]).sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  const all = {};
  staffGroups.forEach((gs, si) => {
    const name = staffNames[si];
    const rules = cfg.classes?.[name] ?? [[name, {}]];
    const by = {};
    for (const g of gs) (by[classify(g, rules)] ??= []).push(g);
    for (const [cls, items] of Object.entries(by)) lanes(items).forEach((lane, li) => (all[li === 0 ? cls : `${cls}${li + 1}`] = lane));
  });
  // the grid: steps per quarter from every onset and length
  let spq = 1;
  for (const items of Object.values(all)) for (const g of items) for (const x of [g.on, g.dur]) {
    const den = TPQ / gcd(x, TPQ);
    spq = (spq * den) / gcd(spq, den);
  }
  const spb = (k.barLen * spq) / TPQ;
  const endQ = Math.max(...Object.values(all).flatMap((items) => items.map((g) => g.on + g.dur)));
  const nbars = Math.ceil(endQ / k.barLen);
  log(`grid ${spq}/quarter, ${spb}/bar, ${nbars} bars, lanes ${Object.keys(all)}`);
  const lines = Object.fromEntries(Object.entries(all).map(([n, v]) => [n, barTokens(v, spq, spb, nbars)]));
  // dynamics: the marks per bar, hairpins to the next mark
  const dynCells = [];
  let cur = cfg.dynamic ?? 'mf';
  for (let b = 0; b < nbars; b++) {
    const b0 = b * k.barLen, b1 = (b + 1) * k.barLen;
    let hair = '';
    for (const [t, v] of marks) {
      const vv = ENGINE_LEVELS[v] ?? v;
      if (t < b0 + k.barLen / 2 && LEVELS.includes(vv)) cur = ENGINE_LEVELS[vv] ?? vv;
      if (b0 <= t && t < b1 && (v.includes('<') || v.includes('>'))) hair = v.includes('<') ? '<' : '>';
    }
    dynCells.push([cur, hair]);
  }
  // the pedal, with the bass
  const pedalSteps = new Set();
  if (cfg.pedal === 'bass') {
    const from = cfg.pedalFrom ?? ['lh', 'bass'];
    const lh = Object.entries(all).filter(([n]) => from.some((p) => n.startsWith(p))).flatMap(([, items]) => items).sort((a, b) => a.on - b.on);
    for (const g of lh) if (g.dur >= TPQ || g.on % TPQ === 0) pedalSteps.add(Math.floor((g.on * spq) / TPQ));
  }
  let pedalBars = null;
  if (pedalSteps.size) {
    pedalBars = [];
    for (let b = 0; b < nbars; b++) {
      const toks = [];
      let pos = b * spb;
      for (const s of [...pedalSteps].filter((x) => b * spb <= x && x < (b + 1) * spb).sort((x, y) => x - y)) {
        if (s > pos) toks.push(s - pos > 1 ? `.:${s - pos}` : '.');
        toks.push('P');
        pos = s + 1;
      }
      if (pos < (b + 1) * spb) toks.push((b + 1) * spb - pos > 1 ? `.:${(b + 1) * spb - pos}` : '.');
      pedalBars.push(toks.join(' '));
    }
  }
  // sections of `chunk` bars; identical chunks share one section; the last is its own (it carries the rit.)
  const chunk = cfg.chunk ?? 4;
  const sections = new Map(), form = [], seen = new Map();
  const starts = [];
  for (let b = 0; b < nbars; b += chunk) starts.push(b);
  starts.forEach((b0, ci) => {
    const b1 = Math.min(nbars, b0 + chunk);
    const sec = { bars: b1 - b0, parts: {} };
    for (const [lane, bl] of Object.entries(lines)) {
      const seg = bl.slice(b0, b1);
      if (seg.some((x) => x.replace(/^[|. :0-9]+|[|. :0-9]+$/g, ''))) sec.parts[lane] = '| ' + seg.join(' | ') + ' |';
    }
    let prev = null;
    const cells = [];
    for (let b = b0; b < b1; b++) {
      const [lv, hair] = dynCells[b];
      cells.push(b === b0 || lv !== prev || hair ? `${lv}${hair}` : '-');
      prev = lv;
    }
    sec.dyn = { '*': '| ' + cells.join(' | ') + ' |' };
    if (pedalBars) sec.pedal = '| ' + pedalBars.slice(b0, b1).join(' | ') + ' |';
    const canon = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((kk) => [kk, canon(x[kk])])) : x);
    const key = JSON.stringify(canon(sec));
    let name;
    if (ci === starts.length - 1) {
      name = 'end';
      if (cfg.rit) sec.rit = raw.rit;
    } else if (seen.has(key)) name = seen.get(key);
    else {
      name = `m${b0 + 1}`;
      seen.set(key, name);
    }
    if (!sections.has(name)) sections.set(name, sec);
    form.push(name);
  });
  const meta = raw.song;
  const missing = Object.keys(lines).filter((lane) => !(lane in meta.parts));
  if (missing.length) throw new Error(`config has no part settings for lanes ${missing.join(', ')}`);
  const nNotes = Object.values(all).reduce((a, v) => a + v.length, 0);
  const out = [
    ...(cfg.header ?? []).map((line) => `// ${line}`),
    `// Imported by tools/import_score.py from ${basename(cfg.source)}: ${nbars} bars, ${nNotes} notes and chords;`,
    `// ${form.length} sections of up to ${chunk} bars, ${sections.size} of them distinct. Steps: ${spb} per bar (${spq} per quarter note).`,
    'export default {',
    ...['title', 'style'].map((kk) => `  ${kk}: ${pyjson(meta[kk])},`),
    `  bpm: ${pyval(raw.bpm)}, meter: [${Math.trunc(k.barLen / TPQ)}, 4], grid: ${spb}, key: ${pyjson(meta.key)}, seed: ${pyval(meta.seed ?? 7)}, tail: ${pyval(meta.tail ?? 5)},`,
    `  source: ${pyjson(meta.source)},`,
    ...['instruments', 'parts', 'buses', 'master'].map((kk) => `  ${kk}: ${pyjson(meta[kk])},`),
    '  sections: {',
  ];
  for (const [name, sec] of sections) {
    out.push(`    ${name}: {`, `      bars: ${sec.bars},`);
    if (sec.rit) out.push(`      rit: ${pyjson(sec.rit)},`);
    out.push('      parts: {');
    for (const [lane, txt] of Object.entries(sec.parts)) out.push(`        ${lane}: '${txt}',`);
    out.push('      },', `      dyn: { '*': '${sec.dyn['*']}' },`);
    if (sec.pedal) out.push(`      pedal: '${sec.pedal}',`);
    out.push('    },');
  }
  out.push('  },', `  form: ${pyjson(form)},`, '};');
  return out.join('\n') + '\n';
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const oi = args.indexOf('--out');
  const cfgText = readFileSync(args[0], 'utf8');
  const outPath = oi >= 0 ? args[oi + 1] : JSON.parse(cfgText).out;
  const text = importScore(cfgText, { log: console.log });
  writeFileSync(outPath, text);
  console.log('wrote', outPath, Buffer.byteLength(text), 'bytes');
}
