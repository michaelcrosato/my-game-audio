// instruments.mjs: every instrument is a small function of note events -> samples. Nothing is sampled.
// An instrument spec is plain data (see songs/*.mjs); build(spec) returns { range, render(ev, out, ctx) }.
// ev: { t, dur, midi | drum, vel, art, seed, pan, level, next, ci, prevMidi, legato }
// out: { L, R } part buffers. ctx: { pan(p) -> [gl, gr], levelAt(t) -> 0..1 }
import { SR, TAU, rng, gauss, mtof, db, clamp, Saw, Pulse, SVF, svfG, Biquad, OnePole, ADSR, levelGain } from './dsp.mjs';
import { piano } from './piano.mjs';
import { formant } from './fx.mjs';

export const exp2s = (s) => {
  // 2^(s/12) for small s (|s| < 2 semitones): quadratic approximation, < 0.2 cent error.
  const x = s * 0.057762265;
  return 1 + x + x * x * 0.5 + x * x * x * 0.1666667;
};

export function noteLevels(ev, ctx, n) {
  // dynamics curve sampled every 64 samples across the note (crescendo inside a held note)
  const blocks = Math.ceil(n / 64) + 1;
  const a = new Float64Array(blocks);
  for (let b = 0; b < blocks; b++) a[b] = ctx.levelAt(ev.t + (b * 64) / SR);
  return a;
}

// ---------------------------------------------------------------------------------------------------------------
// NES 2A03-style channels: 4-bit volume, NES period quantization, 32-step triangle, 15-bit LFSR noise.
// Instruments are FamiTracker-style macros at 60 Hz: vol, duty, arp, pitch (cents/frame), vib, release.
// ---------------------------------------------------------------------------------------------------------------
const CPU = 1789773;
const NOISE_PERIODS = [4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 2034, 4068];
const TRI_SEQ = [15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
const DUTY = [0.125, 0.25, 0.5, 0.75];
const macro = (m, i) => (m && m.length ? m[Math.min(i, m.length - 1)] : 0);

export function chip(spec) {
  const { ch = 'pulse', vol = [15], duty = [2], arp = null, pitch = null, vib = null, release = [], kit = null, gain = 1 } = spec;
  const chGain = (ch === 'pulse' ? 1 : ch === 'tri' ? 1.13 : 0.66) * gain * 0.5;
  return {
    range: ch === 'tri' ? [28, 96] : [33, 108],
    render(ev, out, ctx) {
      const [gl, gr] = ctx.pan(ev.pan);
      const i0 = Math.round(ev.t * SR);
      const p = ch === 'noise' && kit ? kit[ev.drum] : null;
      if (ch === 'noise' && kit && !p) throw new Error(`chip noise: unknown drum "${ev.drum}"`);
      const volM = p ? p.vol : vol;
      const relM = p ? p.release ?? [] : release;
      const gateS = p ? volM.length / 60 : ev.dur;
      const lenS = Math.min(ev.next, gateS + relM.length / 60);
      const n = Math.max(1, Math.round(lenS * SR));
      const gateN = Math.round(gateS * SR);
      const velScale = clamp(ev.vel / 0.8, 0.2, 1.25);
      const fade = Math.round(0.0015 * SR);
      const r = rng(ev.seed);
      let reg = (Math.floor(r() * 32766) + 1) & 0x7fff;
      const pulse = new Pulse(0);
      let triPh = 8 / 32; // start mid-wave: no click
      let acc = 0;
      for (let k = 0; k < n; k++) {
        const fr = Math.floor((k * 60) / SR);
        const gate = k < gateN;
        let v = gate ? macro(volM, fr) : macro(relM, fr - Math.floor((gateN * 60) / SR));
        if (ch !== 'tri') v = clamp(Math.round(v * velScale), 0, 15);
        else v = gate || relM.length ? 15 : 0;
        let y = 0;
        if (ch === 'noise') {
          const per = NOISE_PERIODS[clamp(Array.isArray(p.period) ? macro(p.period, fr) : p.period, 0, 15)];
          const short = p.mode === 'short';
          const cps = CPU / per / SR;
          acc += cps;
          let hi = 0, cnt = 0;
          if (acc < 1) {
            hi = (reg & 1) === 0 ? 1 : 0;
            cnt = 1;
          }
          while (acc >= 1) {
            const fb = (reg & 1) ^ ((reg >> (short ? 6 : 1)) & 1);
            reg = (reg >> 1) | (fb << 14);
            hi += (reg & 1) === 0 ? 1 : 0;
            cnt++;
            acc -= 1;
          }
          y = (2 * (hi / cnt) - 1) * (v / 15);
        } else {
          let semis = ev.midi + macro(arp, fr);
          let cents = 0;
          if (pitch) for (let q = 0; q <= Math.min(fr, pitch.length - 1); q++) cents += pitch[q];
          if (vib && fr >= (vib[2] ?? 0)) cents += vib[1] * Math.sin((TAU * vib[0] * (fr - (vib[2] ?? 0))) / 60);
          const f = mtof(semis + cents / 100);
          if (ch === 'pulse') {
            const timer = clamp(Math.round(CPU / (16 * f) - 1), 8, 2047);
            const fq = CPU / (16 * (timer + 1));
            y = pulse.next(fq / SR, DUTY[macro(duty, fr) & 3]) * (v / 15);
          } else {
            const timer = clamp(Math.round(CPU / (32 * f) - 1), 2, 2047);
            const fq = CPU / (32 * (timer + 1));
            triPh += fq / SR;
            if (triPh >= 1) triPh -= 1;
            y = (TRI_SEQ[Math.floor(triPh * 32)] / 7.5 - 1) * (v / 15);
          }
        }
        if (k > n - fade) y *= (n - k) / fade;
        y *= chGain;
        const i = i0 + k;
        if (i < out.L.length) {
          out.L[i] += y * gl;
          out.R[i] += y * gr;
        }
      }
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Virtual analog: band-limited oscillators, unison, state-variable filter with envelope, glide, vibrato.
// ---------------------------------------------------------------------------------------------------------------
export function va(spec) {
  const {
    osc = 'saw', duty = 0.5, unison = 1, detune = 0, spread = 0, sub = 0, noise = 0, glide = 0, vib = null, gain = 1,
    range = [24, 108], filter = {}, amp = {},
  } = spec;
  const F = { type: 'lp24', cutoff: 3000, res: 0.15, env: 2, key: 0.3, a: 0.005, d: 0.3, s: 0.35, r: 0.3, vel: 0.5, ...filter };
  const A = { a: 0.005, d: 0.25, s: 0.8, r: 0.25, ...amp };
  return {
    range,
    render(ev, out, ctx) {
      const r = rng(ev.seed);
      const f0 = mtof(ev.midi);
      const fStart = glide > 0 && ev.legato && ev.prevMidi != null ? mtof(ev.prevMidi) : f0;
      const onN = Math.round(ev.dur * SR);
      const n = onN + Math.round(A.r * SR);
      const i0 = Math.round(ev.t * SR);
      const voices = [];
      for (let u = 0; u < unison; u++) {
        const pos = unison > 1 ? (u / (unison - 1)) * 2 - 1 : 0;
        const cents = detune * pos + (unison > 1 ? (r() - 0.5) * detune * 0.15 : 0);
        const [gl, gr] = ctx.pan(clamp(ev.pan + spread * pos, -1, 1));
        voices.push({ saw: new Saw(r()), pul: new Pulse(r()), ph: r(), ratio: Math.pow(2, cents / 1200), gl, gr });
      }
      const subOsc = new Pulse(0);
      const norm = gain / Math.sqrt(unison);
      const ampEnv = new ADSR(A.a, A.d, A.s, A.r);
      const filEnv = new ADSR(F.a, F.d, F.s, F.r, 'lin');
      const fL = [new SVF(), new SVF()], fR = [new SVF(), new SVF()];
      const k = 2 * (1 - 0.97 * clamp(F.res, 0, 1));
      const velF = 1 - F.vel + F.vel * ev.vel;
      const keyF = Math.pow(f0 / 261.63, F.key);
      const stereo = unison > 1 && spread > 0;
      const [monoL, monoR] = ctx.pan(ev.pan);
      let g = svfG(F.cutoff);
      let vibPh = 0;
      for (let s = 0; s < n; s++) {
        const t = s / SR;
        const gate = s < onN;
        const ae = ampEnv.next(gate);
        const fe = filEnv.next(gate);
        if ((s & 3) === 0) {
          const fc = F.cutoff * keyF * Math.pow(2, F.env * fe * velF);
          g = svfG(fc);
        }
        let semis = 0;
        if (vib && t > (vib[2] ?? 0)) {
          vibPh += (TAU * vib[0]) / SR;
          semis += vib[1] * Math.sin(vibPh) * Math.min(1, (t - (vib[2] ?? 0)) / 0.3);
        }
        let f = fStart === f0 ? f0 : f0 * Math.pow(fStart / f0, Math.exp(-t / Math.max(1e-3, glide)));
        if (semis) f *= exp2s(semis);
        let sl = 0, sr = 0;
        for (let u = 0; u < voices.length; u++) {
          const V = voices[u];
          const dt = (f * V.ratio) / SR;
          let y;
          if (osc === 'saw') y = V.saw.next(dt);
          else if (osc === 'square' || osc === 'pulse') y = V.pul.next(dt, duty);
          else {
            V.ph += dt;
            if (V.ph >= 1) V.ph -= 1;
            y = osc === 'tri' ? 1 - 4 * Math.abs(V.ph - 0.5) : Math.sin(TAU * V.ph);
          }
          if (stereo) {
            sl += y * V.gl;
            sr += y * V.gr;
          } else sl += y;
        }
        if (sub) {
          const y = subOsc.next(f / 2 / SR, 0.5) * sub;
          sl += y * 0.7;
          sr += y * 0.7;
        }
        if (noise) {
          const y = (r() * 2 - 1) * noise;
          sl += y;
          sr += y;
        }
        const yl = filt(fL, sl);
        const yr = stereo ? filt(fR, sr) : 0;
        const i = i0 + s;
        if (i >= out.L.length) break;
        const a = ae * norm * ev.vel;
        if (stereo) {
          out.L[i] += yl * a;
          out.R[i] += yr * a;
        } else {
          out.L[i] += yl * a * monoL;
          out.R[i] += yl * a * monoR;
        }
      }
      function filt(fs, x) {
        if (F.type === 'none') return x;
        if (F.type === 'hp') {
          fs[0].tick(x, g, k);
          return fs[0].hp;
        }
        if (F.type === 'bp') {
          fs[0].tick(x, g, k);
          return fs[0].bp;
        }
        let y = fs[0].tick(x, g, k);
        if (F.type === 'lp24') y = fs[1].tick(y, g, k);
        return y;
      }
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// FM (two parallel 2-operator stacks): electric pianos, bells, mallets.
// ---------------------------------------------------------------------------------------------------------------
export function fm(spec) {
  const {
    ratio = 1, index = 2.4, indexEnd = 0.4, indexTime = 0.9, ratio2 = 14, index2 = 0, time2 = 0.04, mix2 = 0.4,
    amp = {}, detune = 3, width = 0.25, gain = 1, range = [28, 103],
  } = spec;
  const A = { a: 0.002, d: 1.6, s: 0, r: 0.35, ...amp };
  return {
    range,
    render(ev, out, ctx) {
      const f0 = mtof(ev.midi);
      const onN = Math.round(ev.dur * SR);
      const n = onN + Math.round(A.r * SR);
      const i0 = Math.round(ev.t * SR);
      const sides = [
        { ratio: Math.pow(2, -detune / 1200), pan: ev.pan - width },
        { ratio: Math.pow(2, detune / 1200), pan: ev.pan + width },
      ];
      const v = ev.vel;
      for (const S of sides) {
        const [gl, gr] = ctx.pan(S.pan);
        const env = new ADSR(A.a, A.d * Math.pow(261.6 / f0, 0.3), A.s, A.r);
        let pc = 0, pm = 0, pm2 = 0;
        const fc = f0 * S.ratio;
        const dc = (TAU * fc) / SR, dm = dc * ratio, dm2 = dc * ratio2;
        for (let s = 0; s < n; s++) {
          const t = s / SR;
          const e = env.next(s < onN);
          if (e < 1e-5 && s > onN) break;
          const I = (indexEnd + (index - indexEnd) * Math.exp(-t / indexTime)) * (0.5 + 0.5 * v);
          const I2 = index2 * Math.exp(-t / time2) * v;
          pc += dc; pm += dm; pm2 += dm2;
          if (pc > TAU) pc -= TAU;
          if (pm > TAU) pm -= TAU;
          if (pm2 > TAU) pm2 -= TAU;
          let y = Math.sin(pc + I * Math.sin(pm));
          if (index2) y += mix2 * Math.sin(pc + I2 * Math.sin(pm2));
          y *= e * v * gain * 0.5;
          const i = i0 + s;
          if (i >= out.L.length) break;
          out.L[i] += y * gl;
          out.R[i] += y * gr;
        }
      }
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Extended Karplus-Strong (Jaffe & Smith): plucked strings for guitar, bass, harp. Pick position comb,
// tuning allpass, loop-gain from a T60, palm mute (art ^), damping at note-off, strum offset for chords.
// ---------------------------------------------------------------------------------------------------------------
export function pluck(spec) {
  const {
    bright = 0.5, pick = 0.13, decay = 3, ref = 130.8, damp = 0.3, muteT = 0.08, pmT = 0.16, strum = 0.007,
    ring = false, gain = 1, range = [28, 100], vib = null,
  } = spec;
  return {
    range,
    render(ev, out, ctx) {
      const r = rng(ev.seed);
      const f0 = mtof(ev.midi);
      const pm = ev.art.includes('^');
      const S = pm ? 0.5 : clamp(damp, 0.05, 0.5);
      const N = SR / f0;
      let L = Math.floor(N - S - 0.15);
      if (L < 2) L = 2;
      const dap = N - S - L;
      const C = (1 - dap) / (1 + dap);
      const T60 = pm ? pmT : decay * Math.pow(ref / f0, 0.45);
      const w0 = (TAU * f0) / SR;
      const H = Math.hypot(1 - S + S * Math.cos(w0), S * Math.sin(w0));
      const rho = Math.min(0.99995, Math.pow(10, -3 / (T60 * f0)) / H);
      const rhoM = Math.min(rho, Math.pow(10, -3 / (muteT * f0)) / H);
      const br = (pm ? bright * 0.45 : bright) * (0.55 + 0.45 * ev.vel);
      const lp = new OnePole(Math.min(18000, f0 * (1.5 + 40 * br * br)));
      const ex = new Float64Array(L);
      for (let k = 0; k < L; k++) ex[k] = lp.lp(r() * 2 - 1);
      const P = Math.max(1, Math.round(pick * L));
      const dl = new Float64Array(L);
      let mean = 0;
      for (let k = 0; k < L; k++) {
        dl[k] = ex[k] - (k >= P ? ex[k - P] : 0);
        mean += dl[k];
      }
      mean /= L;
      let rms = 0;
      for (let k = 0; k < L; k++) {
        dl[k] -= mean;
        rms += dl[k] * dl[k];
      }
      rms = Math.sqrt(rms / L) || 1;
      const amp = (ev.vel * gain * 0.35) / rms;
      for (let k = 0; k < L; k++) dl[k] *= amp;
      const [gl, gr] = ctx.pan(ev.pan);
      const off = Math.round((ev.ci || 0) * strum * SR);
      const i0 = Math.round(ev.t * SR) + off;
      const onN = Math.round(ev.dur * SR);
      const maxN = Math.round((ring ? T60 * 1.1 : Math.min(T60 * 1.1, ev.dur + muteT * 4)) * SR) + 1;
      const fadeN = Math.round(0.006 * SR);
      const tailGain = (s) => (s > maxN - fadeN ? (maxN - s) / fadeN : 1);
      const xN = Math.round(0.01 * SR);
      let idx = 0, x1 = 0, ax1 = 0, ay1 = 0;
      if (vib) {
        // vibrato needs a moving delay: a longer ring buffer read with linear interpolation instead of the allpass
        const size = Math.ceil(N * 1.2) + 4;
        const ring2 = new Float64Array(size);
        for (let k = 0; k < L; k++) ring2[k] = dl[k];
        let w = L;
        let ph = 0;
        for (let s = 0; s < maxN; s++) {
          const t = s / SR;
          let g = rho;
          if (!ring && s > onN) g = s - onN < xN ? rho + ((rhoM - rho) * (s - onN)) / xN : rhoM;
          const semis = t > vib[2] ? vib[1] * Math.min(1, (t - vib[2]) / 0.25) * Math.sin(ph) : 0;
          if (t > vib[2]) ph += (TAU * vib[0]) / SR;
          const d = SR / (f0 * exp2s(semis)) - S;
          let rp = w - d;
          while (rp < 0) rp += size;
          const i1 = Math.floor(rp), fr = rp - i1;
          const x = ring2[i1] + (ring2[i1 + 1 === size ? 0 : i1 + 1] - ring2[i1]) * fr;
          const f = (1 - S) * x + S * x1;
          x1 = x;
          ring2[w] = f * g;
          w = w + 1 === size ? 0 : w + 1;
          const i = i0 + s;
          if (i >= out.L.length) break;
          const xf = x * tailGain(s);
          out.L[i] += xf * gl;
          out.R[i] += xf * gr;
        }
        return;
      }
      for (let s = 0; s < maxN; s++) {
        let g = rho;
        if (!ring && s > onN) g = s - onN < xN ? rho + ((rhoM - rho) * (s - onN)) / xN : rhoM;
        const x = dl[idx];
        const f = (1 - S) * x + S * x1;
        x1 = x;
        const ap = C * f + ax1 - C * ay1;
        ax1 = f;
        ay1 = ap;
        dl[idx] = ap * g;
        idx = idx + 1 === L ? 0 : idx + 1;
        const i = i0 + s;
        if (i >= out.L.length) break;
        const xf = x * tailGain(s);
        out.L[i] += xf * gl;
        out.R[i] += xf * gr;
      }
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Bowed string section: N players, each a band-limited saw with its own detune, delayed vibrato, bow-pressure
// wobble, bow noise and envelope; brightness follows dynamics. The body resonance is applied per section (part fx).
// Articulations: ^ staccato, ! accent, _ legato (slow bow), ~ tremolo.
// ---------------------------------------------------------------------------------------------------------------
export function strings(spec) {
  const {
    players = 6, detune = 6, vib = [5.6, 0.16, 0.22], attack = 0.13, release = 0.32, noise = 0.035, spread = 0.3,
    timing = 0.018, bright = [4, 22], wobble = 0.05, gain = 1, range = [28, 105], source = 'saw',
  } = spec;
  return {
    range,
    render(ev, out, ctx) {
      const r = rng(ev.seed);
      const a = ev.art, tech = ev.tech ?? [];
      const stacc = a.includes('^'), acc = a.includes('!'), leg = a.includes('_'), trem = a.includes('~');
      const harmonic = a.includes('*');
      const pont = tech.includes('pont'), tasto = tech.includes('tasto'), spicc = tech.includes('spicc');
      const legno = tech.includes('legno'), port = tech.includes('port');
      // measured tremolo: bow strokes of a note value (%trem16: sixteenths), in time with the music
      const measured = tech.find((k) => /^trem\d+$/.test(k));
      const stroke = measured ? ((ev.quarter ?? 0.5) * 4) / Number(measured.slice(4)) : 0;
      // the bow turns between unslurred notes that join: a quicker start than from silence
      const bowChange = !leg && ev.legato && !stacc && !spicc && !legno;
      const att = legno ? 0.002 : spicc ? 0.006 : stacc ? 0.025 : acc ? 0.04 : leg ? 0.03 : bowChange ? 0.06 : attack;
      // a note the next one is slurred to hands over quickly (one bow, one sound)
      const rel = legno || spicc ? 0.05 : stacc ? 0.08 : ev.slurNext ? 0.07 : release;
      const durS = legno ? Math.min(ev.dur, 0.1) : spicc ? Math.min(ev.dur * 0.5, 0.13) : stacc ? Math.min(ev.dur * 0.6, 0.2) : ev.dur;
      const decayT = legno ? 0.045 : spicc ? 0.07 : 0; // struck and bounced notes die away
      const onN = Math.round(durS * SR);
      const n = onN + Math.round(rel * SR * 1.15);
      const lv = noteLevels(ev, ctx, n);
      const f0 = mtof(ev.midi);
      const per = (gain / Math.sqrt(players)) * (0.55 + 0.45 * ev.vel) * (legno ? 0.7 : harmonic ? 0.8 : 1);
      const i0b = Math.round(ev.t * SR);
      const nP = ev.cn > 1 ? Math.max(1, Math.round(players / ev.cn)) : players; // divisi: the section splits
      // the pitch path: a slurred note leaves the last over a finger change (30 ms); portamento slides (up to 0.2 s)
      const from = ev.prevMidi != null && ev.ci === 0 && Math.abs(ev.prevMidi - ev.midi) <= 12 ? ev.prevMidi - ev.midi : 0;
      const glideT = !from ? 0 : port ? Math.min(0.2, 0.4 * ev.dur) : leg ? 0.03 : 0;
      // the bow's contact point: near the bridge glassy (upper partials, fundamental weak), over the fingerboard soft;
      // a harmonic is nearly pure
      const brightMul = pont ? 1.8 : tasto ? 0.45 : 1;
      const noiseMul = pont ? 2.5 : tasto ? 0.5 : harmonic ? 0.35 : legno ? 0 : 1;
      const vibMul = harmonic ? 0.4 : 1;
      for (let p = 0; p < nP; p++) {
        const det = gauss(r) * detune;
        const vRate = vib[0] * (1 + (r() - 0.5) * 0.16);
        const vDepth = vib[1] * (0.7 + r() * 0.6) * vibMul;
        const vDelay = Math.max(0.01, vib[2] * (0.7 + r() * 0.6));
        const i0 = i0b + Math.round(r() * timing * SR);
        const [gl, gr] = ctx.pan(clamp(ev.pan + spread * (r() * 2 - 1), -1, 1));
        const osc = new Saw(r());
        const pul = new Pulse(r());
        const env = new ADSR(att * (0.85 + r() * 0.3), 0.5, 0.9, rel);
        const lpf = new OnePole(f0 * bright[1]), lpf2 = new OnePole(f0 * bright[1]);
        const nlp = new OnePole(4200), nhp = new OnePole(500);
        const hpf = new OnePole(f0 * 2.2), hpf2 = new OnePole(f0 * 2.2); // sul ponticello: the fundamental drops away
        const click = new Biquad('bp', 3200, 1.2); // col legno: the stick on the string
        const wRate = (TAU * (0.35 + r() * 0.7)) / SR;
        let wPh = r() * TAU;
        let vPh = r() * TAU;
        const vInc = (TAU * vRate) / SR;
        const tRate = (TAU * (12 + r() * 3)) / SR;
        let tPh = r() * TAU;
        const sOff = r() * 0.006; // each player's strokes a little apart
        const base = det / 100;
        for (let s = 0; s < n; s++) {
          const t = s / SR;
          let e = env.next(s < onN);
          if (decayT) e *= Math.exp(-t / decayT);
          const lvl = lv[s >> 6];
          vPh += vInc;
          let semis = base + vDepth * Math.min(1, t / vDelay) * Math.sin(vPh);
          if (glideT && t < glideT) {
            const x = t / glideT;
            semis += from * (port ? (1 - x) * (1 - x) : 1 - x * x * (3 - 2 * x));
          }
          const dt = (f0 * exp2s(semis)) / SR;
          let y = source === 'saw' ? osc.next(dt) : 0.6 * osc.next(dt) + 0.4 * pul.next(dt, 0.3);
          if ((s & 31) === 0) {
            const fc = harmonic ? f0 * 1.4 : f0 * (bright[0] + (bright[1] - bright[0]) * e * lvl) * brightMul;
            lpf.set(Math.min(16000, fc));
            if (tasto) lpf2.set(Math.min(16000, fc));
          }
          y = lpf.lp(y);
          if (tasto) y = lpf2.lp(y); // over the fingerboard: the upper partials fall away faster
          if (pont) y = 2.2 * hpf2.hp(hpf.hp(y));
          // bow noise: more on a new stroke (none on a slur), and on every stroke of a measured tremolo
          let scrape = leg ? 0 : 3 * Math.max(0, 1 - t / 0.05);
          let strokeAmp = 1;
          if (stroke && t > 0) {
            const ph = ((t + sOff) % stroke) / stroke, st = ph * stroke;
            // each stroke bites (the bow changes direction), then eases off
            strokeAmp = (0.3 + 0.7 * Math.min(1, st / 0.012)) * (1 - 0.35 * ph) * (1 + 0.3 * Math.exp(-st / 0.02));
            scrape += 2.5 * Math.exp(-st / 0.012);
          }
          const bow = (r() * 2 - 1) * noise * noiseMul * (e + scrape);
          y += nhp.hp(nlp.lp(bow));
          if (legno) y += click.tick((r() * 2 - 1) * Math.exp(-t / 0.004)) * 2.5;
          wPh += wRate;
          let amp = e * (1 + wobble * Math.sin(wPh)) * levelGain(lvl) * per * strokeAmp;
          if (trem) {
            tPh += tRate;
            amp *= 0.6 + 0.4 * Math.sin(tPh);
          }
          y *= amp;
          const i = i0 + s;
          if (i >= out.L.length) break;
          out.L[i] += y * gl;
          out.R[i] += y * gr;
        }
      }
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Brass section: saw through a lowpass whose cutoff rises with the envelope and the dynamic (the "blare"),
// a lip scoop into pitch, breath noise on the attack.
// ---------------------------------------------------------------------------------------------------------------
export function brass(spec) {
  const {
    players = 3, detune = 5, attack = 0.06, release = 0.22, scoop = 0.3, scoopT = 0.035, bright = [1.3, 13], res = 0.22,
    breath = 0.025, vib = [5, 0.05, 0.45], spread = 0.2, timing = 0.012, gain = 1, range = [34, 84], flutter = 24,
  } = spec;
  return {
    range,
    render(ev, out, ctx) {
      const r = rng(ev.seed);
      const a = ev.art, tech = ev.tech ?? [];
      const stacc = a.includes('^'), acc = a.includes('!'), leg = a.includes('_');
      const flz = a.includes('~') || tech.includes('flz'), rip = tech.includes('rip');
      const measured = tech.find((k) => /^trem\d+$/.test(k));
      const stroke = measured ? ((ev.quarter ?? 0.5) * 4) / Number(measured.slice(4)) : 0;
      const att = leg ? 0.025 : stacc ? 0.02 : acc ? 0.03 : attack;
      const durS = stacc ? Math.min(ev.dur * 0.6, 0.22) : ev.dur;
      const onN = Math.round(durS * SR);
      const rel = ev.slurNext ? 0.06 : release;
      const n = onN + Math.round(rel * SR * 1.2);
      const lv = noteLevels(ev, ctx, n);
      const f0 = mtof(ev.midi);
      const k = 2 * (1 - 0.97 * res);
      const per = (gain / Math.sqrt(players)) * (0.5 + 0.5 * ev.vel);
      const i0b = Math.round(ev.t * SR);
      // a rip: a fast lip slur up through the partials into the note, getting louder
      const ripT = rip ? Math.min(0.22, 0.5 * ev.dur) : 0;
      // a slurred note moves from the last by the lips (25 ms), with no scoop
      const from = leg && ev.prevMidi != null && Math.abs(ev.prevMidi - ev.midi) <= 12 ? ev.prevMidi - ev.midi : 0;
      // cuivre: loud brass turns brassy, its wave steepened in the bore (shock waves); %brassy asks for it at any level
      const forced = tech.includes('brassy');
      for (let p = 0; p < players; p++) {
        const det = gauss(r) * detune;
        const i0 = i0b + Math.round(r() * timing * SR);
        const [gl, gr] = ctx.pan(clamp(ev.pan + spread * (r() * 2 - 1), -1, 1));
        const osc = new Saw(r());
        const env = new ADSR(att * (0.85 + r() * 0.3), 0.35, acc ? 0.72 : 0.85, rel);
        const flt = new SVF();
        const nb = new Biquad('bp', 1400, 0.8);
        let vPh = r() * TAU;
        const vInc = (TAU * vib[0] * (1 + (r() - 0.5) * 0.1)) / SR;
        let g = svfG(f0 * 2);
        const sc = leg || rip ? 0 : scoop * (0.7 + r() * 0.6);
        const fInc = (TAU * flutter * (0.9 + r() * 0.2)) / SR;
        let fPh = r() * TAU;
        const sOff = r() * 0.004;
        let drive = 0;
        for (let s = 0; s < n; s++) {
          const t = s / SR;
          const e = env.next(s < onN);
          const lvl = lv[s >> 6];
          vPh += vInc;
          let semis = det / 100 - sc * Math.exp(-t / scoopT) + (t > vib[2] ? vib[1] * Math.sin(vPh) : 0);
          if (ripT && t < ripT) semis -= Math.round(9 * (1 - t / ripT)) * 0.85 + 0.15 * 9 * (1 - t / ripT);
          if (from && t < 0.025) semis += from * (1 - t / 0.025);
          const dt = (f0 * exp2s(semis)) / SR;
          let y = osc.next(dt);
          if ((s & 7) === 0) {
            const blare = Math.pow(e, 1.4) * (0.35 + 0.65 * lvl) * (acc ? 1.15 : 1);
            const hot = forced ? 1.25 : Math.max(0, (lvl - 0.78) / 0.22) * e;
            drive = hot * 3;
            g = svfG(Math.min(15000, f0 * (bright[0] + (bright[1] - bright[0]) * blare) * (1 + 0.5 * hot)));
          }
          if (drive > 0.01) y = Math.tanh(y * (1 + drive)) / Math.tanh(1 + drive);
          y += nb.tick((r() * 2 - 1) * breath * (0.4 * e + 4 * Math.exp(-t / 0.025)));
          y = flt.tick(y, g, k);
          let amp = e * levelGain(lvl) * per;
          if (ripT && t < ripT) amp *= 0.35 + 0.65 * (t / ripT);
          if (flz) {
            // flutter-tongue: the tongue rolls (about 24 times a second), chopping and roughening the tone
            fPh += fInc;
            amp *= 0.62 + 0.38 * Math.sin(fPh) + 0.12 * (r() - 0.5);
          }
          if (stroke && t > 0) {
            // tongued repeats: double-tongued, so every other stroke (the "k") is a little softer
            const st = (t + sOff) % stroke, kth = Math.floor((t + sOff) / stroke) & 1;
            amp *= (kth ? 0.82 : 1) * (0.4 + 0.6 * Math.min(1, st / 0.012)) * (1 - 0.25 * (st / stroke));
          }
          y *= amp;
          const i = i0 + s;
          if (i >= out.L.length) break;
          out.L[i] += y * gl;
          out.R[i] += y * gr;
        }
      }
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Choir: an ensemble of glottal sources (saw, tilted), each with its own vibrato and jitter. With spec.voice
// (soprano, alto, tenor, bass) every note is sung on its own vowel (token suffix @a @e @i @o @u, default spec.vowel)
// or syllable (@freu: its consonants too); without it, a part fx 'formant' sets one vowel for the whole part.
// ---------------------------------------------------------------------------------------------------------------
// Consonants by spelling, longest first: [letters, kind, band centre Hz, Q, seconds, level]. Kinds: f fricative
// (shaped noise), p plosive (a burst), v voiced (the vowel's own sound, dipped and darkened), r a tapped r.
const PHONES = [
  ['tsch', 'f', 3000, 1.2, 0.11, 0.45], ['sch', 'f', 3000, 1.2, 0.1, 0.45], ['ch', 'f', 2400, 0.8, 0.08, 0.3],
  ['sh', 'f', 3000, 1.2, 0.1, 0.45], ['th', 'f', 5500, 0.6, 0.06, 0.15], ['ph', 'f', 4500, 0.5, 0.07, 0.22],
  ['ck', 'p', 2200, 1.4, 0.025, 0.5], ['qu', 'p', 2200, 1.4, 0.025, 0.5], ['ng', 'v', 0, 0, 0.06, 0],
  ['s', 'f', 6500, 1.6, 0.09, 0.5], ['ß', 'f', 6500, 1.6, 0.09, 0.5], ['z', 'f', 6000, 1.4, 0.08, 0.45],
  ['x', 'f', 6000, 1.4, 0.08, 0.4], ['c', 'p', 2200, 1.4, 0.025, 0.5], ['k', 'p', 2200, 1.4, 0.025, 0.5],
  ['g', 'p', 2000, 1.2, 0.02, 0.3], ['t', 'p', 4500, 0.9, 0.018, 0.6], ['d', 'p', 3500, 0.9, 0.015, 0.35],
  ['p', 'p', 900, 0.9, 0.015, 0.45], ['b', 'p', 700, 0.9, 0.012, 0.3], ['f', 'f', 4500, 0.5, 0.07, 0.22],
  ['v', 'f', 4500, 0.5, 0.06, 0.15], ['h', 'f', 1600, 0.4, 0.05, 0.18], ['w', 'v', 0, 0, 0.05, 0],
  ['m', 'v', 0, 0, 0.06, 0], ['n', 'v', 0, 0, 0.06, 0], ['l', 'v', 0, 0, 0.05, 0], ['j', 'v', 0, 0, 0.04, 0],
  ['y', 'v', 0, 0, 0.04, 0], ['r', 'r', 0, 0, 0.05, 0],
];
const SUNG_VOWELS = /[aeiouyäöüéèêëàâáíîïóôúûœæ]+/g;
const phonesOf = (letters) => {
  const out = [];
  for (let i = 0; i < letters.length;) {
    const ph = PHONES.find(([sp]) => letters.startsWith(sp, i));
    if (!ph) i++;
    else {
      out.push(ph);
      i += ph[0].length;
    }
  }
  return out;
};
/** A sung syllable's consonants: those before its first vowel (onset) and after its last (coda). */
export function syllableParts(syl) {
  const t = (syl ?? '').toLowerCase();
  const runs = [...t.matchAll(SUNG_VOWELS)];
  if (!runs.length) return { onset: phonesOf(t), coda: [] };
  const first = runs[0], last = runs[runs.length - 1];
  // a leading y before a vowel is a consonant (ja, you); a vowel run of only "y" after consonants is the vowel
  return { onset: phonesOf(t.slice(0, first.index)), coda: phonesOf(t.slice(last.index + last[0].length)) };
}

export function choir(spec) {
  const {
    players = 6, detune = 9, vib = [5.2, 0.24, 0.35], release = 0.5, breath = 0.03, spread = 0.35,
    timing = 0.03, tilt = 6, gain = 1, range = [36, 84], voice = null, vowel = 'a',
  } = spec;
  return {
    range,
    render(ev, out, ctx) {
      const r = rng(ev.seed);
      const onN = Math.round(ev.dur * SR);
      const n = onN + Math.round(release * SR * 1.2);
      const lv = noteLevels(ev, ctx, n);
      const f0 = mtof(ev.midi);
      const per = (gain / Math.sqrt(players)) * (0.55 + 0.45 * ev.vel);
      // a syllable's consonants (with a voice type): the vowel starts sooner after a consonant, and stops for a final one
      const sy = voice && ev.syl ? syllableParts(ev.syl) : null;
      const attack = sy?.onset.length ? Math.min(spec.attack ?? 0.28, 0.09) : spec.attack ?? 0.28;
      const i0b = Math.round(ev.t * SR);
      const span = n + Math.ceil(timing * SR) + 1;
      // with a voice type the note is sung into a scratch buffer, then shaped by its own vowel
      const dst = voice ? { L: new Float32Array(span), R: new Float32Array(span) } : out;
      const base = voice ? 0 : i0b;
      for (let p = 0; p < players; p++) {
        const det = gauss(r) * detune;
        const i0 = base + Math.round(r() * timing * SR);
        const [gl, gr] = ctx.pan(clamp(ev.pan + spread * (r() * 2 - 1), -1, 1));
        const osc = new Saw(r());
        const env = new ADSR(attack * (0.8 + r() * 0.4), 0.6, 0.92, release);
        const tl = new OnePole(Math.min(12000, f0 * tilt));
        const vRate = vib[0] * (1 + (r() - 0.5) * 0.14);
        const vDepth = vib[1] * (0.7 + r() * 0.6);
        let vPh = r() * TAU;
        const vInc = (TAU * vRate) / SR;
        let jit = 0;
        for (let s = 0; s < n; s++) {
          const t = s / SR;
          const e = env.next(s < onN);
          const lvl = lv[s >> 6];
          vPh += vInc;
          if ((s & 255) === 0) jit = jit * 0.9 + (r() - 0.5) * 0.02;
          const semis = det / 100 + jit + vDepth * Math.min(1, t / vib[2]) * Math.sin(vPh);
          let y = tl.lp(osc.next((f0 * exp2s(semis)) / SR));
          y += (r() * 2 - 1) * breath * e;
          y *= e * levelGain(lvl) * per;
          const i = i0 + s;
          if (i >= dst.L.length) break;
          dst.L[i] += y * gl;
          dst.R[i] += y * gr;
        }
      }
      if (voice) {
        const v = ev.vowel ?? vowel;
        const th = Math.min(12000, f0 * tilt);
        formant(dst.L, voice, v, f0, th);
        formant(dst.R, voice, v, f0, th);
        if (sy) consonants(sy, ev, dst, out, i0b, onN, span, gain * (0.55 + 0.45 * ev.vel) * levelGain(lv[0]));
        const m = Math.min(span, out.L.length - i0b);
        for (let s = 0; s < m; s++) {
          out.L[i0b + s] += dst.L[s];
          out.R[i0b + s] += dst.R[s];
        }
      }
    },
  };
}

/**
 * Sing a syllable's consonants around its vowel (already in `dst`, which starts at the note): fricatives and plosives
 * of the onset sound just before the note, so the vowel lands on the beat; voiced ones (m n l r w j) dip and darken
 * the vowel's start; a final consonant stops the vowel and sounds at the note's end.
 */
function consonants({ onset, coda }, ev, dst, out, i0b, onN, span, amp) {
  const r = rng(ev.seed ^ 0x5bd1e995);
  const noise = (ph, at, L) => {
    const [, kind, fc, q, dur, level] = ph;
    const bp = new Biquad('bp', fc, q), m = Math.round(dur * SR);
    for (let s = 0; s < m; s++) {
      const x = s / m;
      const env = kind === 'p' ? Math.exp(-x * 5) : Math.min(1, x / 0.2) * Math.min(1, (1 - x) / 0.25);
      const y = bp.tick(r() * 2 - 1) * env * level * amp * 1.4;
      const i = at + s;
      if (i < 0 || i >= L) continue;
      out.L[i] += y * (1 + 0.1 * (r() - 0.5));
      out.R[i] += y * (1 + 0.1 * (r() - 0.5));
    }
  };
  // the onset: unvoiced consonants in turn before the note, voiced ones over the vowel's start
  const unv = onset.filter((ph) => ph[1] === 'f' || ph[1] === 'p');
  let at = i0b - Math.round(unv.reduce((a, ph) => a + ph[4], 0) * SR);
  for (const ph of unv) {
    noise(ph, at, out.L.length);
    at += Math.round(ph[4] * SR);
  }
  const voiced = onset.filter((ph) => ph[1] === 'v' || ph[1] === 'r');
  if (voiced.length) {
    const m = Math.min(span, Math.round(voiced.reduce((a, ph) => a + ph[4], 0) * SR));
    const tap = voiced.some((ph) => ph[1] === 'r');
    for (let s = 0; s < m; s++) {
      const x = s / m;
      let g = 0.25 + 0.75 * x * x;
      if (tap) g *= 0.6 + 0.4 * Math.cos((TAU * 25 * s) / SR);
      dst.L[s] *= g;
      dst.R[s] *= g;
    }
  }
  if (!coda.length) return;
  // the coda: the vowel closes (to a hum for m n l, to silence before the others), then the consonant sounds
  const unvC = coda.filter((ph) => ph[1] === 'f' || ph[1] === 'p');
  const cDur = Math.round(unvC.reduce((a, ph) => a + ph[4], 0) * SR);
  const close = Math.max(0, onN - cDur), fade = Math.round(0.05 * SR);
  const floor = unvC.length ? 0 : 0.4;
  for (let s = Math.max(0, close - fade); s < span; s++) {
    const g = s < close ? 1 - (1 - floor) * ((s - (close - fade)) / fade) : floor;
    dst.L[s] *= g;
    dst.R[s] *= g;
  }
  at = i0b + close;
  for (const ph of unvC) {
    noise(ph, at, out.L.length);
    at += Math.round(ph[4] * SR);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Modal synthesis: a bank of two-pole resonators excited by mallet strikes. Timpani, glockenspiel, celesta.
// Art ~ makes a roll (repeated strikes at rollRate for the note's length).
// ---------------------------------------------------------------------------------------------------------------
export function modal(spec) {
  const {
    modes = [[1, 1, 2]], hardness = 3000, noise = 0.2, noiseLP = 3000, velBright = 0.8, rollRate = 15, gain = 1,
    range = [24, 108], tail = 1, dyn = false,
  } = spec;
  return {
    range,
    render(ev, out, ctx) {
      const r = rng(ev.seed);
      const f0 = mtof(ev.midi);
      const roll = ev.art.includes('~');
      const strikes = [];
      if (roll) {
        for (let t = 0; t < ev.dur; t += 1 / rollRate) strikes.push([t + (r() - 0.5) * 0.01, 0.75 + r() * 0.25]);
      } else strikes.push([0, 1]);
      const lv = noteLevels(ev, ctx, Math.round((ev.dur + 0.1) * SR));
      const maxT = Math.max(...modes.map((m) => m[2]));
      const n = Math.round((ev.dur * (roll ? 1 : 0) + maxT * tail) * SR);
      // impulses at the strikes; the mallet's softness is a per-mode weight (a soft mallet excites high modes less)
      const exc = new Float64Array(n);
      for (const [ts, sv] of strikes) {
        const s0 = Math.max(0, Math.round(ts * SR));
        const lvl = roll ? lv[Math.min(lv.length - 1, s0 >> 6)] : 1;
        if (s0 < n) exc[s0] += sv * (roll ? levelGain(lvl) : 1);
      }
      const [gl, gr] = ctx.pan(ev.pan);
      const i0 = Math.round(ev.t * SR);
      const lvl0 = dyn ? ctx.levelAt(ev.t) : 1;
      const v = dyn ? clamp(ev.vel * (0.55 + 0.6 * lvl0), 0.05, 1) : ev.vel; // dynamics: louder blows are brighter too
      const dg = dyn && !roll ? levelGain(lvl0) : 1;
      const y = new Float64Array(n);
      modes.forEach(([ratio, amp, t60], j) => {
        const f = f0 * ratio;
        if (f > SR * 0.45) return;
        const w = (TAU * f) / SR;
        const rr = Math.pow(10, -3 / (t60 * SR));
        const a1 = 2 * rr * Math.cos(w), a2 = -rr * rr;
        const vb = Math.pow(v, 1 + velBright * j * 0.5);
        const mallet = 1 / (1 + Math.pow(f / (hardness * (0.6 + 0.4 * v)), 2));
        const scale = amp * vb * mallet * Math.sin(w) * 0.6;
        let y1 = 0, y2 = 0;
        for (let s = 0; s < n; s++) {
          const yy = exc[s] * scale + a1 * y1 + a2 * y2;
          y2 = y1;
          y1 = yy;
          y[s] += yy;
        }
      });
      const nl = new OnePole(noiseLP);
      for (const [ts, sv] of strikes) {
        const s0 = Math.max(0, Math.round(ts * SR));
        const nn = Math.round(0.012 * SR);
        for (let k = 0; k < nn && s0 + k < n; k++) y[s0 + k] += nl.lp(r() * 2 - 1) * noise * sv * v * Math.exp(-k / (0.003 * SR));
      }
      for (let s = 0; s < n; s++) {
        const i = i0 + s;
        if (i >= out.L.length) break;
        const val = y[s] * gain * v * dg;
        out.L[i] += val * gl;
        out.R[i] += val * gr;
      }
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Drum kit: every token is a synthesized hit (kick, snare, hats, cymbals, toms, clap, swell).
// ---------------------------------------------------------------------------------------------------------------
const METAL = [205.3, 304.4, 369.6, 522.7, 540, 800];

export function hit(p, v, r, len) {
  const n = Math.round(len * SR);
  const y = new Float64Array(n);
  const T = p.type;
  if (T === 'kick' || T === 'tom') {
    let ph = 0;
    const kd = p.d, pd = p.pd;
    const hp = new OnePole(2500);
    for (let s = 0; s < n; s++) {
      const t = s / SR;
      const f = p.f0 + (p.f1 - p.f0) * Math.exp(-t / pd);
      ph += (TAU * f) / SR;
      let x = Math.sin(ph) * Math.pow(10, (-3 * t) / kd);
      x += (p.click ?? 0) * hp.hp(r() * 2 - 1) * Math.exp(-t / 0.0025);
      x += (p.thump ?? 0) * (r() * 2 - 1) * Math.exp(-t / 0.02) * 0.3;
      y[s] = p.drive ? Math.tanh(x * p.drive) / Math.tanh(p.drive) : x;
    }
  } else if (T === 'snare') {
    const [fa, fb] = p.tone;
    let pa = 0, pb = 0;
    const hp = new Biquad('hp', p.nf[0], 0.7), lp = new Biquad('lp', p.nf[1], 0.7);
    const gtl = new OnePole(5200), gth = new OnePole(450);
    for (let s = 0; s < n; s++) {
      const t = s / SR;
      pa += (TAU * fa * (1 + 0.25 * Math.exp(-t / 0.01))) / SR;
      pb += (TAU * fb * (1 + 0.2 * Math.exp(-t / 0.01))) / SR;
      const body = (Math.sin(pa) * 0.65 + Math.sin(pb) * 0.35) * Math.pow(10, (-3 * t) / p.td);
      const white = r() * 2 - 1;
      const nz = lp.tick(hp.tick(white)) * Math.pow(10, (-3 * t) / p.nd) * (1 + (p.snap ?? 0.5) * 3 * Math.exp(-t / 0.006));
      y[s] = body * (p.bodyMix ?? 0.55) + nz * (p.noiseMix ?? 0.85);
      if (p.gate) {
        // 1980s gated reverb: a dense plateau of filtered noise that is cut off hard
        const [lvl, hold, rel] = p.gate;
        const g = t < hold ? 1 - 0.35 * (t / hold) : Math.exp(-(t - hold) / rel);
        y[s] += gtl.lp(gth.hp(r() * 2 - 1)) * lvl * g * Math.min(1, t / 0.008);
      }
    }
  } else if (T === 'metal') {
    const oscs = METAL.map((f) => new Pulse(r()));
    const scale = p.scale ?? 1;
    const bp = new Biquad('bp', p.bp ?? 10000, p.q ?? 0.9), hp = new Biquad('hp', p.hp ?? 7000, 0.7), hp2 = new Biquad('hp', p.hp ?? 7000, 0.7);
    const ns = new Biquad('hp', p.hp ?? 7000, 0.7);
    for (let s = 0; s < n; s++) {
      const t = s / SR;
      let m = 0;
      for (let k = 0; k < 6; k++) m += oscs[k].next((METAL[k] * scale) / SR, 0.5);
      const sw = p.swell ?? 0;
      const env = (sw ? Math.min(1, Math.pow(t / sw, 2)) : 1) * Math.pow(10, (-3 * Math.max(0, t - sw)) / p.d);
      const x = hp2.tick(hp.tick(bp.tick(m * (p.metal ?? 0.6)))) + ns.tick(r() * 2 - 1) * (1 - (p.metal ?? 0.6));
      y[s] = x * env * (1 + (p.attack ?? 0.6) * Math.exp(-t / 0.004));
    }
  } else if (T === 'clap') {
    const bp = new Biquad('bp', 1250, 1.4);
    for (let s = 0; s < n; s++) {
      const t = s / SR;
      let env = 0;
      for (const o of [0, 0.011, 0.023, 0.034]) if (t >= o) env += Math.exp(-(t - o) / 0.006) * (t - o < 0.03 ? 1 : 0);
      env += Math.exp(-t / (p.d ?? 0.18)) * 0.35;
      y[s] = bp.tick(r() * 2 - 1) * env * 2;
    }
  } else if (T === 'bell') {
    // decaying sine partials [Hz, amp, T60 s] (triangle, tam-tam, wood block, cow bell) with a strike noise
    const sw = p.swell ?? 0;
    for (const [f, a, t60] of p.partials) {
      if (f > SR * 0.45) continue;
      const w = (TAU * f * (1 + (r() - 0.5) * 0.004)) / SR;
      const rr = Math.pow(10, -3 / (t60 * SR));
      const c = Math.cos(w), sn = Math.sin(w);
      let x = Math.cos(r() * TAU), yv = 0, amp = a;
      for (let s = 0; s < n; s++) {
        const u = x * c - yv * sn;
        yv = x * sn + yv * c;
        x = u;
        const t = s / SR;
        y[s] += amp * yv * (sw ? Math.min(1, Math.pow(t / sw, 2)) : 1);
        if (!sw || t > sw) amp *= rr;
      }
    }
    if (p.noise) {
      const nl = new OnePole(p.noiseLP ?? 6000);
      const nn = Math.min(n, Math.round(0.03 * SR));
      for (let s = 0; s < nn; s++) y[s] += nl.lp(r() * 2 - 1) * p.noise * Math.exp(-s / ((p.nd ?? 0.006) * SR));
    }
  } else if (T === 'noise') {
    const bp = new Biquad('bp', p.bp ?? 5000, p.q ?? 0.6);
    for (let s = 0; s < n; s++) {
      const t = s / SR;
      const env = (p.swell ? Math.min(1, Math.pow(t / p.swell, 2)) : 1) * Math.pow(10, (-3 * Math.max(0, t - (p.swell ?? 0))) / p.d);
      y[s] = bp.tick(r() * 2 - 1) * env;
    }
  } else throw new Error(`drums: unknown hit type ${T}`);
  for (let s = 0; s < n; s++) y[s] *= v * (p.gain ?? 1);
  return y;
}

export function drums(spec) {
  const { kit, gain = 1 } = spec;
  return {
    range: [0, 127],
    render(ev, out, ctx) {
      let p = kit[ev.drum];
      if (!p) throw new Error(`drums: unknown token "${ev.drum}"`);
      if (p.swell === 'dur') p = { ...p, swell: ev.dur }; // a swell lasts as long as the written note
      const r = rng(ev.seed);
      const len = p.len ?? (p.type === 'metal' || p.type === 'noise' ? p.d * 1.05 + (p.swell ?? 0) : (p.d ?? p.nd ?? 0.4) * 1.1);
      const v = ev.vel * (1 + (r() - 0.5) * 0.06);
      const y = hit(p, v, r, Math.max(0.02, p.swell ? ev.dur + p.d : len));
      const [gl, gr] = ctx.pan(clamp(ev.pan + (p.pan ?? 0), -1, 1));
      const i0 = Math.round(ev.t * SR) + Math.round((p.late ?? 0) * SR);
      for (let s = 0; s < y.length; s++) {
        const i = i0 + s;
        if (i >= out.L.length) break;
        const val = y[s] * gain;
        out.L[i] += val * gl;
        out.R[i] += val * gr;
      }
    },
  };
}

export const BUILDERS = { chip, va, fm, pluck, strings, brass, choir, modal, drums, piano };

export function build(spec) {
  const b = BUILDERS[spec.type];
  if (!b) throw new Error(`unknown instrument type "${spec.type}" (known: ${Object.keys(BUILDERS).join(', ')})`);
  return b(spec);
}

// Shared ranges (MIDI, sounding) so the critic can flag notes an instrument cannot play.
export const RANGES = {
  violin: [55, 100], viola: [48, 88], cello: [36, 79], bass: [28, 67], horn: [34, 77], trumpet: [52, 82],
  trombone: [40, 72], tuba: [28, 65], timpani: [38, 57], harp: [24, 103], glock: [79, 108], celesta: [60, 108],
  soprano: [60, 81], alto: [53, 74], tenor: [48, 69], baritone: [43, 65], guitar: [38, 88], bassguitar: [26, 60],
  piano: [21, 108],
};
export { db, levelGain };
