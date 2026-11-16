// fx.mjs: effects as code. Every effect is a pure function of its input and its parameters (no randomness
// except seeded modulation), so a mix renders identically every time.
import { SR, TAU, Biquad, Delay, OnePole, db, clamp, eqChain } from './dsp.mjs';

// ---------------------------------------------------------------------------------------------------------------
// Reverb: early reflections + input diffusion + 16-line feedback delay network with frequency-dependent decay.
// ---------------------------------------------------------------------------------------------------------------
const FDN_LENGTHS = [1153, 1231, 1321, 1427, 1523, 1619, 1733, 1847, 1949, 2069, 2179, 2287, 2399, 2521, 2633, 2749];
const ER_TAPS = [
  [7.1, 0.82, 0], [11.3, 0.74, 1], [16.9, 0.66, 0], [21.7, 0.61, 1], [26.3, 0.55, 0],
  [33.1, 0.47, 1], [39.7, 0.42, 0], [47.9, 0.35, 1], [57.3, 0.29, 0], [67.1, 0.24, 1],
];

class Allpass {
  constructor(len, g) {
    this.d = new Delay(len + 2);
    this.len = len;
    this.g = g;
  }
  tick(x) {
    const dl = this.d.readInt(this.len);
    const w = x + this.g * dl;
    this.d.write(w);
    return dl - this.g * w;
  }
}

/**
 * Process a stereo send into a stereo wet signal (added to outL/outR).
 * opts: rt60 (s), hf (ratio of high-frequency to low-frequency RT60), size, predelay (s), er (early level),
 * late (late level), lowCut, highCut (Hz), mod (samples of delay modulation), seed.
 */
export function reverb(inL, inR, outL, outR, opts = {}) {
  const {
    rt60 = 2.2, hf = 0.45, size = 1, predelay = 0.02, er = 0.35, late = 1,
    lowCut = 150, highCut = 9000, mod = 4, diffusion = 0.62,
  } = opts;
  const N = 16;
  const lens = FDN_LENGTHS.map((l) => Math.round(l * size));
  const lines = lens.map((l) => new Delay(l + 16));
  const fb = lens.map((m) => {
    const gdc = Math.pow(10, (-3 * m) / (rt60 * SR));
    const gny = Math.pow(10, (-3 * m) / (rt60 * hf * SR));
    const a = (gdc - gny) / (gdc + gny);
    return { a, b: gdc * (1 - a), z: 0 };
  });
  const preN = Math.max(1, Math.round(predelay * SR));
  const erLine = [new Delay(Math.ceil(0.08 * SR * size) + 4), new Delay(Math.ceil(0.08 * SR * size) + 4)];
  const taps = ER_TAPS.map(([ms, g, side]) => [Math.round((ms / 1000) * SR * size), g, side]);
  const difL = [142, 107, 379, 277].map((l) => new Allpass(Math.round(l * size), diffusion));
  const difR = [151, 113, 389, 283].map((l) => new Allpass(Math.round(l * size), diffusion));
  const hpL = new Biquad('hp', lowCut, 0.7), hpR = new Biquad('hp', lowCut, 0.7);
  const lpL = new Biquad('lp', highCut, 0.7), lpR = new Biquad('lp', highCut, 0.7);
  const sign = [1, -1, 1, 1, -1, 1, -1, -1, 1, -1, -1, 1, 1, 1, -1, -1];
  const lfoRate = [0.31, 0.47, 0.61, 0.83];
  const lateGain = late * 0.35;
  void N;
  reverbCore(inL, inR, outL, outR, { lens, lines, fb, preN, erLine, taps, difL, difR, hpL, hpR, lpL, lpR, sign, lfoRate, mod, er, lateGain });
}

function reverbCore(inL, inR, outL, outR, s) {
  const { lens, lines, fb, preN, erLine, taps, difL, difR, hpL, hpR, lpL, lpR, sign, lfoRate, mod, er, lateGain } = s;
  const N = lens.length;
  const preL = new Delay(preN + 4), preR = new Delay(preN + 4);
  const outs = new Float64Array(N);
  const n = inL.length;
  const lfoPh = lfoRate.map((_, k) => k * 1.7);
  const lfoInc = lfoRate.map((r) => (TAU * r) / SR);
  for (let i = 0; i < n; i++) {
    preL.write(inL[i]);
    preR.write(inR[i]);
    const pl = preL.readInt(preN);
    const pr = preR.readInt(preN);
    // early reflections
    erLine[0].write(pl);
    erLine[1].write(pr);
    let eL = 0, eR = 0;
    for (let t = 0; t < taps.length; t++) {
      const [d, g, side] = taps[t];
      if (side === 0) eL += g * erLine[0].readInt(d) + 0.3 * g * erLine[1].readInt(d);
      else eR += g * erLine[1].readInt(d) + 0.3 * g * erLine[0].readInt(d);
    }
    // diffuse the input to the late field
    let dl = pl * 0.6 + eL * 0.25, dr = pr * 0.6 + eR * 0.25;
    for (let k = 0; k < difL.length; k++) {
      dl = difL[k].tick(dl);
      dr = difR[k].tick(dr);
    }
    // read lines (4 of them modulated), apply absorption filters
    let sum = 0;
    for (let k = 0; k < N; k++) {
      let v;
      if (k < 4 && mod > 0) {
        lfoPh[k] += lfoInc[k];
        if (lfoPh[k] > TAU) lfoPh[k] -= TAU;
        v = lines[k].read(lens[k] + mod * (1 + Math.sin(lfoPh[k])));
      } else v = lines[k].readInt(lens[k]);
      const f = fb[k];
      f.z = f.b * v + f.a * f.z;
      outs[k] = f.z;
      sum += f.z;
    }
    const h = (2 / N) * sum;
    let wl = 0, wr = 0;
    for (let k = 0; k < N; k++) {
      const inj = (k & 1) === 0 ? dl : dr;
      lines[k].write(outs[k] - h + inj * sign[k] * 0.5);
      if ((k & 1) === 0) wl += outs[k] * sign[k];
      else wr += outs[k] * sign[(k + 5) % N];
    }
    let yl = er * eL + lateGain * wl;
    let yr = er * eR + lateGain * wr;
    yl = lpL.tick(hpL.tick(yl));
    yr = lpR.tick(hpR.tick(yr));
    outL[i] += yl;
    outR[i] += yr;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Ping-pong delay, chorus
// ---------------------------------------------------------------------------------------------------------------
export function pingpong(inL, inR, outL, outR, { time = 0.375, feedback = 0.38, lowCut = 250, highCut = 4500 } = {}) {
  const T = Math.round(time * SR);
  const dl = new Delay(T + 4), dr = new Delay(T + 4);
  const hp = new Biquad('hp', lowCut, 0.7);
  const lpa = new OnePole(highCut), lpb = new OnePole(highCut);
  for (let i = 0; i < inL.length; i++) {
    const x = hp.tick(0.5 * (inL[i] + inR[i]));
    const l = dl.readInt(T), r = dr.readInt(T);
    outL[i] += l;
    outR[i] += r;
    dl.write(x + feedback * lpa.lp(r));
    dr.write(feedback * lpb.lp(l));
  }
}

export function chorus(L, R, { rate = 0.45, depth = 0.0025, base = 0.012, mix = 0.45, voices = 3 } = {}) {
  const max = Math.ceil((base + depth * 2) * SR) + 4;
  const dL = new Delay(max), dR = new Delay(max);
  const ph = Array.from({ length: voices }, (_, k) => (k * TAU) / voices);
  const inc = (TAU * rate) / SR;
  for (let i = 0; i < L.length; i++) {
    const xl = L[i], xr = R[i];
    dL.write(xl);
    dR.write(xr);
    let wl = 0, wr = 0;
    for (let k = 0; k < voices; k++) {
      ph[k] += inc * (1 + k * 0.13);
      const m = (base + depth * (1 + Math.sin(ph[k]))) * SR;
      const m2 = (base + depth * (1 + Math.cos(ph[k] * 1.07))) * SR;
      wl += dL.read(m);
      wr += dR.read(m2);
    }
    L[i] = xl * (1 - mix * 0.5) + (wl / voices) * mix;
    R[i] = xr * (1 - mix * 0.5) + (wr / voices) * mix;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Dynamics: compressor, ducking, lookahead limiter
// ---------------------------------------------------------------------------------------------------------------
export function compress(L, R, opts = {}) {
  const g = compressGain(L, R, opts);
  for (let i = 0; i < L.length; i++) {
    L[i] *= g[i];
    R[i] *= g[i];
  }
}

/** The compressor's gain for every sample of a stereo signal, without applying it (to share one curve across stems). */
export function compressGain(L, R, { threshold = -18, ratio = 3, attack = 0.01, release = 0.15, knee = 6, makeup = 0 } = {}) {
  const ak = Math.exp(-1 / (attack * SR)), rk = Math.exp(-1 / (release * SR));
  let env = 0;
  const mk = db(makeup);
  const out = new Float64Array(L.length);
  for (let i = 0; i < L.length; i++) {
    const x = Math.max(Math.abs(L[i]), Math.abs(R[i]));
    const xdb = 20 * Math.log10(x + 1e-12);
    let over = xdb - threshold;
    let gr;
    if (over <= -knee / 2) gr = 0;
    else if (over >= knee / 2) gr = over * (1 - 1 / ratio);
    else {
      const o = over + knee / 2;
      gr = ((1 - 1 / ratio) * o * o) / (2 * knee);
    }
    env = gr > env ? gr + (env - gr) * ak : gr + (env - gr) * rk;
    out[i] = db(-env) * mk;
  }
  return out;
}

/** Sidechain-style ducking from a list of trigger times (e.g. kicks). */
export function duck(L, R, times, { depth = 0.6, attack = 0.004, release = 0.22 } = {}) {
  if (!times.length) return;
  const sorted = [...times].sort((a, b) => a - b);
  let j = 0;
  for (let i = 0; i < L.length; i++) {
    const t = i / SR;
    while (j + 1 < sorted.length && sorted[j + 1] <= t) j++;
    const dt = t - sorted[j];
    let g = 1;
    if (dt >= 0) {
      const a = dt < attack ? dt / attack : 1;
      g = 1 - depth * a * Math.exp(-Math.max(0, dt - attack) / release);
    }
    L[i] *= g;
    R[i] *= g;
  }
}

/** Lookahead brickwall limiter: min-filter the required gain, then box-smooth it, then delay the audio to match. */
export function limit(L, R, opts = {}) {
  const { gain: out, delay: W } = limitGain(L, R, opts);
  // apply with delay W
  for (let i = L.length - 1; i >= 0; i--) {
    const src = i - W;
    const gl = out[i];
    L[i] = src >= 0 ? L[src] * gl : 0;
    R[i] = src >= 0 ? R[src] * gl : 0;
  }
}

// interpolation filters for the true peak: x(i + t) for t = 1/4, 1/2, 3/4 from samples i-7 .. i+8 (Hann-windowed sinc)
const TP_HALF = 8, TP_TAPS = 16;
const TP_PHASES = [0.25, 0.5, 0.75].map((t) => {
  const k = [];
  for (let j = 0; j < TP_TAPS; j++) {
    const d = j - TP_HALF + 1 - t; // distance from the point to sample i - TP_HALF + 1 + j
    const w = 0.5 + 0.5 * Math.cos((Math.PI * d) / TP_HALF);
    k.push((d === 0 ? 1 : Math.sin(Math.PI * d) / (Math.PI * d)) * w);
  }
  return k;
});
/**
 * The limiter's gain curve without applying it: `gain[i]` multiplies the input delayed by `delay` samples (the
 * lookahead). Sample i of the input is limited by gain[i + delay], which is how a mix and its stems share one curve.
 */
export function limitGain(L, R, { ceiling = -1.5, lookahead = 0.005, release = 0.08 } = {}) {
  const c = db(ceiling);
  const W = Math.max(1, Math.round(lookahead * SR));
  const n = L.length;
  // required gain per sample, from the true (inter-sample) peak: the signal between samples, at 1/4, 1/2 and 3/4,
  // by a 16-tap windowed sinc (4x oversampling, as loudness meters measure it); only near the ceiling, where it matters
  const req = new Float64Array(n);
  const near = c * 0.4;
  const tp = (x, i) => {
    let m = Math.abs(x[i]);
    if (m < near && Math.abs(x[Math.min(n - 1, i + 1)]) < near) return m;
    for (const k of TP_PHASES) {
      let v = 0;
      for (let j = 0; j < TP_TAPS; j++) {
        const at = i - TP_HALF + 1 + j;
        v += k[j] * x[at < 0 ? 0 : at >= n ? n - 1 : at];
      }
      if (Math.abs(v) > m) m = Math.abs(v);
    }
    return m;
  };
  for (let i = 0; i < n; i++) {
    const p = Math.max(tp(L, i), tp(R, i));
    req[i] = p > c ? c / p : 1;
  }
  // sliding minimum over the last W+1 samples (monotonic deque)
  const m = new Float64Array(n);
  const dq = new Int32Array(n);
  let h = 0, t = 0;
  for (let i = 0; i < n; i++) {
    while (t > h && req[dq[t - 1]] >= req[i]) t--;
    dq[t++] = i;
    if (dq[h] < i - W) h++;
    m[i] = req[dq[h]];
  }
  // release smoothing (only lets the gain rise slowly), then box average over W+1 samples
  const rk = Math.exp(-1 / (release * SR));
  let g = 1;
  for (let i = 0; i < n; i++) {
    g = m[i] < g ? m[i] : m[i] + (g - m[i]) * rk;
    m[i] = g;
  }
  const out = new Float64Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += m[i];
    if (i > W) acc -= m[i - W - 1];
    out[i] = acc / Math.min(i + 1, W + 1);
  }
  return { gain: out, delay: W };
}

// ---------------------------------------------------------------------------------------------------------------
// Distortion (4x oversampled waveshaper) and cabinet simulation
// ---------------------------------------------------------------------------------------------------------------
export function drive(buf, { gain = 24, bias = 0.08, pre = [['hp', 110, 0.7], ['peak', 760, 0.9, 6]], level = -18 } = {}) {
  const OS = 4;
  const preEq = eqChain(pre);
  const aa1 = new Biquad('lp', 19000, 0.54, 0, SR * OS), aa2 = new Biquad('lp', 19000, 1.31, 0, SR * OS);
  const ai1 = new Biquad('lp', 19000, 0.54, 0, SR * OS), ai2 = new Biquad('lp', 19000, 1.31, 0, SR * OS);
  const g = db(gain);
  const off = Math.tanh(bias * g);
  const out = db(level);
  let prev = 0;
  for (let i = 0; i < buf.length; i++) {
    let x = buf[i];
    for (const bq of preEq) x = bq.tick(x);
    let y = 0;
    for (let k = 1; k <= OS; k++) {
      // upsample (linear) + anti-imaging filter
      let s = prev + ((x - prev) * k) / OS;
      s = ai2.tick(ai1.tick(s));
      // asymmetric soft clip
      let v = Math.tanh(g * (s + bias)) - off;
      v = aa2.tick(aa1.tick(v));
      if (k === OS) y = v;
    }
    prev = x;
    buf[i] = y * out;
  }
}

export const CABS = {
  // a closed-back 4x12 voiced for high-gain rhythm: tight lows, scooped low-mids, presence bump, steep top cut
  metal: [['hp', 85, 0.8], ['peak', 120, 1.1, 3], ['peak', 420, 1.0, -4.5], ['peak', 1800, 1.2, 2], ['peak', 3200, 2.2, 3.5], ['lp', 5200, 0.9], ['lp', 6200, 0.7]],
  bass: [['hp', 35, 0.7], ['peak', 90, 0.9, 2.5], ['peak', 700, 1.0, 1.5], ['lp', 3800, 0.7], ['lp', 5200, 0.7]],
  lead: [['hp', 110, 0.8], ['peak', 800, 0.9, 2], ['peak', 2600, 1.6, 3], ['lp', 5600, 0.9], ['lp', 7000, 0.7]],
  // an open-back 2x12 for clean and crunch tones: rounder lows, a little sparkle, a gentler top cut
  clean: [['hp', 70, 0.7], ['peak', 400, 1.0, -1.5], ['peak', 2200, 1.2, 2], ['lp', 7000, 0.8]],
};

export function eq(buf, spec) {
  for (const bq of eqChain(spec)) bq.run(buf);
}

// ---------------------------------------------------------------------------------------------------------------
// Formant filter bank (vowels for choir parts). Values: Csound's formant table (vowels a e i o u).
// ---------------------------------------------------------------------------------------------------------------
export const FORMANTS = {
  soprano: {
    a: [[800, 0, 80], [1150, -6, 90], [2900, -32, 120], [3900, -20, 130], [4950, -50, 140]],
    e: [[350, 0, 60], [2000, -20, 100], [2800, -15, 120], [3600, -40, 150], [4950, -56, 200]],
    i: [[270, 0, 60], [2140, -12, 90], [2950, -26, 100], [3900, -26, 120], [4950, -44, 120]],
    o: [[450, 0, 70], [800, -11, 80], [2830, -22, 100], [3800, -22, 130], [4950, -50, 135]],
    u: [[325, 0, 50], [700, -16, 60], [2700, -35, 170], [3800, -40, 180], [4950, -60, 200]],
  },
  alto: {
    a: [[800, 0, 80], [1150, -4, 90], [2800, -20, 120], [3500, -36, 130], [4950, -60, 140]],
    e: [[400, 0, 60], [1600, -24, 80], [2700, -30, 120], [3300, -35, 150], [4950, -60, 200]],
    i: [[350, 0, 50], [1700, -20, 100], [2700, -30, 120], [3700, -36, 150], [4950, -60, 200]],
    o: [[450, 0, 70], [800, -9, 80], [2830, -16, 100], [3500, -28, 130], [4950, -55, 135]],
    u: [[325, 0, 50], [700, -12, 60], [2530, -30, 170], [3500, -40, 180], [4950, -64, 200]],
  },
  tenor: {
    a: [[650, 0, 80], [1080, -6, 90], [2650, -7, 120], [2900, -8, 130], [3250, -22, 140]],
    e: [[400, 0, 70], [1700, -14, 80], [2600, -12, 100], [3200, -14, 120], [3580, -20, 120]],
    i: [[290, 0, 40], [1870, -15, 90], [2800, -18, 100], [3250, -20, 120], [3540, -30, 120]],
    o: [[400, 0, 40], [800, -10, 80], [2600, -12, 100], [2800, -12, 120], [3000, -26, 120]],
    u: [[350, 0, 40], [600, -20, 60], [2700, -17, 100], [2900, -14, 120], [3300, -26, 120]],
  },
  bass: {
    a: [[600, 0, 60], [1040, -7, 70], [2250, -9, 110], [2450, -9, 120], [2750, -20, 130]],
    e: [[400, 0, 40], [1620, -12, 80], [2400, -9, 100], [2800, -12, 120], [3100, -18, 120]],
    i: [[250, 0, 60], [1750, -30, 90], [2600, -16, 100], [3050, -22, 120], [3340, -28, 120]],
    o: [[400, 0, 40], [750, -11, 80], [2400, -21, 100], [2600, -20, 120], [2900, -40, 120]],
    u: [[350, 0, 40], [600, -20, 80], [2400, -32, 100], [2675, -28, 120], [2950, -36, 120]],
  },
};

// Singers raise the first formant to the pitch when the pitch would sit above it (formant tuning). Given the pitch
// f0 and the source's tilt, each note is also brought to the loudness of a smoothed "a" at the voice's middle pitch,
// rising 3 dB an octave: a scale stays even when single harmonics fall on or between the narrow formants, and every
// vowel sings at about the same level. Power is weighted like a loudness meter (+4 dB above 1.5 kHz).
function tuned(voice, vowel, f0) {
  const set = FORMANTS[voice][vowel];
  return f0 ? set.map(([f, g, bw], k) => (k === 0 && f < f0 * 1.05 ? [f0 * 1.05, g, bw] : [f, g, bw])) : set;
}
function vowelPower(voice, vowel, f0, tiltHz) {
  const set = tuned(voice, vowel, f0);
  let P = 0;
  for (let h = 1; h * f0 < 8000; h++) {
    const f = h * f0;
    const src = 1 / h / Math.sqrt(1 + (f / tiltHz) ** 2);
    let H = 0;
    for (const [fc, g, bw] of set) {
      const q = fc / bw, x = f / fc - fc / f;
      H += db(g) / Math.sqrt(1 + q * q * x * x);
    }
    const r2 = (f / 1500) ** 2;
    P += (src * H) ** 2 * (1 + (1.51 * r2) / (1 + r2));
  }
  return P;
}

const MID_PITCH = { soprano: 523, alto: 392, tenor: 262, bass: 175 };
const REF_POWER = new Map();

export function formant(buf, voice = 'soprano', vowel = 'a', f0 = 0, tiltHz = 12000) {
  if (!FORMANTS[voice]?.[vowel]) throw new Error(`formant: no vowel "${vowel}" for ${voice}`);
  let norm = 1;
  if (f0) {
    const mid = MID_PITCH[voice] ?? 300;
    const key = `${voice}:${tiltHz / f0}`;
    let ref = REF_POWER.get(key);
    if (ref === undefined) {
      ref = 0;
      for (let k = -6; k <= 6; k++) ref += vowelPower(voice, 'a', mid * (1 + 0.02 * k), (tiltHz / f0) * mid * (1 + 0.02 * k)) / 13;
      REF_POWER.set(key, ref);
    }
    norm = clamp(Math.sqrt((ref * (f0 / mid)) / vowelPower(voice, vowel, f0, tiltHz)), 0.25, 4);
  }
  const bands = tuned(voice, vowel, f0).map(([f, g, bw]) => ({ bq: new Biquad('bp', f, f / bw), g: db(g) }));
  for (let i = 0; i < buf.length; i++) {
    const x = buf[i];
    let y = 0;
    for (const b of bands) y += b.g * b.bq.tick(x);
    buf[i] = y * 2.2 * norm;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Dynamic lowpass driven by a level curve (0..1): softer playing is darker, as on acoustic instruments.
// ---------------------------------------------------------------------------------------------------------------
export function dynlp(buf, levelAt, lo = 2200, hi = 9000, q = 0.55) {
  // one gentle 12 dB/octave lowpass: dynamics change the tone colour, they should not muffle it
  const a = new Biquad('lp', hi, q);
  let lastF = -1;
  for (let i = 0; i < buf.length; i++) {
    if ((i & 63) === 0) {
      const lv = clamp(levelAt(i / SR), 0, 1);
      const f = lo * Math.pow(hi / lo, lv);
      if (Math.abs(f - lastF) > 1) {
        a.set('lp', f, q);
        lastF = f;
      }
    }
    buf[i] = a.tick(buf[i]);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Loudness (ITU-R BS.1770-4 integrated, gated) so every song is mixed to a loudness target, not a peak.
// ---------------------------------------------------------------------------------------------------------------
export function lufs(L, R) {
  const kw = () => [new Biquad('hs', 1681.974450955533, 0.7071752369554196, 3.999843853973347), new Biquad('hp', 38.13547087602444, 0.5003270373238773)];
  const [sl, hl] = kw();
  const [sr2, hr] = kw();
  const n = L.length;
  const blk = Math.round(0.4 * SR), hop = Math.round(0.1 * SR);
  const sq = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = hl.tick(sl.tick(L[i]));
    const b = hr.tick(sr2.tick(R[i]));
    sq[i] = a * a + b * b;
  }
  const cum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) cum[i + 1] = cum[i] + sq[i];
  const blocks = [];
  for (let s = 0; s + blk <= n; s += hop) blocks.push((cum[s + blk] - cum[s]) / blk);
  const loud = (z) => -0.691 + 10 * Math.log10(z + 1e-20);
  const abs = blocks.filter((z) => loud(z) > -70);
  if (!abs.length) return -70;
  const meanAbs = abs.reduce((a, b) => a + b, 0) / abs.length;
  const rel = loud(meanAbs) - 10;
  const gated = abs.filter((z) => loud(z) > rel);
  return loud(gated.reduce((a, b) => a + b, 0) / gated.length);
}
