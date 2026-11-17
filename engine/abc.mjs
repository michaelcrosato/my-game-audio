// abc.mjs: ABC notation (abcnotation.com, the text format of folk tunes) to songs, through the MusicXML importer's
// layout. Reads the header (X T C M L Q K V), notes with accidentals, octaves and lengths, rests, chords, ties,
// slurs, broken rhythm, tuplets, grace notes, decorations (staccato, accent, fermata, trill, roll, dynamics,
// hairpins, the sustain pedal), bar lines with repeats and first and second endings, inline fields, several voices,
// lyrics (w:), and chord symbols ("Am"), which become each section's chords line and, unless `accompany: false`, a
// harp and a bass that play them.
//
//   const { song, text, report } = importABC(abcText, { instrument: 'flute', title, tempo });
import { buildSong, ROOMS, mapPart, GM_PERC } from './musicxml.mjs';
import { padLine, arpLine, parseChord, parseChords, midiToName } from './score.mjs';
import PRESETS from './orchestra-presets.json' with { type: 'json' };
import { GM_DRUM, useDrumKit } from './midi.mjs';

const INST = PRESETS.instruments;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
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
 * chord symbols), title, key, tempo, source, log. Returns { song, text, report }. A piano pedals where the score
 * marks it: `!ped!` presses (again, a change), `!ped-up!` lifts.
 */
export function importABC(abc, opt = {}) {
  const lines = abc.replace(/\r/g, '').split('\n');
  // the tune: from its X: line to the next blank line
  let start = lines.findIndex((l) => /^X:/.test(l) && (opt.index == null || +l.slice(2) === opt.index));
  if (start < 0) start = 0;
  let endI = lines.findIndex((l, i) => i > start && /^\s*$/.test(l) && i > lines.findIndex((x, j) => j >= start && /^K:/.test(x)));
  if (endI < 0) endI = lines.length;
  const tune = lines.slice(start, endI);
  const H = { M: '4/4', L: null, Q: null, K: 'C', T: null, C: null, P: null, program: null, drums: false };
  const voices = new Map(); // id -> { name, body: [], program, drums }
  let cur = null, inBody = false, lastV = null;
  const voiceOf = (id) => {
    if (!voices.has(id)) voices.set(id, { id, name: null, body: [], program: null, drums: false });
    return voices.get(id);
  };
  // a V: field's voice, with its name (name= or nm=, else its short name snm=) and a percussion clef
  const voiceField = (v) => {
    const id = v.trim().split(/\s+/)[0];
    const vo = voiceOf(id);
    const nm = /(?:name|nm)="([^"]*)"/.exec(v) ?? /(?:subname|snm)="([^"]*)"/.exec(v);
    if (nm) vo.name = nm[1];
    if (/clef=perc/.test(v)) vo.drums = true;
    lastV = vo;
    return vo;
  };
  const directives = [];
  for (let raw of tune) {
    // %%MIDI program n (0 to 127) and %%MIDI channel 10 name the instrument of the voice declared last; other %%
    // lines are kept for the songbook (%%cue, %%layer, %%stinger) or ignored
    const dm = /^%%\s*(\S+)\s*(.*)$/.exec(raw);
    if (dm) {
      const [, d, arg] = dm;
      const midi = /^MIDI$/i.test(d) ? /^(program|channel)\s+(?:\d+\s+)?(\d+)/.exec(arg.trim()) : null;
      const ctl = /^MIDI$/i.test(d) ? /^control\s+(7|10)\s+(\d+)/.exec(arg.trim()) : null;
      const target = lastV ?? (inBody ? cur : null);
      if (midi && midi[1] === 'program') (target ?? H).program = +midi[2];
      else if (midi && midi[1] === 'channel' && +midi[2] === 10) (target ?? H).drums = true;
      // a voice's level and place in the mix: %%gain +3 (dB) and %%pan -0.5 (-1 left to 1 right), or as abc2midi
      // writes them, %%MIDI control 7 (volume, 100 as it is) and %%MIDI control 10 (pan, 64 the centre)
      else if (ctl && target && ctl[1] === '7') target.gainDb = +(40 * Math.log10(Math.max(1, +ctl[2]) / 100)).toFixed(1);
      else if (ctl && target) target.pan = clamp((+ctl[2] - 64) / 63, -1, 1);
      else if (/^gain$/i.test(d) && target && Number.isFinite(parseFloat(arg))) target.gainDb = parseFloat(arg);
      else if (/^pan$/i.test(d) && target && Number.isFinite(parseFloat(arg))) target.pan = clamp(parseFloat(arg), -1, 1);
      // %%double: the voice double-tracked, two takes played apart and panned to either side (0 to 1, default 0.85)
      else if (/^double$/i.test(d) && target) target.double = clamp(Number.isFinite(parseFloat(arg)) ? parseFloat(arg) : 0.85, 0.1, 1);
      else directives.push({ name: d.toLowerCase(), arg: arg.trim() });
      continue;
    }
    const line = raw.replace(/(^|[^\\])%.*$/, '$1');
    if (/^\s*$/.test(line)) continue;
    const f = /^([A-Za-z]):\s*(.*)$/.exec(line);
    if (f && !(inBody && f[1] === '|')) {
      const [, k, v] = f;
      if (k === 'V') {
        const vo = voiceField(v);
        if (inBody) cur = vo;
        continue;
      }
      if (k === 'P' && inBody && cur) {
        // a part starts here (P:A), in every voice from the next music on
        for (const vo of voices.values()) vo.body.push({ part: v.trim() });
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
    if (!inBody) continue;
    // [V:2] at the start of a line switches to that voice for the line (the usual way to write a score's voices)
    const iv = /^\s*\[V:\s*([^\]]*)\]\s*(.*)$/.exec(line);
    if (iv) {
      cur = voiceField(iv[1]);
      lastV = null;
      if (iv[2].trim()) cur.body.push({ music: iv[2] });
      continue;
    }
    const ip = /^\s*\[P:\s*([^\]]*)\]\s*(.*)$/.exec(line);
    if (ip) {
      for (const vo of voices.values()) vo.body.push({ part: ip[1].trim() });
      if (ip[2].trim() && cur) cur.body.push({ music: ip[2] });
      continue;
    }
    if (cur) cur.body.push({ music: line });
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

  // P:ABAC in the header plays the parts in that order (P:A2B, P:(AB)2C repeat them)
  if (H.P) {
    const order = partOrder(H.P);
    for (const v of voices.values()) {
      const head = [], chunks = new Map();
      let label = null;
      for (const it of v.body) {
        if (it.part != null) {
          label = it.part;
          if (!chunks.has(label)) chunks.set(label, []);
          continue;
        }
        (label == null ? head : chunks.get(label)).push(it);
      }
      if (!chunks.size) continue;
      v.body = [...head];
      for (const l of order) if (chunks.has(l)) v.body.push({ part: l }, ...chunks.get(l));
    }
  }
  const parts = [];
  const harmony = [];
  const warnings = [];
  let measuresOut = null;
  const vlist = [...voices.values()].filter((v) => v.body.some((it) => it.music));
  if (!vlist.length) throw new Error('no music in the ABC text');
  const chosen = voicePresets(vlist, opt.presets);
  // a percussion clef, channel 10, or a voice named for the drums or an orchestral percussion instrument, with no
  // program of its own; its notes are drum sounds, so the key signature does not touch them
  const isDrums = (v) => v.drums || (H.drums && vlist.length === 1) || (v.program == null && PERC_NAME.test(v.name ?? ''));
  // the band's drum kit, or the orchestra's percussion: the orchestra's when the score has an orchestral instrument and
  // no voice is named as a drum kit ("Drums", "Drum Kit"); a voice named for one instrument ("Cymbals") plays only it
  const kitVoice = vlist.some((v) => isDrums(v) && (!v.name || KIT_NAME.test(v.name)));
  const orchestral = !kitVoice && vlist.some((v) => !isDrums(v) && !(INST[chosen[v.id] ?? mapPart(v.name ?? '', null, v.program, 0, false)[0]]?.family in ROOMS));
  const extraDrums = [];
  vlist.forEach((v, vi) => {
    const drums = isDrums(v);
    const res = readVoice(v, { unit, meter: [mb, mu], key: drums ? 'C' : H.K, Q: parseQ(H.Q), parseQ, meterOf: meter, voices: vlist.length, drums, warn: (w) => warnings.includes(w) || warnings.push(w) }, vi === 0 ? harmony : null);
    if (vi === 0) measuresOut = res.measures;
    // a percussion voice plays General MIDI drum notes, each its own kit sound
    const one = drums && orchestral ? percByName(v.name) : null;
    const stacked = [];
    if (drums) {
      // a chord on a drum staff is several hits at once (kick and hi-hat). A drum line plays one hit at a time, so
      // the second hit of every chord goes to a second lane of the same voice, the third to a third
      const tokenOf = (m) => (orchestral ? one ?? GM_ORCH[m] ?? 'sd' : GM_DRUM[m] ?? 's');
      const hits = res.notes.flatMap((n) => [...n.pitches].sort((a, b) => a - b).map((m, k) => ({ ...n, pitches: [m], names: [String(m)], unpitched: true, token: tokenOf(m), stack: k })));
      res.notes = hits.filter((h) => h.stack === 0);
      for (const h of hits) if (h.stack > 0) (stacked[h.stack] ??= []).push(h);
    }
    // a voice named only as a choir ("Choir", "Chorus", "Voices") sings the part its register is: its middle note
    if (!drums && !chosen[v.id] && v.program == null && /\b(choir|chorus|chor|coro|voices|aahs?)\b/i.test(v.name ?? '') && res.notes.length) {
      const ps = res.notes.flatMap((n) => n.pitches).sort((a, b) => a - b), mid = ps[ps.length >> 1];
      chosen[v.id] = mid >= 67 ? 'soprano_choir' : mid >= 60 ? 'alto_choir' : mid >= 53 ? 'tenor_choir' : 'bass_choir';
    }
    parts.push({
      id: `P${vi + 1}`, name: (vlist.length > 1 ? v.name ?? opt.instrument : opt.instrument ?? v.name) ?? H.T ?? 'Melody', instName: null,
      instSound: drums ? 'drum.group' : null, program: v.program ?? H.program, preset: chosen[v.id] ?? null, gainDb: v.gainDb, pan: v.pan, double: v.double,
      measures: res.measures, notes: res.notes, dyns: res.dyns, words: res.words, wedges: res.wedges, metros: vi === 0 ? res.metros : [], keys: res.keys,
      pedal: res.pedal,
    });
    for (let k = 1; k < stacked.length; k++) extraDrums.push({ ...parts[parts.length - 1], id: `P${vi + 1}.${k}`, notes: stacked[k], words: [], metros: [], pedal: [] });
  });
  // the drum staves' second and third hits, as lanes after every voice's own (so P1, P2... stay the voices in order)
  parts.push(...extraDrums);
  // every voice's bars are the first voice's: bars that do not fill their meter were made to, so they agree
  for (const p of parts) p.measures = measuresOut;
  const score = { tpq: TPQ, parts, meta: { title: opt.title ?? H.T ?? 'Tune', composer: H.C ?? null }, harmony };
  // the chord symbols are written over the first voice: it is the melody the critic checks against them
  // ABC reads every dynamic and hairpin where it is written, within the bar (dynamicsInBar: false reads one a bar)
  const r = buildSong(score, { rooms: true, dynamicsInBar: true, ...(harmony.length ? { melody: 'P1' } : {}), ...opt, title: opt.title ?? H.T ?? 'Tune', fileName: opt.fileName ?? 'tune.abc', key: opt.key ?? H.K }, opt.log);
  // drum voices play the General MIDI band kit (the noise channel in a chip song), unless they are the orchestra's
  if (!orchestral && parts.some((p) => p.instSound === 'drum.group')) useDrumKit(r);
  // %%accompany off in a tune: its chord symbols are only the critic's chords
  const accOff = directives.some((d) => d.name === 'accompany' && /^(off|no|none|false)$/i.test(d.arg));
  if (harmony.length && opt.accompany !== false && !accOff) accompany(r);
  // a part named Intro (or the parts %%intro names) plays once, before the rest loops: in a game, and in the ears.
  // A songbook does this for each of its tunes itself, from the same directive.
  if (!opt.book) {
    const introParts = new Set([...directives.filter((d) => d.name === 'intro').flatMap((d) => d.arg.split(/[\s,]+/)), ...Object.keys(r.report.partSections ?? {}).filter((l) => /^intro/i.test(l))]);
    const introSecs = new Set([...introParts].flatMap((l) => r.report.partSections?.[l] ?? []));
    const form = r.song.form;
    let ni = 0;
    while (ni < form.length - 1 && introSecs.has(form[ni])) ni++;
    if (ni > 0) {
      Object.assign(r.song, { intro: form.slice(0, ni), loop: form.slice(ni) });
      r.text = r.text.replace(/\n  form: /, `\n  intro: ${JSON.stringify(r.song.intro)},\n  loop: ${JSON.stringify(r.song.loop)},\n  form: `);
    }
  }
  r.report.voices = vlist.length;
  r.report.voiceIds = vlist.map((v) => v.id);
  r.report.warnings = warnings;
  r.report.directives = directives;
  r.report.chordSymbols = harmony.length;
  return r;
}

// Percussion voices: a drum kit by name, or an orchestral percussion instrument (its notes are General MIDI drum
// notes either way); and the orchestral sound General MIDI's drum notes stand for (a Chinese cymbal is the tam-tam)
const PERC_NAME = /\b(drums?|drum ?kit|drum ?set|batterie|schlagzeug|percussion|cymbals?|bass drum|snare|triangle(?! ?wave)|tam-?tam|gong|tambourine|wood ?blocks?|castanets|sleigh bells|cowbell|whip)\b/i;
const KIT_NAME = /^\s*(drums?|drum ?kit|drum ?set|kit|batterie|schlagzeug)(\s+\d+)?\s*$/i;
const GM_ORCH = { ...GM_PERC, 52: 'tam' };
const percByName = (name) => {
  const n = ` ${(name ?? '').toLowerCase().replace(/[^a-z0-9-]+/g, ' ').trim()} `;
  let best = null;
  for (const [tok, p] of Object.entries(PRESETS.percussion)) for (const a of p.aliases) if (n.includes(` ${a} `) && (!best || a.length > best[1])) best = [tok, a.length];
  return best?.[0] ?? null;
};

// A voice part as a choir names it, the whole name: Soprano, Alto, Tenor, Baritone, Bass (and "Sopranos", "Tenor I",
// "Alto 2", "Solo Alto", "Bass voices"); not "Alto Sax" or "Bass Clarinet"
const CHOIR_PART = /^\s*(?:solo\s+)?(soprano|alto|tenor|baritone|bass)(?:es|s)?(?:\s+(?:\d+|[ivx]+|voices?|choir|section))?\s*$/i;

/**
 * Presets the voice names settle better than one name alone can, by voice id. Two or more voices named as a choir's
 * parts are a choir, sung with or without words (alone, "Alto" is a viola and "Bass" nothing). A voice named only
 * "Bass" is the bass of the music around it: the bass guitar in a band, the synth bass among synths, the triangle in a
 * chip tune, and the string basses otherwise (a jazz trio's, an orchestra's). A %%MIDI program, or opt.presets,
 * decides first.
 */
function voicePresets(vlist, presets = {}) {
  const out = { ...presets };
  const sung = vlist.filter((v) => v.program == null && !v.drums && CHOIR_PART.test(v.name ?? ''));
  if (sung.length >= 2) {
    for (const v of sung) {
      if (out[v.id]) continue;
      const part = CHOIR_PART.exec(v.name)[1].toLowerCase().replace('baritone', 'bass');
      out[v.id] = /\bsolo\b/i.test(v.name) ? `${part}_voice` : `${part}_choir`;
    }
    return out;
  }
  for (const v of vlist) {
    if (out[v.id] || v.program != null || v.drums || !/^\s*bass(?:\s+\d+)?\s*$/i.test(v.name ?? '')) continue;
    const fams = new Set(vlist.filter((o) => o !== v && !o.drums && o.name).map((o) => INST[out[o.id] ?? mapPart(o.name, null, o.program, 0, false)[0]]?.family));
    out[v.id] = fams.has('band') ? 'electric_bass' : fams.has('synth') ? 'synth_bass' : fams.has('chip') ? 'chip_triangle' : 'basses';
  }
  return out;
}

/**
 * A songbook: every tune in the ABC text becomes a cue of one song, so a game plays them with
 * `player.music(song, { cue: 'battle' })`. In each tune (its header or anywhere in it):
 *   %%cue battle            the cue's name (default: the title, as an identifier)
 *   %%stinger victory       a stinger instead of a cue: played once over the music (player.sting)
 *   %%intro A               the parts (P:) played once before the rest loops; a part named Intro is one already
 *   %%layer drums Drums     a layer (player.layer) of these voices (names or ids, comma separated) or lanes
 * Lines before the first X: (a file header) apply to every tune. Voices with the same instrument and name share their
 * lane across cues. Options: as importABC's (for every tune), title. Returns { song, text, report } with
 * report.cues ({ name: { intro, body, bars, warnings } }), report.stingers, report.layers and report.warnings.
 */
export function importABCBook(abc, opt = {}) {
  const lines = abc.replace(/\r/g, '').split('\n');
  const starts = lines.flatMap((l, i) => (/^X:/.test(l) ? [i] : []));
  if (!starts.length) starts.push(0);
  const fileHead = lines.slice(0, starts[0]).filter((l) => /^(%%|[A-Za-z]:)/.test(l) && !/^X:/.test(l));
  const song = { title: opt.title ?? null, style: '', bpm: 120, meter: [4, 4], grid: 16, key: '', seed: 5, tail: 2, instruments: {}, parts: {}, buses: {}, sections: {}, loops: {}, form: [] };
  const report = { tunes: 0, cues: {}, stingers: {}, layers: {}, warnings: [], parts: [], bars: 0 };
  const rooms = [];
  const ident = (t) => (t ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || null;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  starts.forEach((st, k) => {
    const end = starts[k + 1] ?? lines.length;
    const tl = lines.slice(st, end);
    const text = [tl[0], ...fileHead, ...tl.slice(1)].join('\n');
    const r = importABC(text, { ...opt, title: undefined, index: undefined, book: true });
    report.tunes++;
    const dir = (n) => r.report.directives.filter((d) => d.name === n).map((d) => d.arg.trim());
    const sting = dir('stinger')[0];
    let cue = ident(sting ?? dir('cue')[0] ?? r.song.title) ?? `cue${k + 1}`;
    while (song.loops[cue] || song.stingers?.[cue]) cue += '_' + (k + 1);
    rooms.push(r.report.room);
    if (k === 0) Object.assign(song, { bpm: r.song.bpm, meter: r.song.meter, key: r.song.key, title: song.title ?? (starts.length > 1 ? 'Songbook' : r.song.title) });
    song.tail = Math.max(song.tail, r.song.tail);
    // instruments and lanes: shared when the same, renamed when a name is taken by something else
    const instMap = {}, laneMap = {};
    for (const [n, spec] of Object.entries(r.song.instruments)) {
      let m = n, j = 1;
      while (song.instruments[m] && !same(song.instruments[m], spec)) m = `${n}${++j}`;
      song.instruments[m] = spec;
      instMap[n] = m;
    }
    for (const [n, part] of Object.entries(r.song.parts)) {
      const pt = { ...part, inst: instMap[part.inst] };
      // a lane is shared whatever its role: the melody in one tune may be an inner voice in the next, and the critic
      // checks it as the melody wherever a tune has chords
      const unroled = ({ role, ...rest }) => rest;
      let m = n, j = 1;
      while (song.parts[m] && !same(unroled(song.parts[m]), unroled(pt))) m = `${n}${++j}`;
      if (song.parts[m]?.role && !pt.role) pt.role = song.parts[m].role;
      song.parts[m] = pt;
      laneMap[n] = m;
    }
    const secName = (n) => `${cue}_${n}`;
    for (const [n, sec] of Object.entries(r.song.sections)) {
      const lanes = (o) => Object.fromEntries(Object.entries(o ?? {}).map(([l, v]) => [laneMap[l], v]));
      song.sections[secName(n)] = { ...sec, parts: lanes(sec.parts), dyn: lanes(sec.dyn) };
    }
    const form = r.song.form.map(secName);
    // the intro: the form's opening run of sections from the intro parts (P:Intro, or those %%intro names)
    const introParts = new Set([...dir('intro').flatMap((a) => a.split(/[\s,]+/)), ...Object.keys(r.report.partSections ?? {}).filter((l) => /^intro/i.test(l))]);
    const introSecs = new Set([...introParts].flatMap((l) => r.report.partSections?.[l] ?? []).map(secName));
    let ni = 0;
    while (ni < form.length - 1 && introSecs.has(form[ni])) ni++;
    const bars = form.reduce((a, n) => a + song.sections[n].bars, 0);
    report.bars += bars;
    const warns = r.report.warnings.map((w) => `${cue}: ${w}`);
    report.warnings.push(...warns);
    report.parts.push(...r.report.parts.map((p) => ({ ...p, cue })));
    if (sting) {
      (song.stingers ??= {})[cue] = form;
      report.stingers[cue] = { sections: form, bars, warnings: warns };
    } else {
      song.loops[cue] = { intro: form.slice(0, ni), body: form.slice(ni) };
      report.cues[cue] = { intro: form.slice(0, ni), body: form.slice(ni), bars, warnings: warns };
    }
    song.form.push(...form);
    // layers: voices by name or id, or lanes by name
    const voiceLanes = (who) => {
      const w = who.toLowerCase();
      const i = r.report.parts.findIndex((p, pi) => String(p.name).toLowerCase() === w || `p${pi + 1}` === w || r.report.voiceIds?.[pi]?.toLowerCase() === w);
      if (i >= 0) return Object.entries(r.report.partLanes).filter(([id]) => id === `P${i + 1}` || id.startsWith(`P${i + 1}.`)).flatMap(([, ls]) => ls).map((l) => laneMap[l]);
      return laneMap[who] ? [laneMap[who]] : [];
    };
    for (const a of dir('layer')) {
      const m = /^(\S+)\s+(.*)$/.exec(a);
      if (!m) continue;
      const got = m[2].split(',').map((x) => x.trim().replace(/^"|"$/g, '')).filter(Boolean).flatMap(voiceLanes);
      if (!got.length) report.warnings.push(`${cue}: layer ${m[1]}: no voice or lane named ${m[2]}`);
      const L = (song.layers ??= {})[m[1]] ??= [];
      for (const l of got) if (!L.includes(l)) L.push(l);
    }
  });
  // the room: the concert hall if any tune is orchestral, else the band's, the synths' or the chip's
  const room = rooms.includes('hall') ? 'hall' : rooms.every((x) => x === 'chip') ? 'chip' : rooms.includes('band') ? 'band' : 'synth';
  const R = room === 'hall' ? { style: 'Orchestra', hall: PRESETS.hall, master: PRESETS.master, stage: PRESETS.stage } : ROOMS[room];
  song.style = `${R.style}: ${starts.length > 1 ? `a songbook of ${Object.keys(song.loops).length} cues` : 'an ABC tune'}`;
  song.buses = { hall: R.hall };
  song.master = R.master;
  if (R.stage) song.stage = R.stage;
  if (!song.stingers) delete song.stingers;
  report.room = room;
  report.layers = song.layers ?? {};
  const head = `// ${song.title}: imported from ABC by engine/abc.mjs importABCBook: ${report.tunes} tunes, ${report.bars} bars.\n`;
  return { song, text: songText(song, head), report };
}

/**
 * P:ABAC, P:A2B, P:(AB)2C, P:Intro A2 B: the order to play parts in, as part labels. A label is a capital letter and
 * the small letters after it (A, B, Intro, Verse), a number after a label or a bracket repeats it.
 */
export function partOrder(p) {
  const s = p.replace(/[\s.,]+/g, '');
  const read = (i) => {
    const seq = [];
    while (i < s.length && s[i] !== ')') {
      let unit;
      if (s[i] === '(') {
        const r = read(i + 1);
        unit = r.seq;
        i = r.i + 1;
      } else if (/[A-Za-z]/.test(s[i])) {
        const m = /^[A-Za-z][a-z_]*/.exec(s.slice(i));
        unit = [m[0]];
        i += m[0].length;
      } else {
        i++;
        continue;
      }
      const m = /^\d+/.exec(s.slice(i));
      const n = m ? +m[0] : 1;
      if (m) i += m[0].length;
      for (let k = 0; k < n; k++) seq.push(...unit);
    }
    return { seq, i };
  };
  return read(0).seq;
}

// One voice's music: measures (bar lines, repeats, endings), notes, dynamics, hairpins, words, tempo marks.
// The decorations this reader plays, and those it accepts without a sound of their own (bowings, fingerings,
// navigation marks, tenuto: a note is held its full length anyway); any other is ignored with a warning
const KNOWN_DECO = new RegExp('^(' + [
  'ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff', 'sfz', 'sf', 'ped', 'ped-down', 'pedal', 'ped-?up', 'ped-?end', 'ped-?off',
  'staccato', 'accent', '>', 'emphasis', 'fermata', 'invertedfermata', 'trill', 'tr', 'roll', '/{1,3}', 'trem', 'tremolo',
  'marcato', '\\^', 'staccatissimo', 'wedge', 'mordent', 'lowermordent', 'pralltriller', 'uppermordent', 'turn',
  'invertedturn', 'arpeggio', 'breath', 'caesura', 'tenuto', 'upbow', 'downbow', 'segno', 'coda', 'fine', 'd\\.c\\.',
  'd\\.s\\.', 'dacapo', 'dacoda', 'open', 'thumb', 'snap', '[0-5]', '\\+', 'plus', 'shortphrase', 'mediumphrase',
  'longphrase', 'harmonic',
].join('|') + ')$');
const DECO_HINT = {
  rit: 'a ritardando is words above the staff: "^rit." (or "^poco rit."), and "^a tempo" ends it',
  'rit.': 'a ritardando is words above the staff: "^rit." (or "^poco rit."), and "^a tempo" ends it',
  ritardando: 'a ritardando is words above the staff: "^rit." (or "^poco rit."), and "^a tempo" ends it',
  rall: 'a rallentando is words above the staff: "^rall.", and "^a tempo" ends it',
  accel: 'an accelerando is words above the staff: "^accel.", and "^a tempo" ends it; an inline [Q:1/4=132] sets a new tempo',
  cresc: 'a crescendo is a hairpin: !<(! ... !<)!, ending on a dynamic',
  crescendo: 'a crescendo is a hairpin: !<(! ... !<)!, ending on a dynamic',
  dim: 'a diminuendo is a hairpin: !>(! ... !>)!, ending on a dynamic',
  decresc: 'a diminuendo is a hairpin: !>(! ... !>)!, ending on a dynamic',
  diminuendo: 'a diminuendo is a hairpin: !>(! ... !>)!, ending on a dynamic',
  legato: 'a slur is round brackets: (c d e)',
  pizz: 'a technique is words above the staff: "^pizz."',
  'pizz.': 'a technique is words above the staff: "^pizz."',
  arco: 'a technique is words above the staff: "^arco"',
  glissando: 'a glissando is a line from one note to the next: !-(! before the first and !-)! before the second (or !~(! and !~)!)',
  slide: 'a glissando is a line from one note to the next: !-(! before the first and !-)! before the second (or !~(! and !~)!)',
};

function readVoice(v, ctx, harmony) {
  let unit = ctx.unit, [mb, mu] = ctx.meter;
  let keyAcc = keyAccidentals(ctx.key);
  const keys = [{ off: 0, fifths: keyFifths(ctx.key) }]; // for trills: their upper note is the key's
  const metros = ctx.Q ? [{ off: 0, number: ctx.Q.number, referent: ctx.Q.referent }] : [];
  const notes = [], dyns = [], words = [], wedges = [], pedal = [];
  const measures = [];
  let t = 0, barStart = 0, barAcc = {};
  let mFlags = { forward: false, endings: [] };
  let part = null, partStart = 0, partNew = false; // the part (P:A) being read, the bar it starts on, its first bar to come
  const warn = ctx.warn ?? (() => {});
  const vname = v.name ?? (ctx.voices > 1 ? `voice ${v.id}` : null);
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
  // A bar that does not fill its meter is padded with rest, one that overfills it is cut at the bar line, with a
  // warning: a miscounted bar costs a beat, not every bar after it. The first bar may be a pickup and the last may
  // complete it.
  const closeBar = (kind) => {
    if (t > barStart || kind) {
      let len = t - barStart;
      const want = Math.round((mb * 4 * TPQ) / mu);
      if (len > 0 && len !== want && !(measures.length === 0 && len < want) && !(kind === false && len < want)) {
        const beats = (x) => +((x / TPQ) * (mu / 4)).toFixed(3);
        const where = part != null ? `part ${part}, bar ${measures.length - partStart + 1}` : `bar ${measures.length + 1}`;
        warn(`${vname ? vname + ', ' : ''}${where}: ${beats(len)} beats in a ${mb}/${mu} bar; ${len < want ? 'filled out with rest' : 'cut at the bar line'}`);
        if (len > want) {
          const end = barStart + want;
          for (let k = notes.length - 1; k >= 0 && notes[k].off + notes[k].dur > end; k--) {
            if (notes[k].off >= end) notes.splice(k, 1);
            else notes[k].dur = end - notes[k].off;
          }
          for (const [mi, n] of [...tieOpen]) if (n.off >= end) tieOpen.delete(mi);
          if (lastNote && lastNote.off >= end) lastNote = notes[notes.length - 1] ?? null;
        }
        t = barStart + want;
        len = want;
      }
      if (len > 0) {
        measures.push({ number: measures.length + 1, suffix: '', offset: barStart, length: len, forward: mFlags.forward, backward: false, times: null, endings: mFlags.endings, part, partStart: partNew });
        partNew = false;
        mFlags = { forward: false, endings: [] };
      }
      barStart = t;
      barAcc = {};
    }
  };
  const lastMeasure = () => measures[measures.length - 1];
  // where a warning points: the part and bar being read, as a miscounted bar's warning names them
  const place = () => `${vname ? vname + ', ' : ''}${part != null ? `part ${part}, bar ${measures.length - partStart + 1}` : `bar ${measures.length + 1}`}`;
  const closing = []; // hairpins whose closing mark waits for the note it is written before
  const items = v.body;
  for (const it of items) {
    if (it.part != null) {
      closeBar(false);
      part = it.part;
      partStart = measures.length;
      partNew = true;
      continue;
    }
    if (it.field) {
      if (it.field === 'K') {
        if (!ctx.drums) keyAcc = keyAccidentals(it.value);
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
        // a chord symbol the critic cannot read, or one over another voice, would be dropped without a word
        else if (/^[A-G]/.test(q) && harmony) warn(`${place()}: the chord symbol "${q}" is not one this reader knows, so it is ignored; it reads C, Cm, C7, Cmaj7, Cm7, Cdim, Cdim7, Cm7b5, Caug, Csus2, Csus4, C6, Cm6, C9, Cm9, Cadd9, C5, and a bass note after a slash`);
        else if (/^[A-G]/.test(q) && !ctx.drums) warn(`${place()}: the chord symbol "${q}" is over a voice other than the first, so it is ignored; write chord symbols over the first voice`);
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
        // the sustain pedal, as abcm2ps writes it: !ped! presses (again: a change), !ped-up! lifts
        else if (/^(ped|ped-down|pedal)$/.test(d)) pedal.push({ off: t, type: 'P' });
        else if (/^(ped-?up|ped-?end|ped-?off)$/.test(d)) pedal.push({ off: t, type: 'U' });
        else if (/^(crescendo|<)\($/.test(d) || d === 'crescendo(') openWedges.push({ cls: 'Crescendo', els: [], where: place() });
        else if (/^(diminuendo|>)\($/.test(d)) openWedges.push({ cls: 'Diminuendo', els: [], where: place() });
        else if (/^(crescendo|diminuendo|<|>)\)$/.test(d)) {
          // a hairpin ends on the note its closing mark is written before, as every ABC mark belongs to the note after it
          const w = openWedges.pop();
          if (w) closing.push(w);
        } else if (/^[-~][()]$/.test(d)) continue; // a glissando's line, read with the note below
        else if (!KNOWN_DECO.test(d)) warn(`${place()}: !${d}! is not read, so it is ignored${DECO_HINT[d] ? `; ${DECO_HINT[d]}` : ''}`);
      }
      const closeWedges = (end) => {
        for (const w of closing.splice(0)) {
          if (w.els.length) w.els.push(end);
          // the importer ramps from the bar a hairpin starts in to the next dynamic, if the hairpin spans two notes
          if (w.els.length && end.off > w.els[0].off) wedges.push(w);
          else warn(`${w.where}: a hairpin over one note is not heard; open it before one note and close it before a later one`);
        }
      };
      // a breath or a caesura written before a note is a pause after the one before it
      if (lastNote && decos.includes('breath')) lastNote.arts.push('BreathMark');
      if (lastNote && decos.includes('caesura')) lastNote.arts.push('Caesura');
      if (isRest) {
        closeWedges({ off: t });
        t += dur;
        for (const w of openWedges) if (!w.els.length) w.els.push({ off: t - dur });
        continue;
      }
      const arts = [], exprs = [];
      if (decos.includes('staccato')) arts.push('Staccato');
      if (decos.includes('accent') || decos.includes('>') || decos.includes('emphasis')) arts.push('Accent');
      if (decos.includes('fermata') || decos.includes('invertedfermata')) exprs.push({ k: 'Fermata' });
      if (decos.includes('trill') || decos.includes('tr')) exprs.push({ k: 'Trill' });
      if (decos.includes('roll')) exprs.push({ k: 'Tremolo', marks: 3 });
      // !/! !//! !///!: a measured tremolo of eighths, sixteenths, or an unmeasured one; !trem! is unmeasured
      const trem = decos.find((d) => /^\/{1,3}$/.test(d) || d === 'trem' || d === 'tremolo');
      if (trem) exprs.push({ k: 'Tremolo', marks: trem[0] === '/' ? trem.length : 3 });
      if (decos.includes('marcato') || decos.includes('^')) arts.push('StrongAccent');
      if (decos.includes('staccatissimo') || decos.includes('wedge')) arts.push('Staccatissimo');
      const orn = { mordent: 'Mordent', lowermordent: 'Mordent', pralltriller: 'InvertedMordent', uppermordent: 'InvertedMordent', turn: 'Turn', invertedturn: 'InvertedTurn' };
      for (const d of decos) if (orn[d]) exprs.push({ k: orn[d] });
      const ps = pitches.slice().sort((a, b) => a.midi - b.midi);
      // ties: a note continuing a tied note of the same pitch lengthens it instead
      const tied = ps.length === 1 ? tieOpen.get(ps[0].midi) : null;
      if (tied && tied.off + tied.dur === t) {
        closeWedges({ off: t });
        tied.dur += dur;
        if (!tie) tieOpen.delete(ps[0].midi);
        t += dur;
        lastNote = tied;
        continue;
      }
      const el = {
        off: t, dur, grace: false, rest: false, voice: '1', pitches: ps.map((p) => p.midi), names: ps.map((p) => p.name),
        unpitched: false, tie: null, arts, exprs, lyric: lyricQueue.length ? lyricQueue.shift() : null, seq: seq++,
        ...(decos.includes('arpeggio') ? { arp: true } : {}),
      };
      // a glissando, as abcm2ps and abc2svg write it: !-(! (or the wavy !~(!) before the note it leaves, !-)! before
      // the note it reaches; it runs in the time of the first note (on a harp or a keyboard over the white keys)
      const gl = [...(decos.some((d) => d === '-)' || d === '~)') ? [{ type: 'stop', number: 1, kind: 'glissando' }] : []),
        ...(decos.some((d) => d === '-(' || d === '~(') ? [{ type: 'start', number: 1, kind: 'glissando' }] : [])];
      if (gl.length) el.gliss = gl;
      // !harmonic!: a natural harmonic on its note, sounding as written; on a two-note chord, an artificial one (the
      // stopped note and the touch above it: a fourth sounds two octaves over the stopped note)
      if (decos.includes('harmonic')) el.harmonic = { artificial: ps.length > 1, kind: 'natural' };
      if (pendGrace.length) {
        for (const g of pendGrace) notes.push({ ...el, grace: true, dur: 0, pitches: [g], names: [NAMES[g % 12] + (Math.floor(g / 12) - 1)], arts: [], exprs: [], lyric: null, seq: seq++ });
        pendGrace = [];
        el.seq = seq++;
      }
      for (let k = 0; k < slurOpen.length; k++) if (slurOpen[k] === null) slurOpen[k] = el;
      closeWedges(el);
      for (const w of openWedges) if (!w.els.length) w.els.push(el);
      notes.push(el);
      if (tie && ps.length === 1) tieOpen.set(ps[0].midi, el);
      lastNote = el;
      t += dur;
    }
  }
  for (const d of pendDeco) if (typeof d === 'string' && /^(crescendo|diminuendo|<|>)\)$/i.test(d) && openWedges.length) closing.push(openWedges.pop());
  if (closing.length) {
    const end = lastNote ?? { off: t };
    for (const w of closing.splice(0)) if (w.els.length && end.off > w.els[0].off) wedges.push(Object.assign(w, { els: [...w.els, end] }));
  }
  closeBar(false);
  if (openEnding(measures)) closeEnding(measures);
  notes.sort((a, b) => a.off - b.off || (a.grace ? 0 : 1) - (b.grace ? 0 : 1) || a.seq - b.seq);
  return { measures, notes, dyns, words, wedges, metros, keys, pedal };
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
// The accompaniment chord symbols get, by the song's room: the orchestra's harp and pizzicato cellos, a band's strummed
// guitar and electric bass, a synth pad and bass, or a chip pulse arpeggio and the triangle. The bass sits out when
// the tune has a bass part of its own; lane names the tune already uses are not taken.
const ACCOMPANY = {
  hall: { acc: ['harp', { lo: 'G3', hi: 'E5', notes: 3 }], bass: ['cellos_pizz', 36] },
  band: { acc: ['acoustic_guitar', { lo: 'E3', hi: 'E5', notes: 4 }], bass: ['electric_bass', 28] },
  synth: { acc: ['synth_pad', { lo: 'F3', hi: 'E5', notes: 4 }], bass: ['synth_bass', 24] },
  chip: { acc: ['chip_pulse', { lo: 'B3', hi: 'B4', notes: 3, arp: [0, 1, 2, 1] }], bass: ['chip_triangle', 36] },
};
const BASSY = new Set(['basses', 'cellos', 'contrabass_solo', 'cellos_pizz', 'basses_pizz', 'tuba', 'bassoon', 'contrabassoon',
  'bass_trombone', 'bass_choir', 'bass_voice', 'electric_bass', 'synth_bass', 'chip_triangle']);
function accompany(r) {
  const song = r.song;
  const A = ACCOMPANY[r.report.room] ?? ACCOMPANY.hall;
  const free = (n) => {
    let k = 1;
    while (song.parts[k === 1 ? n : n + k]) k++;
    return k === 1 ? n : n + k;
  };
  const hasBass = r.report.parts.some((p) => BASSY.has(p.preset));
  const add = (lane, key, pan, gainDb) => {
    const P = INST[key];
    song.instruments[key] ??= { ...P.spec, rangeName: key };
    const sends = { hall: P.send - 2 };
    song.parts[lane] = { inst: key, gain: +(P.gain + gainDb).toFixed(1), pan, sends, ...(P.fx.length ? { fx: P.fx } : {}), role: lane === 'bass' ? 'bass' : 'harmony' };
  };
  const accLane = free('acc'), bassLane = hasBass ? null : free('bass');
  add(accLane, A.acc[0], 0.3, -5);
  if (bassLane) add(bassLane, A.bass[0], -0.1, -3);
  for (const sec of Object.values(song.sections)) {
    if (!sec.chords) continue;
    const o = A.acc[1];
    sec.parts[accLane] = o.arp ? arpLine(sec.chords, { ...o, pattern: o.arp, rate: Math.max(1, sec.grid / 8), spb: sec.grid }) : padLine(sec.chords, { ...o, spb: sec.grid });
    sec.dyn[accLane] = '| mp |' + ' - |'.repeat(sec.bars - 1);
    if (!bassLane) continue;
    // the bass: each chord's bass note, held for as long as the chord
    const bars = [];
    for (const c of parseChords(sec.chords, sec.grid).chords) (bars[c.bar] ??= []).push(`${midiToName(A.bass[1] + c.chord.bass)}${c.steps > 1 ? ':' + c.steps : ''}`);
    sec.parts[bassLane] = '| ' + bars.map((b) => b.join(' ')).join(' | ') + ' |';
    sec.dyn[bassLane] = '| mp |' + ' - |'.repeat(sec.bars - 1);
  }
  r.text = songText(song);
  r.report.accompanied = true;
}

/** A song as the text of a song module: `export default {...};`, each value on one line when it fits in 118 columns. */
export function songText(song, head = '') {
  const flat = (v) => (v && typeof v === 'object' ? (Array.isArray(v) ? `[${v.map(flat).join(', ')}]` : `{ ${Object.entries(v).map(([k, x]) => `${key(k)}: ${flat(x)}`).join(', ')} }`.replace('{  }', '{}')) : JSON.stringify(v));
  const key = (k) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k));
  const fmt = (v, ind, pre = 0) => {
    const one = flat(v);
    if (!v || typeof v !== 'object' || one.length + ind.length + pre < 118) return one;
    const inner = ind + '  ';
    if (Array.isArray(v)) return `[\n${v.map((x) => inner + fmt(x, inner)).join(',\n')},\n${ind}]`;
    return `{\n${Object.entries(v).map(([k, x]) => `${inner}${key(k)}: ${fmt(x, inner, key(k).length + 2)}`).join(',\n')},\n${ind}}`;
  };
  return `${head}export default ${fmt(song, '')};\n`;
}
