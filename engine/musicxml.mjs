// musicxml.mjs: full scores in MusicXML (.mxl or .musicxml) to song files, in a browser or in Node, with no
// dependencies. A port of tools/import_orchestra.py: the same choices of instrument, tempo, dynamics, articulation,
// repeats and layout, so it writes the same song (test/musicxml.test.mjs compares them on two Beethoven scores).
//
//   const { song, text, report } = await importMusicXML(bytes, { title, key, bars: '93-331', tempo, source });
//   song: the song object (play it); text: the song file as an ES module (save it as songs/name.mjs)
//
// What the Python importer took from music21, this file does itself: it reads the XML, unzips .mxl, lays out
// measures, voices, chords, ties and grace notes, writes transposing instruments at sounding pitch, expands repeats
// and endings, and follows slurs and hairpins the way music21 attaches them. Times are integer ticks (the least
// common multiple of the score's divisions per quarter note), so every offset is exact.
import PRESETS from './orchestra-presets.json' with { type: 'json' };

const INST = PRESETS.instruments;
const LEVELS = ['ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff'];
const LEVEL_MAP = { pppp: 'ppp', ffff: 'fff', fp: 'p', sfp: 'p', sfpp: 'pp' };
const ACCENT_DYN = new Set(['sf', 'sfz', 'fz', 'sffz', 'rfz', 'rf', 'sfp', 'fp', 'sfpp', 'fzp']);
const ABBR = {
  violins: 'vn', violas: 'va', cellos: 'vc', basses: 'cb', violin_solo: 'vns', viola_solo: 'vas', cello_solo: 'vcs',
  contrabass_solo: 'cbs', flute: 'fl', piccolo: 'picc', recorder: 'rec', oboe: 'ob', english_horn: 'eh',
  clarinet: 'cl', bass_clarinet: 'bcl', bassoon: 'bn', contrabassoon: 'cbn', soprano_sax: 'ssx', alto_sax: 'asx',
  tenor_sax: 'tsx', baritone_sax: 'bsx', horn: 'hn', trumpet: 'tp', cornet: 'cnt', trombone: 'tb', bass_trombone: 'btb',
  tuba: 'tu', euphonium: 'eu', muted_trumpet: 'mtp', timpani: 'timp', glockenspiel: 'glk', xylophone: 'xyl',
  marimba: 'mar', vibraphone: 'vib', tubular_bells: 'bells', celesta: 'cel', crotales: 'crt', piano: 'pno',
  harp: 'hp', harpsichord: 'hpd', organ: 'org', soprano_choir: 'sop', alto_choir: 'alt', tenor_choir: 'ten',
  bass_choir: 'bas', soprano_voice: 'sopsolo', alto_voice: 'altsolo', tenor_voice: 'tensolo', bass_voice: 'bassolo',
  percussion: 'perc',
};

// ---------------------------------------------------------------------------------------------------------------
// Reading the file: unzip .mxl, parse XML
// ---------------------------------------------------------------------------------------------------------------
async function inflateRaw(bytes) {
  const ds = new DecompressionStream('deflate-raw');
  const out = await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer();
  return new Uint8Array(out);
}

/** The files of a zip archive (stored or deflated): { name: Uint8Array }. */
export async function unzip(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // the end of central directory record, searched for from the end
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('not a zip archive');
  const n = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const files = {};
  const dec = new TextDecoder();
  for (let k = 0; k < n; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('bad zip directory');
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nlen));
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + csize);
    files[name] = method === 0 ? data : method === 8 ? await inflateRaw(data) : null;
    p += 46 + nlen + xlen + clen;
  }
  return files;
}

/** The MusicXML text of a file: an .mxl archive (its container names the score) or MusicXML bytes or text. */
export async function readMusicXMLText(input) {
  if (typeof input === 'string') return input;
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const files = await unzip(bytes);
    const dec = new TextDecoder();
    let path = null;
    if (files['META-INF/container.xml']) path = /full-path="([^"]+)"/.exec(dec.decode(files['META-INF/container.xml']))?.[1];
    path ??= Object.keys(files).find((f) => /\.(xml|musicxml)$/i.test(f) && !f.startsWith('META-INF'));
    if (!path || !files[path]) throw new Error('no score in the .mxl archive');
    return dec.decode(files[path]);
  }
  // UTF-16 files start with a byte order mark
  if ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff)) return new TextDecoder(bytes[0] === 0xff ? 'utf-16le' : 'utf-16be').decode(bytes);
  return new TextDecoder().decode(bytes);
}

const ENT = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
const unescape = (s) => (s.includes('&') ? s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e] ?? m)) : s);

/** A small XML parser: elements as { n: name, a: attributes, c: children, t: text }. Enough for MusicXML. */
export function parseXML(text) {
  const root = { n: '#root', a: {}, c: [], t: '' };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE(?:[^[>]|\[[^\]]*\])*>|<\/([^\s>]+)\s*>|<([^\s/>]+)([^>]*?)(\/?)>|([^<]+)/g;
  const attrRe = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(text))) {
    if (m[3]) {
      const el = { n: m[3], a: {}, c: [], t: '' };
      if (m[4]) {
        let a;
        attrRe.lastIndex = 0;
        while ((a = attrRe.exec(m[4]))) el.a[a[1]] = unescape(a[2] ?? a[3]);
      }
      stack[stack.length - 1].c.push(el);
      if (!m[5]) stack.push(el);
    } else if (m[2]) {
      if (stack.length > 1) stack.pop();
    } else if (m[6] !== undefined) {
      if (/\S/.test(m[6])) stack[stack.length - 1].t += unescape(m[6]);
    } else if (m[1] !== undefined) stack[stack.length - 1].t += m[1];
  }
  return root;
}
const kid = (el, name) => el?.c.find((x) => x.n === name);
const kids = (el, name) => (el ? el.c.filter((x) => x.n === name) : []);
const txt = (el, name) => kid(el, name)?.t.trim();

// ---------------------------------------------------------------------------------------------------------------
// Exact times: integer ticks, and fractions of a quarter note for the layout
// ---------------------------------------------------------------------------------------------------------------
const gcd = (a, b) => {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
};
const lcm = (a, b) => (a / gcd(a, b)) * b;
// Python's round(): half to even (on exact rationals num / den, den > 0)
function roundHalfEven(num, den) {
  const f = Math.floor(num / den), r = num - f * den;
  if (2 * r < den) return f;
  if (2 * r > den) return f + 1;
  return f % 2 === 0 ? f : f + 1;
}
// Python's round(x, 2) on a float: correctly rounded, ties (exact in binary) to even
function round2(x) {
  const s = x * 200;
  if (Number.isInteger(s) && s % 2 !== 0) {
    const lo = Math.floor(x * 100);
    return (lo % 2 === 0 ? lo : lo + 1) / 100;
  }
  return Number(x.toFixed(2));
}
// Python's f"{x:g}"
const fmtG = (x) => {
  if (Number.isInteger(x) && Math.abs(x) < 1e6) return String(x);
  const s = x.toPrecision(6);
  return s.includes('e') ? s : s.replace(/\.?0+$/, '');
};
// Python's json.dumps: ', ' and ': ' separators, non-ASCII escaped
function pyjson(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return JSON.stringify(v).replace(/[\u007f-\uffff]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return '[' + v.map(pyjson).join(', ') + ']';
  return '{' + Object.entries(v).map(([k, x]) => `${pyjson(k)}: ${pyjson(x)}`).join(', ') + '}';
}
// a canonical key for "are these two sections the same"
const canon = (v) => (v && typeof v === 'object' ? (Array.isArray(v) ? '[' + v.map(canon).join(',') + ']' : '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}') : JSON.stringify(v));

// ---------------------------------------------------------------------------------------------------------------
// Pitches
// ---------------------------------------------------------------------------------------------------------------
const STEP_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const STEPS = 'CDEFGAB';
// music21's spelling of a MIDI number with no context (grace notes)
const M21_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
const midiName = (m) => `${M21_NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
const pitchName = (step, alter, octave) => `${step}${alter > 0 ? '#'.repeat(alter) : alter < 0 ? 'b'.repeat(-alter) : ''}${octave}`;
// transpose a spelled pitch by an interval (diatonic steps, chromatic semitones): the sounding pitch of a
// transposing instrument, spelled the way the interval spells it
function transposeSpelled({ step, alter, octave }, dia, chrom) {
  const si = STEPS.indexOf(step) + dia;
  const nstep = STEPS[((si % 7) + 7) % 7];
  const noct = octave + Math.floor(si / 7);
  const midi = (octave + 1) * 12 + STEP_PC[step] + alter + chrom;
  const nalter = midi - ((noct + 1) * 12 + STEP_PC[nstep]);
  return { step: nstep, alter: nalter, octave: noct, midi };
}

// ---------------------------------------------------------------------------------------------------------------
// The score: parts of measures of notes, the way music21 reads them
// ---------------------------------------------------------------------------------------------------------------
/**
 * Read a parsed MusicXML document into parts: { id, name, instName, instSound, program, measures, notes, dyns,
 * words, wedges, metros, keys } with integer tick times, and `tpq` (ticks per quarter note).
 */
export function readScore(doc) {
  let root = kid(doc, 'score-partwise');
  if (!root) {
    if (kid(doc, 'score-timewise')) throw new Error('score-timewise MusicXML is not supported: export it as partwise');
    throw new Error('not a MusicXML score');
  }
  // ticks per quarter: the least common multiple of every divisions value
  let tpq = 8; // and a multiple of 8: trills alternate in eighths of a quarter
  const scan = (el) => {
    for (const c of el.c) {
      if (c.n === 'divisions') tpq = lcm(tpq, Math.max(1, Math.round(+c.t)));
      else if (c.c.length) scan(c);
    }
  };
  scan(root);
  const info = {};
  for (const sp of kids(kid(root, 'part-list'), 'score-part')) {
    const si = kid(sp, 'score-instrument'), mi = kid(sp, 'midi-instrument');
    // every instrument of the part by id: a percussion staff may hold several (snare, bass drum, cymbal on one line)
    const instruments = {};
    for (const x of kids(sp, 'score-instrument')) instruments[x.a.id] = { name: txt(x, 'instrument-name') ?? '', unpitched: null };
    for (const x of kids(sp, 'midi-instrument')) if (instruments[x.a.id] && txt(x, 'midi-unpitched')) instruments[x.a.id].unpitched = +txt(x, 'midi-unpitched') - 1;
    info[sp.a.id] = {
      name: txt(sp, 'part-name') ?? '', instName: txt(si, 'instrument-name') ?? null, instSound: txt(si, 'instrument-sound') ?? null,
      program: txt(mi, 'midi-program') != null ? +txt(mi, 'midi-program') - 1 : null, instruments,
    };
  }
  const meta = {
    title: txt(kid(root, 'work'), 'work-title') ?? txt(root, 'movement-title') ?? null,
    movement: txt(root, 'movement-title') ?? null,
    composer: kids(kid(root, 'identification'), 'creator').find((c) => c.a.type === 'composer')?.t.trim() ?? null,
  };
  // music21 keeps one bundle of spanners while it reads the whole score: a hairpin or slur left open in one part can
  // be closed (or continued) by the next part's, and a hairpin waiting for its first note takes the next note read
  // anywhere. Spanners belong to the part being read when they complete.
  const sb = { list: [], pending: [] };
  const parts = kids(root, 'part').map((pel) => readPart(pel, info[pel.a.id] ?? { name: '' }, tpq, sb));
  return { tpq, parts, meta };
}

function readPart(pel, inf, tpq, sb) {
  const part = { id: pel.a.id, ...inf, measures: [], notes: [], dyns: [], words: [], wedges: [], metros: [], keys: [], pedal: [] };
  let divisions = 1, mOff = 0, lastBar = 4 * tpq, meter = [4, 4];
  let trans = { dia: 0, chrom: 0 }, fifths = 0;
  let seq = 0;
  // music21's spanner rules: a start reuses an open spanner of its kind and number (slurs) or opens a new one
  // (hairpins); a stop closes the earliest open one with its number; an element joins a spanner once
  const open = (cls, id) => sb.list.find((x) => !x.complete && cls.includes(x.cls) && x.id === id);
  const join = (sp, el) => {
    if (sp.els.includes(el)) return;
    if (sp.cls === 'Slur' && sp.els.length) el.slurred = true; // in a slur, and not its first element
    sp.els.push(el);
  };
  const complete = (sp) => {
    sp.complete = true;
    if (sp.cls !== 'Slur') part.wedges.push(sp);
  };
  for (const mel of kids(pel, 'measure')) {
    const num = String(mel.a.number ?? '');
    const mm = /^(\d+)(.*)$/.exec(num);
    const measure = { number: mm ? +mm[1] : 0, suffix: mm ? mm[2] : num, offset: mOff, length: 0, forward: false, backward: false, times: null, endings: [] };
    let cur = 0, high = 0;
    let nLast = null; // the last note, chord or rest read in this measure: where a hairpin's stop attaches
    const voiceOrder = new Map();
    let lastVoice = '1';
    const chordBuf = [];
    const slurEvents = []; // the slur starts and stops of the chord being read, in file order
    const mNotes = [];
    // a finished note, chord or rest: hairpins waiting for one take it as their first element
    const settle = (el) => {
      // the first hairpin waiting for a note takes this one as its first element (one per note, first come first served)
      const w = sb.pending.shift();
      if (w && !w.els.includes(el)) {
        w.els.unshift(el);
      }
      nLast = el;
    };
    const flushChord = () => {
      if (!chordBuf.length) return;
      const first = chordBuf[0];
      const el = {
        off: mOff + first.cur, dur: first.dur, grace: first.grace, rest: false, voice: first.voice, measureIdx: part.measures.length,
        pitches: [], names: [], unpitched: chordBuf.some((x) => x.unpitched), tie: null, arts: [], exprs: [], lyric: first.lyric,
        seq: seq++,
      };
      // pitches sorted low to high; articulations and expressions merged, one of each kind
      const sorted = [...chordBuf].sort((a, b) => a.midi - b.midi);
      const seenA = new Set(), seenE = new Set();
      for (const x of sorted) {
        el.pitches.push(x.midi);
        el.names.push(x.name);
        for (const a of x.arts) if (!seenA.has(a)) { seenA.add(a); el.arts.push(a); }
        for (const e of x.exprs) if (!seenE.has(e.k)) { seenE.add(e.k); el.exprs.push(e); }
      }
      if (chordBuf.length === 1) el.tie = first.tie;
      for (const x of chordBuf) if (!el.lyric && x.lyric) el.lyric = x.lyric;
      // what music21 does not read, but the default (non-compat) import uses: cue notes, harmonics, arpeggio marks,
      // glissandi and slides, and which instrument of a percussion staff plays
      el.cue = chordBuf.every((x) => x.cue);
      el.arp = chordBuf.some((x) => x.arp);
      el.instrumentId = first.instrumentId;
      el.harmonic = chordBuf.find((x) => x.harmonic)?.harmonic ?? null;
      el.harmonicParts = el.harmonic ? sorted.map((x) => ({ midi: x.midi, kind: x.harmonic?.kind ?? 'base' })) : null;
      el.gliss = chordBuf.flatMap((x) => x.gliss);
      chordBuf.length = 0;
      // slurs, in the order the file gives them (a note may end one slur and start the next): music21 keeps only
      // the elements a slur starts and stops on, so only a slur's last note counts as slurred
      for (const ev of slurEvents) {
        let sp = open(['Slur'], ev.number);
        if (!sp) sb.list.push((sp = { cls: 'Slur', id: ev.number, els: [], complete: false }));
        join(sp, el);
        if (ev.type === 'stop') complete(sp);
      }
      slurEvents.length = 0;
      if (!voiceOrder.has(el.voice)) voiceOrder.set(el.voice, voiceOrder.size);
      mNotes.push(el);
      settle(el);
    };
    for (const c of mel.c) {
      if (c.n !== 'note') flushChord();
      if (c.n === 'attributes') {
        if (txt(c, 'divisions')) divisions = +txt(c, 'divisions');
        const key = kid(c, 'key');
        if (key && txt(key, 'fifths') != null) {
          fifths = +txt(key, 'fifths');
          part.keys.push({ off: mOff + cur, fifths: fifths + (7 * trans.chrom - 12 * trans.dia) });
        }
        const time = kid(c, 'time');
        if (time && txt(time, 'beats')) {
          const beats = txt(time, 'beats').split('+').reduce((a, b) => a + +b, 0), bt = +txt(time, 'beat-type');
          lastBar = Math.round((beats * 4 * tpq) / bt);
          meter = [beats, bt];
        }
        const tr = kid(c, 'transpose');
        if (tr) {
          const oc = +(txt(tr, 'octave-change') ?? 0);
          trans = { dia: +(txt(tr, 'diatonic') ?? 0) + 7 * oc, chrom: +(txt(tr, 'chromatic') ?? 0) + 12 * oc };
          part.keys.push({ off: mOff + cur, fifths: fifths + (7 * trans.chrom - 12 * trans.dia) });
        }
      } else if (c.n === 'note') {
        const isChord = !!kid(c, 'chord');
        if (!isChord) flushChord();
        const grace = !!kid(c, 'grace');
        const dur = grace ? 0 : Math.round(((+txt(c, 'duration') || 0) * tpq) / divisions);
        const voice = txt(c, 'voice') ?? lastVoice;
        lastVoice = voice;
        const at = isChord && chordBuf.length ? chordBuf[0].cur : cur;
        const lyrEl = kids(c, 'lyric')[0];
        const lyric = lyrEl ? kids(lyrEl, 'text').map((t) => t.t).join('') || null : null;
        if (kid(c, 'rest')) {
          const el = { rest: true, off: mOff + cur, dur, voice };
          settle(el);
          cur += dur;
          high = Math.max(high, cur);
          continue;
        }
        const pitch = kid(c, 'pitch'), unp = kid(c, 'unpitched');
        let midi = 0, name = '';
        if (pitch) {
          const sp = { step: txt(pitch, 'step'), alter: Math.round(+(txt(pitch, 'alter') ?? 0)), octave: +txt(pitch, 'octave') };
          const s = transposeSpelled(sp, trans.dia, trans.chrom);
          midi = s.midi;
          name = pitchName(s.step, s.alter, s.octave);
        } else if (unp) {
          const step = txt(unp, 'display-step') ?? 'E', oct = +(txt(unp, 'display-octave') ?? 4);
          midi = (oct + 1) * 12 + STEP_PC[step];
          name = `${step}${oct}`;
        }
        const ties = kids(c, 'tie').map((t) => t.a.type);
        const tie = ties.includes('start') && ties.includes('stop') ? 'continue' : ties.includes('stop') ? 'stop' : ties.includes('start') ? 'start' : null;
        const arts = [], exprs = [], gliss = [];
        let harmonic = null, arp = false;
        for (const nt of kids(c, 'notations')) {
          for (const tech of kids(nt, 'technical')) {
            const h = kid(tech, 'harmonic');
            if (h) harmonic = { artificial: !!kid(h, 'artificial'), kind: kid(h, 'touching-pitch') ? 'touching' : kid(h, 'base-pitch') ? 'base' : kid(h, 'sounding-pitch') ? 'sounding' : 'natural' };
          }
          if (kid(nt, 'arpeggiate')) arp = true;
          for (const g of [...kids(nt, 'glissando'), ...kids(nt, 'slide')]) gliss.push({ type: g.a.type, number: g.a.number ?? '1', kind: g.n });
          for (const a of kids(nt, 'articulations')) {
            for (const x of a.c) {
              const k = { staccato: 'Staccato', staccatissimo: 'Staccatissimo', spiccato: 'Spiccato', accent: 'Accent', 'strong-accent': 'StrongAccent', 'breath-mark': 'BreathMark', caesura: 'Caesura' }[x.n];
              if (k) arts.push(k);
            }
          }
          for (const o of kids(nt, 'ornaments')) {
            for (const x of o.c) {
              if (x.n === 'trill-mark') exprs.push({ k: 'Trill' });
              else if (['mordent', 'inverted-mordent', 'turn', 'inverted-turn', 'delayed-turn', 'delayed-inverted-turn'].includes(x.n)) exprs.push({ k: { mordent: 'Mordent', 'inverted-mordent': 'InvertedMordent', turn: 'Turn', 'inverted-turn': 'InvertedTurn', 'delayed-turn': 'DelayedTurn', 'delayed-inverted-turn': 'DelayedInvertedTurn' }[x.n] });
              else if (x.n === 'tremolo' && (x.a.type ?? 'single') === 'single') exprs.push({ k: 'Tremolo', marks: +(x.t.trim() || 3) });
            }
          }
          for (const f of kids(nt, 'fermata')) if (f) exprs.push({ k: 'Fermata' });
          for (const s of kids(nt, 'slur')) if (['start', 'stop', 'continue'].includes(s.a.type)) slurEvents.push({ type: s.a.type, number: s.a.number ?? null });
        }
        chordBuf.push({ cur: at, dur, grace, voice, midi, name, unpitched: !!unp, tie, arts, exprs, lyric, cue: !!kid(c, 'cue'), instrumentId: kid(c, 'instrument')?.a.id ?? null, harmonic, arp, gliss });
        if (!isChord) {
          cur += dur;
          high = Math.max(high, cur);
        }
      } else if (c.n === 'backup') {
        cur -= Math.round(((+txt(c, 'duration') || 0) * tpq) / divisions);
      } else if (c.n === 'forward') {
        cur += Math.round(((+txt(c, 'duration') || 0) * tpq) / divisions);
      } else if (c.n === 'direction') {
        const dOff = txt(c, 'offset') != null ? Math.round((+txt(c, 'offset') * tpq) / divisions) : 0;
        const off = mOff + cur + dOff;
        for (const dt of kids(c, 'direction-type')) {
          for (const x of dt.c) {
            if (x.n === 'words' && x.t.trim()) part.words.push({ off, content: x.t });
            else if (x.n === 'dynamics') {
              for (const d of x.c) part.dyns.push({ off, value: d.n === 'other-dynamics' ? d.t : d.n });
            } else if (x.n === 'wedge') {
              const type = x.a.type, number = x.a.number ?? null;
              if (type === 'crescendo' || type === 'diminuendo') {
                const w = { cls: type === 'crescendo' ? 'Crescendo' : 'Diminuendo', id: number, els: [], complete: false };
                sb.list.push(w);
                sb.pending.push(w);
              } else if (type === 'stop') {
                const w = open(['Crescendo', 'Diminuendo'], number);
                if (w) {
                  if (nLast) join(w, nLast);
                  complete(w);
                }
              }
            } else if (x.n === 'pedal') {
              // sustain pedal marks: start presses, change lifts and presses again, stop lifts (sostenuto is ignored)
              const k = { start: 'P', change: 'P', resume: 'P', stop: 'U', discontinue: 'U' }[x.a.type];
              if (k && x.a.sostenuto !== 'yes') part.pedal.push({ off, type: k });
            } else if (x.n === 'metronome') {
              const units = { breve: 8, whole: 4, half: 2, quarter: 1, eighth: 0.5, '16th': 0.25, '32nd': 0.125 };
              const bu = txt(x, 'beat-unit');
              let ref = units[bu] ?? 1;
              let add = ref / 2;
              for (let k = 0; k < kids(x, 'beat-unit-dot').length; k++, add /= 2) ref += add;
              const pm = parseFloat(txt(x, 'per-minute'));
              if (pm > 0) part.metros.push({ off, number: pm, referent: ref });
            }
          }
        }
      } else if (c.n === 'barline') {
        const rep = kid(c, 'repeat');
        if (rep?.a.direction === 'forward') measure.forward = true;
        if (rep?.a.direction === 'backward') {
          measure.backward = true;
          measure.times = rep.a.times ? +rep.a.times : null;
        }
        const end = kid(c, 'ending');
        if (end) measure.endings.push({ numbers: String(end.a.number ?? '1').split(/[,\s]+/).filter(Boolean).map(Number), type: end.a.type });
      }
    }
    flushChord();
    // music21's measure length: what the notes fill, or the time signature's bar when they overfill it oddly or
    // the measure is empty
    let shift = high;
    if (high > lastBar) {
      const diff = (high - lastBar) / tpq;
      const near = (x, unit) => Math.abs(x / unit - Math.round(x / unit)) * unit < 1e-6;
      if (!(diff > 0.5 || near(diff, 0.0625) || near(diff, 1 / 12))) shift = lastBar;
    } else if (high === 0) shift = lastBar;
    measure.length = high === 0 ? lastBar : high;
    measure.meter = meter;
    // music21's flattened order within a measure: by offset, grace notes first, then voice by voice, as read
    mNotes.sort((a, b) => a.off - b.off || (a.grace ? 0 : 1) - (b.grace ? 0 : 1) || voiceOrder.get(a.voice) - voiceOrder.get(b.voice) || a.seq - b.seq);
    part.notes.push(...mNotes);
    part.measures.push(measure);
    mOff += shift;
  }
  return part;
}

/** The order a performance plays the written measures in: repeats and endings written out. */
export function playOrder(measures) {
  const order = [];
  let i = 0, start = 0, pass = 1, guard = 0;
  const done = new Map(); // a backward repeat's index -> passes made
  while (i < measures.length && guard++ < 100000) {
    const m = measures[i];
    if (m.forward) start = i;
    // an ending whose numbers do not include this pass is skipped, to the end of the ending
    const endStart = m.endings.find((e) => e.type === 'start');
    if (endStart && !endStart.numbers.includes(pass)) {
      let j = i;
      while (j < measures.length && !measures[j].endings.some((e) => e.type === 'stop' || e.type === 'discontinue')) j++;
      i = j + 1;
      continue;
    }
    order.push(i);
    if (m.backward) {
      const times = m.times ?? 2;
      const made = (done.get(i) ?? 1);
      if (made < times) {
        done.set(i, made + 1);
        pass = made + 1;
        i = start;
        continue;
      }
      done.set(i, 0);
      pass = 1;
      start = i + 1;
    }
    i++;
  }
  return order;
}

// ---------------------------------------------------------------------------------------------------------------
// The importer: tools/import_orchestra.py, step by step
// ---------------------------------------------------------------------------------------------------------------
function norm(s) {
  s = (s ?? '').normalize('NFKD').replace(/[^\x00-\x7f]/g, '').toLowerCase().replace(/[^a-z]+/g, ' ');
  return ` ${s.trim()} `;
}
function bestAlias(name, table) {
  const n = norm(name);
  let best = [null, null];
  for (const [key, aliases] of Object.entries(table)) {
    for (const a of aliases) {
      const na = norm(a);
      if (na.trim() && n.includes(na) && (best[1] === null || na.length > best[1].length)) best = [key, na];
    }
  }
  return best;
}

/** Choose a preset for a part from its names, MusicXML sound ID and General MIDI program: [preset, kit token, how]. */
export function mapPart(names, sound, program, unpitchedFrac, hasVoices) {
  sound = (sound ?? '').toLowerCase();
  let bySound = null;
  for (const [key, p] of Object.entries(INST)) {
    for (const sd of p.sounds) if (sound.startsWith(sd) && (bySound === null || sd.length > bySound[1])) bySound = [key, sd.length, sd];
  }
  const kitSound = ['drum', 'metal', 'wood'].includes(sound.split('.')[0]) && (bySound === null || INST[bySound[0]].family !== 'percussion');
  if (unpitchedFrac > 0.5 || (kitSound && unpitchedFrac > 0)) {
    let [tok] = bestAlias(names, Object.fromEntries(Object.entries(PRESETS.percussion).map(([k, v]) => [k, v.aliases])));
    let how = 'name';
    if (!tok) {
      let best = null;
      for (const [k, v] of Object.entries(PRESETS.percussion)) for (const sd of v.sounds) if (sound.startsWith(sd) && (best === null || sd.length > best[1])) best = [k, sd.length];
      [tok, how] = best ? [best[0], 'sound'] : ['sd', 'default'];
    }
    return ['percussion', tok, `unpitched percussion, ${how}`];
  }
  const [byName, alias] = bestAlias(names, Object.fromEntries(Object.entries(INST).map(([k, p]) => [k, p.aliases])));
  let key, how;
  if (bySound && byName && INST[byName].family === INST[bySound[0]].family && byName !== bySound[0]) [key, how] = [byName, `name '${alias.trim()}' (sound ${sound})`];
  else if (bySound) [key, how] = [bySound[0], `sound ${sound}`];
  else if (byName) [key, how] = [byName, `name '${alias.trim()}'`];
  else {
    key = Object.keys(INST).find((k) => program != null && INST[k].gm.includes(program)) ?? null;
    how = key ? `GM program ${program}` : 'no match: piano';
    key ??= 'piano';
  }
  const bare = norm(names).trim();
  if (key === 'basses' && hasVoices && ['bass', 'basses', 'basso', 'bassi'].includes(bare)) key = 'bass_choir';
  if (key === 'alto_choir' && !hasVoices) key = 'violas';
  if (norm(names).includes(' solo ')) {
    key = { violins: 'violin_solo', violas: 'viola_solo', cellos: 'cello_solo', basses: 'contrabass_solo', soprano_choir: 'soprano_voice', alto_choir: 'alto_voice', tenor_choir: 'tenor_voice', bass_choir: 'bass_voice' }[key] ?? key;
  }
  return [key, null, how];
}

function tempoWord(text, words) {
  const t = norm(text).trim();
  let best = null;
  for (const [w, bpm] of Object.entries(words)) {
    const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${esc}\\b`).test(t) && (best === null || w.length > best[0].length)) best = [w, bpm];
  }
  return best ? best[1] : null;
}

const VOWEL_LETTERS = 'aeiouyäöüéèêëàâáíîïóôúûœæ';
const SINGLE_VOWEL = { a: 'a', à: 'a', â: 'a', á: 'a', e: 'e', é: 'e', è: 'e', ê: 'e', ë: 'e', ä: 'e', æ: 'e', œ: 'e', ö: 'e', i: 'i', î: 'i', ï: 'i', í: 'i', y: 'i', ü: 'i', o: 'o', ô: 'o', ó: 'o', u: 'u', û: 'u', ú: 'u' };
const DIGRAPH_VOWEL = { eu: 'o', äu: 'o', oi: 'o', oy: 'o', ei: 'a', ai: 'a', ay: 'a', au: 'a', ie: 'i', ee: 'i', oo: 'u', ou: 'u', ae: 'e', oe: 'e' };
function vowelOf(text, prev) {
  const t = (text ?? '').toLowerCase();
  const m = new RegExp(`[${VOWEL_LETTERS}]+`).exec(t);
  if (!m) return prev;
  let run = m[0];
  if (run[0] === 'y' && run.length > 1) run = run.slice(1);
  return DIGRAPH_VOWEL[run.slice(0, 2)] ?? SINGLE_VOWEL[run[0]] ?? prev;
}

// the next pitch of the major scale of the key in force above a pitch (a trill's upper note), as a MIDI number
function upperNote(part, el, midi) {
  let fifths = 0;
  for (const k of part.keys) if (k.off <= el.off) fifths = k.fifths;
  const tonic = ((fifths * 7) % 12 + 12) % 12;
  const scale = [0, 2, 4, 5, 7, 9, 11].map((x) => (x + tonic) % 12);
  for (let d = 1; d <= 2; d++) if (scale.includes((((midi + d) % 12) + 12) % 12)) return midi + d;
  return midi + 2;
}

// General MIDI percussion numbers to the orchestra's kit tokens (a staff's instrument with no recognisable name)
const GM_PERC = { 35: 'bd', 36: 'bd', 41: 'bd', 43: 'bd', 37: 'wb', 38: 'sd', 40: 'sd', 39: 'sd', 45: 'sd', 47: 'sd', 48: 'sd', 50: 'sd', 49: 'cym', 52: 'cym', 57: 'cym', 51: 'scym', 55: 'scym', 59: 'scym', 53: 'tri', 80: 'tri', 81: 'tri', 54: 'tamb', 56: 'cowbell', 76: 'wb', 77: 'wb', 85: 'cast', 83: 'sleigh', 70: 'cast' };
function percToken(inst) {
  if (!inst) return null;
  const [tok] = bestAlias(inst.name, Object.fromEntries(Object.entries(PRESETS.percussion).map(([k, v]) => [k, v.aliases])));
  return tok ?? GM_PERC[inst.unpitched] ?? null;
}
// a shared wind or brass staff: "a 2" (both players), "1." or "2." (one of them)
function playerMarks(part) {
  const out = [];
  for (const w of part.words) {
    const c = w.content.trim().toLowerCase();
    if (/^(a\s*2|zu\s*2|a\s+due|a\s*2\.)$/.test(c)) out.push([w.off, 'a2']);
    else if (/^(1\.?|i\.?|1st|1\. solo|solo)$/.test(c)) out.push([w.off, '1']);
    else if (/^(2\.?|ii\.?|2nd)$/.test(c)) out.push([w.off, '2']);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

function collectPart(part, family, tok, barOf, fermataBars, tpq, opts = {}) {
  // the default import reads notation music21 leaves to the reader; compat mode writes what the Python importer does
  const modern = !opts.compat;
  const holds = []; // fermatas and caesuras: { on, dur, f }: time held f times as long
  // technique changes from text: pizz./arco, mutes
  const tech = [];
  for (const w of part.words) {
    const c = norm(w.content);
    if (c.includes(' pizz')) tech.push([w.off, 'pizz', true]);
    if (c.includes(' arco ') || c.includes(' col arco')) tech.push([w.off, 'pizz', false]);
    if (/ (con sord|mit dampfer|avec sourdine|sord )/.test(c) && !c.includes('senza') && !c.includes('ohne')) tech.push([w.off, 'sord', true]);
    if (/ (senza sord|ohne dampfer|sans sourdine|via sord)/.test(c)) tech.push([w.off, 'sord', false]);
  }
  tech.sort((a, b) => a[0] - b[0]);
  const techAt = (off) => {
    const st = { pizz: false, sord: false };
    for (const [o, k, v] of tech) if (o <= off + tpq / 64) st[k] = v;
    return st;
  };
  const accents = new Set();
  const marks = [];
  for (const d of part.dyns) {
    const v = String(d.value).toLowerCase();
    if (ACCENT_DYN.has(v)) accents.add(d.off);
    const v2 = LEVEL_MAP[v] ?? v;
    if (LEVELS.includes(v2)) marks.push([d.off, v2]);
  }
  for (const w of part.words) {
    const c = norm(w.content);
    if (/ (cresc|crescendo|cr) /.test(c)) marks.push([w.off, '<']);
    else if (/ (dim|dimin|diminuendo|decresc|decrescendo|smorz|morendo|calando) /.test(c)) marks.push([w.off, '>']);
  }
  for (const w of part.wedges) {
    const first = w.els[0], last = w.els[w.els.length - 1];
    if (first && last && last.off > first.off) marks.push([first.off, w.cls === 'Crescendo' ? '<' : '>']);
  }
  marks.sort((a, b) => a[0] - b[0]);

  const out = [];
  let pend = [];
  const pitched = tok === null;
  const sung = family === 'voices';
  let vowel = sung ? 'a' : null;
  const openTies = new Map();
  const openGliss = new Map();
  for (const el of part.notes) {
    const on = el.off;
    if (sung && el.lyric) vowel = vowelOf(el.lyric, vowel);
    if (pitched && !el.grace && el.pitches.length === 1) {
      const m = el.pitches[0], held = openTies.get(m);
      if ((el.tie === 'stop' || el.tie === 'continue') && held && held.on + held.dur === on) {
        held.dur += el.dur;
        if (el.exprs.some((e) => e.k === 'Fermata')) {
          if (modern) holds.push({ on, dur: el.dur, f: 2 });
          else fermataBars.add(barOf(on));
        }
        if (el.tie === 'stop') openTies.delete(m);
        continue;
      }
    }
    if (el.grace) {
      if (pitched) pend.push(...el.pitches);
      continue;
    }
    // cue notes print another part's line for orientation; they are not played (small-print notes are)
    if (modern && el.cue) continue;
    let dur = el.dur;
    if (dur <= 0) continue;
    let breath = false, caesura = false, orn = null;
    const arts = new Set();
    for (const a of el.arts) {
      if (a === 'Staccato' || a === 'Staccatissimo' || a === 'Spiccato') arts.add('^');
      else if (a === 'Accent' || a === 'StrongAccent') arts.add('!');
      else if (modern && a === 'BreathMark') breath = true;
      else if (modern && a === 'Caesura') caesura = true;
    }
    if (accents.has(on)) arts.add('!');
    if (el.slurred) arts.add('_');
    let reps = null;
    for (const e of el.exprs) {
      if (e.k === 'Fermata') {
        // the note is held (twice as long, with everything sounding with it), not its whole bar slowed
        if (modern) holds.push({ on, dur, f: 2 });
        else fermataBars.add(barOf(on));
      } else if (modern && /Mordent|Turn/.test(e.k)) orn = e.k;
      else if (e.k === 'Tremolo') {
        const marksN = e.marks || 3;
        if (marksN >= 3) arts.add('~');
        else {
          const unit = tpq / 2 / 2 ** (marksN - 1);
          if (dur > unit) reps = unit;
        }
      } else if (e.k === 'Trill') arts.add(family === 'percussion' ? '~' : 't');
    }
    const t = techAt(on);
    const cls = family === 'strings' && t.pizz ? 'pizz' : t.sord && (family === 'strings' || family === 'brass') ? 'sord' : '';
    // a note may carry its own kit token: a MIDI drum channel, or a percussion staff naming each note's instrument
    if (modern && !pitched && el.instrumentId && !el.token) el.token = percToken(part.instruments?.[el.instrumentId]);
    let pitches = pitched ? el.pitches : [0], names = pitched ? el.names : [el.token ?? tok];
    if (modern && pitched) {
      if (el.arp && pitches.length > 1) arts.add('&');
      if (el.harmonic) {
        arts.add('*');
        // an artificial harmonic is a stopped note and a lighter touch above it: it sounds two octaves over the
        // stopped note for a touch a fourth above, an octave and a fifth for a fifth, two octaves and a third for a
        // major third
        const hp = el.harmonicParts;
        const base = hp?.find((x) => x.kind === 'base')?.midi ?? (pitches.length > 1 ? pitches[0] : null);
        const touch = hp?.find((x) => x.kind === 'touching')?.midi ?? (pitches.length > 1 ? pitches[pitches.length - 1] : null);
        if (base != null && touch != null && touch > base) {
          const up = { 3: 31, 4: 28, 5: 24, 7: 19, 12: 12 }[touch - base] ?? 24;
          pitches = [base + up];
          names = [midiName(base + up)];
        }
      }
      // a breath mark takes the end of its note (up to an eighth) for the breath; a caesura also stops the music there
      if (breath || caesura) {
        const cut = Math.min(Math.floor(dur / 4), tpq / 2);
        if (cut > 0) {
          dur -= cut;
          if (caesura) holds.push({ on: on + dur, dur: cut, f: 3 });
        }
      }
    }
    const grace = pend;
    pend = [];
    const base = { pitches, names, cls, vowel };
    const artStr = (s) => [...s].sort().join('');
    // mordents and turns, written out at the start of the note (a turn over a short note fills it)
    if (orn && pitched && pitches.length === 1) {
      const main = pitches[0], up = upperNote(part, el, main), down = lowerNote(part, el, main);
      const seq = { Mordent: [main, down, main], InvertedMordent: [main, up, main], Turn: [up, main, down, main], InvertedTurn: [down, main, up, main], DelayedTurn: [main, up, main, down, main], DelayedInvertedTurn: [main, down, main, up, main] }[orn];
      const quick = Math.min(tpq / 8, Math.floor(dur / (seq.length + 1)));
      const firstLen = orn.startsWith('Delayed') ? Math.floor(dur / 2) : quick;
      const lens = seq.map((_, k) => (k === 0 ? firstLen : quick));
      lens[lens.length - 1] = dur - lens.slice(0, -1).reduce((a, b) => a + b, 0);
      let at = on;
      seq.forEach((m, k) => {
        out.push({ ...base, on: at, dur: lens[k], pitches: [m], names: [m === main ? names[0] : midiName(m)], arts: artStr(new Set([...arts].filter((x) => x !== '_'))) + (k ? '_' : ''), grace: k === 0 ? grace : [] });
        at += lens[k];
      });
      continue;
    }
    if (arts.has('t') && pitched && pitches.length === 1) {
      arts.delete('t');
      const up = upperNote(part, el, pitches[0]);
      const step = tpq / 8;
      const n = Math.max(2, Math.floor(dur / step));
      for (let k = 0; k < n; k++) {
        const d = k < n - 1 ? step : dur - step * (n - 1);
        const mid = k % 2 ? pitches[0] : up;
        const nm = k % 2 ? names[0] : midiName(up);
        out.push({ ...base, on: on + step * k, dur: d, pitches: [mid], names: [nm], arts: artStr(new Set([...arts].filter((x) => x !== '_'))) + (k ? '_' : ''), grace: k === 0 ? grace : [] });
      }
      continue;
    }
    arts.delete('t');
    if (reps) {
      const n = Math.floor(dur / reps);
      for (let k = 0; k < n; k++) out.push({ ...base, on: on + reps * k, dur: reps, arts: artStr(k ? new Set([...arts].filter((x) => x !== '_')) : arts), grace: k === 0 ? grace : [] });
      continue;
    }
    const rec = { ...base, on, dur, arts: artStr(arts), grace };
    out.push(rec);
    if (pitched && pitches.length === 1 && (el.tie === 'start' || el.tie === 'continue')) openTies.set(pitches[0], rec);
    // glissandi and slides: from this note to the one that ends it, written out as a fast run (on a harp or a
    // keyboard over the white keys, otherwise chromatic), in the time of this note
    if (modern && pitched) {
      for (const g of el.gliss ?? []) {
        if (g.type === 'start') openGliss.set(g.number, { rec, kind: g.kind });
        else if (g.type === 'stop' && openGliss.has(g.number)) {
          const { rec: from, kind } = openGliss.get(g.number);
          openGliss.delete(g.number);
          const a = from.pitches[0], b = pitches[0];
          if (a === b) continue;
          const white = kind === 'glissando' && (family === 'keyboards' || /harp/.test(opts.preset ?? ''));
          const steps = [];
          for (let m = a; m !== b; m += Math.sign(b - a)) if (!white || [0, 2, 4, 5, 7, 9, 11].includes(((m % 12) + 12) % 12)) steps.push(m);
          const unit = Math.max(1, Math.floor(tpq / 16));
          const n = Math.max(1, Math.min(steps.length, Math.floor(from.dur / unit)));
          const pick = Array.from({ length: n }, (_, k) => steps[Math.floor((k * steps.length) / n)]);
          const idx = out.indexOf(from);
          const each = Math.floor(from.dur / n);
          const run = pick.map((m, k) => ({ ...from, on: from.on + each * k, dur: k < n - 1 ? each : from.dur - each * (n - 1), pitches: [m], names: [midiName(m)], arts: from.arts.replace('_', '') + (k ? '_' : ''), grace: k === 0 ? from.grace : [] }));
          out.splice(idx, 1, ...run);
        }
      }
    }
  }
  // a shared wind or brass staff: two players on one line. Two-note chords split between them (the upper note to
  // the first); single notes go to both after "a 2", to one after "1." or "2."; a split staff with no marking plays
  // its single notes on the first
  if (modern && opts.shared) {
    const marks2 = playerMarks(part);
    const modeAt = (t) => {
      let m = '1';
      for (const [o, v] of marks2) if (o <= t) m = v;
      return m;
    };
    const split = [];
    for (const r of out) {
      if (r.pitches.length === 2) {
        split.push({ ...r, pitches: [r.pitches[1]], names: [r.names[1]], player: 1 }, { ...r, pitches: [r.pitches[0]], names: [r.names[0]], player: 2 });
        continue;
      }
      const m = modeAt(r.on);
      if (m === 'a2') split.push({ ...r, player: 1 }, { ...r, player: 2 });
      else split.push({ ...r, player: m === '2' ? 2 : 1 });
    }
    return { notes: split, marks, holds };
  }
  return { notes: out, marks, holds };
}

// the next note of the key's major scale below a pitch: a mordent's or a turn's lower note
/** Times (ticks) of the new bass notes: notes that start with nothing lower still sounding. */
function bassChanges(notes) {
  const ns = notes.filter((n) => n.pitches?.length).map((n) => ({ on: n.on, end: n.on + n.dur, lo: Math.min(...n.pitches) })).sort((a, b) => a.on - b.on);
  const out = [];
  let active = [];
  for (let i = 0; i < ns.length;) {
    const t = ns[i].on, from = i;
    let lo = Infinity;
    for (; i < ns.length && ns[i].on === t; i++) lo = Math.min(lo, ns[i].lo);
    active = active.filter((n) => n.end > t);
    if (!active.some((n) => n.lo < lo)) out.push(t);
    active.push(...ns.slice(from, i));
  }
  return out;
}

function lowerNote(part, el, midi) {
  let fifths = 0;
  for (const k of part.keys) if (k.off <= el.off) fifths = k.fifths;
  const tonic = ((fifths * 7) % 12 + 12) % 12;
  const scale = [0, 2, 4, 5, 7, 9, 11].map((x) => (x + tonic) % 12);
  for (let d = 1; d <= 2; d++) if (scale.includes((((midi - d) % 12) + 12) % 12)) return midi - d;
  return midi - 2;
}

function mergeChords(notes) {
  const merged = new Map();
  for (const nt of notes) {
    const k = `${nt.on}|${nt.dur}|${nt.arts}|${nt.cls}|${nt.vowel}`;
    let g = merged.get(k);
    if (!g) merged.set(k, (g = { ...nt, pitches: [], names: [], grace: [] }));
    nt.pitches.forEach((p, i) => {
      if (!g.pitches.includes(p)) {
        g.pitches.push(p);
        g.names.push(nt.names[i]);
      }
    });
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

// bars of tokens for one lane between tick offsets q0 and q1, `spq` steps per quarter
function sectionTokens(items, q0, q1, barLen, spq, tpq) {
  const spb = (barLen * spq) / tpq;
  const nb = (q1 - q0) / barLen;
  const bars = Array.from({ length: nb }, () => []);
  const used = new Array(nb).fill(0);
  const emit = (start, length, tok, cont) => {
    let s = start, left = length, first = true;
    while (left > 0) {
      const b = Math.floor(s / spb);
      const n = Math.min(left, (b + 1) * spb - s);
      bars[b].push(first && !cont ? tok(n) : n > 1 ? `-:${n}` : '-');
      first = false;
      used[b] += n;
      s += n;
      left -= n;
    }
  };
  const rest = (start, length) => {
    let s = start, left = length;
    while (left > 0) {
      const b = Math.floor(s / spb);
      const n = Math.min(left, (b + 1) * spb - s);
      bars[b].push(n > 1 ? `.:${n}` : '.');
      used[b] += n;
      s += n;
      left -= n;
    }
  };
  let pos = 0;
  const total = nb * spb;
  for (const g of items) {
    const a = g.on, e = g.on + g.dur;
    if (e <= q0 || a >= q1) continue;
    let st = Math.max(0, roundHalfEven((a - q0) * spq, tpq));
    const en = Math.min(total, roundHalfEven((Math.min(e, q1) - q0) * spq, tpq));
    if (st < pos) st = pos;
    if (en <= st) continue;
    if (st > pos) rest(pos, st - pos);
    const cont = a < q0;
    const body = g.names.length === 1 ? g.names[0] : '[' + g.names.join(' ') + ']';
    const grace = g.grace.length && !cont ? '{' + g.grace.map(midiName).join(' ') + '}' : '';
    const arts = g.arts + (g.vowel ? `@${g.vowel}` : '');
    emit(st, en - st, (n) => `${grace}${body}${n > 1 ? ':' + n : ''}${arts}`, cont);
    pos = en;
  }
  if (pos < total) rest(pos, total - pos);
  for (let b = 0; b < nb; b++) if (used[b] !== spb) throw new Error(`bar ${b}: ${used[b]} steps, expected ${spb}`);
  return bars;
}

/**
 * Import a MusicXML full score. `input` is the file's bytes (.mxl or .musicxml) or its text. Options: title, key,
 * source (recorded in the song), tempo (quarter notes per minute, overriding the score's), bars ('A-B', counted as
 * played), compat (the Python importer's output, no more), expression (rubato and agogic accents), pedal ('bass': pedal
a piano score without pedal marks with its bass), log (a function for progress lines). Returns { song, text, report }.
 */
export async function importMusicXML(input, opt = {}) {
  const log = opt.log ?? (() => {});
  const xmlText = await readMusicXMLText(input);
  const score = readScore(parseXML(xmlText));
  return buildSong(score, opt, log);
}

/**
 * Lay a score model out as a song: what importMusicXML does after reading the file. The MIDI and ABC importers build
 * the same model (parts of measures and notes in integer ticks) and call this, so every importer makes the same
 * choices of preset, tempo, dynamics, lanes and sections.
 */
export function buildSong(score, opt = {}, log = () => {}) {
  const { tpq, parts: P } = score;
  const fileName = opt.fileName ?? 'score.musicxml';
  const title = opt.title ?? score.meta.title ?? fileName;
  const composer = score.meta.composer ?? '';
  // measures as written, and the order a performance plays them in
  const orig = P[0].measures;
  const oOff = orig.map((m) => m.offset), oLen = orig.map((m) => m.length);
  // music21 matches each played measure back to the first written measure with its number
  const byNumber = new Map();
  orig.forEach((m, i) => {
    if (!byNumber.has(m.number)) byNumber.set(m.number, i);
  });
  const firstPass = new Set();
  const order = playOrder(orig).map((i) => {
    // the first time a measure plays it is itself; a repeated pass is numbered 1a, 2a ... and found by number
    if (!firstPass.has(i)) {
      firstPass.add(i);
      return orig.findIndex((m) => m.number === orig[i].number && m.suffix === orig[i].suffix);
    }
    return byNumber.get(orig[i].number) ?? i;
  });
  if (order.length !== orig.length) log(`  repeats written out: ${orig.length} -> ${order.length} bars`);
  let bars = [];
  const occ = new Map();
  let t = 0;
  for (const oi of order) {
    if (oLen[oi] > 0) {
      if (!occ.has(oi)) occ.set(oi, []);
      occ.get(oi).push(bars.length);
      bars.push([t, oLen[oi], oi]);
      t += oLen[oi];
    }
  }
  let firstBar = 0;
  if (opt.bars) {
    const [a, b] = String(opt.bars).split('-').map(Number);
    firstBar = a - 1;
    for (const [oi, ks] of occ) occ.set(oi, ks.filter((k) => k >= a - 1 && k < b));
    bars = bars.slice(a - 1, b);
  }
  const barOf = (off) => {
    let lo = 0, hi = oOff.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (oOff[mid] <= off) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const firstBarStart = new Map();
  bars.forEach(([b0], k) => firstBarStart.set(k + firstBar, b0));
  const unfold = (off) => {
    const mi = barOf(off);
    return (occ.get(mi) ?? []).map((k) => firstBarStart.get(k) + (off - oOff[mi]));
  };

  // parts -> presets
  const hasVoices = P.some((p) => norm(String(p.instSound ?? '').replace(/\./g, ' ')).includes(' voice '));
  const fermataBars = new Set();
  const holdsAll = []; // fermatas and caesuras (default mode): stretched time, laid out per section below
  const plan = [];
  const usedKeys = {};
  for (const p of P) {
    const names = [p.name, p.instName, p.name].filter(Boolean).join(' ');
    const unp = p.notes.filter((n) => n.unpitched).length;
    const [key, tok, how] = mapPart(names, p.instSound, p.program, unp / Math.max(1, p.notes.length), hasVoices);
    const fam = INST[key].family;
    const idx = (usedKeys[key] ?? 0) + 1;
    usedKeys[key] = idx;
    // a shared staff: two wind or brass players on one line, named so ("Flutes 1.2") or marked "a 2", "1." and "2."
    const shared = !opt.compat && (fam === 'woodwinds' || fam === 'brass') && (/\b(1\s*[.,&+/]\s*2|i\s*[.,&+/]?\s*ii)\b/i.test(names) || playerMarks(p).length > 0);
    const c = collectPart(p, fam, tok, barOf, fermataBars, tpq, { compat: opt.compat, shared, preset: key });
    const notes = c.notes.flatMap((nt) => unfold(nt.on).map((t2) => ({ ...nt, on: t2 })));
    for (const h of c.holds) for (const t2 of unfold(h.on)) holdsAll.push({ ...h, on: t2 });
    const marks = c.marks.flatMap(([o, v]) => unfold(o).map((t2) => [t2, v])).sort((a, b) => a[0] - b[0]);
    plan.push({ part: p, key, tok, fam, idx, notes, marks });
    log(`  ${String(p.name).padEnd(28)} -> ${key}${tok ? ' ' + tok : ''} (${how}); ${notes.length} notes`);
  }

  // tempo: metronome marks, tempo words, fermatas
  const words = PRESETS.tempoWords;
  let events = [];
  for (const p of P) for (const m of p.metros) events.push([m.off, 'set', m.number * m.referent]);
  for (const p of P) {
    for (const w of p.words) {
      const c = norm(w.content);
      if (/ (tempo i|tempo primo|tempo 1|1 tempo) /.test(c)) events.push([w.off, 'primo', 0]);
      else if (c.includes(' a tempo ')) events.push([w.off, 'atempo', 0]);
      else if (/ (rit|ritard|ritardando|rall|rallentando|allargando) /.test(c)) events.push([w.off, 'rit', 0]);
      else if (/ (accel|accelerando|stringendo|piu mosso|piu animato) /.test(c)) events.push([w.off, 'accel', 0]);
      else if (/ (recit|recitativo|recitative|recitatif|recitativ) /.test(c) && !c.includes(' in tempo ')) events.push([w.off, 'recit', 0]);
      else {
        const b = tempoWord(w.content, words);
        if (b && c.trim().split(/\s+/).length <= 4) events.push([w.off, 'word', b]);
      }
    }
  }
  // a tempo word gives the speed of the beat its meter counts (default mode): a half note in 2/2, an eighth in 3/8,
  // a dotted quarter in 6/8; the table's numbers are for a quarter-note beat
  if (!opt.compat) {
    const beatOf = ([n, d]) => (d === 2 ? 2 : d === 8 && n % 3 === 0 && n > 3 ? 1.5 : d === 8 ? 0.5 : d === 16 ? (n % 3 === 0 && n > 3 ? 0.75 : 0.25) : 1);
    events = events.map((e) => (e[1] === 'word' ? [e[0], e[1], e[2] * beatOf(orig[barOf(e[0])].meter ?? [4, 4])] : e));
  }
  // a tempo word printed with a metronome mark is the same instruction
  const setAt = events.filter((e) => e[1] === 'set').map((e) => e[0]);
  events = events.filter(([o, k]) => !(k === 'word' && setAt.some((x) => Math.abs(o - x) <= tpq)));
  events = events.flatMap(([o, k, v]) => unfold(o).map((t2) => [t2, k, v]));
  events.sort((a, b) => a[0] - b[0]); // stable, as Python's sort
  const firstSet = events.find((e) => e[1] === 'set')?.[2] ?? null;
  const base = +(opt.tempo || firstSet || events.find((e) => e[1] === 'word')?.[2] || 120);
  if (opt.tempo) events = events.filter((e) => !(e[1] === 'set' && e[0] === 0));
  const scale = base / (firstSet || base);
  let primo = base, cur = base, ramp = null;
  const barBpm = [];
  let ev = 0;
  bars.forEach(([b0, ln, oi], bi) => {
    while (ev < events.length && events[ev][0] < b0 + ln / 2) {
      const [o, kind, v] = events[ev];
      if (kind === 'set') {
        cur = o > 0 ? v * scale : base;
        ramp = null;
      } else if (kind === 'word') {
        cur = firstSet ? v * scale : v;
        ramp = null;
      } else if (kind === 'primo') [cur, ramp] = [primo, null];
      else if (kind === 'atempo') {
        cur = ramp ? ramp[2] : cur;
        ramp = null;
      } else if (kind === 'rit') ramp = [bi, -0.1, cur];
      else if (kind === 'accel') ramp = [bi, 0.07, cur];
      else if (kind === 'recit') [cur, ramp] = [Math.min(cur, 100), null];
      ev++;
    }
    let bpm = cur;
    if (ramp) bpm = ramp[2] * (1 + ramp[1] * Math.min(3, bi - ramp[0] + 1));
    if (fermataBars.has(oi)) bpm *= 0.5;
    // the expression model (an option): phrase-level rubato over four-bar phrases, the last bar broadening
    if (opt.expression && !opt.compat) bpm *= bi === bars.length - 1 ? 0.88 : [1, 1.02, 1, 0.95][bi % 4];
    barBpm.push(round2(bpm));
  });
  void primo;
  log(`tempo: base ${base.toFixed(0)} quarter notes per minute; ${fermataBars.size} bars with fermatas`);

  // agogic accents (the expression model): the melody's highest note in each four-bar phrase is held a little
  if (opt.expression && !opt.compat) {
    const pitchedPlans = plan.filter((pl) => !pl.tok && pl.notes.length);
    const most = Math.max(0, ...pitchedPlans.map((pl) => pl.notes.length));
    const mean = (pl) => pl.notes.reduce((a, n) => a + n.pitches[n.pitches.length - 1], 0) / pl.notes.length;
    const melody = pitchedPlans.filter((pl) => pl.notes.length >= 0.2 * most).sort((x, y) => mean(y) - mean(x))[0];
    if (melody) {
      for (let p0 = 0; p0 < bars.length; p0 += 4) {
        const from = bars[p0][0], to = bars[Math.min(bars.length, p0 + 4) - 1][0] + bars[Math.min(bars.length, p0 + 4) - 1][1];
        const inPhrase = melody.notes.filter((n) => n.on >= from && n.on < to);
        if (!inPhrase.length) continue;
        const top = inPhrase.reduce((a, n) => (n.pitches[n.pitches.length - 1] > a.pitches[a.pitches.length - 1] ? n : a));
        holdsAll.push({ on: top.on, dur: Math.min(top.dur, tpq / 4), f: 1.12 });
      }
    }
  }

  // the sustain pedal: marked in the score (MusicXML pedal marks, MIDI controller 64), or else, with the option
  // pedal: 'bass', changed at each new bass note of the pianos, as a pianist pedals with the harmony
  let pedal = [];
  if (!opt.compat) {
    pedal = [...(score.pedal ?? []), ...P.flatMap((p) => p.pedal ?? [])].flatMap((e) => unfold(e.off).map((on) => ({ on, type: e.type })));
    if (!pedal.length && opt.pedal === 'bass') pedal = bassChanges(plan.filter((pl) => pl.key === 'piano').flatMap((pl) => pl.notes)).map((on) => ({ on, type: 'P' }));
    pedal.sort((x, y) => x.on - y.on);
    if (pedal.length) log(`pedal: ${pedal.length} marks${score.pedal?.length || P.some((p) => p.pedal?.length) ? '' : ', with the bass'}`);
  }

  // lanes per part and technique
  const laneItems = new Map(), laneInfo = new Map();
  for (const pl of plan) {
    const abbr = ABBR[pl.key] ?? pl.key.slice(0, 4);
    const name0 = usedKeys[pl.key] > 1 ? `${abbr}${pl.idx}` : abbr;
    const by = new Map();
    for (const nt of pl.notes) {
      const k = nt.cls + (nt.player === 2 ? '|2' : '');
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(nt);
    }
    for (const [k, notes] of by) {
      const [cls, player] = k.split('|');
      lanes(mergeChords(notes)).forEach((items, li) => {
        // the second player of a shared staff has lanes of its own (_2)
        const nm = name0 + (cls ? '_' + cls : '') + (player ? '_2' : '') + (li === 0 ? '' : 'abcdefghij'[li]);
        laneItems.set(nm, items);
        laneInfo.set(nm, [pl, cls, player === '2']);
      });
    }
  }
  log(`${laneItems.size} lanes`);
  // chord symbols, unfolded like the notes
  const harmony = (score.harmony ?? []).flatMap((h) => unfold(h.off).map((on) => ({ on, sym: h.sym }))).sort((a, b) => a.on - b.on);

  // per-part dynamics per bar
  const dynCells = (marks) => {
    const cells = [];
    let curL = 'mf';
    for (const [b0, ln] of bars) {
      let hair = '';
      for (const [o, v] of marks) {
        if (o < b0 + ln / 2 && LEVELS.includes(v)) curL = v;
        if (b0 <= o && o < b0 + ln && (v === '<' || v === '>')) hair = v;
      }
      cells.push([curL, hair]);
    }
    return cells;
  };
  const partDyn = new Map(plan.map((pl) => [pl, dynCells(pl.marks)]));

  // sections: runs of up to 4 bars with the same length
  const secs = [];
  for (let i = 0; i < bars.length;) {
    let j = i + 1;
    while (j < bars.length && j - i < 4 && bars[j][1] === bars[i][1]) j++;
    secs.push([i, j]);
    i = j;
  }
  const sections = new Map(), form = [], seen = new Map();
  const denOf = (ticks) => tpq / gcd(ticks, tpq);
  secs.forEach(([a, b], si) => {
    const q0 = bars[a][0], ln = bars[a][1];
    const q1 = bars[b - 1][0] + bars[b - 1][1];
    let den = denOf(ln);
    for (const items of laneItems.values()) {
      for (const g of items) {
        if (g.on + g.dur > q0 && g.on < q1) for (const x of [Math.max(g.on, q0) - q0, Math.min(g.on + g.dur, q1) - q0]) den = lcm(den, denOf(x));
      }
    }
    for (const h of holdsAll) {
      if (h.on + h.dur > q0 && h.on < q1) for (const x of [Math.max(h.on, q0) - q0, Math.min(h.on + h.dur, q1) - q0]) den = lcm(den, denOf(x));
    }
    for (const e of pedal) if (e.on >= q0 && e.on < q1) den = lcm(den, denOf(e.on - q0));
    const spq = den <= 48 ? den : 48;
    const lnQ = ln / tpq;
    const meter = [Number.isInteger(lnQ) ? lnQ : lnQ, 4];
    const sec = { bars: b - a, meter, grid: Math.trunc((ln * spq) / tpq), parts: {}, dyn: {} };
    sec.tempo = '| ' + barBpm.slice(a, b).map(fmtG).join(' | ') + ' |';
    // held time (fermatas, caesuras, agogic accents): per bar, the union of the held steps, each with its factor
    const secHolds = holdsAll.filter((h) => h.on < q1 && h.on + h.dur > q0);
    if (secHolds.length) {
      const cells = bars.slice(a, b).map(([b0, l]) => {
        const steps = new Map();
        for (const h of secHolds) {
          const s0 = Math.max(0, roundHalfEven((h.on - b0) * spq, tpq)), s1 = Math.min(roundHalfEven(l * spq, tpq), roundHalfEven((h.on + h.dur - b0) * spq, tpq));
          for (let st = s0; st < s1; st++) steps.set(st, Math.max(steps.get(st) ?? 1, h.f));
        }
        const runs = [];
        for (const st of [...steps.keys()].sort((x, y) => x - y)) {
          const r = runs[runs.length - 1];
          if (r && r.s + r.n === st && r.f === steps.get(st)) r.n++;
          else runs.push({ s: st, n: 1, f: steps.get(st) });
        }
        return runs.length ? runs.map((r) => `${r.s}:${r.n}*${r.f}`).join(' ') : '-';
      });
      if (cells.some((c) => c !== '-')) sec.hold = '| ' + cells.join(' | ') + ' |';
    }
    // the pedal line: each mark on its step, lasting to the next (the last mark on a step wins: U then P is a change)
    const secPedal = pedal.filter((e) => e.on >= q0 && e.on < q1);
    if (secPedal.length) {
      sec.pedal = '| ' + bars.slice(a, b).map(([b0, l]) => {
        const n = roundHalfEven(l * spq, tpq);
        const at = new Map();
        for (const e of secPedal) if (e.on >= b0 && e.on < b0 + l) at.set(Math.min(n - 1, roundHalfEven((e.on - b0) * spq, tpq)), e.type);
        const steps = [...at.keys()].sort((x, y) => x - y);
        const len = (k) => (k > 1 ? `:${k}` : '');
        if (!steps.length) return `.${len(n)}`;
        return [...(steps[0] > 0 ? [`.${len(steps[0])}`] : []), ...steps.map((st, k) => at.get(st) + len((steps[k + 1] ?? n) - st))].join(' ');
      }).join(' | ') + ' |';
    }
    // chord symbols (ABC, lead sheets): the chord sounding at each bar's start and any that change within it
    if (harmony.length) {
      sec.chords = '| ' + bars.slice(a, b).map(([b0, l]) => {
        const at = harmony.filter((h) => h.on > b0 && h.on < b0 + l).map((h) => h.sym);
        const before = harmony.filter((h) => h.on <= b0).pop()?.sym;
        return [before ?? at.shift() ?? 'C', ...at].join(' ');
      }).join(' | ') + ' |';
    }
    for (const [nm, items] of laneItems) {
      const toks = sectionTokens(items, q0, q1, ln, spq, tpq);
      if (toks.some((tk) => /[^.\s:\d|]/.test(tk.join(' '))) && toks.some((tk) => tk.some((x) => !x.startsWith('.')))) {
        sec.parts[nm] = '| ' + toks.map((tk) => tk.join(' ')).join(' | ') + ' |';
        const cells = partDyn.get(laneInfo.get(nm)[0]).slice(a, b);
        let prev = null;
        const outC = cells.map(([lv, hair], k) => {
          const s = k === 0 || lv !== prev || hair ? `${lv}${hair}` : '-';
          prev = lv;
          return s;
        });
        sec.dyn[nm] = '| ' + outC.join(' | ') + ' |';
      }
    }
    const key = canon(sec);
    let name;
    if (si === secs.length - 1) name = 'end';
    else if (seen.has(key)) name = seen.get(key);
    else {
      name = `m${a + 1}`;
      seen.set(key, name);
    }
    if (!sections.has(name)) sections.set(name, sec);
    form.push(name);
  });

  // parts and instruments
  const instruments = {}, parts = {};
  for (const [nm, [pl, cls, second]] of laneInfo) {
    let key = pl.key;
    if (cls === 'pizz' && INST[key + '_pizz']) key = key + '_pizz';
    if (cls === 'sord' && key === 'trumpet') key = 'muted_trumpet';
    const p = INST[key];
    instruments[key] = { ...p.spec, rangeName: key };
    const nSame = usedKeys[pl.key];
    let pan = p.pan;
    if (nSame > 1) {
      if (p.family === 'strings') pan = p.pan + (pl.idx - 1) * 0.28 * (p.pan < 0 ? 1 : -1);
      else pan = p.pan + (pl.idx - (nSame + 1) / 2) * 0.12;
    }
    if (second) pan += p.pan < 0 ? 0.08 : -0.08; // the second player sits beside the first
    const fx = [...p.fx];
    if (cls === 'sord' && pl.fam === 'strings') fx.push(['eq', [['lp', 3200, 0.7], ['peak', 1500, 1.0, -3]]]);
    if (cls === 'sord' && key === 'horn') fx.push(['eq', [['hp', 400, 0.7], ['peak', 1800, 1.2, 5], ['lp', 4500, 0.7]]]);
    parts[nm] = { inst: key, gain: p.gain, pan: round2(Math.max(-0.9, Math.min(0.9, pan))), sends: { hall: p.send }, fx, humanize: 0.006, velVar: 0.05 };
  }

  const firstLen = bars[0][1] / tpq;
  const song = {
    title, style: 'Orchestra: ' + (composer || 'imported score'),
    bpm: barBpm[0], meter: [firstLen, 4], grid: 16, key: opt.key ?? '', seed: 5, tail: 4,
    source: opt.source ?? fileName,
    instruments, parts, buses: { hall: PRESETS.hall }, master: PRESETS.master,
    sections: Object.fromEntries([...sections].map(([n, s]) => [n, { bars: s.bars, meter: s.meter, grid: s.grid, tempo: s.tempo, ...(s.hold ? { hold: s.hold } : {}), ...(s.chords ? { chords: s.chords } : {}), ...(s.pedal ? { pedal: s.pedal } : {}), parts: s.parts, dyn: s.dyn }])),
    form,
  };
  const noteCount = [...laneItems.values()].reduce((a, v) => a + v.length, 0);
  const lines = [
    `// ${title}${composer ? ' - ' + composer : ''}.`,
    `// Imported by engine/musicxml.mjs from ${fileName}: ${bars.length} bars, ${P.length} parts, ${laneItems.size} lanes,`,
    `// ${noteCount} notes and chords; ${form.length} sections of up to 4 bars, ${sections.size} of them distinct.`,
    'export default {',
    `  title: ${pyjson(title)},`,
    `  style: ${pyjson(song.style)},`,
    `  bpm: ${fmtG(barBpm[0])}, meter: [${firstLen}, 4], grid: 16, key: ${pyjson(song.key)}, seed: 5, tail: 4,`,
    `  source: ${pyjson(song.source)},`,
    `  instruments: ${pyjson(instruments)},`,
    `  parts: ${pyjson(parts)},`,
    `  buses: ${pyjson(song.buses)},`,
    `  master: ${pyjson(song.master)},`,
    '  sections: {',
  ];
  for (const [name, sec] of sections) {
    lines.push(`    ${name}: { bars: ${sec.bars}, meter: ${pyjson(sec.meter)}, grid: ${sec.grid}, tempo: '${sec.tempo}',${sec.hold ? ` hold: '${sec.hold}',` : ''}${sec.chords ? ` chords: '${sec.chords}',` : ''}`);
    if (sec.pedal) lines.push(`      pedal: '${sec.pedal}',`);
    lines.push('      parts: {');
    for (const [lane, text] of Object.entries(sec.parts)) lines.push(`        ${lane}: '${text}',`);
    lines.push('      },');
    lines.push('      dyn: { ' + Object.entries(sec.dyn).map(([lane, text]) => `${lane}: '${text}'`).join(', ') + ' },');
    lines.push('    },');
  }
  lines.push('  },', `  form: ${pyjson(form)},`, '};');
  const report = { bars: bars.length, parts: plan.map((pl) => ({ name: pl.part.name, preset: pl.key, token: pl.tok, notes: pl.notes.length })), lanes: laneItems.size, sections: sections.size, base, fermataBars: fermataBars.size, holds: holdsAll.length, pedal: pedal.length, compat: !!opt.compat };
  return { song, text: lines.join('\n') + '\n', report };
}
