// score.mjs: the text format, its validators, chord symbols, generators, arrangement and the score critic.
//
// A part line is bars of tokens separated by `|`. Steps are grid units (16 per 4/4 bar by default).
//   C4  F#3  Bb2      a note, 1 step          C4:4        a note held 4 steps
//   [D3 F3 A3]:8      a chord, 8 steps        .  .:4      a rest (1 or 4 steps)
//   -   -:3           extend the previous note
//   suffixes: ! accent  ? ghost  ^ staccato / palm mute  _ legato  ~ roll / tremolo
//   {G#4 A4}B4:2      grace notes, played quickly just before the note or chord they precede
//   C5:4@o            the vowel a voice sings (a e i o u); it carries on through held notes
// Drum lines use kit tokens instead of notes:  k . h . s . h k | ...
// Pedal lines (a section's `pedal`) use P (press, or lift and press again) and U (lift):  | P . . . . . P . . . . . |
// Dynamics lines give one marking per bar, optional hairpin to the next marked bar:  | p< | - | mf | f> | p |
import { hash, DYN, clamp } from './dsp.mjs';
import { RANGES } from './instruments.mjs';

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
const PARTS_RE = /^(?:\{([^}]*)\})?(\[[^\]]*\]|[^:!?^_~{}@]+)(?::(\d+))?([!?^_~]*)(?:@([aeiou]))?$/;

/** Parse one part line into events with step positions. Returns errors instead of throwing, so a checker can list them all. */
export function parseLine(line, { spb = 16, drum = false, where = '' } = {}) {
  const clean = line
    .split('\n')
    .map((l) => l.replace(/(^|\s)#.*$/, '')) // comments start with " #" (a sharp in F#5 has no space before it)
    .join(' ');
  const tokens = clean.match(TOKEN_RE) || [];
  const events = [];
  const errors = [];
  let step = 0, barStart = 0, bar = 0, last = null, sawBarLine = false, lead = 0;
  for (const tok of tokens) {
    if (tok === '|') {
      if (step > barStart) {
        const len = step - barStart;
        if (len !== spb) errors.push(`${where} bar ${bar + 1}: ${len} steps, expected ${spb} (${len < spb ? 'missing ' + (spb - len) : (len - spb) + ' too many'})`);
        bar++;
        barStart = step;
      }
      sawBarLine = true;
      continue;
    }
    const m = PARTS_RE.exec(tok);
    if (!m) {
      errors.push(`${where} bar ${bar + 1}: can't read "${tok}"`);
      continue;
    }
    const [, graceS, body, lenS, arts, vowel] = m;
    const len = lenS ? Number(lenS) : 1;
    if (body === '.') {
      step += len;
      last = null;
      continue;
    }
    if (body === '-') {
      if (last) last.steps += len;
      else if (step === lead) lead += len; // a note held over from the section before
      else errors.push(`${where} bar ${bar + 1}: "-" with no note before it`);
      step += len;
      continue;
    }
    let notes;
    if (drum) notes = [body];
    else if (body.startsWith('[')) notes = body.slice(1, -1).trim().split(/\s+/).map(noteToMidi);
    else notes = [noteToMidi(body)];
    if (!drum && notes.some((x) => x == null)) {
      errors.push(`${where} bar ${bar + 1}: bad note in "${tok}"`);
      step += len;
      continue;
    }
    let grace = null;
    if (graceS != null) {
      grace = graceS.trim().split(/\s+/).filter(Boolean).map(noteToMidi);
      if (drum || grace.some((x) => x == null)) {
        errors.push(`${where} bar ${bar + 1}: bad grace notes in "${tok}"`);
        grace = null;
      }
    }
    const vel = arts.includes('!') ? 1 : arts.includes('?') ? 0.42 : 0.8;
    const ev = { step, steps: len, notes, art: arts, vel, bar, grace, vowel: vowel ?? null };
    events.push(ev);
    last = ev;
    step += len;
  }
  if (step > barStart) {
    const len = step - barStart;
    if (!sawBarLine && step > spb) errors.push(`${where}: ${step} steps with no bar lines; write | between bars`);
    else if (len !== spb) errors.push(`${where} bar ${bar + 1}: ${len} steps, expected ${spb}`);
    bar++;
  }
  return { events, bars: bar, steps: step, errors, lead };
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
function dynPoints(line, barTimes, where, errors) {
  const cells = line.split('|').map((c) => c.trim()).filter((c, i, a) => c.length || (i > 0 && i < a.length - 1));
  const pts = [];
  let prevLevel = null, hair = false;
  cells.forEach((c, i) => {
    const bt = barTimes[i];
    if (!bt) return errors.push(`${where}: more dynamics bars than the section has`);
    if (c === '-' || c === '') {
      if (!hair && prevLevel != null) pts.push([bt.t0, prevLevel], [bt.t1 - 1e-3, prevLevel]);
      return;
    }
    const m = /^(ppp|pp|p|mp|mf|f|ff|fff)([<>]?)$/.exec(c);
    if (!m) return errors.push(`${where} bar ${i + 1}: bad dynamic "${c}"`);
    const lv = DYN[m[1]];
    pts.push([bt.t0, lv]);
    hair = !!m[2];
    if (!hair) pts.push([bt.t1 - 1e-3, lv]);
    prevLevel = lv;
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
export function arrange(song) {
  const spbSong = song.grid ?? 16;
  const beats = song.meter?.[0] ?? 4;
  const errors = [];
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
      if (cells.length !== sec.bars) errors.push(`${name}.tempo: ${cells.length} bars, section has ${sec.bars}`);
      let last = sec.bpm ?? song.bpm;
      tempos = cells.map((c) => (c === '-' ? last : (last = Number(c))));
      if (tempos.some((x) => !(x > 0))) errors.push(`${name}.tempo: bad tempo in "${sec.tempo}"`);
    }
    starts.push({ name, bar0: timeline.length, spb: spbS, beats: beatsS });
    for (let b = 0; b < sec.bars; b++) {
      const bpm = tempos?.[b] ?? (sec.rit ? sec.rit[0] + ((sec.rit[1] - sec.rit[0]) * b) / Math.max(1, sec.bars - 1) : sec.bpm ?? song.bpm);
      const dur = (60 / bpm) * beatsS;
      timeline.push({ t0: t, t1: t + dur, stepDur: dur / spbS, spb: spbS });
      t += dur;
    }
  }
  const timeAt = (barIdx, step) => {
    let b = barIdx, s = step;
    while (b < timeline.length - 1 && s >= timeline[b].spb) {
      s -= timeline[b].spb;
      b++;
    }
    if (b >= timeline.length) b = timeline.length - 1;
    return timeline[b].t0 + s * timeline[b].stepDur;
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
      errors.push(`${secName}.${partName}: reference loop`);
      return '';
    }
    const target = song.sections[m[1]]?.parts?.[m[2]];
    if (target == null) {
      errors.push(`${secName}.${partName}: unknown reference ${raw}`);
      return '';
    }
    return transposeLine(resolve(target, m[1], m[2], depth + 1), Number(m[3] ?? 0));
  };
  starts.forEach(({ name, bar0, spb, beats: secBeats }) => {
    const sec = song.sections[name];
    if (sec.chords) {
      const pc = parseChords(sec.chords, spb, `${name}.chords`);
      errors.push(...pc.errors);
      if (pc.bars !== sec.bars) errors.push(`${name}.chords: ${pc.bars} bars, section has ${sec.bars}`);
    }
    for (const [p, raw] of Object.entries(sec.parts ?? {})) {
      const part = song.parts[p];
      if (!part) {
        errors.push(`${name}: unknown part "${p}"`);
        continue;
      }
      const inst = song.instruments[part.inst];
      if (!inst) {
        errors.push(`part ${p}: unknown instrument "${part.inst}"`);
        continue;
      }
      const drum = inst.type === 'drums' || inst.type === 'perc' || (inst.type === 'chip' && inst.ch === 'noise');
      const text = resolve(raw, name, p);
      lines[`${name}.${p}`] = text;
      const res = parseLine(text, { spb, drum, where: `${name}.${p}` });
      errors.push(...res.errors);
      if (!res.bars) continue;
      if (sec.bars % res.bars !== 0) {
        errors.push(`${name}.${p}: ${res.bars} bars do not fill the section's ${sec.bars}`);
        continue;
      }
      for (let rep = 0; rep < sec.bars / res.bars; rep++) {
        const barOff = bar0 + rep * res.bars;
        if (res.lead) {
          const held = lastChord[p];
          if (!held) errors.push(`${name}.${p}: starts with "-" but nothing is held from the section before`);
          else {
            const add = timeAt(barOff, res.lead) - timeAt(barOff, 0);
            for (const ev of held) ev.dur += add;
          }
        }
        res.events.forEach((e, k) => {
          const group = [];
          const t0 = timeAt(barOff, e.step);
          const t1 = timeAt(barOff, e.step + e.steps);
          e.notes.forEach((nt, ci) => {
            group.push({
              t: t0, dur: Math.max(0.01, t1 - t0), midi: drum ? null : nt, drum: drum ? nt : null, vel: e.vel, art: e.art,
              ci, cn: e.notes.length, grace: ci === 0 ? e.grace : null, vowel: e.vowel, where: `${name} bar ${e.bar + 1 + rep * res.bars}`, sec: name, barInSec: e.bar + rep * res.bars, step: e.step % spb, spb, beats: secBeats,
              seed: hash(`${song.seed ?? 1}:${p}:${name}:${rep}:${k}:${ci}`),
            });
          });
          parts[p].events.push(...group);
          lastChord[p] = group;
        });
      }
    }
    if (sec.pedal) {
      const res = parseLine(sec.pedal, { spb, drum: true, where: `${name}.pedal` });
      errors.push(...res.errors);
      if (res.bars && sec.bars % res.bars !== 0) errors.push(`${name}.pedal: ${res.bars} bars do not fill the section's ${sec.bars}`);
      else if (res.bars) {
        for (let rep = 0; rep < sec.bars / res.bars; rep++) {
          for (const e of res.events) {
            if (e.notes[0] !== 'P' && e.notes[0] !== 'U') errors.push(`${name}.pedal: "${e.notes[0]}" is not P or U`);
            else pedal.push({ t: timeAt(bar0 + rep * res.bars, e.step), type: e.notes[0] });
          }
        }
      }
    }
    const dynEntries = Object.entries(sec.dyn ?? {}).flatMap(([p, line]) =>
      p === '*' ? Object.keys(sec.parts ?? {}).map((q) => [q, line]) : [[p, line]]); // '*' = every part in the section
    for (const [p, line] of dynEntries) {
      if (!parts[p]) {
        errors.push(`${name}.dyn: unknown part "${p}"`);
        continue;
      }
      parts[p].dyn.push(...dynPoints(line, timeline.slice(bar0, bar0 + sec.bars), `${name}.dyn.${p}`, errors));
    }
  });
  // finish events: sort, humanize, next/prev, level
  for (const [p, P] of Object.entries(parts)) {
    const part = song.parts[p];
    P.levelAt = curve(P.dyn, part.level ?? 0.7);
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
        prev = e;
      }
    }
  }
  const triggers = (p, token) => (parts[p]?.events ?? []).filter((e) => !token || e.drum === token).map((e) => e.t);
  pedal.sort((a, b) => a.t - b.t);
  /** When a key released at `keyUp` is damped: at once with the pedal up, else at the pedal's next lift. */
  const damperAt = (keyUp) => {
    let lo = 0, hi = pedal.length; // first event after keyUp
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pedal[mid].t <= keyUp + 1e-6) lo = mid + 1;
      else hi = mid;
    }
    const down = lo > 0 && pedal[lo - 1].type === 'P';
    if (!down) return keyUp;
    return lo < pedal.length ? pedal[lo].t : Infinity;
  };
  return { duration: t, timeline, parts, lines, errors, triggers, spb: spbSong, beats, starts, pedal, damperAt };
}

// ---------------------------------------------------------------------------------------------------------------
// The score critic: the checks an agent runs before anyone renders audio.
// ---------------------------------------------------------------------------------------------------------------
export function critic(song, arr = arrange(song)) {
  const warnings = [];
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
