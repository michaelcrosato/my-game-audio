// abc.mjs: ABC notation (abcnotation.com, the text format of folk tunes) to songs, through the MusicXML importer's
// layout. Reads the header (X T C M L Q K V), notes with accidentals, octaves and lengths, rests, chords, ties,
// slurs, broken rhythm, tuplets, grace notes, decorations (staccato, accent, fermata, trill, roll, dynamics,
// hairpins), bar lines with repeats and first and second endings, inline fields, several voices, lyrics (w:), and
// chord symbols ("Am"), which become each section's chords line and, unless `accompany: false`, a harp and a bass
// that play them.
//
//   const { song, text, report } = importABC(abcText, { instrument: 'flute', title, tempo });
import { buildSong } from './musicxml.mjs';
import { padLine, parseChord, parseChords, midiToName } from './score.mjs';

const TPQ = 20160; // ticks per quarter: divisible by every ABC length and tuplet in practice (2^6 3^2 5 7)
const STEP_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const ORDER_SHARPS = 'FCGDAEB';
const MODES = { '': 0, maj: 0, ion: 0, m: -3, min: -3, aeo: -3, mix: -1, dor: -2, phr: -4, lyd: 1, loc: -5 };
const TONIC_FIFTHS = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, 'C#': 7, F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6, Cb: -7 };
const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
const spell = (step, alter, oct) => `${step}${alter > 0 ? '#'.repeat(alter) : alter < 0 ? 'b'.repeat(-alter) : ''}${oct}`;

/** The key signature's place on the circle of fifths (sharps positive): K:D 2, K:Dm -1, K:Amix 2. */
export function keyFifths(k) {
  const m = /^\s*([A-G])([#b]?)\s*([A-Za-z]*)/.exec(k ?? '');
  if (!m || /^none/i.test(k)) return 0;
  return (TONIC_FIFTHS[m[1] + m[2]] ?? 0) + (MODES[m[3].toLowerCase().slice(0, 3)] ?? 0);
}

/** The accidental (-1, 0, +1) a key signature gives each letter: K:G, K:Dm, K:Amix, K:F ^c. */
export function keyAccidentals(k) {
  const m = /^\s*([A-G])([#b]?)\s*([A-Za-z]*)(.*)$/.exec(k ?? '');
  const acc = { C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0 };
  if (!m || /^none/i.test(k)) return acc;
  const fifths = keyFifths(k);
  for (let i = 0; i < Math.min(7, fifths); i++) acc[ORDER_SHARPS[i]] = 1;
  for (let i = 0; i < Math.min(7, -fifths); i++) acc[ORDER_SHARPS[6 - i]] = -1;
  // explicit accidentals after the key: K:D =c ^g
  for (const x of m[4].matchAll(/(\^{1,2}|_{1,2}|=)([A-Ga-g])/g)) acc[x[2].toUpperCase()] = x[1] === '=' ? 0 : x[1][0] === '^' ? x[1].length : -x[1].length;
  return acc;
}

const frac = (s, dflt = 1) => {
  if (!s) return dflt;
  const m = /^(\d+)\/(\d+)$/.exec(s.trim());
  return m ? +m[1] / +m[2] : +s || dflt;
};
// a note length after a note: 2, /2, /, //, 3/2, 3/
function lengthOf(s) {
  if (!s) return 1;
  const m = /^(\d*)(\/*)(\d*)$/.exec(s);
  if (!m) return 1;
  const num = m[1] ? +m[1] : 1;
  let den = 1;
  if (m[2]) den = m[3] ? +m[3] * 2 ** (m[2].length - 1) : 2 ** m[2].length;
  return num / den;
}

/**
 * Import ABC notation (the first tune in the text, or the one numbered `opt.index`). Options: instrument (a preset
 * name, or a name the presets answer to: 'flute', 'violin', 'piano'...), accompany (default true when the tune has
 * chord symbols), title, key, tempo, source, log. Returns { song, text, report }.
 */
export function importABC(abc, opt = {}) {
  const lines = abc.replace(/\r/g, '').split('\n');
  // the tune: from its X: line to the next blank line
  let start = lines.findIndex((l) => /^X:/.test(l) && (opt.index == null || +l.slice(2) === opt.index));
  if (start < 0) start = 0;
  let endI = lines.findIndex((l, i) => i > start && /^\s*$/.test(l) && i > lines.findIndex((x, j) => j >= start && /^K:/.test(x)));
  if (endI < 0) endI = lines.length;
  const tune = lines.slice(start, endI);
  const H = { M: '4/4', L: null, Q: null, K: 'C', T: null, C: null };
  const voices = new Map(); // id -> { name, body: [] }
  let cur = null, inBody = false;
  const voiceOf = (id) => {
    if (!voices.has(id)) voices.set(id, { id, name: null, body: [] });
    return voices.get(id);
  };
  for (let raw of tune) {
    const line = raw.replace(/(^|[^\\])%.*$/, '$1');
    if (/^%%/.test(raw) || /^\s*$/.test(line)) continue;
    const f = /^([A-Za-z]):\s*(.*)$/.exec(line);
    if (f && !(inBody && f[1] === '|')) {
      const [, k, v] = f;
      if (k === 'V') {
        const id = v.split(/\s+/)[0];
        const vo = voiceOf(id);
        const nm = /(?:name|nm)="([^"]*)"/.exec(v);
        if (nm) vo.name = nm[1];
        if (inBody) cur = vo;
        continue;
      }
      if (k === 'w' && inBody && cur) {
        cur.body.push({ lyrics: v });
        continue;
      }
      if (!inBody) {
        if (k === 'T' && H.T) continue; // the first title is the tune's
        H[k] = v.trim();
        if (k === 'K') {
          inBody = true;
          cur = voices.size ? [...voices.values()][0] : voiceOf('1');
        }
        continue;
      }
      // a field inside the body (K: M: L: Q:) applies from here, in the voice being read
      if (cur) cur.body.push({ field: k, value: v.trim() });
      continue;
    }
    if (inBody && cur) cur.body.push({ music: line });
  }
  if (!voices.size) throw new Error('no tune in the ABC text (a K: line ends the header)');
  const meter = (m) => (m === 'C' ? [4, 4] : m === 'C|' ? [2, 2] : /^none/i.test(m) ? [4, 4] : m.split('/').map((x) => +x.split('+').reduce((a, b) => +a + +b, 0)));
  const [mb, mu] = meter(H.M);
  const unit = H.L ? frac(H.L) : mb / mu < 0.75 ? 1 / 16 : 1 / 8;
  const parseQ = (q) => {
    const m = /(\d+\/\d+)\s*=\s*(\d+(?:\.\d+)?)/.exec(q ?? '') ?? /^\s*(\d+(?:\.\d+)?)\s*$/.exec(q ?? '');
    if (!m) return null;
    return m[2] ? { number: +m[2], referent: frac(m[1]) * 4 } : { number: +m[1], referent: unit * 4 };
  };

  const parts = [];
  const harmony = [];
  let measuresOut = null;
  [...voices.values()].forEach((v, vi) => {
    const res = readVoice(v, { unit, meter: [mb, mu], key: H.K, Q: parseQ(H.Q), parseQ, meterOf: meter }, vi === 0 ? harmony : null);
    if (vi === 0) measuresOut = res.measures;
    parts.push({
      id: `P${vi + 1}`, name: opt.instrument ?? v.name ?? H.T ?? 'Melody', instName: null, instSound: null, program: null,
      measures: res.measures, notes: res.notes, dyns: res.dyns, words: res.words, wedges: res.wedges, metros: vi === 0 ? res.metros : [], keys: res.keys,
    });
  });
  for (const p of parts) p.measures = measuresOut;
  const score = { tpq: TPQ, parts, meta: { title: opt.title ?? H.T ?? 'Tune', composer: H.C ?? null }, harmony };
  const r = buildSong(score, { ...opt, title: opt.title ?? H.T ?? 'Tune', fileName: opt.fileName ?? 'tune.abc', key: opt.key ?? H.K }, opt.log);
  if (harmony.length && opt.accompany !== false) accompany(r);
  r.report.voices = voices.size;
  r.report.chordSymbols = harmony.length;
  return r;
}

// One voice's music: measures (bar lines, repeats, endings), notes, dynamics, hairpins, words, tempo marks.
function readVoice(v, ctx, harmony) {
  let unit = ctx.unit, [mb, mu] = ctx.meter;
  let keyAcc = keyAccidentals(ctx.key);
  const keys = [{ off: 0, fifths: keyFifths(ctx.key) }]; // for trills: their upper note is the key's
  const metros = ctx.Q ? [{ off: 0, number: ctx.Q.number, referent: ctx.Q.referent }] : [];
  const notes = [], dyns = [], words = [], wedges = [];
  const measures = [];
  let t = 0, barStart = 0, barAcc = {};
  let mFlags = { forward: false, endings: [] };
  let seq = 0;
  let tuplet = null; // { left, factor }
  let broken = null; // the length factor the next note takes from a > or <
  let pendGrace = [];
  let pendDeco = [];
  let slurDepth = 0, slurOpen = [];
  const tieOpen = new Map();
  let lastNote = null;
  const lyricQueue = [];
  const openWedges = [];
  const closeBar = (kind) => {
    if (t > barStart || kind) {
      const len = t - barStart;
      if (len > 0) {
        measures.push({ number: measures.length + 1, suffix: '', offset: barStart, length: len, forward: mFlags.forward, backward: false, times: null, endings: mFlags.endings });
        mFlags = { forward: false, endings: [] };
      }
      barStart = t;
      barAcc = {};
    }
  };
  const lastMeasure = () => measures[measures.length - 1];
  const items = v.body;
  for (const it of items) {
    if (it.field) {
      if (it.field === 'K') {
        keyAcc = keyAccidentals(it.value);
        keys.push({ off: t, fifths: keyFifths(it.value) });
      } else if (it.field === 'L') unit = frac(it.value);
      else if (it.field === 'M') [mb, mu] = ctx.meterOf(it.value);
      else if (it.field === 'Q') {
        const q = ctx.parseQ(it.value);
        if (q) metros.push({ off: t, ...q });
      }
      continue;
    }
    if (it.lyrics != null) {
      lyricQueue.push(...it.lyrics.split(/[\s-]+/).filter((x) => x && x !== '|' && x !== '*' && x !== '_'));
      continue;
    }
    const s = it.music.replace(/\\\s*$/, '');
    let i = 0;
    while (i < s.length) {
      const rest = s.slice(i);
      let m;
      if ((m = /^\s+/.exec(rest))) { i += m[0].length; continue; }
      // inline fields [K:D] [M:3/4] [L:1/16] [Q:120] [V:2]
      if ((m = /^\[([KMLQV]):([^\]]*)\]/.exec(rest))) {
        const [, k, val] = m;
        if (k === 'K') {
          keyAcc = keyAccidentals(val);
          keys.push({ off: t, fifths: keyFifths(val) });
        } else if (k === 'L') unit = frac(val);
        else if (k === 'M') [mb, mu] = ctx.meterOf(val);
        else if (k === 'Q') {
          const q = ctx.parseQ(val);
          if (q) metros.push({ off: t, ...q });
        }
        i += m[0].length;
        continue;
      }
      // bar lines, repeats and endings
      if ((m = /^(:*\|\]|\[\||:*\|:*|::|:+)(\[?[0-9,\-]+)?/.exec(rest)) && /[|:]/.test(m[1])) {
        const bar = m[1], end = m[2];
        const backward = bar.startsWith(':');
        const forward = bar.endsWith(':');
        closeBar(true);
        if (backward && lastMeasure()) lastMeasure().backward = true;
        if (backward && openEnding(measures)) closeEnding(measures);
        if (forward) mFlags.forward = true;
        if (end) {
          if (openEnding(measures)) closeEnding(measures);
          mFlags.endings.push({ numbers: end.replace('[', '').split(/[,\-]/).map(Number), type: 'start' });
        }
        i += m[0].length;
        continue;
      }
      if ((m = /^\[([0-9][0-9,\-]*)/.exec(rest))) {
        if (openEnding(measures)) closeEnding(measures);
        mFlags.endings.push({ numbers: m[1].split(/[,\-]/).map(Number), type: 'start' });
        i += m[0].length;
        continue;
      }
      // chord symbols and annotations in quotes
      if ((m = /^"([^"]*)"/.exec(rest))) {
        const q = m[1];
        if (/^[\^_<>@]/.test(q)) words.push({ off: t, content: q.slice(1) });
        else if (harmony && parseChord(q.replace(/\/[A-G][#b]?$/, '').replace('min', 'm').replace(/^([A-G][#b]?)M$/, '$1'))) harmony.push({ off: t, sym: q.replace(/\/[A-G][#b]?$/, '').replace('min', 'm') });
        i += m[0].length;
        continue;
      }
      // decorations: !name! +name+ and the one-letter ones
      if ((m = /^[!+]([^!+]*)[!+]/.exec(rest))) {
        pendDeco.push(m[1]);
        i += m[0].length;
        continue;
      }
      if ((m = /^[.~HTLMPSuv]/.exec(rest)) && /^[.~HTLMPSuv](?=[\^_=A-Ga-gz\[{(!.~HTLMPSuv]|$)/.test(rest)) {
        pendDeco.push({ '.': 'staccato', '~': 'roll', H: 'fermata', T: 'trill', L: 'accent', M: 'mordent', P: 'pralltriller', S: 'segno', u: 'upbow', v: 'downbow' }[m[0]]);
        i += 1;
        continue;
      }
      // tuplets: (3 (3:2 (3:2:3
      if ((m = /^\((\d)(?::(\d*))?(?::(\d*))?/.exec(rest))) {
        const p = +m[1];
        const q = m[2] ? +m[2] : { 2: 3, 3: 2, 4: 3, 6: 2, 8: 3 }[p] ?? (mu === 8 && mb % 3 === 0 ? 3 : 2);
        tuplet = { left: m[3] ? +m[3] : p, factor: q / p };
        i += m[0].length;
        continue;
      }
      if (rest[0] === '(') {
        slurDepth++;
        slurOpen.push(null);
        i++;
        continue;
      }
      if (rest[0] === ')') {
        if (slurOpen.length) {
          const first = slurOpen.pop();
          if (lastNote && lastNote !== first) lastNote.slurred = true;
        }
        slurDepth = Math.max(0, slurDepth - 1);
        i++;
        continue;
      }
      // grace notes {gab}
      if ((m = /^\{\/?([^}]*)\}/.exec(rest))) {
        for (const g of m[1].matchAll(/(\^{1,2}|_{1,2}|=)?([A-Ga-g])([',]*)/g)) pendGrace.push(pitchOf(g[1], g[2], g[3], keyAcc, barAcc, false).midi);
        i += m[0].length;
        continue;
      }
      // broken rhythm
      if ((m = /^(>+|<+)/.exec(rest))) {
        const n = m[1].length, f = 1 - 0.5 ** n;
        if (lastNote) {
          const extra = Math.round(lastNote.dur * (m[1][0] === '>' ? f : -f));
          lastNote.dur += extra;
          t += extra;
          broken = m[1][0] === '>' ? 0.5 ** n : 2 - 0.5 ** n;
        }
        i += m[0].length;
        continue;
      }
      // a chord [CEG]2, a note ^c'2, a rest z2 x Z4
      let pitches = null, len = 1, isRest = false, tie = false, mm;
      if ((mm = /^\[([^\]]*)\]([\d/]*)(-?)/.exec(rest))) {
        pitches = [...mm[1].matchAll(/(\^{1,2}|_{1,2}|=)?([A-Ga-g])([',]*)([\d/]*)(-?)/g)].map((g) => ({ ...pitchOf(g[1], g[2], g[3], keyAcc, barAcc, true), len: lengthOf(g[4]), tie: !!g[5] }));
        len = (pitches[0]?.len ?? 1) * lengthOf(mm[2]);
        tie = !!mm[3] || pitches.some((p) => p.tie);
        i += mm[0].length;
      } else if ((mm = /^(\^{1,2}|_{1,2}|=)?([A-Ga-g])([',]*)([\d/]*)(-?)/.exec(rest))) {
        pitches = [pitchOf(mm[1], mm[2], mm[3], keyAcc, barAcc, true)];
        len = lengthOf(mm[4]);
        tie = !!mm[5];
        i += mm[0].length;
      } else if ((mm = /^([zx])([\d/]*)/.exec(rest))) {
        isRest = true;
        len = lengthOf(mm[2]);
        i += mm[0].length;
      } else if ((mm = /^Z(\d*)/.exec(rest))) {
        // a multi-bar rest: whole bars of the meter
        const nbar = mm[1] ? +mm[1] : 1;
        for (let k = 0; k < nbar; k++) {
          t += Math.round((mb * 4 * TPQ) / mu);
          if (k < nbar - 1) closeBar(true);
        }
        i += mm[0].length;
        continue;
      } else {
        i++; // anything else (a stray character) is skipped
        continue;
      }
      let dur = Math.round(len * unit * 4 * TPQ);
      if (tuplet) {
        dur = Math.round(dur * tuplet.factor);
        if (--tuplet.left <= 0) tuplet = null;
      }
      if (broken != null) {
        dur = Math.round(dur * broken);
        broken = null;
      }
      const decos = pendDeco.map((d) => (typeof d === 'string' ? d.toLowerCase() : d));
      pendDeco = [];
      for (const d of decos) {
        if (/^(ppp|pp|p|mp|mf|f|ff|fff|sfz|sf)$/.test(d)) dyns.push({ off: t, value: d });
        else if (/^(crescendo|<)\($/.test(d) || d === 'crescendo(') openWedges.push({ cls: 'Crescendo', els: [] });
        else if (/^(diminuendo|>)\($/.test(d)) openWedges.push({ cls: 'Diminuendo', els: [] });
        else if (/^(crescendo|diminuendo|<|>)\)$/.test(d)) {
          const w = openWedges.pop();
          if (w && lastNote) {
            w.els.push(lastNote);
            wedges.push(w);
          }
        }
      }
      if (isRest) {
        t += dur;
        for (const w of openWedges) if (!w.els.length) w.els.push({ off: t - dur });
        continue;
      }
      const arts = [], exprs = [];
      if (decos.includes('staccato')) arts.push('Staccato');
      if (decos.includes('accent') || decos.includes('>') || decos.includes('emphasis')) arts.push('Accent');
      if (decos.includes('fermata')) exprs.push({ k: 'Fermata' });
      if (decos.includes('trill') || decos.includes('tr')) exprs.push({ k: 'Trill' });
      if (decos.includes('roll')) exprs.push({ k: 'Tremolo', marks: 3 });
      const ps = pitches.slice().sort((a, b) => a.midi - b.midi);
      // ties: a note continuing a tied note of the same pitch lengthens it instead
      const tied = ps.length === 1 ? tieOpen.get(ps[0].midi) : null;
      if (tied && tied.off + tied.dur === t) {
        tied.dur += dur;
        if (!tie) tieOpen.delete(ps[0].midi);
        t += dur;
        lastNote = tied;
        continue;
      }
      const el = {
        off: t, dur, grace: false, rest: false, voice: '1', pitches: ps.map((p) => p.midi), names: ps.map((p) => p.name),
        unpitched: false, tie: null, arts, exprs, lyric: lyricQueue.length ? lyricQueue.shift() : null, seq: seq++,
      };
      if (pendGrace.length) {
        for (const g of pendGrace) notes.push({ ...el, grace: true, dur: 0, pitches: [g], names: [NAMES[g % 12] + (Math.floor(g / 12) - 1)], arts: [], exprs: [], lyric: null, seq: seq++ });
        pendGrace = [];
        el.seq = seq++;
      }
      for (let k = 0; k < slurOpen.length; k++) if (slurOpen[k] === null) slurOpen[k] = el;
      for (const w of openWedges) if (!w.els.length) w.els.push(el);
      notes.push(el);
      if (tie && ps.length === 1) tieOpen.set(ps[0].midi, el);
      lastNote = el;
      t += dur;
    }
  }
  closeBar(false);
  if (openEnding(measures)) closeEnding(measures);
  notes.sort((a, b) => a.off - b.off || (a.grace ? 0 : 1) - (b.grace ? 0 : 1) || a.seq - b.seq);
  return { measures, notes, dyns, words, wedges, metros, keys };
}

const openEnding = (ms) => {
  for (let k = ms.length - 1; k >= 0; k--) {
    if (ms[k].endings.some((e) => e.type === 'stop' || e.type === 'discontinue')) return false;
    if (ms[k].endings.some((e) => e.type === 'start')) return true;
  }
  return false;
};
const closeEnding = (ms) => ms[ms.length - 1]?.endings.push({ numbers: [], type: 'stop' });

// a note's pitch: its letter and octave marks, its own accidental (kept for the rest of the bar) or the bar's or
// the key's
function pitchOf(acc, letter, marks, keyAcc, barAcc, remember) {
  const step = letter.toUpperCase();
  let oct = letter === step ? 4 : 5;
  for (const c of marks) oct += c === "'" ? 1 : -1;
  const k = `${step}${oct}`;
  let alter;
  if (acc) {
    alter = acc === '=' ? 0 : acc[0] === '^' ? acc.length : -acc.length;
    if (remember) barAcc[k] = alter;
  } else alter = barAcc[k] ?? keyAcc[step];
  return { midi: (oct + 1) * 12 + STEP_PC[step] + alter, name: spell(step, alter, oct) };
}

// chord symbols to a harp playing the chords and a bass playing their roots, section by section
function accompany(r) {
  const song = r.song;
  song.instruments.harp ??= { type: 'pluck', bright: 0.5, pick: 0.2, decay: 2.5, damp: 0.4, ring: true, rangeName: 'harp' };
  song.instruments.cellos_pizz ??= { type: 'ensemble', players: 3, detune: 6, timing: 0.02, spread: 0.2, inner: { type: 'pluck', bright: 0.35, pick: 0.18, decay: 1.3, damp: 0.55, ring: true }, rangeName: 'cellos_pizz' };
  song.parts.acc = { inst: 'harp', gain: -9, pan: 0.3, sends: { hall: -12 }, role: 'harmony' };
  song.parts.bass = { inst: 'cellos_pizz', gain: -6, pan: -0.15, sends: { hall: -16 }, role: 'bass' };
  for (const sec of Object.values(song.sections)) {
    if (!sec.chords) continue;
    sec.parts.acc = padLine(sec.chords, { lo: 'G3', hi: 'E5', notes: 3, spb: sec.grid });
    // the bass: each chord's bass note, held for as long as the chord
    const bars = [];
    for (const c of parseChords(sec.chords, sec.grid).chords) (bars[c.bar] ??= []).push(`${midiToName(36 + c.chord.bass)}${c.steps > 1 ? ':' + c.steps : ''}`);
    sec.parts.bass = '| ' + bars.map((b) => b.join(' ')).join(' | ') + ' |';
    sec.dyn.acc = '| mp |' + ' - |'.repeat(sec.bars - 1);
    sec.dyn.bass = '| mp |' + ' - |'.repeat(sec.bars - 1);
  }
  r.text = 'export default ' + JSON.stringify(song, null, 1) + ';\n';
  r.report.accompanied = true;
}
