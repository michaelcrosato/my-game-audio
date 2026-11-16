// loop.mjs: songs as game music. A cue is an optional intro and a loop body; it renders to a head (the intro and the
// first seconds of the body) and a loop that repeats with no gap and no click, each as one stem per layer.
//
// Why the loop is seamless by construction: the body renders once on its own, with a second of pre-roll before it and
// its whole tail after it (notes ringing, reverb decaying). Everything up to the master is a sum of parts and buses,
// so the steady sound of the body repeating forever is that render folded onto one period: the tail adds into the
// start, the pre-roll (grace notes before the downbeat) into the end. The folded signal is continuous across the
// seam because the render it came from is continuous. The head plays the intro with the body's first pass, unfolded,
// for as long as the tail lasts, and then the loop takes over at that same point of the body.
//
// The master chain (EQ, compressor, loudness, limiter) is not a sum, so it runs once over the head followed by
// copies of the loop, and the loop is cut from the last copy, where the compressor and limiter have settled. Their
// gain curves come from the whole mix and apply to every stem, so the stems always add up to the mix.
import { SR, db, hash } from './dsp.mjs';
import { arrange, critic } from './score.mjs';
import { mixParts, ringOf, busTail } from './render.mjs';
import { eq, compressGain, limitGain, lufs } from './fx.mjs';
import { VERSION } from './version.mjs';

const PRE = 1; // seconds of pre-roll before the body: grace notes and humanized notes may start before the downbeat
const now = () => (globalThis.performance ? performance.now() : Date.now());

/**
 * The cues of a song: name -> { intro: [section names], body: [section names] }. A song names them in `loops`
 * (`{ main: { intro: ['intro'], body: ['A', 'B'] }, tense: { body: ['C'] } }`), or gives one with `intro` and `loop`;
 * a song with neither loops its whole form.
 */
export function cuesOf(song) {
  if (song.loops) return Object.fromEntries(Object.entries(song.loops).map(([k, v]) => [k, { intro: v.intro ?? [], body: v.body }]));
  if (song.loop) return { main: { intro: song.intro ?? [], body: song.loop } };
  return { main: { intro: [], body: song.form } };
}

/**
 * The layers of a song: name -> [part names]. A song groups parts in `layers` (`{ drums: ['kick', 'hats'] }`);
 * parts in no layer form the layer `base`. A song without layers has one, `base`, with every part.
 */
export function layersOf(song) {
  const out = {};
  const taken = new Set();
  for (const [name, parts] of Object.entries(song.layers ?? {})) {
    for (const p of parts) if (!song.parts[p]) throw new Error(`layer ${name}: unknown part "${p}"`);
    out[name] = [...parts];
    parts.forEach((p) => taken.add(p));
  }
  const rest = Object.keys(song.parts).filter((p) => !taken.has(p));
  if (rest.length) out.base = [...(out.base ?? []), ...rest];
  return out;
}

/** Seconds of sound after the last note of a song: the longest ring of its instruments or tail of its buses. */
export function tailOf(song) {
  let t = song.tail ?? 3;
  for (const p of Object.values(song.parts)) t = Math.max(t, ringOf(song.instruments[p.inst]));
  for (const b of Object.values(song.buses ?? {})) t = Math.max(t, busTail(b, song.bpm));
  return t;
}

/** Bars of an arrangement as { t, dur, beats } (seconds from its start; beats per bar). */
function barsOf(arr) {
  const out = [];
  for (const s of arr.starts) {
    const n = (arr.starts.find((x) => x.bar0 > s.bar0)?.bar0 ?? arr.timeline.length) - s.bar0;
    for (let b = 0; b < n; b++) {
      const bar = arr.timeline[s.bar0 + b];
      out.push({ t: bar.t0, dur: bar.t1 - bar.t0, beats: s.beats, sec: s.name });
    }
  }
  return out;
}

/**
 * A song as plain data that can be posted to a worker, stored and hashed: part lines written as functions of the
 * song are called and replaced by the text they return.
 */
export function freeze(song) {
  const sections = {};
  for (const [name, sec] of Object.entries(song.sections)) {
    const parts = {};
    for (const [p, raw] of Object.entries(sec.parts ?? {})) parts[p] = typeof raw === 'function' ? raw(song) : raw;
    sections[name] = { ...sec, parts };
  }
  return JSON.parse(JSON.stringify({ ...song, sections }));
}

/** A key for rendered audio: changes with the song's content, the cue and the engine version. */
export function cueKey(song, cue = 'main') {
  const text = JSON.stringify(freeze(song));
  const a = hash(text), b = hash(text + '\u0001' + text.length);
  return `${VERSION}:${cue}:${a.toString(16).padStart(8, '0')}${b.toString(16).padStart(8, '0')}`;
}

// Samples needed to hold every note that starts in [t0, t1) with its whole sound, rendered `offset` seconds early.
// Instruments stop a note at the end of the buffer, and some draw random numbers per sample, so a note cut short
// would change how the next player of the same note sounds: windows always render long enough, then are cut.
function spanOf(song, arr, [t0, t1], offset, only) {
  let end = 0;
  for (const [p, part] of Object.entries(song.parts)) {
    if (only && !only.includes(p)) continue;
    const ring = ringOf(song.instruments[part.inst]);
    for (const e of arr.parts[p].events) if (e.t >= t0 && e.t < t1) end = Math.max(end, e.t - offset + e.dur + ring + 0.1);
  }
  return Math.ceil(end * SR);
}
// mixParts over a window, rendered long enough (see spanOf) and returned at length N (cut, or padded with silence)
function windowMix(song, arr, N, opts) {
  const full = Math.max(N, spanOf(song, arr, opts.range, opts.offset ?? 0, opts.only));
  const y = mixParts(song, arr, full, opts);
  return full === N ? y : { L: y.L.subarray(0, N), R: y.R.subarray(0, N), full: y };
}

function checkSong(song, form) {
  const arr = arrange({ ...song, form });
  if (arr.errors.length) throw new Error('score errors:\n  ' + arr.errors.join('\n  '));
  return arr;
}

/**
 * Render one cue of a song for a game. Returns
 *   { cue, sr, layers, head: { layer: { L, R } }, loop: { layer: { L, R } }, entry,
 *     intro, body, headLoopAt, introBars, bodyBars, normDb, stats }
 * The player plays `head` from its start, then `loop` from `headLoopAt` seconds in, repeating forever. `entry` is
 * the head without the intro (for coming into this cue from another at a bar line); it is `head` when there is no
 * intro. Times are in seconds: `intro` is the intro's length, `body` the loop's. `introBars` and `bodyBars` list each
 * bar's start, length and beats, for bar and beat callbacks.
 */
export function renderCue(song, { cue = 'main', log = () => {} } = {}) {
  const t0 = now();
  const def = cuesOf(song)[cue];
  if (!def) throw new Error(`no cue "${cue}" (cues: ${Object.keys(cuesOf(song)).join(', ')})`);
  if (!def.body?.length) throw new Error(`cue "${cue}" has no body`);
  const layers = layersOf(song);
  const names = Object.keys(layers);
  const tailS = tailOf(song);
  const P = Math.round(PRE * SR), Tt = Math.round(tailS * SR);

  // One arrangement of the intro and three passes of the body, so every note knows its neighbours (the note before
  // a legato one, the next onset that cuts a monophonic channel) as it would in a game that loops forever. The loop
  // is the middle pass: its notes render alone, with pre-roll and their whole tails, then fold onto one period.
  const arrI = def.intro.length ? checkSong(song, def.intro) : null;
  const arrB = checkSong(song, def.body);
  const tI = arrI ? arrI.duration : 0, tB = arrB.duration;
  const full = { ...song, form: [...def.intro, ...def.body, ...def.body, ...def.body] };
  const arr = checkSong(song, full.form);
  const TI = Math.round(tI * SR), Lb = Math.round(tB * SR);
  const EARLY = 0.1; // a note up to 0.1 s before a pass (humanized) still belongs to it
  const m0 = tI + tB;
  const loop = {};
  for (const name of names) {
    const opts = { only: layers[name], offset: m0 - PRE, range: [m0 - EARLY, m0 + tB - EARLY], log };
    const w = windowMix(full, arr, P + Lb + Tt, opts);
    const y = w.full ?? w;
    const NB = y.L.length; // the whole render is folded: every tail, however long, lands in the loop
    const L = new Float32Array(Lb), R = new Float32Array(Lb);
    for (let j = 0; j < NB; j++) {
      let k = (j - P) % Lb;
      if (k < 0) k += Lb;
      L[k] += y.L[j];
      R[k] += y.R[j];
    }
    loop[name] = { L, R };
  }
  // The head: the intro and the body's first pass as they sound from the start, until the loop's tail has been added
  // in (Tw samples into the body); from there the loop plays the same music.
  const Tw = Math.min(Tt, Lb);
  const H = TI + Tw;
  const head = {};
  for (const name of names) head[name] = windowMix(full, arr, H, { only: layers[name], range: [-1, H / SR] });
  // The entry: the same without the intro, for coming into this cue from another one at a bar line.
  let entry = null;
  if (arrI) {
    const plain = { ...song, form: [...def.body, ...def.body] };
    const arrP = checkSong(song, plain.form);
    entry = {};
    for (const name of names) entry[name] = windowMix(plain, arrP, Tw, { only: layers[name], range: [-1, Tw / SR] });
  }

  const M = song.master ?? {};
  const { stems: headM, loop: loopM, normDb } = masterCue(head, loop, Tw, M);
  const entryM = entry ? masterCue(entry, loop, Tw, M, normDb).stems : headM;

  // loudness and peak of the loop as heard
  const mix = sumStems(loopM, Lb);
  let peak = 0;
  for (let i = 0; i < Lb; i++) peak = Math.max(peak, Math.abs(mix.L[i]), Math.abs(mix.R[i]));
  const stats = { renderMs: Math.round(now() - t0), lufs: +lufs(mix.L, mix.R).toFixed(2), peakDb: +(20 * Math.log10(peak + 1e-12)).toFixed(2), normDb: +normDb.toFixed(3), tail: +tailS.toFixed(2) };
  return {
    cue, sr: SR, layers: names, head: headM, loop: loopM, entry: entryM,
    intro: TI / SR, body: Lb / SR, headLoopAt: Tw / SR,
    introBars: arrI ? barsOf(arrI) : [], bodyBars: barsOf(arrB),
    normDb, stats, review: critic({ ...song, form: [...def.intro, ...def.body] }),
  };
}

function sumStems(stems, n, from = 0) {
  const L = new Float32Array(n), R = new Float32Array(n);
  for (const s of Object.values(stems)) {
    for (let i = 0; i < n; i++) {
      L[i] += s.L[from + i];
      R[i] += s.R[from + i];
    }
  }
  return { L, R };
}

// The master chain over [head, loop from Tw on, loop x k]: the last copy of the loop has at least 2 s of the loop
// before it, so the compressor's and limiter's state there is the loop's own. Loudness is measured on that copy.
// `fixedDb` uses a known loudness gain (an entry shares its head's) instead of measuring.
function masterCue(head, loop, Tw, M, fixedDb = null) {
  const names = Object.keys(loop);
  const H = head[names[0]].L.length, Lb = loop[names[0]].L.length;
  const k = 1 + Math.max(0, Math.ceil((2 * SR - (Lb - Tw)) / Lb));
  const NT = H + (Lb - Tw) + k * Lb;
  const T = {};
  for (const n of names) {
    const L = new Float32Array(NT), R = new Float32Array(NT);
    L.set(head[n].L);
    R.set(head[n].R);
    let o = H;
    L.set(loop[n].L.subarray(Tw), o);
    R.set(loop[n].R.subarray(Tw), o);
    o += Lb - Tw;
    for (let c = 0; c < k; c++, o += Lb) {
      L.set(loop[n].L, o);
      R.set(loop[n].R, o);
    }
    if (M.eq) {
      eq(L, M.eq);
      eq(R, M.eq);
    }
    T[n] = { L, R };
  }
  const apply = (g, shift = 0) => {
    for (const n of names) {
      const { L, R } = T[n];
      for (let i = 0; i < NT; i++) {
        const x = typeof g === 'number' ? g : g[Math.min(NT - 1, i + shift)];
        L[i] *= x;
        R[i] *= x;
      }
    }
  };
  if (M.comp) {
    const m = sumStems(T, NT);
    apply(compressGain(m.L, m.R, M.comp));
  }
  let normDb = 0;
  const passes = M.lufs === false ? 0 : 2;
  for (let pass = 0; pass < passes; pass++) {
    const g = fixedDb != null ? (pass === 0 ? fixedDb : 0) : (M.lufs ?? -16) - (() => {
      const last = sumStems(T, Lb, NT - Lb);
      return lufs(last.L, last.R);
    })();
    normDb += g;
    apply(db(g));
    // the limiter's lookahead is taken out (the gain for sample i is read W samples on), so bars stay on the grid
    const m = sumStems(T, NT);
    const { gain, delay } = limitGain(m.L, m.R, { ceiling: M.ceiling ?? -2 });
    apply(gain, delay);
  }
  const stems = {}, loopOut = {};
  for (const n of names) {
    stems[n] = { L: T[n].L.slice(0, H), R: T[n].R.slice(0, H) };
    loopOut[n] = { L: T[n].L.slice(NT - Lb), R: T[n].R.slice(NT - Lb) };
  }
  return { stems, loop: loopOut, normDb };
}

/**
 * A one-shot render (a stinger, a jingle, a song that does not loop): the given sections of a song, or its form,
 * rendered whole with its tail, mastered like a song. Returns { L, R, sr, seconds, normDb }.
 */
export function renderOnce(song, form = song.form) {
  const s = { ...song, form };
  const arr = checkSong(song, form);
  const N = Math.ceil((arr.duration + tailOf(song)) * SR);
  const y = mixParts(s, arr, N);
  const normDb = masterOnce(y, song.master ?? {});
  return { L: y.L, R: y.R, sr: SR, seconds: N / SR, normDb };
}

function masterOnce(y, M) {
  const { L, R } = y;
  if (M.eq) {
    eq(L, M.eq);
    eq(R, M.eq);
  }
  const mul = (g, shift = 0) => {
    for (let i = 0; i < L.length; i++) {
      const x = typeof g === 'number' ? g : g[Math.min(L.length - 1, i + shift)];
      L[i] *= x;
      R[i] *= x;
    }
  };
  if (M.comp) mul(compressGain(L, R, M.comp));
  let normDb = 0;
  for (let pass = 0; pass < (M.lufs === false ? 0 : 2); pass++) {
    const g = (M.lufs ?? -16) - lufs(L, R);
    normDb += g;
    mul(db(g));
    const { gain, delay } = limitGain(L, R, { ceiling: M.ceiling ?? -2 });
    mul(gain, delay);
  }
  return normDb;
}

/**
 * A quick estimate of a cue's loudness gain (dB), for streaming before the exact render exists: the notes of the
 * body's first few seconds (up to `seconds`), rendered with their effects and the master EQ and compressor, measured
 * and brought to the master's target. Usually within 2 dB of the exact gain; a player corrects it smoothly.
 */
export function estimateNorm(song, { cue = 'main', seconds = 3 } = {}) {
  const def = cuesOf(song)[cue];
  const M = song.master ?? {};
  if (M.lufs === false) return 0;
  const arr = checkSong(song, def.body);
  const t1 = Math.min(arr.duration, seconds);
  const N = Math.round(t1 * SR) + Math.round(0.5 * SR);
  const y = windowMix({ ...song, form: def.body }, arr, N, { range: [-1, t1] });
  const L = Float32Array.from(y.L), R = Float32Array.from(y.R);
  if (M.eq) {
    eq(L, M.eq);
    eq(R, M.eq);
  }
  if (M.comp) {
    const g = compressGain(L, R, M.comp);
    for (let i = 0; i < L.length; i++) {
      L[i] *= g[i];
      R[i] *= g[i];
    }
  }
  const cur = lufs(L, R);
  return cur <= -70 ? 0 : Math.max(-30, Math.min(30, (M.lufs ?? -16) - cur));
}

/**
 * A cue's timing without rendering it: { intro, body (seconds), introBars, bodyBars }. Cheap (it only arranges), so
 * a player knows where the bars and beats fall while the audio is still rendering.
 */
export function cueTiming(song, cue = 'main') {
  const def = cuesOf(song)[cue];
  if (!def) throw new Error(`no cue "${cue}" (cues: ${Object.keys(cuesOf(song)).join(', ')})`);
  const arrI = def.intro.length ? checkSong(song, def.intro) : null;
  const arrB = checkSong(song, def.body);
  return {
    intro: arrI ? Math.round(arrI.duration * SR) / SR : 0, body: Math.round(arrB.duration * SR) / SR,
    introBars: arrI ? barsOf(arrI) : [], bodyBars: barsOf(arrB),
  };
}
