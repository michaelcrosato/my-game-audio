// piano.mjs: a synthesized grand piano. Nothing is sampled.
//
// Additive synthesis of stiff strings, note by note:
// - Inharmonic partials: f_k = k f0 sqrt(1 + B k^2), with B rising into the treble, and stretch tuning to match.
// - A felt-hammer spectrum: a notch pattern from the strike point, and a low-pass that opens with velocity, so
//   loud notes are brighter as well as louder.
// - Soundboard radiation: weak fundamentals in the bass, as on a real instrument.
// - Two-stage decay: a fast "prompt" sound and a slow "aftersound" from the coupled unison strings, a fraction of a
//   cent apart, so partials beat slowly while they ring. Higher partials die sooner.
// - Hammer noise, chord voicing (top note forward), rolled chords, grace notes, and dampers that obey the score's
//   sustain pedal (ctx.damperAt). The top strings have no dampers, as on a real piano.
import { SR, rng, mtof, db, clamp } from './dsp.mjs';

const LN1000 = Math.log(1000); // a T60 time constant -> per-sample decay factor: exp(-ln(1000) / (T60 * SR))

/** Inharmonicity coefficient: smallest in the tenor, rising toward the treble (short stiff strings) and the bass. */
export function inharmonicity(m) {
  const lg = m >= 40 ? -4 + 0.024 * (m - 40) : -4 + 0.012 * (40 - m);
  return Math.pow(10, lg);
}
/** Stretch tuning in cents (a Railsback-like curve): treble sharp, bass flat, so octaves match the stiff strings. */
export function stretchCents(m) {
  const d = m - 69;
  return d > 0 ? 0.009 * d * d : -0.0045 * d * d;
}

export function piano(spec = {}) {
  const S = {
    bright: spec.bright ?? 1, // hammer brightness
    felt: spec.felt ?? [500, 4400, 1.8], // the felt's cutoff: lo + hi * velocity^p Hz (soft blows are darker)
    decay: spec.decay ?? 1, // scales every decay time
    detune: spec.detune ?? 1.0, // cents between unison strings
    after: spec.after ?? 0.13, // aftersound level relative to the prompt sound (about -18 dB)
    hammer: spec.hammer ?? 1, // hammer and key noise
    width: spec.width ?? 0.5, // stereo spread by pitch (player's view: bass left)
    voicing: spec.voicing ?? [2, -1.5, 0.5], // dB for the top, inner and bottom notes of a chord
    damp: spec.damp ?? 0.2, // damper T60 in seconds, mid range
    undamped: spec.undamped ?? 90, // MIDI note from which strings have no dampers
    roll: spec.roll ?? 0.028, // seconds between the notes of a rolled chord (~)
    grace: spec.grace ?? 0.055, // seconds per grace note
    release: spec.release ?? 0.96, // share of the written length the key stays down
    gain: spec.gain ?? 1,
    maxLen: spec.maxLen ?? 24,
  };

  function strike(out, ctx, t, m, hv, gainMul, keyUp, seed) {
    const N = out.L.length;
    const i0 = Math.round(t * SR);
    if (i0 >= N || m < 12 || m > 120) return;
    const r = rng(seed);
    const f0 = mtof(m) * Math.pow(2, stretchCents(m) / 1200);
    const B = inharmonicity(m);
    const beta = 0.112 + 0.02 * r(); // strike point as a share of the string length
    const det = Math.pow(2, (S.detune * (0.6 + 0.8 * r())) / 2400); // half the unison spread, each way
    // Calibrated against measurements of recorded grand-piano notes (tools/piano_compare.py): partial slopes,
    // the high cliff near 4.5 kHz, a fast first second (about -25 dB/s) and a quiet, slow aftersound.
    const fc = Math.max(1.5 * f0, (S.felt[0] + S.felt[1] * Math.pow(hv, S.felt[2])) * S.bright);
    const slope = 2.5;
    const gam = 1.2;
    const T1 = 2.5 * S.decay * Math.pow(f0 / 262, -0.12); // prompt-sound T60 of the fundamental
    const T2 = 24 * S.decay * Math.pow(f0 / 262, -0.45); // aftersound T60
    const damped = m < S.undamped;
    const td = damped ? Math.max(keyUp, ctx.damperAt ? ctx.damperAt(keyUp) : keyUp) : Infinity;
    const dampT60 = S.damp * (f0 < 130 ? 2.4 : f0 < 260 ? 1.5 : 1);
    const lenSec = Math.min(S.maxLen, T2 * 1.15, damped ? td - t + dampT60 * 1.3 : Infinity);
    const n = Math.min(N - i0, Math.ceil(lenSec * SR));
    if (n <= 0) return;
    const nd = damped ? clamp(Math.round((td - t) * SR), 0, n) : n; // damper onset (sample)
    const rd = Math.exp(-LN1000 / (dampT60 * SR));
    const buf = new Float64Array(n);
    const thr = 2e-6;
    for (let k = 1; k <= 72; k++) {
      const fk = k * f0 * Math.sqrt(1 + B * k * k);
      if (fk > 16000 || fk > 0.45 * SR) break;
      let a = Math.pow(k, -gam);
      a *= 0.12 + 0.88 * Math.abs(Math.sin(Math.PI * k * beta)); // strike-point comb
      a /= 1 + Math.pow(fk / fc, slope); // hammer felt: opens with velocity
      a /= 1 + Math.pow(fk / 4200, 8); // the high cliff every note shows
      const q4 = Math.pow(fk / 120, 4);
      a *= q4 / (1 + q4); // soundboard radiation: weak bass fundamentals
      if (a < 2e-4) continue;
      const T1k = Math.max(0.05, (T1 * Math.pow(k, 0.2)) / (1 + Math.pow(fk / 3500, 2)));
      const T2k = Math.max(0.1, T2 / (1 + Math.pow(fk / 4000, 2)));
      const r1 = Math.exp(-LN1000 / (T1k * SR));
      const r2 = Math.exp(-LN1000 / (T2k * SR));
      const w1 = (2 * Math.PI * fk * det) / SR, w2 = (2 * Math.PI * fk) / det / SR;
      const c1 = Math.cos(w1), s1 = Math.sin(w1), c2 = Math.cos(w2), s2 = Math.sin(w2);
      let x1 = 1, y1 = 0, x2 = 1, y2 = 0;
      let g1 = a * (1 - S.after), g2 = a * S.after;
      let i = 0;
      // undamped stretch
      while (i < nd) {
        const end = Math.min(nd, i + 256);
        for (; i < end; i++) {
          const u1 = x1 * c1 - y1 * s1;
          y1 = x1 * s1 + y1 * c1;
          x1 = u1;
          const u2 = x2 * c2 - y2 * s2;
          y2 = x2 * s2 + y2 * c2;
          x2 = u2;
          buf[i] += g1 * y1 + g2 * y2;
          g1 *= r1;
          g2 *= r2;
        }
        if (g1 + g2 < thr) break;
      }
      if (g1 + g2 < thr) continue;
      // after the damper falls
      const d1 = r1 * rd, d2 = r2 * rd;
      while (i < n) {
        const end = Math.min(n, i + 256);
        for (; i < end; i++) {
          const u1 = x1 * c1 - y1 * s1;
          y1 = x1 * s1 + y1 * c1;
          x1 = u1;
          const u2 = x2 * c2 - y2 * s2;
          y2 = x2 * s2 + y2 * c2;
          x2 = u2;
          buf[i] += g1 * y1 + g2 * y2;
          g1 *= d1;
          g2 *= d2;
        }
        if (g1 + g2 < thr) break;
      }
    }
    // hammer contact: a short rise, longer for soft blows
    const na = Math.max(2, Math.round((0.0012 + 0.0035 * (1 - hv)) * SR));
    for (let i = 0; i < Math.min(na, n); i++) buf[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / na);
    // hammer and key noise: a filtered click and a low knock, both scaled with the blow
    const nh = Math.min(n, Math.round(0.03 * SR));
    const kc = 1 - Math.exp((-2 * Math.PI * (1200 + 3200 * hv)) / SR);
    const hn = 0.035 * S.hammer * hv * (1 + Math.max(0, m - 66) / 12); // the treble is more percussive
    const wk = (2 * Math.PI * (55 + 30 * r())) / SR;
    let lp = 0;
    for (let i = 0; i < nh; i++) {
      lp += kc * (r() * 2 - 1 - lp);
      const e = Math.exp(-i / (0.0035 * SR));
      buf[i] += hn * (lp * e + 0.6 * Math.sin(wk * i) * Math.exp(-i / (0.012 * SR)));
    }
    // mix, panned by pitch
    const amp = 0.32 * hv * hv * S.gain * gainMul;
    const [gl, gr] = ctx.pan(clamp(((m - 62) / 36) * S.width, -1, 1));
    const L = out.L, R = out.R;
    for (let i = 0; i < n; i++) {
      const y = buf[i] * amp;
      L[i0 + i] += y * gl;
      R[i0 + i] += y * gr;
    }
  }

  return {
    range: [21, 108],
    render(ev, out, ctx) {
      if (ev.midi == null) return;
      const lvl = ctx.levelAt(ev.t);
      let hv = clamp(0.1 + 0.88 * lvl, 0.05, 1) * Math.sqrt(ev.vel / 0.8);
      let vdb = 0;
      if (ev.cn > 1) vdb = ev.ci === ev.cn - 1 ? S.voicing[0] : ev.ci === 0 ? S.voicing[2] : S.voicing[1];
      hv = clamp(hv * db(vdb * 0.5), 0.03, 1);
      const roll = ev.art.includes('~') && ev.cn > 1 ? ev.ci * S.roll : 0;
      const t = ev.t + roll;
      const frac = ev.art.includes('^') ? 0.42 : ev.art.includes('_') ? 1.04 : S.release;
      strike(out, ctx, t, ev.midi, hv, db(vdb), t + Math.max(0.03, ev.dur * frac), ev.seed);
      if (ev.grace && ev.grace.length && ev.ci === 0) {
        const g = ev.grace;
        g.forEach((gm, i) => {
          const gt = Math.max(0, ev.t - (g.length - i) * S.grace);
          strike(out, ctx, gt, gm, hv * 0.85, 0.85, gt + S.grace * 1.2, (ev.seed ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0);
        });
      }
    },
  };
}
