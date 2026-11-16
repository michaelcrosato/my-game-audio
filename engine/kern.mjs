// kern.mjs: Humdrum **kern (the subset piano and small-ensemble scores use) to songs, through the MusicXML
// importer's layout: the JavaScript port of tools/kern.py, so no Python is needed for any score format.
//
// Timing follows the Humdrum rule: each data line starts when the earliest sounding event ends. Spine splits (*^)
// and merges (*v) are followed, so a staff can have several voices. Ties are merged, grace notes (q, Q) attach to
// the next note in their spine, trills (t, T) and staccato (') and accent (^) marks are kept, **dynam spines give
// the dynamics, *MM the tempo, *k[...] the key, and an expansion list (*>[A,A,B]) writes the repeats out.
//
//   const { song, text, report } = importKern(kernText, { title, tempo, pedal: 'bass' });
import { buildSong } from './musicxml.mjs';

const TPQ = 20160; // ticks per quarter: every kern duration in practice (2^6 3^2 5 7) is a whole number of them
const PC = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const LEVELS = new Set(['ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff']);

/** Humdrum `thru`: the labelled sections (*>A) in the order of the expansion list (*>[A,A,B] or *>name[...]). */
export function kernExpand(text, listName = '') {
  const lines = text.replace(/\r/g, '').split('\n');
  let order = null;
  for (const ln of lines) {
    const f = ln.split('\t')[0];
    if (f.startsWith(`*>${listName}[`)) order = f.slice(listName.length + 3, -1).split(',');
  }
  const labels = lines.flatMap((ln, i) => (ln.startsWith('*>') && !ln.split('\t')[0].includes('[') ? [i] : []));
  if (!order || !labels.length) return { text: lines.join('\n'), order: null };
  const end = lines.findIndex((ln) => ln.split('\t')[0] === '*-');
  const header = lines.slice(0, labels[0]).filter((ln) => !ln.startsWith('*>'));
  const secs = {};
  const bounds = [...labels, end];
  for (let k = 0; k + 1 < bounds.length; k++) secs[lines[bounds[k]].split('\t')[0].slice(2)] = lines.slice(bounds[k] + 1, bounds[k + 1]);
  const body = order.flatMap((lab) => secs[lab] ?? []);
  return { text: [...header, ...body, ...lines.slice(end)].join('\n'), order };
}

// a token's length in ticks: 4 quarter, 8 eighth, 12 triplet eighth, 0 breve, 3%2 (a dotted half in tuplet form), dots
function duration(tok) {
  const m = /^(\d+)(%(\d+))?(\.*)/.exec(tok.replace(/^[[({&<>]+/, ''));
  if (!m) return null;
  const r = +m[1];
  let q = r === 0 ? 8 : 4 / r;
  if (m[3]) q *= +m[3];
  const dots = m[4].length;
  if (dots) q *= 2 - 1 / 2 ** dots;
  return Math.round(q * TPQ);
}
// a kern pitch: [midi, spelled name], or null for a rest
function pitch(tok) {
  const m = /([a-gA-G])\1*/.exec(tok);
  if (!m) return null;
  const L = m[0][0], n = m[0].length;
  const octave = L === L.toLowerCase() ? 3 + n : 4 - n;
  const acc = /^(#{1,2}|-{1,2}|n)?/.exec(tok.slice(m.index + m[0].length))[0];
  const semis = (acc.match(/#/g) ?? []).length - (acc.match(/-/g) ?? []).length;
  return [(octave + 1) * 12 + PC[L.toLowerCase()] + semis, `${L.toUpperCase()}${'#'.repeat(Math.max(0, semis))}${'b'.repeat(Math.max(0, -semis))}${octave}`];
}
const KEY_FIFTHS = (sig) => {
  const sharps = (sig.match(/#/g) ?? []).length, flats = (sig.match(/-/g) ?? []).length;
  return sharps - flats;
};

/**
 * Read **kern into staves of notes, in ticks (TPQ to the quarter). Returns { notes: { staff: [{ on, dur, midi, name,
 * arts, grace, trill }] }, dyn: [[tick, mark]], barLen, pickup, bars (the tick of each bar line), end, order, tempo,
 * keys: [[tick, fifths]], names: { staff: instrument } }. The same reading as tools/kern.py's read().
 */
export function readKern(text, listName = '') {
  const ex = kernExpand(text, listName);
  let cols = [];
  let T = 0;
  const notes = {}, dyn = [], openTies = new Map(), keys = [], names = {};
  let pendGrace = new Map(), barLen = null, tempo = null;
  const bars = [];
  for (const raw of ex.text.split('\n')) {
    if (!raw || raw.startsWith('!')) continue;
    const f = raw.split('\t');
    if (raw.startsWith('**')) {
      cols = f.map((x) => ({ type: x, staff: null, end: 0 }));
      continue;
    }
    if (raw.startsWith('*')) {
      if (f.some((x) => x === '*+' || x === '*x')) throw new Error(`kern: spine manipulator not supported: ${raw}`);
      if (f.some((x) => x === '*^' || x === '*v')) {
        const next = [];
        for (let i = 0; i < f.length;) {
          if (f[i] === '*^') {
            next.push({ ...cols[i] }, { ...cols[i] });
            i++;
          } else if (f[i] === '*v') {
            let j = i;
            while (j < f.length && f[j] === '*v') j++;
            next.push({ ...cols[i], end: Math.max(...cols.slice(i, j).map((c) => c.end)) });
            i = j;
          } else next.push(cols[i++]);
        }
        // grace notes waiting for their note follow their column only when nothing moved: drop them
        pendGrace = new Map();
        cols = next;
        continue;
      }
      f.forEach((x, i) => {
        if (i >= cols.length) return;
        let m;
        if ((m = /^\*staff(\d+)/.exec(x))) cols[i].staff = +m[1];
        if ((m = /^\*M(\d+)\/(\d+)/.exec(x)) && barLen == null) barLen = Math.round((+m[1] * 4 * TPQ) / +m[2]);
        if ((m = /^\*MM(\d+(?:\.\d+)?)/.exec(x)) && tempo == null) tempo = +m[1];
        if ((m = /^\*k\[([^\]]*)\]/.exec(x)) && cols[i].type === '**kern' && !keys.some((k) => k[0] === T)) keys.push([T, KEY_FIFTHS(m[1])]);
        if ((m = /^\*I"(.+)$/.exec(x)) && cols[i].type === '**kern') names[cols[i].staff ?? i] = m[1];
      });
      continue;
    }
    if (raw.startsWith('=')) {
      bars.push(T);
      continue;
    }
    f.forEach((tok, i) => {
      if (i >= cols.length || tok === '.') return;
      const c = cols[i];
      if (c.type === '**dynam') {
        dyn.push([T, tok]);
        return;
      }
      if (c.type !== '**kern') return;
      const staff = c.staff ?? i;
      let end = T, lastD = null;
      for (const sub of tok.split(' ')) {
        if (!sub || sub === '.') continue;
        let d = duration(sub);
        if (d == null) d = lastD; // a chord's later notes may leave out the duration: it is its first note's
        lastD = d;
        const grace = /[qQ]/.test(sub);
        if (d == null && !grace) continue;
        const p = sub.includes('r') ? null : pitch(sub);
        if (grace) {
          if (p) (pendGrace.get(i) ?? pendGrace.set(i, []).get(i)).push(p[0]);
          continue;
        }
        end = Math.max(end, T + d);
        if (!p) continue;
        const [midi, name] = p;
        const key = `${staff}:${midi}`;
        const held = openTies.get(key);
        if (held && sub.includes('[') && held.on + held.dur === T) {
          held.dur += d; // a second tie start on a note already tied: the middle of a tie
          continue;
        }
        if ((sub.includes(']') || sub.includes('_')) && held) {
          held.dur += d;
          if (sub.includes(']')) openTies.delete(key);
          continue;
        }
        let arts = '';
        if (sub.includes("'") || sub.includes('`')) arts += '^';
        if (sub.includes('^')) arts += '!';
        const nt = { on: T, dur: d, midi, name, arts, grace: pendGrace.get(i) ?? [], trill: sub.includes('t') ? 1 : sub.includes('T') ? 2 : 0 };
        pendGrace.delete(i);
        (notes[staff] ??= []).push(nt);
        if (sub.includes('[')) openTies.set(key, nt);
      }
      c.end = end;
    });
    const ends = cols.filter((c) => c.type === '**kern').map((c) => c.end);
    const nxt = ends.length ? Math.min(...ends) : T;
    if (nxt > T) T = nxt;
  }
  let pickup = 0;
  const first = bars.filter((t) => t > 0);
  if (first.length && barLen && first[0] < barLen) pickup = first[0];
  return { notes, dyn, barLen, pickup, bars, end: T, order: ex.order, tempo, keys, names };
}

/**
 * Import a Humdrum **kern score as a song (through the MusicXML importer's layout). Options: title, tempo, key,
 * source, list (the expansion list to follow, default the unnamed one), pedal ('bass': pedal with the bass), log.
 * Returns { song, text, report }.
 */
export function importKern(text, opt = {}) {
  const k = readKern(text, opt.list ?? '');
  const title = opt.title ?? /^!!!OTL:\s*(.+)$/m.exec(text)?.[1]?.trim() ?? 'Score';
  const composer = /^!!!COM:\s*(.+)$/m.exec(text)?.[1]?.trim() ?? null;
  // bars from the bar lines (the first may be a pickup), the last one to the end of the music
  const starts = [0, ...k.bars.filter((t) => t > 0 && t < k.end)];
  const uniq = [...new Set(starts)].sort((a, b) => a - b);
  const measures = uniq.map((off, n) => ({
    number: n + 1, suffix: '', offset: off, length: (uniq[n + 1] ?? Math.max(k.end, off + (k.barLen ?? TPQ * 4))) - off,
    forward: false, backward: false, times: null, endings: [],
  })).filter((m) => m.length > 0);
  const metros = [{ off: 0, number: opt.tempo ?? k.tempo ?? 100, referent: 1 }];
  const dyns = k.dyn.flatMap(([t, mark]) => {
    const m = /(ppp|pp|p|mp|mf|ff|fff|f)/.exec(mark);
    return m && LEVELS.has(m[1]) ? [{ off: t, value: m[1] }] : [];
  });
  // staves from the top down: Humdrum numbers them from the top (*staff1 the right hand)
  const staves = Object.keys(k.notes).sort((a, b) => +a - +b);
  let seq = 0;
  const parts = staves.map((st, si) => {
    const notes = [];
    // a chord: the notes of one staff that start and end together, with the same marks
    const groups = new Map();
    for (const nt of k.notes[st]) {
      const key = `${nt.on}:${nt.dur}:${nt.arts}:${nt.trill}`;
      const g = groups.get(key) ?? groups.set(key, { ...nt, pitches: [], names: [], grace: [] }).get(key);
      if (!g.pitches.includes(nt.midi)) {
        g.pitches.push(nt.midi);
        g.names.push(nt.name);
      }
      for (const x of nt.grace) if (!g.grace.includes(x)) g.grace.push(x);
    }
    for (const g of [...groups.values()].sort((a, b) => a.on - b.on || b.dur - a.dur)) {
      const order = g.pitches.map((_, i) => i).sort((a, b) => g.pitches[a] - g.pitches[b]);
      for (const x of g.grace) notes.push({ off: g.on, dur: 0, grace: true, rest: false, voice: '1', pitches: [x], names: [null], unpitched: false, tie: null, arts: [], exprs: [], lyric: null, seq: seq++ });
      notes.push({
        off: g.on, dur: g.dur, grace: false, rest: false, voice: '1', pitches: order.map((i) => g.pitches[i]), names: order.map((i) => g.names[i]),
        unpitched: false, tie: null, arts: [...(g.arts.includes('^') ? ['Staccato'] : []), ...(g.arts.includes('!') ? ['Accent'] : [])],
        exprs: g.trill ? [{ k: 'Trill' }] : [], lyric: null, seq: seq++,
      });
    }
    return {
      id: `P${si + 1}`, name: k.names[st] ?? opt.instrument ?? 'Piano', instName: null, instSound: null, program: null,
      measures, notes, dyns, words: [], wedges: [], metros: si === 0 ? metros : [],
      keys: k.keys.map(([off, fifths]) => ({ off, fifths })),
    };
  });
  if (!parts.length) throw new Error('kern: no **kern spine with notes');
  const score = { tpq: TPQ, parts, meta: { title, composer } };
  const r = buildSong(score, { rooms: true, ...opt, title, fileName: opt.fileName ?? 'score.krn' }, opt.log);
  r.report.expansion = k.order;
  r.report.pickup = k.pickup / TPQ;
  return r;
}
