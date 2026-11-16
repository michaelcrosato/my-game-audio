// midi.mjs: Standard MIDI Files in and out. Import turns a MIDI file into a song through the same layout as the
// MusicXML importer (presets, tempo, dynamics, lanes, sections); export writes a song's notes for a DAW: a tempo
// track, then one track per part with its General MIDI program, drums on channel 10.
//
//   const { song, text, report } = importMidi(bytes, { title, grid });   // grid: steps per quarter, or detected
//   const bytes = exportMidi(song);                                       // a format 1 .mid file
import PRESETS from './orchestra-presets.json' with { type: 'json' };
import { arrange } from './score.mjs';
import { buildSong } from './musicxml.mjs';

const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
const midiName = (m) => `${NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
const lcm = (a, b) => (a / gcd(a, b)) * b;

// General MIDI drums to kit tokens, and the band kit they play on (synthesized: engine/instruments.mjs `hit`)
export const GM_DRUM = {
  35: 'k', 36: 'k', 37: 'rim', 38: 's', 39: 'clap', 40: 's', 41: 't3', 43: 't3', 45: 't2', 47: 't2', 48: 't1', 50: 't1',
  42: 'h', 44: 'h', 46: 'o', 49: 'c', 52: 'c', 55: 'c', 57: 'c', 51: 'r', 59: 'r', 53: 'bell', 54: 'tamb', 56: 'cb',
};
export const GM_KIT = {
  type: 'drums', gain: 1,
  kit: {
    k: { type: 'kick', f0: 55, f1: 130, pd: 0.03, d: 0.3, click: 0.6, thump: 0.3, gain: 1.0 },
    s: { type: 'snare', tone: [190, 330], td: 0.15, nd: 0.2, nf: [1500, 10000], snap: 0.7, bodyMix: 0.6, noiseMix: 0.85, gain: 0.85 },
    rim: { type: 'snare', tone: [420, 900], td: 0.04, nd: 0.03, nf: [2000, 9000], snap: 1, bodyMix: 0.9, noiseMix: 0.3, gain: 0.6 },
    clap: { type: 'clap', d: 0.16, gain: 0.7 },
    t1: { type: 'tom', f0: 170, f1: 230, pd: 0.05, d: 0.45, thump: 0.25, gain: 0.75, pan: -0.25 },
    t2: { type: 'tom', f0: 125, f1: 170, pd: 0.05, d: 0.5, thump: 0.25, gain: 0.75, pan: 0.1 },
    t3: { type: 'tom', f0: 88, f1: 118, pd: 0.06, d: 0.6, thump: 0.25, gain: 0.8, pan: 0.3 },
    h: { type: 'metal', d: 0.07, bp: 9000, hp: 6500, metal: 0.55, gain: 0.3, pan: 0.3 },
    o: { type: 'metal', d: 0.35, bp: 8500, hp: 6000, metal: 0.55, gain: 0.3, pan: 0.3 },
    c: { type: 'metal', d: 1.8, bp: 6000, hp: 3000, q: 0.5, metal: 0.4, scale: 1.4, gain: 0.45, pan: -0.35 },
    r: { type: 'metal', d: 1.1, bp: 5500, hp: 3500, q: 0.7, metal: 0.6, scale: 1.7, gain: 0.28, pan: -0.3 },
    bell: { type: 'metal', d: 0.8, bp: 4000, hp: 2500, q: 1.5, metal: 0.8, scale: 2.2, gain: 0.25, pan: -0.3 },
    tamb: { type: 'noise', bp: 7000, q: 1.2, d: 0.12, gain: 0.35, pan: 0.2 },
    cb: { type: 'bell', partials: [[540, 1, 0.25], [800, 0.6, 0.18]], noise: 0.2, gain: 0.35 },
  },
};
// the same tokens on the NES noise channel, for songs of chip instruments (a period, or a sweep of them, and a volume
// envelope per hit, as songs/chiptune.mjs plays them)
export const CHIP_KIT = {
  type: 'chip', ch: 'noise', gain: 0.5,
  kit: {
    k: { period: [11, 12, 13, 14, 14], vol: [15, 11, 7, 4, 2] },
    s: { period: [6, 5, 7, 8, 8, 9], vol: [14, 12, 10, 9, 7, 6, 4, 3, 2, 1] },
    rim: { period: 4, vol: [11, 6, 2] },
    clap: { period: [5, 6, 5, 6], vol: [12, 7, 11, 8, 5, 3, 1] },
    t1: { period: [9, 10, 11, 12], vol: [13, 10, 7, 4, 2] },
    t2: { period: [10, 11, 12, 13], vol: [13, 10, 7, 4, 2] },
    t3: { period: [11, 12, 13, 14], vol: [14, 11, 8, 5, 2] },
    h: { period: 1, vol: [7, 4, 2] },
    o: { period: 1, vol: [7, 6, 5, 4, 3, 3, 2, 2, 1, 1] },
    c: { period: 2, vol: [10, 9, 8, 7, 6, 5, 5, 4, 4, 3, 3, 2, 2, 1, 1] },
    r: { period: 1, vol: [6, 5, 4, 3, 2, 1] },
    bell: { period: 1, vol: [6, 4, 2, 1] },
    tamb: { period: 1, vol: [8, 5, 3, 1] },
    cb: { period: 3, vol: [9, 6, 3, 1] },
  },
};
/** Give an imported song's drum part the band kit, or the chip noise channel in a chip song (report.room). */
export function useDrumKit(r) {
  if (!r.song.instruments.percussion) return;
  const kit = r.report.room === 'chip' ? CHIP_KIT : GM_KIT;
  r.song.instruments.percussion = kit;
  r.text = r.text.replace(/("percussion": )\{"type": "perc"[^]*?"rangeName": "percussion"\}/, `$1${JSON.stringify(kit)}`);
}
// kit tokens back to General MIDI: the band kit above, the chip noise channel's, the orchestral percussion's
const TOKEN_GM = { k: 36, s: 38, rim: 37, clap: 39, t1: 50, t2: 47, t3: 43, h: 42, o: 46, c: 49, r: 51, bell: 53, tamb: 54, cb: 56, bd: 35, sd: 38, cym: 49, scym: 55, tri: 81, tam: 52, wb: 76, cast: 85, sleigh: 83, cowbell: 56, whip: 39, p: 39, x: 42 };
// instruments that are not orchestra presets: a General MIDI program by synthesis type
const TYPE_GM = { chip: 80, va: 81, fm: 4, pluck: 25, strings: 48, brass: 61, choir: 52, modal: 47, piano: 0, wind: 73, organ: 19, ensemble: 48 };

// ---------------------------------------------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------------------------------------------
/** Parse a Standard MIDI File: { format, ppq, tracks: [{ name, events: [{ tick, type, ... }] }] }. */
export function parseMidi(input) {
  const b = input instanceof Uint8Array ? input : new Uint8Array(input);
  let p = 0;
  const u32 = () => ((b[p++] << 24) | (b[p++] << 16) | (b[p++] << 8) | b[p++]) >>> 0;
  const u16 = () => (b[p++] << 8) | b[p++];
  const str = (n) => String.fromCharCode(...b.subarray(p, (p += n)));
  const vlq = () => {
    let v = 0, c;
    do {
      c = b[p++];
      v = (v << 7) | (c & 0x7f);
    } while (c & 0x80);
    return v;
  };
  if (str(4) !== 'MThd') throw new Error('not a MIDI file');
  const hlen = u32();
  const format = u16(), ntr = u16(), div = u16();
  p = 8 + hlen;
  if (div & 0x8000) throw new Error('SMPTE time division is not supported');
  const tracks = [];
  for (let t = 0; t < ntr && p < b.length; t++) {
    const id = str(4), len = u32(), end = p + len;
    if (id !== 'MTrk') {
      p = end;
      continue;
    }
    const events = [];
    let tick = 0, status = 0, name = null;
    while (p < end) {
      tick += vlq();
      let s = b[p];
      if (s & 0x80) p++;
      else s = status; // running status
      const hi = s & 0xf0, ch = s & 0x0f;
      if (s === 0xff) {
        const type = b[p++], l = vlq(), data = b.subarray(p, p + l);
        p += l;
        if (type === 0x51) events.push({ tick, type: 'tempo', us: (data[0] << 16) | (data[1] << 8) | data[2] });
        else if (type === 0x58) events.push({ tick, type: 'meter', num: data[0], den: 2 ** data[1] });
        else if (type === 0x03 && name === null) name = new TextDecoder().decode(data).trim();
        else if (type === 0x2f) break;
      } else if (s === 0xf0 || s === 0xf7) p += vlq();
      else {
        status = s;
        if (hi === 0x90 || hi === 0x80) {
          const note = b[p++], vel = b[p++];
          events.push({ tick, type: hi === 0x90 && vel > 0 ? 'on' : 'off', ch, note, vel });
        } else if (hi === 0xc0) events.push({ tick, type: 'program', ch, program: b[p++] });
        else if (hi === 0xb0) {
          events.push({ tick, type: 'cc', ch, cc: b[p], value: b[p + 1] });
          p += 2;
        } else if (hi === 0xd0) p++;
        else p += 2; // aftertouch, pitch bend
      }
    }
    p = end;
    tracks.push({ name, events });
  }
  return { format, ppq: div, tracks };
}

const levelOf = (v) => (v >= 112 ? 'ff' : v >= 96 ? 'f' : v >= 80 ? 'mf' : v >= 64 ? 'mp' : v >= 48 ? 'p' : v >= 32 ? 'pp' : 'ppp');

/**
 * Import a MIDI file as a song (through the MusicXML importer's layout). Options: title, key, source, tempo, bars,
 * grid (steps per quarter note to snap to; detected from the notes by default), pedal ('bass': without controller 64,
 * pedal with the bass), log. Returns { song, text, report }.
 */
export function importMidi(input, opt = {}) {
  const mid = parseMidi(input);
  const ppq = mid.ppq;
  // collect notes per track and channel, and the tempo and meter maps
  const tempos = [], meters = [], pedalEv = [];
  const groups = new Map();
  mid.tracks.forEach((tr, ti) => {
    const program = new Array(16).fill(0), open = new Map();
    for (const e of tr.events) {
      if (e.type === 'tempo') tempos.push(e);
      else if (e.type === 'meter') meters.push(e);
      else if (e.type === 'program') program[e.ch] = e.program;
      else if (e.type === 'cc' && e.cc === 64) pedalEv.push({ tick: e.tick, down: e.value >= 64 });
      else if (e.type === 'on') {
        const k = `${e.ch}:${e.note}`;
        if (!open.has(k)) open.set(k, []);
        open.get(k).push({ tick: e.tick, vel: e.vel, program: program[e.ch] });
      } else if (e.type === 'off') {
        const st = open.get(`${e.ch}:${e.note}`);
        const on = st?.shift();
        if (!on) continue;
        const gk = `${ti}:${e.ch}`;
        if (!groups.has(gk)) groups.set(gk, { track: ti, ch: e.ch, name: tr.name, program: on.program, notes: [] });
        groups.get(gk).notes.push({ on: on.tick, off: Math.max(e.tick, on.tick + 1), note: e.note, vel: on.vel });
      }
    }
  });
  const all = [...groups.values()].flatMap((g) => g.notes);
  if (!all.length) throw new Error('the MIDI file has no notes');
  // the grid: the coarsest subdivision of the quarter note that nearly every onset and end falls on
  let grid = opt.grid;
  if (!grid) {
    // onsets: where a note ends is sloppy in played music, and it snaps to whatever grid the onsets choose
    const pts = all.map((n) => n.on);
    // a file written on a grid (by a notation program, or by exportMidi) fits one exactly; a played one is snapped to
    // the coarsest grid nearly all its notes are close to
    const fits = (k, tol) => pts.filter((t) => {
      const x = (t / ppq) * k;
      return Math.abs(x - Math.round(x)) * (ppq / k) <= tol;
    }).length;
    const K = [1, 2, 4, 3, 6, 8, 12, 16, 24, 32, 48];
    // otherwise the coarsest grid whose mean distance from the onsets is under 0.035 of a quarter note (about 17 ms
    // at 120 BPM: a player's looseness, not a different rhythm)
    const err = (k) => pts.reduce((a, t) => {
      const x = (t / ppq) * k;
      return a + Math.abs(x - Math.round(x)) / k;
    }, 0) / pts.length;
    grid = K.find((k) => fits(k, 0.5) === pts.length) ?? K.find((k) => err(k) <= 0.035) ?? 12;
  }
  const tpq = lcm(grid, 8);
  const snap = (t) => Math.round((t / ppq) * grid) * (tpq / grid);
  // measures from the meter map, to the end of the last note
  meters.sort((a, b) => a.tick - b.tick);
  const end = Math.max(...all.map((n) => snap(n.off)));
  const measures = [];
  let off = 0, mi = 0, num = 4, den = 4;
  while (off < end || measures.length === 0) {
    while (mi < meters.length && snap(meters[mi].tick) <= off) {
      num = meters[mi].num;
      den = meters[mi].den;
      mi++;
    }
    const length = Math.round((num * 4 * tpq) / den);
    measures.push({ number: measures.length + 1, suffix: '', offset: off, length, forward: false, backward: false, times: null, endings: [] });
    off += length;
  }
  const metros = tempos.map((t) => ({ off: snap(t.tick), number: Math.round((60e6 / t.us) * 100) / 100, referent: 1 }));
  if (!metros.length) metros.push({ off: 0, number: 120, referent: 1 });
  const parts = [...groups.values()].sort((a, b) => a.track - b.track || a.ch - b.ch).map((g, gi) => {
    const drums = g.ch === 9;
    let seq = 0;
    const notes = g.notes
      .map((n) => {
        const on = snap(n.on), dur = Math.max(tpq / grid, snap(n.off) - on);
        return {
          off: on, dur, grace: false, rest: false, voice: '1', pitches: [n.note], names: [midiName(n.note)], unpitched: drums,
          token: drums ? GM_DRUM[n.note] ?? 's' : undefined, tie: null, arts: [], exprs: [], lyric: null, seq: seq++, vel: n.vel,
        };
      })
      .sort((a, b) => a.off - b.off || a.seq - b.seq);
    // dynamics: a marking where the bar's average velocity moves to another level
    const dyns = [];
    let last = null;
    for (const m of measures) {
      const inBar = notes.filter((n) => n.off >= m.offset && n.off < m.offset + m.length);
      if (!inBar.length) continue;
      const lv = levelOf(inBar.reduce((a, n) => a + n.vel, 0) / inBar.length);
      if (lv !== last) dyns.push({ off: inBar[0].off, value: lv });
      last = lv;
    }
    return {
      id: `P${gi + 1}`, name: drums ? (g.name || 'Drums') : g.name || `Channel ${g.ch + 1}`, instName: null, instSound: drums ? 'drum.group' : null,
      program: drums ? null : g.program, measures, notes, dyns, words: [], wedges: [], metros: gi === 0 ? metros : [], keys: [],
    };
  });
  // the sustain pedal (controller 64): its presses and lifts; a lift and a press on one step is a change (P)
  const pedal = [];
  let down = false;
  for (const e of pedalEv.sort((x, y) => x.tick - y.tick)) {
    if (e.down === down) continue;
    down = e.down;
    const off = snap(e.tick), last = pedal[pedal.length - 1];
    if (down && last?.type === 'U' && last.off === off) last.type = 'P';
    else pedal.push({ off, type: down ? 'P' : 'U' });
  }
  const score = { tpq, parts, pedal, meta: { title: opt.title ?? null, composer: null } };
  const r = buildSong(score, { rooms: true, ...opt, fileName: opt.fileName ?? 'score.mid' }, opt.log);
  // drum parts play the General MIDI band kit, not the orchestra's percussion
  if (parts.some((p) => p.notes.some((n) => n.token))) useDrumKit(r);
  r.report.grid = grid;
  return r;
}

// ---------------------------------------------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------------------------------------------
function programOf(spec) {
  const rn = spec.rangeName;
  const p = rn && (PRESETS.instruments[rn] ?? Object.values(PRESETS.instruments).find((x) => x.aliases?.includes(rn)));
  if (p?.gm?.length) return p.gm[0];
  return TYPE_GM[spec.type] ?? 0;
}

/**
 * A song's notes as a Standard MIDI File (format 1, `ppq` ticks per quarter, default 480): a tempo track with the
 * tempo of every bar and the meter of every section, then one track per part, named, with its General MIDI program;
 * drum and percussion parts on channel 10. Velocities follow the notes' accents and the dynamics.
 */
export function exportMidi(song, { ppq = 480 } = {}) {
  // the score as written: humanizing and part shifts off, so every note lands on its grid
  const parts = Object.fromEntries(Object.entries(song.parts).map(([k, p]) => [k, { ...p, humanize: 0, shift: 0 }]));
  const s = { ...song, parts };
  const arr = arrange(s);
  if (arr.errors.length) throw new Error('score errors:\n  ' + arr.errors.join('\n  '));
  // each bar's start tick and length, its quarter notes per beat and its tempo
  const bars = [];
  let tick = 0;
  arr.starts.forEach((st, k) => {
    const sec = song.sections[st.name];
    const unit = sec.meter?.[1] ?? song.meter?.[1] ?? 4;
    const n = (arr.starts[k + 1]?.bar0 ?? arr.timeline.length) - st.bar0;
    for (let b = 0; b < n; b++) {
      const tb = arr.timeline[st.bar0 + b];
      const quarters = (st.beats * 4) / unit;
      const len = Math.round(quarters * ppq);
      bars.push({ t0: tb.t0, t1: tb.t1, tick, len, quarters, beats: st.beats, unit });
      tick += len;
    }
  });
  const tickAt = (t) => {
    let lo = 0, hi = bars.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (bars[mid].t0 <= t + 1e-9) lo = mid;
      else hi = mid - 1;
    }
    const bar = bars[lo];
    return bar.tick + Math.round(((t - bar.t0) / (bar.t1 - bar.t0)) * bar.len);
  };
  const tracks = [];
  // the tempo track: title, meter changes, tempo changes
  const t0 = [{ tick: 0, data: [0xff, 0x03, ...text(song.title ?? 'my-game-audio song')] }];
  let lastTempo = null, lastMeter = null;
  for (const bar of bars) {
    const us = Math.round(((bar.t1 - bar.t0) / bar.quarters) * 1e6);
    if (us !== lastTempo) t0.push({ tick: bar.tick, data: [0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255] });
    lastTempo = us;
    // a meter is whole beats over a power of two: a bar of 2.5 quarter notes is written 5/8
    let num = bar.beats, den = bar.unit;
    while (!Number.isInteger(num) && den < 64) {
      num *= 2;
      den *= 2;
    }
    num = Math.round(num);
    const meter = `${num}/${den}`;
    if (meter !== lastMeter) t0.push({ tick: bar.tick, data: [0xff, 0x58, 4, num, Math.round(Math.log2(den)), 24, 8] });
    lastMeter = meter;
  }
  tracks.push(t0);
  let ch = 0, pedalDone = false;
  for (const [name, part] of Object.entries(song.parts)) {
    const evs = arr.parts[name]?.events ?? [];
    if (!evs.length) continue;
    const spec = song.instruments[part.inst];
    const drums = evs.some((e) => e.drum != null);
    const c = drums ? 9 : ch;
    if (!drums) ch = ch + 1 === 9 ? 10 : (ch + 1) % 16;
    const tr = [{ tick: 0, data: [0xff, 0x03, ...text(name)] }];
    if (!drums) tr.push({ tick: 0, data: [0xc0 | c, programOf(spec)] });
    // the sustain pedal (controller 64) on the first piano's track; a change lifts and presses on one tick
    if (!pedalDone && spec?.type === 'piano' && arr.pedal.length) {
      let down = false;
      for (const p of arr.pedal) {
        const tk = tickAt(p.t);
        if (down || p.type === 'U') tr.push({ tick: tk, data: [0xb0 | c, 64, 0] });
        if (p.type === 'P') tr.push({ tick: tk, data: [0xb0 | c, 64, 127] });
        down = p.type === 'P';
      }
      pedalDone = true;
    }
    for (const e of evs) {
      const on = tickAt(e.t), off = Math.max(on + 1, tickAt(e.t + e.dur));
      const vel = Math.max(1, Math.min(127, Math.round(127 * e.vel * (0.35 + 0.65 * (e.level ?? 0.7)))));
      const note = drums ? TOKEN_GM[e.drum] ?? 38 : e.midi;
      // grace notes: a sixteenth of a quarter each, just before the note
      (e.grace ?? []).forEach((g, i, all) => {
        const gt = Math.max(0, on - (all.length - i) * (ppq / 16));
        tr.push({ tick: gt, data: [0x90 | c, g, vel] }, { tick: gt + ppq / 16, data: [0x80 | c, g, 0] });
      });
      tr.push({ tick: on, data: [0x90 | c, note, vel] }, { tick: drums ? on + ppq / 4 : off, data: [0x80 | c, note, 0] });
    }
    tracks.push(tr);
  }
  // bytes: header, then each track's events in time order (note-offs before note-ons at the same tick)
  const out = [...ascii('MThd'), 0, 0, 0, 6, 0, 1, (tracks.length >> 8) & 255, tracks.length & 255, (ppq >> 8) & 255, ppq & 255];
  for (const tr of tracks) {
    tr.sort((a, b) => a.tick - b.tick || isOn(a) - isOn(b));
    const body = [];
    let last = 0;
    for (const e of tr) {
      body.push(...vlq(e.tick - last), ...e.data);
      last = e.tick;
    }
    body.push(0, 0xff, 0x2f, 0);
    out.push(...ascii('MTrk'), (body.length >>> 24) & 255, (body.length >> 16) & 255, (body.length >> 8) & 255, body.length & 255, ...body);
  }
  return new Uint8Array(out);
}
const isOn = (e) => ((e.data[0] & 0xf0) === 0x90 ? 1 : 0);
const ascii = (s) => [...s].map((c) => c.charCodeAt(0));
function text(s) {
  const b = [...new TextEncoder().encode(s)];
  return [...vlq(b.length), ...b];
}
function vlq(n) {
  const out = [n & 0x7f];
  while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80);
  return out;
}
