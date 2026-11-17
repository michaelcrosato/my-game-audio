// score.mjs: the text format, its validators, chord symbols, generators, arrangement and the score critic.
//
// A part line is bars of tokens separated by `|`. Steps are grid units (16 per 4/4 bar by default).
//   C4  F#3  Bb2      a note, 1 step          C4:4        a note held 4 steps
//   [D3 F3 A3]:8      a chord, 8 steps        .  .:4      a rest (1 or 4 steps)
//   -   -:3           extend the previous note
//   suffixes: ! accent  ? ghost  ^ staccato / palm mute  _ legato  ~ roll / tremolo  & arpeggiated chord (rolled
//   from the bottom)  * harmonic (flageolet)
//   {G#4 A4}B4:2      grace notes, played quickly just before the note or chord they precede
//   C5:4@o            the vowel a voice sings (a e i o u); it carries on through held notes
//   C5:4@freu         a syllable: the voice sings its consonants and its vowel (Freu-de: @freu then @de)
//   C5:4%pont         a playing technique, after the suffixes (several may follow each other):
//     strings  %pont sul ponticello  %tasto sul tasto  %spicc spiccato  %legno col legno  %port portamento from
//              the previous note  %trem8 %trem16 %trem32 measured tremolo (strokes of that note value; ~ unmeasured)
//     winds and brass  %flz flutter-tongue  %trem16 (etc.) tongued repeats, double-tongued  %rip a rip up into the
//              note (brass)  %brassy cuivre (brass; it also comes on by itself at ff)
// Drum lines use kit tokens instead of notes:  k . h . s . h k | ...
// Pedal lines (a section's `pedal`) use P (press, or lift and press again) and U (lift):  | P . . . . . P . . . . . |
//   A press comes down 50 ms after its step, so keys let go with a change are damped (legato pedalling).
// Dynamics lines give one marking per bar, optional hairpin to the next marking:  | p< | - | mf | f> | p |, or
//   several at their steps, written like notes:  | mf:12 <:4 | f |  (mf, then a crescendo over the last beat to f)
import { hash, DYN, clamp } from './dsp.mjs';
import { RANGES } from './instruments.mjs';
// registers every preset's range in RANGES; without it the critic checked a preset's range only when something else
// had loaded the presets first, so `ode` had 11 critic notes or 12 depending on what was imported before
import './orchestra.mjs';

const PEDAL_CATCH = 0.05;
const NOTE_RE = /^([A-Ga-g])([#b]{0,2})(-?\d)$/;
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

export function noteToMidi(s) {
  const m = NOTE_RE.exec(s);
  if (!m) return null;
  let n = PC[m[1].toUpperCase()];
  for (const c of m[2]) n += c === '#' ? 1 : -1;
  return (Number(m[3]) + 1) * 12 + n;
}
export const midiToName = (m) => `${NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
const pcOf = (name) => {
  const m = /^([A-G])([#b]?)$/.exec(name);
  if (!m) return null;
  return (PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
};

const TOKEN_RE = /(?:\{[^}]*\})?\[[^\]]*\][^\s|]*|(?:\{[^}]*\})?[^\s|{\[]+|\|/g;
const PARTS_RE = /^(?:\{([^}]*)\})?(\[[^\]]*\]|[^:!?^_~&*{}@%]+)(?::(\d+))?([!?^_~&*]*)((?:%[a-z]+\d*)*)(?:@([^\s|:@%]+))?$/;
/** The playing techniques a note may carry (%name). */
export const TECHNIQUES = ['pont', 'tasto', 'spicc', 'legno', 'port', 'trem8', 'trem16', 'trem32', 'flz', 'rip', 'brassy'];
const VOWEL_LETTERS = 'aeiouyäöüéèêëàâáíîïóôúûœæ';
const SINGLE_VOWEL = { a: 'a', à: 'a', â: 'a', á: 'a', e: 'e', é: 'e', è: 'e', ê: 'e', ë: 'e', ä: 'e', æ: 'e', œ: 'e', ö: 'e', i: 'i', î: 'i', ï: 'i', í: 'i', y: 'i', ü: 'i', o: 'o', ô: 'o', ó: 'o', u: 'u', û: 'u', ú: 'u' };
const DIGRAPH_VOWEL = { eu: 'o', äu: 'o', oi: 'o', oy: 'o', ei: 'a', ai: 'a', ay: 'a', au: 'a', ie: 'i', ee: 'i', oo: 'u', ou: 'u', ae: 'e', oe: 'e' };
/** The vowel (a e i o u) a syllable is sung on, or `prev` when it has none (German, Latin, Italian, English spellings). */
export function vowelOf(text, prev = null) {
  const t = (text ?? '').toLowerCase();
  const m = new RegExp(`[${VOWEL_LETTERS}]+`).exec(t);
  if (!m) return prev;
  let run = m[0];
  if (run[0] === 'y' && run.length > 1) run = run.slice(1);
  return DIGRAPH_VOWEL[run.slice(0, 2)] ?? SINGLE_VOWEL[run[0]] ?? prev;
}

/**
 * Parse one part line into events with step positions. Returns errors instead of throwing, so a checker can list them
 * all. With `lenient`, what can be repaired is, and listed in `repairs` instead: a bar that does not add up is padded
 * with rest or cut at the bar line, an unreadable token or note becomes a rest, an unknown technique is left out.
 */
export function parseLine(line, { spb = 16, drum = false, where = '', lenient = false } = {}) {
  const clean = line
    .split('\n')
    .map((l) => l.replace(/(^|\s)#.*$/, '')) // comments start with " #" (a sharp in F#5 has no space before it)
    .join(' ');
  const tokens = clean.match(TOKEN_RE) || [];
  const events = [];
  const errors = [], repairs = [];
  // a problem: an error, or with `lenient` a repair (the message says what was done)
  const problem = (msg, done) => (lenient ? repairs.push(`${msg}; ${done}`) : errors.push(msg));
  let step = 0, barStart = 0, bar = 0, last = null, sawBarLine = false, lead = 0;
  // a bar that does not add up: an error, or padded with rest or cut at the bar line
  const closeBar = (len) => {
    const msg = `${where} bar ${bar + 1}: ${len} steps, expected ${spb} (${len < spb ? 'missing ' + (spb - len) : (len - spb) + ' too many'})`;
    if (!lenient) return errors.push(msg);
    repairs.push(`${msg}; ${len < spb ? 'filled out with rest' : 'cut at the bar line'}`);
    const end = barStart + spb;
    for (let k = events.length - 1; k >= 0 && events[k].step + events[k].steps > end; k--) {
      if (events[k].step >= end) events.splice(k, 1);
      else events[k].steps = end - events[k].step;
    }
    if (last && !events.includes(last)) last = events[events.length - 1] ?? null;
    step = end;
  };
  for (const tok of tokens) {
    if (tok === '|') {
      if (step > barStart) {
        const len = step - barStart;
        if (len !== spb) closeBar(len);
        bar++;
        barStart = step;
      }
      sawBarLine = true;
      continue;
    }
    const m = PARTS_RE.exec(tok);
    if (!m) {
      problem(`${where} bar ${bar + 1}: can't read "${tok}"`, 'left out');
      continue;
    }
    const [, graceS, body, lenS, arts, techS, sung] = m;
    let tech = techS ? techS.slice(1).split('%') : [];
    const bad = tech.find((x) => !TECHNIQUES.includes(x));
    if (bad) {
      problem(`${where} bar ${bar + 1}: unknown technique "%${bad}" in "${tok}" (${TECHNIQUES.map((x) => '%' + x).join(' ')})`, 'left out');
      tech = tech.filter((x) => TECHNIQUES.includes(x));
    }
    // @a sings a vowel; @freu a syllable, its vowel and the consonants around it
    const syl = sung && !/^[aeiou]$/.test(sung) ? sung.toLowerCase() : null;
    const vowel = sung ? (syl ? vowelOf(syl, 'a') : sung) : null;
    const len = lenS ? Number(lenS) : 1;
    if (body === '.') {
      step += len;
      last = null;
      continue;
    }
    if (body === '-') {
      if (last) last.steps += len;
      else if (step === lead) lead += len; // a note held over from the section before
      else problem(`${where} bar ${bar + 1}: "-" with no note before it`, 'played as a rest');
      step += len;
      continue;
    }
    let notes;
    if (drum) notes = [body];
    else if (body.startsWith('[')) notes = body.slice(1, -1).trim().split(/\s+/).map(noteToMidi);
    else notes = [noteToMidi(body)];
    if (!drum && notes.some((x) => x == null)) {
      problem(`${where} bar ${bar + 1}: bad note in "${tok}"`, 'played as a rest');
      step += len;
      last = null;
      continue;
    }
    let grace = null;
    if (graceS != null) {
      // on a drum line, grace notes are kit tokens: {s}s is a flam, {s s}s a drag
      grace = graceS.trim().split(/\s+/).filter(Boolean).map((g) => (drum ? g : noteToMidi(g)));
      if (!grace.length || grace.some((x) => x == null)) {
        problem(`${where} bar ${bar + 1}: bad grace notes in "${tok}"`, 'left out');
        grace = null;
      }
    }
    const vel = arts.includes('!') ? 1 : arts.includes('?') ? 0.42 : 0.8;
    const ev = { step, steps: len, notes, art: arts, vel, bar, grace, vowel, ...(tech.length ? { tech } : {}), ...(syl ? { syl } : {}) };
    events.push(ev);
    last = ev;
    step += len;
  }
  if (step > barStart) {
    const len = step - barStart;
    if (!sawBarLine && step > spb) {
      if (!lenient) errors.push(`${where}: ${step} steps with no bar lines; write | between bars`);
      else {
        // read as bars of `spb` steps, the last filled out with rest
        repairs.push(`${where}: ${step} steps with no bar lines; read as bars of ${spb}`);
        for (const e of events) e.bar = Math.floor(e.step / spb);
        bar = Math.ceil(step / spb) - 1;
        barStart = bar * spb;
        step = barStart + spb;
      }
    } else if (len !== spb) {
      if (!lenient) errors.push(`${where} bar ${bar + 1}: ${len} steps, expected ${spb}`);
      else closeBar(len);
    }
    bar++;
  }
  return { events, bars: bar, steps: step, errors, repairs, lead };
}

// ---------------------------------------------------------------------------------------------------------------
// Chord symbols
// ---------------------------------------------------------------------------------------------------------------
const QUAL = {
  '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], dim: [0, 3, 6],
  dim7: [0, 3, 6, 9], m7b5: [0, 3, 6, 10], aug: [0, 4, 8], sus2: [0, 2, 7], sus4: [0, 5, 7], add9: [0, 4, 7, 14],
  madd9: [0, 3, 7, 14], 5: [0, 7], 6: [0, 4, 7, 9], m6: [0, 3, 7, 9], 9: [0, 4, 7, 10, 14], m9: [0, 3, 7, 10, 14],
};

export function parseChord(sym) {
  const m = /^([A-G][#b]?)([^/]*)(?:\/([A-G][#b]?))?$/.exec(sym);
  if (!m) return null;
  const root = pcOf(m[1]);
  const iv = QUAL[m[2]];
  if (root == null || !iv) return null;
  const bass = m[3] ? pcOf(m[3]) : root;
  return { sym, root, bass, intervals: iv, tones: iv.map((i) => (root + i) % 12) };
}

/** '| Dm | Bb F | ...' -> [{ bar, step, steps, chord }] relative to the line start. */
export function parseChords(line, spb = 16, where = 'chords') {
  const bars = line.split('|').map((b) => b.trim()).filter((b, i, a) => b.length || (i > 0 && i < a.length - 1));
  const out = [];
  const errors = [];
  bars.forEach((b, bi) => {
    const syms = b.split(/\s+/).filter(Boolean);
    const each = spb / syms.length;
    syms.forEach((s, k) => {
      const c = parseChord(s);
      if (!c) errors.push(`${where} bar ${bi + 1}: unknown chord "${s}"`);
      out.push({ bar: bi, step: bi * spb + Math.round(k * each), steps: Math.round(each), chord: c });
    });
  });
  return { chords: out, bars: bars.length, errors };
}

// ---------------------------------------------------------------------------------------------------------------
// Generators: code that writes part lines. They return text, so their output is validated like hand-written lines.
// ---------------------------------------------------------------------------------------------------------------
function chordPitches(chord, lo, hi) {
  const out = [];
  for (let m = lo; m <= hi; m++) if (chord.tones.includes(m % 12)) out.push(m);
  return out;
}

/** Voice-led voicings: for each chord, pick `notes` chord tones in [lo, hi] closest to the previous voicing. */
export function voiceLead(chordsLine, { lo = 'C3', hi = 'C5', notes = 4, spb = 16 } = {}) {
  const { chords } = parseChords(chordsLine, spb);
  const L = noteToMidi(lo), H = noteToMidi(hi);
  let prev = null;
  return chords.map((c) => {
    const pool = chordPitches(c.chord, L, H);
    // candidate voicings: windows of `notes` consecutive pool pitches that include root and third if possible
    let best = null, bestCost = Infinity;
    for (let i = 0; i + notes <= pool.length; i++) {
      const v = pool.slice(i, i + notes);
      const pcs = new Set(v.map((x) => x % 12));
      let cost = pcs.has(c.chord.tones[1]) ? 0 : 6;
      cost += pcs.has(c.chord.root) ? 0 : 4;
      if (prev) cost += v.reduce((a, x, k) => a + Math.abs(x - (prev[k] ?? prev[prev.length - 1])), 0) / notes;
      else cost += Math.abs((v[0] + v[v.length - 1]) / 2 - (L + H) / 2) * 0.2;
      if (cost < bestCost) {
        bestCost = cost;
        best = v;
      }
    }
    prev = best ?? pool.slice(0, notes);
    return { ...c, notes: prev };
  });
}

/** A held chord per chord symbol: `[A3 C4 E4]:16 | ...`. */
export function padLine(chordsLine, opts = {}) {
  const spb = opts.spb ?? 16;
  const vs = voiceLead(chordsLine, opts);
  return barsFrom(vs, spb, (v) => `[${v.notes.map(midiToName).join(' ')}]:${v.steps}${opts.art ?? ''}`);
}

/** Arpeggio over the voice-led chord tones, `rate` steps per note, `pattern` indexes into the voicing. */
export function arpLine(chordsLine, { pattern = [0, 1, 2, 3, 2, 1], rate = 1, art = '', ...opts } = {}) {
  const spb = opts.spb ?? 16;
  const vs = voiceLead(chordsLine, { notes: 4, ...opts });
  return barsFrom(vs, spb, (v) => {
    const toks = [];
    for (let s = 0, k = 0; s < v.steps; s += rate, k++) {
      const idx = pattern[k % pattern.length];
      const pitch = idx >= v.notes.length ? v.notes[idx % v.notes.length] + 12 : v.notes[idx];
      toks.push(`${midiToName(pitch)}${rate > 1 ? ':' + rate : ''}${art}`);
    }
    return toks.join(' ');
  });
}

/** Bass from a rhythm per chord: x root, o octave up, 5 fifth, 3 third, . rest, - hold. */
export function bassLine(chordsLine, { rhythm = 'x.x.x.x.', octave = 2, art = '', spb = 16 } = {}) {
  const { chords } = parseChords(chordsLine, spb);
  return barsFrom(chords, spb, (c) => {
    const step = spb / rhythm.length;
    const root = (octave + 1) * 12 + c.chord.bass;
    const toks = [];
    const n = Math.round(c.steps / step);
    for (let k = 0; k < n; k++) {
      const ch = rhythm[k % rhythm.length];
      const d = step > 1 ? ':' + step : '';
      if (ch === '.') toks.push('.' + d);
      else if (ch === '-') toks.push('-' + d);
      else {
        const p = ch === 'o' ? root + 12 : ch === '5' ? root + 7 : ch === '3' ? root + c.chord.intervals[1] : root;
        toks.push(midiToName(p) + d + (ch === 'x' || ch === 'o' ? art : ''));
      }
    }
    return toks.join(' ');
  });
}

function barsFrom(items, spb, fmt) {
  const bars = [];
  for (const it of items) {
    const b = Math.floor(it.step / spb);
    (bars[b] ??= []).push(fmt(it));
  }
  return '| ' + bars.map((b) => b.join(' ')).join(' | ') + ' |';
}

export const repeat = (line, n) => {
  const body = line.trim().replace(/^\|/, '').replace(/\|$/, '').trim();
  return '| ' + Array.from({ length: n }, () => body).join(' | ') + ' |';
};

export function transposeLine(line, semis) {
  if (!semis) return line;
  return line.replace(/([A-G][#b]{0,2})(-?\d)(?![\w])/g, (m) => {
    const x = noteToMidi(m);
    return x == null ? m : midiToName(x + semis);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Dynamics lines
// ---------------------------------------------------------------------------------------------------------------
// the time of a step in one bar of the timeline (held steps last longer)
function barStepTime(bar, s) {
  if (!bar.holds) return bar.t0 + s * bar.stepDur;
  let x = s * bar.stepDur;
  for (const h of bar.holds) x += Math.max(0, Math.min(s, h.s + h.n) - h.s) * bar.stepDur * (h.f - 1);
  return bar.t0 + x;
}
const DYN_MARK = /^(\.|ppp|pp|p|mp|mf|f|ff|fff)?([<>]?)(?::(\d+))?$/;

// A dynamics line's points [time, level]. A bar holds one marking ('mf', 'p<' a crescendo from p to the next marking,
// '-' as before) or several at their steps, written like notes: 'mf:12 <:4' is mf for 12 steps, then a crescendo
// from step 12 to the next marking; 'p:8 f:8'; '.:8 f:8' changes nothing until step 8. Marks without a length share
// what is left of the bar ('p f' puts f half way). A bare '<' or '>' swells from the level before it.
function dynPoints(line, barTimes, where, errors, lenient = false) {
  const problem = (msg, done) => errors.push(lenient ? `${msg}; ${done}` : msg);
  const cells = line.split('|').map((c) => c.trim()).filter((c, i, a) => c.length || (i > 0 && i < a.length - 1));
  const pts = [];
  let prevLevel = null, hair = false;
  cells.forEach((c, i) => {
    const bt = barTimes[i];
    if (!bt) return !lenient || i === barTimes.length ? problem(`${where}: more dynamics bars than the section has`, 'the rest left out') : null;
    if (c === '-' || c === '') {
      if (!hair && prevLevel != null) pts.push([bt.t0, prevLevel], [bt.t1 - 1e-3, prevLevel]);
      return;
    }
    const marks = [];
    for (const tok of c.split(/\s+/)) {
      const m = DYN_MARK.exec(tok);
      if (!m || (!m[1] && !m[2])) problem(`${where} bar ${i + 1}: bad dynamic "${tok}"`, 'left out');
      else marks.push({ lv: m[1] && m[1] !== '.' ? DYN[m[1]] : null, hair: !!m[2], len: m[3] != null ? +m[3] : null });
    }
    const fixed = marks.reduce((a, k) => a + (k.len ?? 0), 0), free = marks.filter((k) => k.len == null).length;
    const share = free ? Math.max(0, bt.spb - fixed) / free : 0;
    let s = 0;
    marks.forEach((mk, k) => {
      const len = mk.len ?? share;
      const t = barStepTime(bt, Math.min(s, bt.spb));
      const tEnd = k + 1 < marks.length ? barStepTime(bt, Math.min(s + len, bt.spb)) : bt.t1;
      if (mk.lv != null) {
        pts.push([t, mk.lv]);
        prevLevel = mk.lv;
        hair = mk.hair;
      } else if (mk.hair) {
        if (prevLevel != null && !hair) pts.push([t, prevLevel]);
        hair = true;
      } else if (!hair && prevLevel != null) pts.push([t, prevLevel]);
      if (!hair && prevLevel != null) pts.push([tEnd - 1e-3, prevLevel]);
      s += len;
    });
  });
  return pts;
}

function curve(points, dflt = 0.7) {
  const p = points.sort((a, b) => a[0] - b[0]);
  return (t) => {
    if (!p.length) return dflt;
    if (t <= p[0][0]) return p[0][1];
    if (t >= p[p.length - 1][0]) return p[p.length - 1][1];
    let lo = 0, hi = p.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (p[mid][0] <= t) lo = mid;
      else hi = mid;
    }
    const [t0, a] = p[lo], [t1, b] = p[hi];
    return t1 > t0 ? a + ((b - a) * (t - t0)) / (t1 - t0) : b;
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Arrangement: sections in form order -> timed note events per part, dynamics curves, trigger lists.
// ---------------------------------------------------------------------------------------------------------------
/**
 * Arrange a song: its sections in form order as timed note events per part, with dynamics curves and triggers.
 * `errors` are what stop it playing. By default what can be repaired is, and listed in `repairs` (a bar that does not
 * add up is padded with rest or cut at the bar line, a part with too few bars repeats to fill its section, an unknown
 * part or dynamic is left out); `{ strict: true }` makes them errors instead.
 */
export function arrange(song, { strict = false } = {}) {
  const lenient = !strict;
  const spbSong = song.grid ?? 16;
  const beats = song.meter?.[0] ?? 4;
  const errors = [], repairs = [];
  const problem = (msg, done) => (lenient ? repairs.push(`${msg}; ${done}`) : errors.push(msg));
  const timeline = [];
  const starts = [];
  let t = 0;
  for (const name of song.form) {
    const sec = song.sections[name];
    if (!sec) {
      errors.push(`form: unknown section "${name}"`);
      continue;
    }
    // a section may set its own meter (beats per bar), grid (steps per bar) and tempo line (bpm per bar)
    const spbS = sec.grid ?? spbSong, beatsS = sec.meter?.[0] ?? beats;
    let tempos = null;
    if (sec.tempo) {
      const cells = sec.tempo.split('|').map((c) => c.trim()).filter(Boolean);
      if (cells.length !== sec.bars) problem(`${name}.tempo: ${cells.length} bars, section has ${sec.bars}`, cells.length < sec.bars ? 'the last tempo carries on' : 'the rest left out');
      let last = sec.bpm ?? song.bpm;
      tempos = cells.map((c) => (c === '-' ? last : (last = Number(c))));
      if (tempos.some((x) => !(x > 0))) {
        problem(`${name}.tempo: bad tempo in "${sec.tempo}"`, 'read as the tempo before it');
        if (lenient) tempos = tempos.reduce((a, x) => [...a, x > 0 ? x : a[a.length - 1] ?? sec.bpm ?? song.bpm], []);
      }
      if (lenient) while (tempos.length < sec.bars) tempos.push(tempos[tempos.length - 1] ?? sec.bpm ?? song.bpm);
    }
    // a hold line stretches steps of a bar (a fermata over a note, a caesura): '| - | 8:4*2 |' makes steps 8 to 11
    // of bar 2 last twice as long; several holds in a bar are separated by spaces
    let holds = null;
    if (sec.hold) {
      const cells = sec.hold.split('|').map((c) => c.trim()).filter((c, i, a) => c.length || (i > 0 && i < a.length - 1));
      if (cells.length !== sec.bars) problem(`${name}.hold: ${cells.length} bars, section has ${sec.bars}`, cells.length < sec.bars ? 'the rest held as written' : 'the rest left out');
      holds = cells.map((c) => (c === '-' || c === '' ? [] : c.split(/\s+/).map((h) => {
        const m = /^(\d+):(\d+)\*(\d+(?:\.\d+)?)$/.exec(h);
        if (!m || +m[3] < 1) {
          problem(`${name}.hold: can't read "${h}" (step:steps*factor, e.g. 8:4*2)`, 'left out');
          return null;
        }
        return { s: +m[1], n: +m[2], f: +m[3] };
      }).filter(Boolean)));
    }
    starts.push({ name, bar0: timeline.length, spb: spbS, beats: beatsS });
    for (let b = 0; b < sec.bars; b++) {
      const bpm = tempos?.[b] ?? (sec.rit ? sec.rit[0] + ((sec.rit[1] - sec.rit[0]) * b) / Math.max(1, sec.bars - 1) : sec.bpm ?? song.bpm);
      const dur = (60 / bpm) * beatsS;
      const stepDur = dur / spbS;
      const hs = holds?.[b]?.length ? holds[b] : null;
      const extra = hs ? hs.reduce((a, h) => a + h.n * stepDur * (h.f - 1), 0) : 0;
      const quarter = ((60 / bpm) * (sec.meter?.[1] ?? song.meter?.[1] ?? 4)) / 4; // a quarter note's length, for measured tremolo
      timeline.push(hs ? { t0: t, t1: t + dur + extra, stepDur, spb: spbS, quarter, holds: hs } : { t0: t, t1: t + dur, stepDur: dur / spbS, spb: spbS, quarter });
      t += dur + extra;
    }
  }
  const timeAt = (barIdx, step) => {
    let b = barIdx, s = step;
    while (b < timeline.length - 1 && s >= timeline[b].spb) {
      s -= timeline[b].spb;
      b++;
    }
    if (b >= timeline.length) b = timeline.length - 1;
    const bar = timeline[b];
    if (!bar.holds) return bar.t0 + s * bar.stepDur;
    // held steps last f times as long: add their extra time for the part of each hold before this step
    let x = s * bar.stepDur;
    for (const h of bar.holds) x += Math.max(0, Math.min(s, h.s + h.n) - h.s) * bar.stepDur * (h.f - 1);
    return bar.t0 + x;
  };
  const parts = {};
  for (const p of Object.keys(song.parts)) parts[p] = { events: [], dyn: [] };
  const pedal = [];
  const lastChord = {}; // per part: the events of its last note or chord, for holds that cross into the next section
  const lines = {};
  const resolve = (raw, secName, partName, depth = 0) => {
    if (typeof raw === 'function') raw = raw(song);
    const m = /^@(\w+)\.(\w+)([+-]\d+)?$/.exec(raw.trim());
    if (!m) return raw;
    if (depth > 4) {
      problem(`${secName}.${partName}: reference loop`, 'left silent');
      return '';
    }
    const target = song.sections[m[1]]?.parts?.[m[2]];
    if (target == null) {
      problem(`${secName}.${partName}: unknown reference ${raw}`, 'left silent');
      return '';
    }
    return transposeLine(resolve(target, m[1], m[2], depth + 1), Number(m[3] ?? 0));
  };
  starts.forEach(({ name, bar0, spb, beats: secBeats }) => {
    const sec = song.sections[name];
    if (sec.chords) {
      const pc = parseChords(sec.chords, spb, `${name}.chords`);
      for (const e of pc.errors) problem(e, 'left out');
      if (pc.bars !== sec.bars) problem(`${name}.chords: ${pc.bars} bars, section has ${sec.bars}`, 'the critic reads the bars there are');
    }
    for (const [p, raw] of Object.entries(sec.parts ?? {})) {
      const part = song.parts[p];
      if (!part) {
        problem(`${name}: unknown part "${p}"`, 'left out');
        continue;
      }
      const inst = song.instruments[part.inst];
      if (!inst) {
        problem(`part ${p}: unknown instrument "${part.inst}"`, 'left out');
        continue;
      }
      const drum = inst.type === 'drums' || inst.type === 'perc' || (inst.type === 'chip' && inst.ch === 'noise');
      const text = resolve(raw, name, p);
      lines[`${name}.${p}`] = text;
      const res = parseLine(text, { spb, drum, where: `${name}.${p}`, lenient });
      errors.push(...res.errors);
      repairs.push(...res.repairs);
      if (!res.bars) continue;
      // a line shorter than its section repeats to fill it (a one-bar drum pattern); with `lenient`, one that does not
      // divide it repeats and stops where the section ends, and one that is longer is cut there
      if (sec.bars % res.bars !== 0) {
        problem(`${name}.${p}: ${res.bars} bars do not fill the section's ${sec.bars}`, res.bars > sec.bars ? `cut after bar ${sec.bars}` : 'repeated to fill it');
        if (!lenient) continue;
      }
      for (let rep = 0; rep < Math.ceil(sec.bars / res.bars); rep++) {
        const barOff = bar0 + rep * res.bars;
        if (res.lead) {
          const held = lastChord[p];
          if (!held) problem(`${name}.${p}: starts with "-" but nothing is held from the section before`, 'the hold left out');
          else {
            const add = timeAt(barOff, res.lead) - timeAt(barOff, 0);
            for (const ev of held) ev.dur += add;
          }
        }
        res.events.forEach((e, k) => {
          if (e.bar + rep * res.bars >= sec.bars) return; // past the section's end (a line that does not divide it)
          const group = [];
          const t0 = timeAt(barOff, e.step);
          const t1 = timeAt(barOff, e.step + e.steps);
          // an arpeggiated chord (&) rolls from its lowest note up, 35 ms a note, all ending together
          const roll = e.art.includes('&') && e.notes.length > 1 ? Math.min(0.035, (t1 - t0) / (2 * e.notes.length)) : 0;
          const order = roll ? e.notes.map((n, i) => i).sort((a, b) => e.notes[a] - e.notes[b]) : null;
          e.notes.forEach((nt, ci) => {
            const delay = roll ? order.indexOf(ci) * roll : 0;
            group.push({
              t: t0 + delay, dur: Math.max(0.01, t1 - t0 - delay), midi: drum ? null : nt, drum: drum ? nt : null, vel: e.vel, art: e.art,
              ci, cn: e.notes.length, grace: ci === 0 ? e.grace : null, vowel: e.vowel, ...(e.tech ? { tech: e.tech } : {}), ...(e.syl ? { syl: e.syl } : {}),
              quarter: timeline[Math.min(timeline.length - 1, barOff + Math.floor(e.step / spb))].quarter, where: `${name} bar ${e.bar + 1 + rep * res.bars}`, sec: name, barInSec: e.bar + rep * res.bars, step: e.step % spb, spb, beats: secBeats,
              seed: hash(`${song.seed ?? 1}:${p}:${name}:${rep}:${k}:${ci}`),
            });
          });
          parts[p].events.push(...group);
          lastChord[p] = group;
        });
      }
    }
    if (sec.pedal) {
      const res = parseLine(sec.pedal, { spb, drum: true, where: `${name}.pedal`, lenient });
      errors.push(...res.errors);
      repairs.push(...res.repairs);
      if (res.bars && sec.bars % res.bars !== 0) problem(`${name}.pedal: ${res.bars} bars do not fill the section's ${sec.bars}`, 'no pedal in this section');
      else if (res.bars) {
        for (let rep = 0; rep < sec.bars / res.bars; rep++) {
          for (const e of res.events) {
            if (e.notes[0] !== 'P' && e.notes[0] !== 'U') problem(`${name}.pedal: "${e.notes[0]}" is not P or U`, 'left out');
            else pedal.push({ t: timeAt(bar0 + rep * res.bars, e.step), type: e.notes[0] });
          }
        }
      }
    }
    const dynEntries = Object.entries(sec.dyn ?? {}).flatMap(([p, line]) =>
      p === '*' ? Object.keys(sec.parts ?? {}).map((q) => [q, line]) : [[p, line]]); // '*' = every part in the section
    for (const [p, line] of dynEntries) {
      if (!parts[p]) {
        problem(`${name}.dyn: unknown part "${p}"`, 'left out');
        continue;
      }
      parts[p].dyn.push(...dynPoints(line, timeline.slice(bar0, bar0 + sec.bars), `${name}.dyn.${p}`, lenient ? repairs : errors, lenient));
    }
  });
  // finish events: sort, humanize, next/prev, level
  for (const [p, P] of Object.entries(parts)) {
    const part = song.parts[p];
    const lv = curve(P.dyn, part.level ?? 0.7);
    // song.dynamics stretches the range between the marks (1: pp to ff is about 17 dB; 1.4: about 24 dB, as an
    // orchestra in a hall), keeping ff where it is
    const k = song.dynamics ?? 1;
    P.levelAt = k === 1 ? lv : (t) => clamp(1 - (1 - lv(t)) * k, 0, 1);
    const hz = part.humanize ?? 0;
    for (const e of P.events) {
      const h = (((e.seed >>> 8) % 1000) / 1000 - 0.5) * 2;
      const hv = (((e.seed >>> 3) % 1000) / 1000 - 0.5) * 2;
      if (hz) e.t = Math.max(0, e.t + h * hz);
      if (part.shift) e.t = Math.max(0, e.t + part.shift);
      e.vel = clamp(e.vel * (1 + hv * (part.velVar ?? 0.06)), 0.05, 1);
      e.pan = part.pan ?? 0;
    }
    P.events.sort((a, b) => a.t - b.t || a.ci - b.ci);
    const onsets = [...new Set(P.events.map((e) => e.t))].sort((a, b) => a - b);
    let prev = null, oi = 0;
    for (const e of P.events) {
      while (oi < onsets.length && onsets[oi] <= e.t + 1e-6) oi++;
      e.next = oi < onsets.length ? onsets[oi] - e.t : Infinity;
      e.level = P.levelAt(e.t);
      if (e.ci === 0) {
        e.prevMidi = prev ? prev.midi : null;
        e.legato = !!prev && Math.abs(prev.t + prev.dur - e.t) < 0.01;
        if (e.legato && e.art.includes('_')) prev.slurNext = true; // the next note is slurred to this one: it takes over
        prev = e;
      }
    }
  }
  const triggers = (p, token) => (parts[p]?.events ?? []).filter((e) => !token || e.drum === token).map((e) => e.t);
  pedal.sort((a, b) => a.t - b.t);
  /**
   * When a key released at `keyUp` is damped: at once with the pedal up, else at the pedal's next lift. A press
   * comes down PEDAL_CATCH seconds after its step (legato pedalling: the foot follows the new notes), so a key
   * released with the change is damped, not carried into the next harmony.
   */
  const damperAt = (keyUp) => {
    let lo = 0, hi = pedal.length; // first event after keyUp
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pedal[mid].t <= keyUp + 1e-6) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0 && pedal[lo - 1].type === 'P' && keyUp < pedal[lo - 1].t + PEDAL_CATCH) return keyUp;
    const down = lo > 0 && pedal[lo - 1].type === 'P';
    if (!down) return keyUp;
    return lo < pedal.length ? pedal[lo].t : Infinity;
  };
  return { duration: t, timeline, parts, lines, errors, repairs, triggers, spb: spbSong, beats, starts, pedal, damperAt };
}

// ---------------------------------------------------------------------------------------------------------------
// The score critic: the checks an agent runs before anyone renders audio.
// ---------------------------------------------------------------------------------------------------------------
export function critic(song, arr = arrange(song)) {
  // what the arranger had to repair comes first: the score plays, but not as written
  const warnings = (arr.repairs ?? []).map((r) => `repaired: ${r}`);
  const report = {};
  const spb = arr.spb;
  const beatSteps = spb / arr.beats;
  const chordMap = {};
  // chord positions on each section's own grid (an imported section may use 12, 24 or 48 steps a bar)
  for (const [name, sec] of Object.entries(song.sections)) if (sec.chords) chordMap[name] = parseChords(sec.chords, sec.grid ?? spb).chords;
  for (const [p, P] of Object.entries(arr.parts)) {
    const part = song.parts[p];
    const inst = song.instruments[part.inst];
    const notes = P.events.filter((e) => e.midi != null);
    const r = { events: P.events.length };
    if (notes.length) {
      const range = part.range ? part.range.map(noteToMidi) : inst.rangeName ? RANGES[inst.rangeName] : null;
      const lo = Math.min(...notes.map((e) => e.midi)), hi = Math.max(...notes.map((e) => e.midi));
      r.range = `${midiToName(lo)}-${midiToName(hi)}`;
      if (range) {
        const out = notes.filter((e) => e.midi < range[0] || e.midi > range[1]);
        if (out.length) warnings.push(`${p}: ${out.length} note${out.length === 1 ? "" : "s"} outside ${midiToName(range[0])}-${midiToName(range[1])}, e.g. ${midiToName(out[0].midi)} at ${out[0].where}`);
      }
      if (part.role === 'harmony' || part.role === 'bass' || part.role === 'melody') {
        let on = 0, hits = 0;
        const bad = [];
        for (const e of notes) {
          if (e.step % ((e.spb ?? spb) / (e.beats ?? arr.beats)) !== 0 || e.ci > 0) continue;
          const cs = chordMap[e.sec];
          if (!cs) continue;
          const c = cs.filter((x) => x.step <= e.barInSec * (e.spb ?? spb) + e.step).pop();
          if (!c?.chord) continue;
          on++;
          const ok = part.role === 'bass' ? e.midi % 12 === c.chord.bass || c.chord.tones.includes(e.midi % 12) : c.chord.tones.includes(e.midi % 12);
          if (ok) hits++;
          else bad.push(`${midiToName(e.midi)} over ${c.chord.sym} (${e.where})`);
        }
        if (on) {
          r.chordTones = `${Math.round((100 * hits) / on)}% of on-beat notes`;
          const floor = part.role === 'melody' ? 0.6 : 0.85;
          if (hits / on < floor) warnings.push(`${p}: only ${r.chordTones} are chord tones; e.g. ${bad.slice(0, 3).join('; ')}`);
        }
      }
    }
    report[p] = r;
  }
  // variety: share of distinct bars per part line
  for (const [key, text] of Object.entries(arr.lines)) {
    const bars = text.split('|').map((b) => b.trim()).filter(Boolean);
    if (bars.length >= 4) {
      const uniq = new Set(bars).size;
      if (uniq === 1 && !/drum|perc|hat|kick|noise/.test(key)) warnings.push(`${key}: all ${bars.length} bars identical`);
    }
  }
  return { warnings, report };
}
