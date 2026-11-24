// render.mjs: song (text + data) -> stereo samples. Parts render one at a time into scratch buffers, run their
// insert effects, then mix into the master and the send buses; the master is normalized to a loudness target.
import { SR, panGains, db } from './dsp.mjs';
import { build } from './instruments.mjs';
import { reverb, pingpong, chorus, compress, compressGain, limitGain, duck, limit, drive, CABS, eq, formant, dynlp, lufs } from './fx.mjs';
import { arrange, critic } from './score.mjs';
import { stageTaps, stage } from './stage.mjs';
import { songOf } from './orchestra.mjs'; // also registers the woodwind, organ, ensemble and orchestral-percussion builders

const now = () => (globalThis.performance ? performance.now() : Date.now());

function noteTime(v, bpm) {
  if (typeof v === 'number') return v;
  const [a, b] = v.split('/').map(Number);
  return ((60 / bpm) * 4 * a) / b;
}

function applyFx(list, L, R, mono, ctx, arr) {
  if (mono && list.some((f) => f[0] === 'duck' || f[0] === 'comp')) R = new Float32Array(L.length); // scratch channel
  for (const fx of list) {
    const [type, a, b, c] = fx;
    const both = (f) => {
      f(L);
      if (!mono) f(R);
    };
    if (type === 'eq') both((x) => eq(x, a));
    else if (type === 'cab') both((x) => eq(x, CABS[a]));
    else if (type === 'dynlp') both((x) => dynlp(x, ctx.levelAt, a, b, c ?? 0.6));
    else if (type === 'drive') both((x) => drive(x, a));
    else if (type === 'formant') both((x) => formant(x, a, b));
    else if (type === 'chorus') {
      if (mono) throw new Error('chorus needs a stereo part');
      chorus(L, R, a);
    } else if (type === 'comp') compress(L, R, a);
    else if (type === 'duck') duck(L, R, arr.triggers(a.source, a.token), a);
    else throw new Error(`unknown fx "${type}"`);
  }
}

/**
 * One part of an arranged song, rendered: its notes through its instrument and insert effects, placed on the stage.
 * Returns its tracks ([{ L, R, pan }], R null for a mono part; a doubled part has two), or null when it has no notes
 * in `range`. Parts are independent, so they can render in any order or in parallel workers; `mixParts` adds them up.
 */
// Grace notes: the piano strikes its own. Every other instrument plays them as short notes just before the note they
// belong to (55 ms each, as the piano does), joined to each other; a drum kit plays them as flams and drags, softer
// hits 30 ms apart. Before 0.15.0 only the piano sounded grace notes, though every importer kept them.
const GRACE = 0.055, FLAM = 0.03;
export function playEvent(inst, spec, ev, out, ctx) {
  if (ev.grace?.length && ev.ci === 0 && spec.type !== 'piano') {
    // in whole samples: 55 ms is 2425.5, and a start on a half sample rounds one way in a whole render and the
    // other in a streamed window
    const drum = ev.drum != null, each = Math.round((drum ? FLAM : GRACE) * SR) / SR, n = ev.grace.length;
    let prev = ev.prevMidi ?? null;
    ev.grace.forEach((g, i) => {
      const t = Math.max(0, ev.t - (n - i) * each);
      const end = Math.max(t + 0.01, ev.t - (n - i - 1) * each);
      inst.render({
        ...ev, t, dur: end - t, next: end - t, midi: drum ? null : g, drum: drum ? g : null, vel: ev.vel * (drum ? 0.5 : 0.85),
        art: i > 0 && !drum ? '_' : '', grace: null, ci: 0, cn: 1, legato: i > 0 && !drum, prevMidi: prev, slurNext: false,
        tech: undefined, syl: undefined, seed: (ev.seed ^ Math.imul(i + 7, 0x85ebca6b)) >>> 0,
      }, out, ctx);
      if (!drum) prev = g;
    });
  }
  inst.render(ev, out, ctx);
}

export function renderPart(song, arr, pname, N, { offset = 0, range = null } = {}) {
  song = songOf(song); // a preset named in place of a spec, a room in one word (orchestra.mjs)
  const part = song.parts[pname];
  const evs = range ? arr.parts[pname].events.filter((e) => e.t >= range[0] && e.t < range[1]) : arr.parts[pname].events;
  if (!evs.length) return null;
  const spec = song.instruments[part.inst];
  const inst = build(spec);
  const tracks = part.double
    ? [{ salt: 0x11, pan: -part.double, shift: 0 }, { salt: 0x22, pan: part.double, shift: 0.009 }]
    : [{ salt: 0, pan: part.pan ?? 0, shift: 0 }];
  const mono = !!part.mono || !!part.double;
  const arrO = offset ? { ...arr, triggers: (src, tok) => arr.triggers(src, tok).map((t) => t - offset) } : arr;
  const levelAt = offset ? (t) => arr.parts[pname].levelAt(t + offset) : arr.parts[pname].levelAt;
  const damperAt = offset && arr.damperAt ? (t) => arr.damperAt(t + offset) - offset : arr.damperAt;
  const placed = mono ? null : stageTaps(song, part); // its place on the stage (song.stage), stereo parts only
  return tracks.map((tr) => {
    // mono parts pan with [1, 0]: R only ever receives zeros, into a scratch buffer
    const L = new Float32Array(N), R = new Float32Array(N);
    const out = { L, R };
    const ctx = { pan: mono ? () => [1, 0] : panGains, levelAt, damperAt };
    for (const ev of evs) {
      const e = { ...ev, t: ev.t - offset + tr.shift, seed: (ev.seed ^ Math.imul(tr.salt, 0x9e3779b1)) >>> 0 };
      playEvent(inst, spec, e, out, ctx);
    }
    applyFx(part.fx ?? [], L, mono ? null : R, mono, ctx, arrO);
    if (placed) stage(L, R, placed);
    return { L, R: mono ? null : R, pan: tr.pan };
  });
}

/**
 * A mix being built: add each part's tracks (from renderPart) in the song's part order, then finish() runs the
 * buses. Adding in a fixed order keeps the sums, and so the samples, the same however the parts were rendered.
 */
export function createMix(song, N, { only = null, stems = null } = {}) {
  song = songOf(song);
  const mL = new Float32Array(N), mR = new Float32Array(N);
  const buses = {};
  for (const [b, spec] of Object.entries(song.buses ?? {})) buses[b] = { spec, L: new Float32Array(N), R: new Float32Array(N), used: false };
  return {
    L: mL, R: mR,
    /** Add a part's tracks to the mix and its sends; `i0`, `i1` limit it to those samples (a mix built in slices,
     *  so the page's thread can draw between them, adds every slice of a part before the next part). */
    add(pname, tracks, i0 = 0, i1 = N) {
      if (!tracks) return;
      const part = song.parts[pname];
      const g = db(part.gain ?? 0);
      const sends = Object.entries(part.sends ?? {}).map(([b, sdb]) => {
        if (!buses[b]) throw new Error(`part ${pname}: unknown bus ${b}`);
        buses[b].used = true;
        return [buses[b], g * db(sdb)];
      });
      const st = stems ? (stems[pname] ??= { L: new Float32Array(N), R: new Float32Array(N) }) : null;
      for (const { L, R, pan } of tracks) {
        if (!R) {
          const [gl, gr] = panGains(pan);
          for (let i = i0; i < i1; i++) {
            const x = L[i];
            if (x === 0) continue;
            mL[i] += x * g * gl;
            mR[i] += x * g * gr;
            if (st) {
              st.L[i] += x * g * gl;
              st.R[i] += x * g * gr;
            }
            for (const [bus, sg] of sends) {
              bus.L[i] += x * sg * gl;
              bus.R[i] += x * sg * gr;
            }
          }
        } else {
          for (let i = i0; i < i1; i++) {
            const xl = L[i], xr = R[i];
            if (xl === 0 && xr === 0) continue;
            mL[i] += xl * g;
            mR[i] += xr * g;
            if (st) {
              st.L[i] += xl * g;
              st.R[i] += xr * g;
            }
            for (const [bus, sg] of sends) {
              bus.L[i] += xl * sg;
              bus.R[i] += xr * sg;
            }
          }
        }
      }
    },
    /** The buses finish() runs, in order: [name, { spec, L, R }] (their inputs). A layer's mix runs only those its
     *  parts send to. */
    buses() {
      return Object.entries(buses).filter(([, bus]) => !only || bus.used);
    },
    /** Run the buses and add their output to the mix. `wets` (name -> { L, R }) gives outputs computed elsewhere (in
     *  a worker, by busOut); the sums are the same either way. */
    finish(wets = null, i0 = 0, i1 = N) {
      for (const [name, bus] of this.buses()) {
        const w = wets?.[name] ?? busOut(name, bus.spec, bus.L, bus.R, song.bpm);
        for (let i = i0; i < i1; i++) {
          mL[i] += w.L[i];
          mR[i] += w.R[i];
        }
      }
      return { L: mL, R: mR };
    },
  };
}

/** A bus's output (its wet signal alone) for its input: a reverb or a ping-pong delay. */
export function busOut(name, spec, L, R, bpm) {
  const out = { L: new Float32Array(L.length), R: new Float32Array(L.length) };
  if (spec.type === 'reverb') reverb(L, R, out.L, out.R, spec);
  else if (spec.type === 'delay') pingpong(L, R, out.L, out.R, { ...spec, time: noteTime(spec.time, bpm) });
  else throw new Error(`bus ${name}: unknown type ${spec.type}`);
  return out;
}

/** The parts a mix renders, in the order it adds them. */
export const mixOrder = (song, only = null) => Object.keys(song.parts).filter((p) => !only || only.includes(p));

/**
 * Render parts of an arranged song into a pre-master stereo mix of N samples: each part through its insert effects,
 * gain and pan, plus its sends through the song's buses. `only` limits it to some parts (a layer's), `offset` moves
 * every event (and the curves notes read) earlier by that many seconds (negative: later, to leave a pre-roll).
 * `stems` collects each part's dry contribution. `range: [t0, t1]` renders only the notes that start in it (each
 * with its whole tail), which is how a window of one long arrangement renders with every note's neighbours known.
 * `tracks` (a Map from part name to renderPart's result) supplies parts rendered elsewhere, in parallel workers.
 */
export function mixParts(song, arr, N, { only = null, offset = 0, stems = null, range = null, tracks = null, log = () => {} } = {}) {
  song = songOf(song);
  const mix = createMix(song, N, { only, stems });
  const partMs = {};
  for (const pname of mixOrder(song, only)) {
    const tp = now();
    const tr = tracks?.has(pname) ? tracks.get(pname) : renderPart(song, arr, pname, N, { offset, range });
    mix.add(pname, tr);
    if (!tr) continue;
    partMs[pname] = Math.round(now() - tp);
    log(`  ${pname.padEnd(12)} ${partMs[pname]} ms`);
  }
  const tb = now();
  mix.finish();
  partMs.buses = Math.round(now() - tb);
  return { L: mix.L, R: mix.R, partMs };
}

/** The master chain, in place: EQ, glue compression, loudness normalization and the true-peak limiter. Returns the gain (dB). */
export function master(mL, mR, song) {
  const N = mL.length;
  const M = song.master ?? {};
  if (M.eq) {
    eq(mL, M.eq);
    eq(mR, M.eq);
  }
  if (M.comp) compress(mL, mR, M.comp);
  const target = M.lufs ?? -16;
  let normDb = 0; // the total loudness gain, kept so a streamed render can apply the same gain up front
  for (let pass = 0; pass < (M.lufs === false ? 0 : 2); pass++) { // lufs: false keeps the raw level (calibration)
    const cur = lufs(mL, mR);
    normDb += target - cur;
    const g = db(target - cur);
    for (let i = 0; i < N; i++) {
      mL[i] *= g;
      mR[i] *= g;
    }
    limit(mL, mR, { ceiling: M.ceiling ?? -2 }); // twice: the limiter costs a little loudness
  }
  return normDb;
}

export function renderSong(song, { log = () => {}, stems = false } = {}) {
  song = songOf(song);
  const t0 = now();
  const arr = arrange(song);
  if (arr.errors.length) throw new Error('score errors:\n  ' + arr.errors.join('\n  '));
  const review = critic(song, arr);
  const tail = song.tail ?? 3;
  const N = Math.ceil((arr.duration + tail) * SR);
  const stemBufs = stems ? {} : null;
  const { L: mL, R: mR, partMs } = mixParts(song, arr, N, { stems: stemBufs, log });
  const normDb = master(mL, mR, song);
  let peak = 0;
  for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(mL[i]), Math.abs(mR[i]));
  const stats = {
    seconds: +(N / SR).toFixed(2), lufs: +lufs(mL, mR).toFixed(2), peakDb: +(20 * Math.log10(peak)).toFixed(2),
    renderMs: Math.round(now() - t0), partMs, normDb: +normDb.toFixed(3),
  };
  return { L: mL, R: mR, sr: SR, stats, review, arr, stems: stemBufs ?? {} };
}

// ---------------------------------------------------------------------------------------------------------------
// Streaming render: playback can start after the first window instead of after the whole piece. Each window renders
// the notes that start in it, with their full tails, through the part effects, the send buses and the master EQ,
// and the windows overlap-add into the mix. That is exact for linear effects (EQ, formants, the dynamic lowpass,
// delay; the reverb's slow modulation restarts per window). The master compressor, gain and limiter then run, in
// order, on audio no later window can touch, which goes to onChunk. Loudness cannot be measured before the end, so
// the gain comes in as normDb (stats.normDb of an offline render); without it the mix plays at its raw level.
// Songs whose parts use compressors, ducking, drive or chorus stream approximately: see streamable().
// ---------------------------------------------------------------------------------------------------------------
const NONLINEAR = new Set(['comp', 'duck', 'drive', 'chorus']);
export const streamable = (song) => Object.values(song.parts).every((p) => !(p.fx ?? []).some((f) => NONLINEAR.has(f[0])));

const RING = { piano: 25, pluck: 8, modal: 12, perc: 12, ensemble: 8 }; // seconds a note may sound after its end (default 3)
/** Seconds a note of this instrument may sound after its written end. */
// a plucked string that is not left to ring is damped within four mute times of its end (engine/instruments.mjs)
export const ringOf = (spec) => (spec.type === 'piano' ? (spec.maxLen ?? 24) + 1 : spec.type === 'pluck' && !spec.ring ? 1 : RING[spec.type] ?? 3);
/** Seconds a bus keeps sounding after its input stops (reverb decay, delay repeats), plus a margin. */
export const busTail = (s, bpm) => (s.type === 'reverb' ? (s.rt60 ?? 2.2) * 1.6 + (s.predelay ?? 0.02) : (Math.log(1e-4) / Math.log(s.feedback ?? 0.38)) * noteTime(s.time ?? 0.375, bpm)) + 0.3;

export function renderStream(song, { onChunk, first = 3, window = 8, normDb = 0, log = () => {} } = {}) {
  song = songOf(song);
  const t0 = now();
  const arr = arrange(song);
  if (arr.errors.length) throw new Error('score errors:\n  ' + arr.errors.join('\n  '));
  const PRE = 1; // seconds of room before a window: grace notes, rolls and humanized notes start early
  const N = Math.ceil((arr.duration + (song.tail ?? 3)) * SR);
  const mL = new Float32Array(N), mR = new Float32Array(N);
  const M = song.master ?? {};
  const buses = Object.entries(song.buses ?? {}).map(([name, spec]) => ({ name, spec, tail: Math.round(busTail(spec, song.bpm) * SR) }));
  const parts = [];
  for (const [pname, part] of Object.entries(song.parts)) {
    const evs = arr.parts[pname].events;
    if (!evs.length) continue;
    const spec = song.instruments[part.inst];
    const ring = ringOf(spec);
    const placed = part.mono || part.double ? null : stageTaps(song, part);
    parts.push({ pname, part, spec, inst: build(spec), evs: [...evs].sort((a, b) => a.t - b.t), next: 0, ring, levelAt: arr.parts[pname].levelAt, placed });
  }
  const maxDur = Math.max(1, ...parts.flatMap((p) => p.evs.map((e) => e.dur)));
  const span = Math.ceil((PRE + Math.max(first, window) + maxDur + Math.max(3, ...parts.map((p) => p.ring)) + 0.5) * SR);
  const len = span + Math.max(0, ...buses.map((b) => b.tail));
  const wL = new Float32Array(len), wR = new Float32Array(len), sL = new Float32Array(len), sR = new Float32Array(len), zR = new Float32Array(len);
  for (const b of buses) {
    b.L = new Float32Array(len);
    b.R = new Float32Array(len);
  }
  const G = db(M.lufs === false ? 0 : normDb);
  const CTX = Math.round(1.5 * SR), LOOK = Math.round(0.02 * SR);
  let done = 0;
  const finish = (upTo) => {
    upTo = Math.min(N, upTo);
    if (upTo <= done) return;
    // the compressor and limiter see 1.5 s of audio already sent, so their state carries over between chunks
    const c0 = Math.max(0, done - CTX), c1 = Math.min(N, upTo + LOOK);
    const L = mL.slice(c0, c1), R = mR.slice(c0, c1);
    if (M.comp) compress(L, R, M.comp);
    for (let i = 0; i < L.length; i++) {
      L[i] *= G;
      R[i] *= G;
    }
    // like the whole-piece render: two limiter passes (each delays by its 5 ms lookahead), none for lufs: false
    for (let pass = 0; pass < (M.lufs === false ? 0 : 2); pass++) limit(L, R, { ceiling: M.ceiling ?? -2 });
    onChunk({ L: L.slice(done - c0, upTo - c0), R: R.slice(done - c0, upTo - c0), start: done, total: N, sr: SR });
    done = upTo;
  };
  let w0 = 0, k = 0;
  while (w0 < arr.duration + 1e-9 || parts.some((p) => p.next < p.evs.length)) {
    const w1 = w0 + (k === 0 ? first : window);
    const off = w0 - PRE;
    let mixEnd = 0;
    for (const b of buses) b.end = 0;
    for (const p of parts) {
      const a = p.next;
      while (p.next < p.evs.length && p.evs[p.next].t < w1) p.next++;
      if (p.next === a) continue;
      const part = p.part;
      const mono = !!part.mono || !!part.double;
      const tracks = part.double
        ? [{ salt: 0x11, pan: -part.double, shift: 0 }, { salt: 0x22, pan: part.double, shift: 0.009 }]
        : [{ salt: 0, pan: part.pan ?? 0, shift: 0 }];
      const ctx = {
        pan: mono ? () => [1, 0] : panGains,
        levelAt: (t) => p.levelAt(t + off),
        damperAt: arr.damperAt ? (t) => arr.damperAt(t + off) - off : undefined,
      };
      const arrS = { ...arr, triggers: (src, tok) => arr.triggers(src, tok).map((t) => t - off) };
      let bound = 0;
      for (let i = a; i < p.next; i++) bound = Math.max(bound, p.evs[i].t - off + p.evs[i].dur);
      bound = Math.min(span, Math.ceil((bound + p.ring + 0.05) * SR));
      const clearTo = Math.min(len, bound + Math.round(0.35 * SR)); // effects may read up to 0.3 s past the sound
      for (const tr of tracks) {
        sL.fill(0, 0, clearTo);
        if (!mono) sR.fill(0, 0, clearTo);
        const R = mono ? zR : sR;
        const out = { L: sL, R };
        for (let i = a; i < p.next; i++) {
          const ev = p.evs[i];
          playEvent(p.inst, p.spec, { ...ev, t: ev.t - off + tr.shift, seed: (ev.seed ^ Math.imul(tr.salt, 0x9e3779b1)) >>> 0 }, out, ctx);
        }
        // where this part's sound really ends in the window, plus room for its effects to ring
        let end = bound;
        while (end > 0 && sL[end - 1] === 0 && (mono || sR[end - 1] === 0)) end--;
        if (end === 0) continue;
        end = Math.min(len, end + Math.round(0.3 * SR));
        applyFx(part.fx ?? [], sL.subarray(0, end), mono ? null : sR.subarray(0, end), mono, ctx, arrS);
        if (p.placed) stage(sL.subarray(0, end), sR.subarray(0, end), p.placed); // linear: exact window by window
        const g = db(part.gain ?? 0);
        const sends = Object.entries(part.sends ?? {}).map(([bn, sdb]) => {
          const bus = buses.find((x) => x.name === bn);
          if (!bus) throw new Error(`part ${p.pname}: unknown bus ${bn}`);
          bus.L.fill(0, bus.end, end);
          bus.R.fill(0, bus.end, end);
          bus.end = Math.max(bus.end, end);
          return [bus, g * db(sdb)];
        });
        if (end > mixEnd) {
          wL.fill(0, mixEnd, end);
          wR.fill(0, mixEnd, end);
          mixEnd = end;
        }
        const [gl, gr] = mono ? panGains(tr.pan) : [1, 1];
        for (let i = 0; i < end; i++) {
          const xl = sL[i], xr = mono ? xl : sR[i];
          if (xl === 0 && xr === 0) continue;
          wL[i] += xl * g * gl;
          wR[i] += xr * g * gr;
          for (const [bus, sg] of sends) {
            bus.L[i] += xl * sg * gl;
            bus.R[i] += xr * sg * gr;
          }
        }
      }
    }
    for (const bus of buses) {
      if (!bus.end) continue;
      const e = Math.min(len, bus.end + bus.tail);
      bus.L.fill(0, bus.end, e);
      bus.R.fill(0, bus.end, e);
      if (e > mixEnd) {
        wL.fill(0, mixEnd, e);
        wR.fill(0, mixEnd, e);
        mixEnd = e;
      }
      const [iL, iR, oL, oR] = [bus.L, bus.R, wL, wR].map((x) => x.subarray(0, e));
      if (bus.spec.type === 'reverb') reverb(iL, iR, oL, oR, bus.spec);
      else pingpong(iL, iR, oL, oR, { ...bus.spec, time: noteTime(bus.spec.time, song.bpm) });
    }
    if (mixEnd) {
      if (M.eq) {
        eq(wL.subarray(0, mixEnd), M.eq);
        eq(wR.subarray(0, mixEnd), M.eq);
      }
      const i0 = Math.round(off * SR);
      for (let i = Math.max(0, -i0); i < mixEnd && i0 + i < N; i++) {
        mL[i0 + i] += wL[i];
        mR[i0 + i] += wR[i];
      }
    }
    log(`  window ${k + 1}: ${w0.toFixed(1)}-${w1.toFixed(1)} s, ${Math.round(now() - t0)} ms`);
    w0 = w1;
    k++;
    finish(Math.round((w0 - PRE) * SR) - LOOK); // no later window reaches back past its own pre-roll
  }
  finish(N);
  return { seconds: +(N / SR).toFixed(2), renderMs: Math.round(now() - t0), windows: k };
}

/** 16-bit PCM stereo WAV. */
export function wav(L, R, sr = SR) {
  const n = L.length;
  const buf = new ArrayBuffer(44 + n * 4);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + n * 4, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 2, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * 4, true);
  v.setUint16(32, 4, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i++) {
    v.setInt16(44 + i * 4, Math.max(-32768, Math.min(32767, Math.round(L[i] * 32767))), true);
    v.setInt16(46 + i * 4, Math.max(-32768, Math.min(32767, Math.round(R[i] * 32767))), true);
  }
  return new Uint8Array(buf);
}

// ---------------------------------------------------------------------------------------------------------------
// A cue's master (engine/loop.mjs)
// ---------------------------------------------------------------------------------------------------------------
/** The sum of some stems ({ name: { L, R } }), n samples from `from`. */
export function sumStems(stems, n, from = 0) {
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
  // after the last pass, the start of the next: the limiter looks ahead, and at a loop's end what follows is its start
  const X = Math.min(Lb, Math.round(0.05 * SR));
  const NT = H + (Lb - Tw) + k * Lb + X;
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
    L.set(loop[n].L.subarray(0, X), o);
    R.set(loop[n].R.subarray(0, X), o);
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
      const last = sumStems(T, Lb, NT - X - Lb);
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
    loopOut[n] = { L: T[n].L.slice(NT - X - Lb, NT - X), R: T[n].R.slice(NT - X - Lb, NT - X) };
  }
  return { stems, loop: loopOut, normDb };
}

/**
 * A cue's mastering as one job: the head and the loop (masterCue), then the entry with the same gain. Returns
 * { head, loop, entry, normDb }. renderCue runs it in place; renderCueParallel sends it to the pool (partJob).
 */
export function masterCueJob({ head, loop, entry = null, Tw, M }) {
  const a = masterCue(head, loop, Tw, M);
  return { head: a.stems, loop: a.loop, normDb: a.normDb, entry: entry ? masterCue(entry, loop, Tw, M, a.normDb).stems : null };
}
