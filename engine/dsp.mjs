// dsp.mjs: deterministic DSP primitives. No dependencies, no Math.random, no clocks.
// The same code runs in Node and in a browser worker, so a song renders to the same samples everywhere V8 runs it.

export const SR = 44100;
export const TAU = Math.PI * 2;

/** mulberry32: small seeded PRNG returning [0, 1). */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a hash of a string, for per-part / per-note seeds. */
export function hash(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Gaussian sample from a uniform rng (Box-Muller). */
export function gauss(r) {
  const u = Math.max(1e-12, r());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * r());
}

export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const db = (x) => Math.pow(10, x / 20);
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;

/** Equal-power pan: returns [gainL, gainR] for pan in -1..1. */
export function panGains(pan) {
  const a = ((clamp(pan, -1, 1) + 1) * Math.PI) / 4;
  return [Math.cos(a), Math.sin(a)];
}

/** PolyBLEP residual for band-limited discontinuities. t = phase in [0,1), dt = phase increment. */
export function polyBlep(t, dt) {
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
}

/** Band-limited sawtooth, -1..1. */
export class Saw {
  constructor(phase = 0) {
    this.p = phase;
  }
  next(dt) {
    let p = this.p + dt;
    if (p >= 1) p -= 1;
    this.p = p;
    return 2 * p - 1 - polyBlep(p, dt);
  }
}

/** Band-limited pulse with variable duty, -1..1. */
export class Pulse {
  constructor(phase = 0) {
    this.p = phase;
  }
  next(dt, duty) {
    let p = this.p + dt;
    if (p >= 1) p -= 1;
    this.p = p;
    let v = p < duty ? 1 : -1;
    v += polyBlep(p, dt);
    let q = p - duty;
    if (q < 0) q += 1;
    v -= polyBlep(q, dt);
    return v;
  }
}

/** Topology-preserving state variable filter (Zavalishin). Cutoff may change every sample. */
export class SVF {
  constructor() {
    this.ic1 = 0;
    this.ic2 = 0;
    this.lp = 0;
    this.bp = 0;
    this.hp = 0;
  }
  /** g = tan(pi * fc / SR), k = 1 / Q. */
  tick(x, g, k) {
    const a1 = 1 / (1 + g * (g + k));
    const a2 = g * a1;
    const a3 = g * a2;
    const v3 = x - this.ic2;
    const v1 = a1 * this.ic1 + a2 * v3;
    const v2 = this.ic2 + a2 * this.ic1 + a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    this.lp = v2;
    this.bp = v1;
    this.hp = x - k * v1 - v2;
    return v2;
  }
}
export const svfG = (fc) => Math.tan((Math.PI * clamp(fc, 10, SR * 0.45)) / SR);

/** RBJ biquad (direct form II transposed). Types: lp hp bp notch peak ls hs. */
export class Biquad {
  constructor(type, f, q = 0.7071, gainDb = 0, sr = SR) {
    this.z1 = 0;
    this.z2 = 0;
    this.sr = sr;
    this.set(type, f, q, gainDb);
  }
  set(type, f, q = 0.7071, gainDb = 0) {
    const sr = this.sr;
    const w = (TAU * clamp(f, 5, sr * 0.49)) / sr;
    const cw = Math.cos(w);
    const sw = Math.sin(w);
    const A = Math.pow(10, gainDb / 40);
    const al = sw / (2 * q);
    let b0, b1, b2, a0, a1, a2;
    switch (type) {
      case 'lp':
        b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al;
        break;
      case 'hp':
        b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al;
        break;
      case 'bp':
        b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al;
        break;
      case 'notch':
        b0 = 1; b1 = -2 * cw; b2 = 1; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al;
        break;
      case 'peak':
        b0 = 1 + al * A; b1 = -2 * cw; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cw; a2 = 1 - al / A;
        break;
      case 'ls': {
        const s = 2 * Math.sqrt(A) * al;
        b0 = A * (A + 1 - (A - 1) * cw + s); b1 = 2 * A * (A - 1 - (A + 1) * cw); b2 = A * (A + 1 - (A - 1) * cw - s);
        a0 = A + 1 + (A - 1) * cw + s; a1 = -2 * (A - 1 + (A + 1) * cw); a2 = A + 1 + (A - 1) * cw - s;
        break;
      }
      case 'hs': {
        const s = 2 * Math.sqrt(A) * al;
        b0 = A * (A + 1 + (A - 1) * cw + s); b1 = -2 * A * (A - 1 + (A + 1) * cw); b2 = A * (A + 1 + (A - 1) * cw - s);
        a0 = A + 1 - (A - 1) * cw + s; a1 = 2 * (A - 1 - (A + 1) * cw); a2 = A + 1 - (A - 1) * cw - s;
        break;
      }
      default:
        throw new Error(`biquad: unknown type ${type}`);
    }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
    return this;
  }
  tick(x) {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
  run(buf, from = 0, to = buf.length) {
    for (let i = from; i < to; i++) buf[i] = this.tick(buf[i]);
  }
}

/** A chain of biquads described as data: [['peak', 450, 1.2, -3], ['lp', 6000, 0.7], ...]. */
export function eqChain(spec) {
  return spec.map(([type, f, q, g]) => new Biquad(type, f, q ?? 0.7071, g ?? 0));
}
export function runChain(chain, buf) {
  for (const bq of chain) bq.run(buf);
}

/** One-pole lowpass / highpass. */
export class OnePole {
  constructor(fc = 1000) {
    this.z = 0;
    this.set(fc);
  }
  set(fc) {
    this.a = Math.exp((-TAU * clamp(fc, 1, SR * 0.49)) / SR);
    return this;
  }
  lp(x) {
    this.z = x + (this.z - x) * this.a;
    return this.z;
  }
  hp(x) {
    return x - this.lp(x);
  }
}

/** Circular delay line with fractional (linear) reads. read(d): the sample written d samples ago (d >= 1). */
export class Delay {
  constructor(maxSamples) {
    this.n = Math.max(2, Math.ceil(maxSamples) + 2);
    this.buf = new Float64Array(this.n);
    this.w = 0;
  }
  write(x) {
    this.buf[this.w] = x;
    this.w = this.w + 1 === this.n ? 0 : this.w + 1;
  }
  read(d) {
    let r = this.w - d;
    while (r < 0) r += this.n;
    const i = Math.floor(r);
    const f = r - i;
    const a = this.buf[i];
    const b = this.buf[i + 1 === this.n ? 0 : i + 1];
    return a + (b - a) * f;
  }
  readInt(d) {
    let r = this.w - d;
    if (r < 0) r += this.n;
    return this.buf[r];
  }
}

/** Pink noise (Paul Kellet's economy filter) from a uniform rng. */
export class Pink {
  constructor(r) {
    this.r = r;
    this.b0 = 0; this.b1 = 0; this.b2 = 0;
  }
  next() {
    const w = this.r() * 2 - 1;
    this.b0 = 0.99765 * this.b0 + w * 0.099046;
    this.b1 = 0.963 * this.b1 + w * 0.2965164;
    this.b2 = 0.57 * this.b2 + w * 1.0526913;
    return (this.b0 + this.b1 + this.b2 + w * 0.1848) * 0.2;
  }
}

/**
 * ADSR envelope, advanced one sample at a time. Attack is a sine-shaped rise, decay and release are exponential.
 * Times in seconds; `release` is the time to fall 60 dB.
 */
export class ADSR {
  constructor(a, d, s, r, curve = 'sine') {
    this.aN = Math.max(1, Math.round(a * SR));
    this.dk = Math.exp(-6.9 / Math.max(1, d * SR));
    this.s = s;
    this.rk = Math.exp(-6.9 / Math.max(1, r * SR));
    this.curve = curve;
    this.i = 0;
    this.v = 0;
    this.released = false;
  }
  next(gate) {
    if (gate && !this.released) {
      if (this.i < this.aN) {
        const x = this.i / this.aN;
        this.v = this.curve === 'sine' ? Math.sin((x * Math.PI) / 2) : x;
        this.i++;
      } else {
        this.v = this.s + (this.v - this.s) * this.dk;
      }
    } else {
      this.released = true;
      this.v *= this.rk;
    }
    return this.v;
  }
}

/** Dynamic marking to a 0..1 level. */
export const DYN = { ppp: 0.1, pp: 0.2, p: 0.32, mp: 0.45, mf: 0.6, f: 0.78, ff: 0.92, fff: 1 };
/** Level (0..1) to linear gain: pp is about -18 dB below ff. */
export const levelGain = (lv) => db(-24 * (1 - lv));
