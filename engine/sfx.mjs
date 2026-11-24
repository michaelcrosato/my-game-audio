// sfx.mjs: sound effects as data. An effect is a list of layers, each a small synthesis model, mixed and brought to
// a loudness. The same spec and seed give the same samples; a new seed gives a new take of the same sound (every
// noise, grain, detuning and the effect's `vary` ranges are drawn from it), so a game can vary each play.
//
//   renderSfx({ layers: [{ type: 'tone', wave: 'square', freq: 'C6', slide: 1.5, d: 0.12 }], level: -16 }, { seed })
//
// Layer types (each takes `at` seconds of delay, `gain` dB and `pan` -1..1):
//   tone    sfxr-style: wave (square saw sine triangle noise pulse), freq (Hz or a note name), slide (octaves per
//           second), dslide (its change per second), vib [rate Hz, semitones], arp [[seconds, semitones], ...],
//           repeat (seconds: restart the pitch, as in a coin's ding-ding), duty, dutySlide, envelope a / s / punch / d,
//           lp { f, sweep (octaves/s), res }, hp { f, sweep }
//   noise   filtered noise: color (white pink brown), bp [from Hz, to Hz] or lp / hp, q, envelope a / s / d, curve
//   modal   a struck resonant body: material (wood metal glass stone plastic flesh) or modes [[ratio, amp, T60 s]],
//           freq, hardness (0..1: a harder strike is brighter), d (scales the decays)
//   boom    an explosion: a falling low thump, a noise roar that darkens, crackle; size (0..1)
//   step    a footstep: surface (grass gravel wood stone metal water snow dirt), weight (0..1)
//   whoosh  air moving past: from / to (Hz of the band), d, q
//   crackle random clicks through a band: density (per second), bp, d, decay of each click
//   drip    water drops: count, freq (Hz), spread, d, span (seconds the drops are spread over)
//   creak   stick-slip friction (doors, hinges, timber): rate [from, to] pulses per second, res [Hz...], q, d
//   scatter many small strikes (glass shards, debris, coins, chain links, a bouncing shell): material or modes, freq
//           [lo, hi], count, span (s), bunch (crowds strikes to the start), taper, or pattern 'bounce' with gap, ratio
// Any layer also takes trem ([rate Hz, depth 0..1, duty 0..1]: an amplitude wobble, or a gate with a duty; a list of
// them multiplies), vowel ('a' 'e' 'i' 'o' 'u', with voice: 'bass' 'tenor' 'alto' 'soprano': a formant filter for
// growls, moans and breaths), rep ([count, every s, fall dB]: played again and again) and seq ([[at s, semitones,
// length s], ...]: played as notes). In a loop, a layer with an `at` is an event; one without runs the whole loop.
// Top-level: layers, level (target loudness, about LUFS, default -18), ceiling (true peak dBTP, default -1), vary
// ({ pitch: ratio spread, gain: dB spread }), loop (seconds: a seamless ambient loop of that length), tail (seconds
// rendered after the last layer ends, default 0.3, or the room's rt60), room (a reverb tail for one-shots: { mix,
// rt60, size, predelay, hf }), desc (what it is, for people, captions and the sound-matching check).
import { SR, TAU, rng, db, clamp, Saw, Pulse, SVF, svfG, Biquad, OnePole, Pink, panGains } from './dsp.mjs';
import { reverb, formant } from './fx.mjs';
import { truePeak } from './ears.mjs';
import { noteToMidi } from './score.mjs';

const hz = (f) => (typeof f === 'string' ? 440 * Math.pow(2, (noteToMidi(f) - 69) / 12) : f);

// a linear attack, a sustain at 1 (raised by `punch` and falling back to 1), and a decay; `curve` > 1 bends the
// decay into an exponential-like fall
function envelope(t, { a = 0.005, s = 0, punch = 0, d = 0.2, curve = 1 }) {
  if (t < a) return t / a;
  t -= a;
  if (t < s) return 1 + punch * (1 - t / s);
  t -= s;
  if (t < d) return Math.pow(1 - t / d, curve);
  return 0;
}
const envLen = ({ a = 0.005, s = 0, d = 0.2 }) => a + s + d;

function noiseSource(r, color = 'white') {
  if (color === 'pink') {
    const p = new Pink(r);
    return () => p.next() * 2.2;
  }
  if (color === 'brown') {
    let b = 0;
    return () => {
      b = clamp(b * 0.995 + (r() * 2 - 1) * 0.08, -1, 1);
      return b * 2.4;
    };
  }
  return () => r() * 2 - 1;
}

// ---------------------------------------------------------------------------------------------------------------
// Layer models. Each returns a mono Float64Array.
// ---------------------------------------------------------------------------------------------------------------
function tone(p, r, pitch) {
  const len = envLen(p) + 0.01;
  const n = Math.ceil(len * SR);
  const y = new Float64Array(n);
  const wave = p.wave ?? 'square';
  const f0 = hz(p.freq ?? 440) * pitch;
  const saw = new Saw(r()), pul = new Pulse(r());
  let ph = r(), tri = 0;
  const lp = p.lp ? new SVF() : null, hp = p.hp ? new OnePole(p.hp.f ?? 200) : null;
  const q = 0.707 + 6 * (p.lp?.res ?? 0); // res 0..1 to the lowpass's Q
  let nv = 0, nph = 0;
  const arp = (p.arp ?? []).slice().sort((x, z) => x[0] - z[0]);
  const vib = p.vib ?? null;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const tr = p.repeat ? t % p.repeat : t;
    let semis = 0;
    for (const [at, st] of arp) if (tr >= at) semis = st;
    let f = f0 * Math.pow(2, (p.slide ?? 0) * tr + 0.5 * (p.dslide ?? 0) * tr * tr + semis / 12);
    if (vib) f *= Math.pow(2, (vib[1] * Math.sin(TAU * vib[0] * t)) / 12);
    if (p.fmin && f < p.fmin) break; // sfxr cuts the sound when the pitch falls below its floor
    f = clamp(f, 10, SR * 0.45);
    const dt = f / SR;
    let x;
    if (wave === 'saw') x = saw.next(dt);
    else if (wave === 'sine') {
      ph = (ph + dt) % 1;
      x = Math.sin(TAU * ph);
    } else if (wave === 'triangle') {
      ph = (ph + dt) % 1;
      tri = ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph;
      x = tri;
    } else if (wave === 'noise') {
      // sfxr's pitched noise: a new random value 32 times per period
      nph += dt * 32;
      if (nph >= 1) {
        nph -= Math.floor(nph);
        nv = r() * 2 - 1;
      }
      x = nv;
    } else {
      const duty = clamp((p.duty ?? (wave === 'pulse' ? 0.25 : 0.5)) + (p.dutySlide ?? 0) * t, 0.05, 0.95);
      x = pul.next(dt, duty);
    }
    if (lp) {
      const fc = (p.lp.f ?? 4000) * Math.pow(2, (p.lp.sweep ?? 0) * t);
      lp.tick(x, svfG(clamp(fc, 30, 18000)), 1 / q);
      x = lp.lp;
    }
    if (hp) {
      if ((i & 31) === 0) hp.set(clamp((p.hp.f ?? 200) * Math.pow(2, (p.hp.sweep ?? 0) * t), 10, 16000));
      x = hp.hp(x);
    }
    y[i] = x * envelope(t, p) * 0.5;
  }
  return y;
}

function noise(p, r, pitch) {
  const len = envLen(p) + 0.01;
  const n = Math.ceil(len * SR);
  const y = new Float64Array(n);
  const src = noiseSource(r, p.color);
  const svf = new SVF();
  const q = p.q ?? 1;
  const mode = p.bp ? 'bp' : p.lp ? 'lp' : p.hp ? 'hp' : null;
  const [f1, f2] = (p.bp ?? p.lp ?? p.hp ?? [1000, 1000]).map((f) => hz(f) * pitch);
  const dur = Math.max(1e-3, envLen(p));
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let x = src();
    if (mode) {
      const fc = f1 * Math.pow(f2 / f1, Math.min(1, t / dur));
      svf.tick(x, svfG(fc), 1 / q);
      x = mode === 'bp' ? svf.bp * Math.sqrt(q) : mode === 'lp' ? svf.lp : svf.hp;
    }
    y[i] = x * envelope(t, p) * 0.5;
  }
  return y;
}

const MATERIALS = {
  // [frequency ratio, amplitude, T60 seconds] per mode; a 'freq' sets the fundamental
  wood: { freq: 420, modes: [[1, 1, 0.12], [2.32, 0.5, 0.07], [4.25, 0.25, 0.05], [6.63, 0.12, 0.03]], noise: 0.5, nlp: 3500 },
  metal: { freq: 520, modes: [[1, 1, 1.6], [2.76, 0.7, 1.2], [5.4, 0.45, 0.9], [8.93, 0.3, 0.6], [13.3, 0.18, 0.4], [1.51, 0.3, 1.3]], noise: 0.25, nlp: 9000 },
  glass: { freq: 1300, modes: [[1, 1, 0.9], [2.32, 0.6, 0.6], [4.25, 0.4, 0.4], [6.63, 0.25, 0.25]], noise: 0.15, nlp: 12000 },
  stone: { freq: 210, modes: [[1, 1, 0.06], [1.83, 0.6, 0.05], [3.1, 0.4, 0.04], [4.9, 0.2, 0.03]], noise: 0.9, nlp: 2500 },
  plastic: { freq: 650, modes: [[1, 1, 0.08], [2.1, 0.5, 0.05], [3.7, 0.25, 0.03]], noise: 0.4, nlp: 5000 },
  flesh: { freq: 110, modes: [[1, 1, 0.05], [1.6, 0.4, 0.04]], noise: 0.7, nlp: 1500 },
};

function modal(p, r, pitch) {
  const m = MATERIALS[p.material ?? 'wood'] ?? MATERIALS.wood;
  const modes = p.modes ?? m.modes;
  const f0 = hz(p.freq ?? m.freq) * pitch;
  const dScale = p.d ?? 1;
  const hard = p.hardness ?? 0.6;
  const maxT = Math.max(...modes.map((x) => x[2])) * dScale;
  const n = Math.ceil((maxT * 1.2 + 0.03) * SR);
  const y = new Float64Array(n);
  for (const [ratio, amp, t60] of modes) {
    const f = f0 * ratio * (1 + (r() - 0.5) * 0.01);
    if (f > SR * 0.45) continue;
    // a harder strike excites the high modes more
    const a = amp * Math.pow(Math.min(1, f / 1000) + 0.15, (hard - 0.5) * 1.2);
    const w = (TAU * f) / SR, c = Math.cos(w), s = Math.sin(w);
    const rr = Math.pow(10, -3 / (t60 * dScale * SR));
    let x = Math.cos(r() * TAU), v = 0, g = a;
    const nn = Math.min(n, Math.ceil(t60 * dScale * 1.2 * SR));
    for (let i = 0; i < nn; i++) {
      const u = x * c - v * s;
      v = x * s + v * c;
      x = u;
      y[i] += g * v;
      g *= rr;
    }
  }
  // the strike: a short noise click, brighter for a harder hit
  const lp = new OnePole(m.nlp * (0.4 + hard));
  const nl = Math.min(n, Math.round(0.012 * SR));
  for (let i = 0; i < nl; i++) y[i] += lp.lp(r() * 2 - 1) * (m.noise ?? 0.5) * Math.exp(-i / (0.002 * SR));
  for (let i = 0; i < n; i++) y[i] *= 0.35;
  return y;
}

function boom(p, r, pitch) {
  const size = p.size ?? 0.7;
  const d = 0.6 + 1.6 * size;
  const n = Math.ceil((d + 0.2) * SR);
  const y = new Float64Array(n);
  const brown = noiseSource(r, 'brown'), white = noiseSource(r, 'white');
  const lp = new SVF();
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    // the thump: a sine falling from about 120 Hz to 35 Hz
    const f = (35 + 85 * Math.exp(-t / 0.08)) * pitch * (1.2 - 0.4 * size);
    ph += (TAU * f) / SR;
    const thump = Math.sin(ph) * Math.exp(-t / (0.25 + 0.3 * size));
    // the roar: noise through a lowpass that closes as the blast dies
    const fc = 300 + 5000 * Math.exp(-t / (0.12 + 0.2 * size));
    lp.tick(brown() * 0.6 + white() * 0.4, svfG(fc), 1.2);
    const roar = lp.lp * Math.min(1, t / 0.004) * Math.exp(-t / (0.35 * d));
    // crackle: sparse sharp clicks in the first second
    let crack = 0;
    if (t < 0.9 * d && r() < 0.0018 * (1 - t / d)) crack = (r() * 2 - 1) * 1.5;
    y[i] = (thump * 0.9 + roar * 1.4 + crack) * 0.45;
  }
  return y;
}

const SURFACES = {
  // heel thud (Hz, s), grain texture (band, grains per second, grain decay s), resonant body (material or none)
  grass: { thud: [90, 0.03], band: [2500, 9000], grains: 1800, gd: 0.004, gl: 0.6, body: null },
  gravel: { thud: [110, 0.03], band: [1500, 6000], grains: 1400, gd: 0.006, gl: 1.2, body: null },
  wood: { thud: [140, 0.05], band: [800, 3000], grains: 120, gd: 0.004, gl: 0.3, body: 'wood' },
  stone: { thud: [120, 0.03], band: [2500, 7000], grains: 300, gd: 0.002, gl: 0.6, body: 'stone' },
  metal: { thud: [150, 0.03], band: [3000, 8000], grains: 200, gd: 0.002, gl: 0.4, body: 'metal' },
  water: { thud: [80, 0.04], band: [600, 3500], grains: 900, gd: 0.01, gl: 0.9, body: null, drips: 3 },
  snow: { thud: [70, 0.05], band: [900, 4500], grains: 2500, gd: 0.005, gl: 1.0, body: null },
  dirt: { thud: [90, 0.04], band: [700, 2500], grains: 600, gd: 0.005, gl: 0.6, body: null },
  // since 0.17.0; bf is the body's pitch (Hz), df the pitch of the drips
  sand: { thud: [75, 0.04], band: [1800, 7000], grains: 3200, gd: 0.003, gl: 0.8, body: null },
  mud: { thud: [65, 0.05], band: [350, 1600], grains: 400, gd: 0.012, gl: 0.9, body: null, drips: 4, df: 420 },
  leaves: { thud: [85, 0.03], band: [1800, 8000], grains: 1500, gd: 0.007, gl: 1.5, body: null },
  tile: { thud: [170, 0.025], band: [3000, 9000], grains: 120, gd: 0.0015, gl: 0.45, body: 'stone', bf: 520 },
  carpet: { thud: [80, 0.05], band: [300, 1400], grains: 250, gd: 0.004, gl: 0.3, body: null },
};

function step(p, r, pitch) {
  const s = SURFACES[p.surface ?? 'dirt'] ?? SURFACES.dirt;
  const w = p.weight ?? 0.5;
  const n = Math.ceil(0.32 * SR);
  const y = new Float64Array(n);
  // two contacts: the heel, then the rest of the foot 40 to 70 ms later
  const roll = 0.04 + r() * 0.03;
  for (const [at, g] of [[0, 1], [roll, 0.55]]) {
    const i0 = Math.round(at * SR);
    let ph = 0;
    const thudLen = Math.round((s.thud[1] * (1 + w)) * SR);
    for (let i = 0; i < thudLen && i0 + i < n; i++) {
      const t = i / SR;
      ph += (TAU * s.thud[0] * pitch * (1 + 0.6 * Math.exp(-t / 0.01))) / SR;
      y[i0 + i] += Math.sin(ph) * Math.exp(-t / (s.thud[1] * 0.4)) * g * (0.4 + w);
    }
    // the surface's grains: tiny clicks through its band, denser for heavier steps
    const bp = new SVF();
    const fc = Math.sqrt(s.band[0] * s.band[1]) * pitch;
    const glen = Math.round(0.09 * SR);
    let env = 0;
    for (let i = 0; i < glen && i0 + i < n; i++) {
      const t = i / SR;
      if (r() < (s.grains * (0.5 + w)) / SR) env = 1;
      env *= Math.exp(-1 / (s.gd * SR));
      const x = (r() * 2 - 1) * env * Math.exp(-t / 0.05);
      bp.tick(x, svfG(fc), 1.2);
      y[i0 + i] += bp.bp * s.gl * g * 1.6;
    }
    if (s.body) {
      const m = modal(s.bf ? { material: s.body, freq: s.bf, hardness: 0.4 + 0.3 * w, d: 0.5 } : { material: s.body, hardness: 0.4 + 0.3 * w, d: 0.5 }, r, pitch * (0.9 + r() * 0.2));
      for (let i = 0; i < m.length && i0 + i < n; i++) y[i0 + i] += m[i] * 0.9 * g;
    }
  }
  if (s.drips) {
    const dr = drip({ count: s.drips, freq: s.df ?? 900, spread: 0.6, d: 0.12 }, r, pitch);
    for (let i = 0; i < dr.length && i < n; i++) y[i] += dr[i] * 0.6;
  }
  return y;
}

function whoosh(p, r, pitch) {
  const d = p.d ?? 0.4;
  const n = Math.ceil((d + 0.05) * SR);
  const y = new Float64Array(n);
  const src = noiseSource(r, 'pink');
  const svf = new SVF();
  const f1 = hz(p.from ?? 300) * pitch, f2 = hz(p.to ?? 2500) * pitch;
  const q = p.q ?? 2;
  for (let i = 0; i < n; i++) {
    const t = i / SR, u = Math.min(1, t / d);
    // the band rises to the peak of the pass (two thirds in) and falls a little after it: air rushing by
    const k = u < 0.66 ? u / 0.66 : 1 - (u - 0.66) * 0.6;
    svf.tick(src(), svfG(f1 * Math.pow(f2 / f1, k)), 1 / q);
    const env = Math.pow(Math.sin(Math.PI * Math.min(1, u)), 1.5);
    y[i] = svf.bp * env * Math.sqrt(q) * 0.9;
  }
  return y;
}

function crackle(p, r, pitch) {
  const d = p.d ?? 1;
  const n = Math.ceil(d * SR);
  const y = new Float64Array(n);
  const svf = new SVF();
  const [lo, hi] = (p.bp ?? [1500, 6000]).map((f) => f * pitch);
  const dens = p.density ?? 30;
  const cd = p.decay ?? 0.003;
  let env = 0, amp = 0;
  for (let i = 0; i < n; i++) {
    if (r() < dens / SR) {
      env = 1;
      amp = 0.3 + r() * 0.7;
    }
    env *= Math.exp(-1 / (cd * SR));
    svf.tick((r() * 2 - 1) * env * amp, svfG(lo + (hi - lo) * r()), 1.5);
    y[i] = svf.bp * 2.2;
  }
  return y;
}

function drip(p, r, pitch) {
  const count = p.count ?? 1;
  const d = p.d ?? 0.15;
  const span = p.span ?? 0;
  const n = Math.ceil((span + d + 0.05) * SR);
  const y = new Float64Array(n);
  for (let k = 0; k < count; k++) {
    const at = count > 1 ? (span || 0.08) * r() : 0;
    const f0 = hz(p.freq ?? 1000) * pitch * (1 + (p.spread ?? 0.3) * (r() - 0.5));
    const i0 = Math.round(at * SR);
    let ph = 0;
    const len = Math.round(d * SR);
    // a drop: a sine that sweeps up as its bubble closes, decaying fast
    for (let i = 0; i < len && i0 + i < n; i++) {
      const t = i / SR;
      ph += (TAU * f0 * (1 + 1.8 * (t / d))) / SR;
      y[i0 + i] += Math.sin(ph) * Math.exp(-t / (d * 0.25)) * (1 - Math.exp(-t / 0.0008)) * 0.6;
    }
  }
  return y;
}

// a creak: stick-slip friction, a train of pulses whose rate glides from `rate[0]` to `rate[1]` per second, each one
// ringing a few resonances of the body (a door's wood, a ship's timber, a rusty hinge's metal)
function creak(p, r, pitch) {
  const d = p.d ?? 0.6;
  const n = Math.ceil((d + 0.1) * SR);
  const y = new Float64Array(n);
  const [r0, r1] = p.rate ?? [25, 60];
  const res = (p.res ?? [380, 920, 1700]).map((f) => {
    const b = new SVF();
    return { b, g: svfG(f * pitch), k: 1 / (p.q ?? 18) };
  });
  let ph = 0.97; // the first slip comes at once
  for (let i = 0; i < n; i++) {
    const t = i / SR, u = Math.min(1, t / d);
    // the rate wanders a little: friction is uneven
    const rate = (r0 + (r1 - r0) * u) * (1 + 0.15 * Math.sin(TAU * 3.1 * t + 1.3) + 0.08 * (r() - 0.5));
    ph += rate / SR;
    let x = 0;
    if (ph >= 1) {
      ph -= 1;
      x = 0.6 + 0.4 * r();
    }
    let out = 0;
    for (const { b, g, k } of res) {
      b.tick(x, g, k);
      out += b.bp;
    }
    // a quick swell, a steady middle and a fade: a hinge starts and stops within the movement
    y[i] = out * Math.min(1, t / 0.015) * Math.min(1, (1 - u) / 0.25) * 0.9;
  }
  return y;
}

// scatter: many small strikes of one material. 'random' spreads them over `span`, crowded toward the start by `bunch`
// (a smash that thins out) and quieter toward the end by `taper`; 'bounce' plays a falling object, each gap `ratio`
// times the last and each strike quieter (a shell casing, a ball, a dropped coin)
function scatter(p, r, pitch) {
  const m = MATERIALS[p.material ?? 'glass'] ?? MATERIALS.glass;
  const [lo, hi] = (Array.isArray(p.freq) ? p.freq : [p.freq ?? m.freq, p.freq ?? m.freq]).map(hz);
  const count = p.count ?? 10;
  const hits = [];
  if (p.pattern === 'bounce') {
    let t = 0, gap = p.gap ?? 0.16, g = 1;
    const k = p.ratio ?? 0.72;
    for (let j = 0; j < count; j++) {
      hits.push([t, g]);
      t += gap * (0.9 + 0.2 * r());
      gap *= k;
      g *= p.fall ?? 0.75;
    }
  } else {
    const span = p.span ?? 0.4;
    for (let j = 0; j < count; j++) {
      const u = j === 0 ? 0 : Math.pow(r(), p.bunch ?? 1.6);
      hits.push([u * span, (1 - (p.taper ?? 0.6) * u) * (j === 0 ? 1 : 0.35 + 0.65 * r())]);
    }
  }
  const strikes = hits.map(([t, g]) => {
    const f = lo * Math.pow(hi / lo, r());
    return [t, g, modal({ material: p.material ?? 'glass', modes: p.modes, freq: f, hardness: p.hardness ?? 0.7, d: p.d ?? 0.5 }, r, pitch)];
  });
  const n = Math.ceil(Math.max(...strikes.map(([t, , y]) => t * SR + y.length)) + 1);
  const y = new Float64Array(n);
  for (const [t, g, s] of strikes) {
    const i0 = Math.round(t * SR);
    for (let i = 0; i < s.length && i0 + i < n; i++) y[i0 + i] += s[i] * g;
  }
  return y;
}

// any layer's amplitude wobble: [rate Hz, depth 0..1] is a smooth tremolo that starts at full level; with a duty
// (0..1) it is a gate open for that share of each cycle, with 2 ms edges (alarms, insect wings, an engine's firing)
function tremolo(y, trem) {
  for (const [rate, depth = 1, duty] of Array.isArray(trem[0]) ? trem : [trem]) {
    const e = duty == null ? 0 : Math.min(duty / 2, 0.002 * rate);
    for (let i = 0; i < y.length; i++) {
      const ph = ((i / SR) * rate) % 1;
      let g;
      if (duty == null) g = 0.5 + 0.5 * Math.cos(TAU * ph);
      else if (ph >= duty) g = 0;
      else if (ph < e) g = 0.5 - 0.5 * Math.cos((Math.PI * ph) / e);
      else if (ph > duty - e) g = 0.5 - 0.5 * Math.cos((Math.PI * (duty - ph)) / e);
      else g = 1;
      y[i] *= 1 - depth * (1 - g);
    }
  }
}

const MODELS = { tone, noise, modal, boom, step, whoosh, crackle, drip, creak, scatter };
export const SFX_TYPES = Object.keys(MODELS);

// ---------------------------------------------------------------------------------------------------------------
// Rendering an effect
// ---------------------------------------------------------------------------------------------------------------
/** Short-sound loudness (dB, near LUFS): K-weighted mean square over the louder part of the sound, ungated. */
export function sfxLoudness(L, R) {
  const kw = () => [new Biquad('hs', 1681.974450955533, 0.7071752369554196, 3.999843853973347), new Biquad('hp', 38.13547087602444, 0.5003270373238773)];
  const [a1, a2] = kw(), [b1, b2] = kw();
  const n = L.length;
  const blk = Math.max(1, Math.round(0.05 * SR));
  const e = [];
  let acc = 0, k = 0;
  for (let i = 0; i < n; i++) {
    const x = a2.tick(a1.tick(L[i])), z = b2.tick(b1.tick(R[i]));
    acc += x * x + z * z;
    if (++k === blk || i === n - 1) {
      e.push(acc / k);
      acc = 0;
      k = 0;
    }
  }
  // the loudest 400 ms (or the whole sound, if shorter): what a player hears as the sound's level
  const w = Math.min(e.length, 8);
  let best = 0;
  for (let i = 0; i + w <= e.length; i++) {
    let s = 0;
    for (let j = i; j < i + w; j++) s += e[j];
    best = Math.max(best, s / w);
  }
  return -0.691 + 10 * Math.log10(best + 1e-20);
}

/**
 * Render an effect. Returns { L, R, seconds, peakDb, loudness }. `seed` picks the take; `pitch` multiplies every
 * frequency (on top of the effect's own `vary.pitch`).
 */
export function renderSfx(spec, { seed = 1, pitch = 1 } = {}) {
  const r = rng((seed * 0x9e3779b1) >>> 0 || 1);
  const vary = spec.vary ?? {};
  const vp = pitch * (1 + (vary.pitch ?? 0) * (r() * 2 - 1));
  const vg = (vary.gain ?? 0) * (r() * 2 - 1);
  const loop = spec.loop ?? 0;
  // An ambient loop's layers run steadily for the loop and X seconds more; the extra crossfades into the start at
  // equal power, so the end flows into the beginning without a click or a dip (stationary noise has no tail to
  // fold, unlike music).
  const X = loop ? Math.min(0.5, loop / 4) : 0;
  // A layer with an `at` is an event in a loop (a bird's call, a far rumble); without one it runs the whole loop.
  const steady = (l) => {
    if (!loop || l.at != null) return l;
    const len = loop + X + 0.05;
    if (l.type === 'noise' || l.type === 'tone' || !l.type) return { ...l, a: 0, s: len, d: 0.001, punch: 0 };
    if (l.type === 'crackle') return { ...l, d: len };
    if (l.type === 'drip') return { ...l, span: len };
    return l;
  };
  // `rep: [count, every s, fall dB]` plays a layer again and again (knocks, a burst of fire, chirps); `seq: [[at s,
  // semitones, length s], ...]` plays it as notes, its envelope's sustain the length (jingles, a tune on bells)
  const expand = (l) => {
    if (l.rep) {
      const [count, every, fall = 0] = l.rep;
      return Array.from({ length: count }, (_, k) => expand({ ...l, rep: null, at: (l.at ?? 0) + k * every, gain: (l.gain ?? 0) - k * fall })).flat();
    }
    if (l.seq) return l.seq.map(([at, st = 0, len]) => ({ ...l, seq: null, at: (l.at ?? 0) + at, pitch: (l.pitch ?? 1) * Math.pow(2, st / 12), ...(len != null ? { s: len } : {}) }));
    return [l];
  };
  const layers = (spec.layers ?? [spec]).flatMap(expand).map(steady);
  const rendered = layers.map((l) => {
    const model = MODELS[l.type ?? 'tone'];
    if (!model) throw new Error(`sfx: unknown layer type "${l.type}" (types: ${SFX_TYPES.join(', ')})`);
    const lr = rng(Math.floor(r() * 4294967296) || 1);
    const y = model(l, lr, vp * (l.pitch ?? 1));
    if (l.vowel) {
      // the vowel shapes the layer's colour, not its level, so its `gain` still sets its place in the mix
      const rms = (x) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length) || 1;
      const before = rms(y);
      formant(y, l.voice ?? 'bass', l.vowel);
      const k = before / rms(y);
      for (let i = 0; i < y.length; i++) y[i] *= k;
    }
    if (l.trem) tremolo(y, l.trem);
    return { l, y };
  });
  const room = loop ? null : spec.room;
  const tail = spec.tail ?? (room ? room.rt60 ?? 1.2 : 0.3);
  const end = Math.max(...rendered.map(({ l, y }) => (l.at ?? 0) + y.length / SR));
  const N = Math.ceil((loop ? Math.max(loop + X, end) : end + tail) * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  for (const { l, y } of rendered) {
    const g = db((l.gain ?? 0) + vg);
    const [gl, gr] = panGains(l.pan ?? 0);
    const i0 = Math.round((l.at ?? 0) * SR);
    for (let i = 0; i < y.length && i0 + i < N; i++) {
      L[i0 + i] += y[i] * g * gl;
      R[i0 + i] += y[i] * g * gr;
    }
  }
  if (room) {
    // a space around a one-shot: a gunshot's slap, a bell's hall, a roar in a cave
    const { mix = 0.3, ...o } = room;
    const wL = new Float32Array(N), wR = new Float32Array(N);
    reverb(L, R, wL, wR, { rt60: 1.2, size: 0.7, predelay: 0.01, er: 0.5, lowCut: 120, highCut: 8000, mod: 2, ...o });
    for (let i = 0; i < N; i++) {
      L[i] += wL[i] * mix;
      R[i] += wR[i] * mix;
    }
  }
  let Lo = L, Ro = R;
  const Nl = loop ? Math.round(loop * SR) : N;
  if (loop) {
    // loop[i] = s[i + X] for the first part; over its last X samples it crossfades from s[i + X] to s[i - (Nl - X)],
    // so its last sample leads into s[X], its first
    const x = Math.round(X * SR);
    Lo = new Float32Array(Nl);
    Ro = new Float32Array(Nl);
    for (let i = 0; i < Nl; i++) {
      const j = i - (Nl - x);
      if (j < 0) {
        Lo[i] = L[i + x];
        Ro[i] = R[i + x];
      } else {
        const a = Math.cos((Math.PI / 2) * (j / x)), b = Math.sin((Math.PI / 2) * (j / x));
        Lo[i] = L[i + x] * a + L[j] * b;
        Ro[i] = R[i + x] * a + R[j] * b;
      }
    }
  }
  // bring it to its level, then keep its peak under the ceiling
  const target = spec.level ?? -18;
  const twice = (x) => {
    const o = new Float32Array(x.length * 2);
    o.set(x);
    o.set(x, x.length);
    return o;
  };
  const cur = loop ? sfxLoudness(twice(Lo), twice(Ro)) : sfxLoudness(Lo, Ro);
  let g = cur > -90 ? db(target - cur) : 1;
  // the ceiling holds the true peak, between the samples (a sharp transient read up to 0.35 dB over its sample peak:
  // a machine gun at -0.65 dBTP under a -1 dBFS ceiling, 0.17.0)
  const peak = Math.max(truePeak(Lo), truePeak(Ro));
  const ceil = db(spec.ceiling ?? -1);
  if (peak * g > ceil) g = ceil / peak;
  const outL = new Float32Array(Nl), outR = new Float32Array(Nl);
  for (let i = 0; i < Nl; i++) {
    outL[i] = Lo[i] * g;
    outR[i] = Ro[i] * g;
  }
  // a one-shot ends with a 5 ms fade, so a cut tail never clicks
  if (!loop) {
    const f = Math.min(Nl, Math.round(0.005 * SR));
    for (let i = 0; i < f; i++) {
      const k = Nl - 1 - i, w = i / f;
      outL[k] *= w;
      outR[k] *= w;
    }
  }
  return { L: outL, R: outR, seconds: Nl / SR, peakDb: 20 * Math.log10(peak * g + 1e-12), loudness: sfxLoudness(outL, outR) };
}
