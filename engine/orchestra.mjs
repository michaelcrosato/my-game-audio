// orchestra.mjs: the rest of the orchestra (woodwinds, organ, ensembles of any instrument, orchestral percussion)
// and the preset table that names every standard instrument (orchestra-presets.json). Nothing is sampled.
//
// The builders register themselves in instruments.mjs's BUILDERS, so `build({ type: 'wind', ... })` works anywhere
// once this module is imported (render.mjs imports it).
import { SR, TAU, rng, gauss, mtof, clamp, hash, Saw, Pulse, SVF, svfG, Biquad, ADSR, levelGain } from './dsp.mjs';
import { BUILDERS, RANGES, build, hit, exp2s, noteLevels } from './instruments.mjs';
import PRESETS from './orchestra-presets.json' with { type: 'json' };

// ---------------------------------------------------------------------------------------------------------------
// Woodwinds and saxophones: a source (band-limited saw for double reeds and saxophones, a square for the
// clarinet's odd harmonics, near-sine for flutes) through a low-pass that opens with the dynamic, breath noise
// in a band, a "chiff" on tongued attacks, delayed vibrato and a small scoop into pitch. The bore's formants are
// applied per part as EQ (see the presets), since every note of a part shares them.
// Articulations: ^ staccato, ! accent, _ slurred (no new attack), ~ or %flz flutter-tongue, %trem16 (etc.) tongued
// repeats, double-tongued: each stroke speaks with its own chiff, every other one (the "k") softer.
// ---------------------------------------------------------------------------------------------------------------
export function wind(spec) {
  const {
    source = 'saw', harm = [0.3, 0.1, 0.04], duty = 0.5, bright = [2, 12], breath = 0.02, breathBand = [1500, 5000],
    chiff = 0.3, vib = [5.2, 0.1, 0.3], attack = 0.045, release = 0.09, scoop = 0.06, gain = 1, players = 1,
    detune = 4, timing = 0.012, spread = 0.12, range = [36, 96], flutter = 18,
  } = spec;
  const bc = Math.sqrt(breathBand[0] * breathBand[1]);
  const bq = Math.max(0.3, bc / (breathBand[1] - breathBand[0]));
  return {
    range,
    render(ev, out, ctx) {
      const r = rng(ev.seed);
      const a = ev.art;
      const tech = ev.tech ?? [];
      const stacc = a.includes('^'), acc = a.includes('!'), leg = a.includes('_') || ev.legato, trem = a.includes('~') || tech.includes('flz');
      const measured = tech.find((k) => /^trem\d+$/.test(k));
      const stroke = measured ? ((ev.quarter ?? 0.5) * 4) / Number(measured.slice(4)) : 0;
      const att = leg ? 0.014 : stacc ? 0.018 : acc ? 0.022 : attack;
      const rel = stacc ? 0.05 : release;
      const durS = stacc ? Math.min(ev.dur * 0.55, 0.16) : ev.dur;
      const onN = Math.max(1, Math.round(durS * SR));
      const n = onN + Math.round(rel * SR * 1.25);
      const lv = noteLevels(ev, ctx, n);
      const f0 = mtof(ev.midi);
      const per = (gain / Math.sqrt(players)) * (0.55 + 0.45 * ev.vel) * (acc ? 1.15 : 1);
      const i0b = Math.round(ev.t * SR);
      const nP = ev.cn > 1 && players > 1 ? Math.max(1, Math.round(players / ev.cn)) : players;
      for (let p = 0; p < nP; p++) {
        const det = (players > 1 ? gauss(r) * detune : (r() - 0.5) * 1.5) / 100;
        const i0 = i0b + (players > 1 ? Math.round(r() * timing * SR) : 0);
        const [gl, gr] = ctx.pan(clamp(ev.pan + spread * (r() * 2 - 1), -1, 1));
        const saw = new Saw(r()), pul = new Pulse(r());
        let ph = r();
        const env = new ADSR(att * (0.85 + r() * 0.3), 0.25, acc ? 0.8 : 0.92, rel);
        const flt = new SVF();
        const k = 2 * (1 - 0.97 * 0.12);
        let g = svfG(f0 * bright[1]);
        const nb = new Biquad('bp', bc, bq);
        let vPh = r() * TAU;
        const vInc = (TAU * vib[0] * (1 + (r() - 0.5) * 0.12)) / SR;
        const fInc = (TAU * flutter) / SR;
        let fPh = 0;
        const sc = leg ? 0 : scoop * (0.6 + r() * 0.8);
        const ch = leg ? 0 : chiff * (stacc || acc ? 1.4 : 1);
        for (let s = 0; s < n; s++) {
          const t = s / SR;
          const e = env.next(s < onN);
          const lvl = lv[s >> 6];
          vPh += vInc;
          const vd = vib[1] * clamp((t - vib[2]) / 0.25, 0, 1);
          const fr = f0 * exp2s(det - sc * Math.exp(-t / 0.03) + vd * Math.sin(vPh));
          let y;
          if (source === 'sine') {
            ph += fr / SR;
            if (ph >= 1) ph -= 1;
            const w = TAU * ph;
            const hb = 0.45 + 0.9 * lvl * e;
            y = Math.sin(w) + hb * (harm[0] * Math.sin(2 * w) + harm[1] * Math.sin(3 * w) + harm[2] * Math.sin(4 * w));
          } else {
            y = source === 'square' ? pul.next(fr / SR, duty) : saw.next(fr / SR);
            if ((s & 15) === 0) g = svfG(Math.min(16000, fr * (bright[0] + (bright[1] - bright[0]) * Math.pow(e, 1.2) * (0.3 + 0.7 * lvl))));
            y = flt.tick(y, g, k);
          }
          let chiffNow = ch * Math.exp(-t / 0.035), strokeAmp = 1;
          if (stroke && t > 0) {
            const st = t % stroke, kth = Math.floor(t / stroke) & 1;
            chiffNow += chiff * (kth ? 0.6 : 1) * Math.exp(-st / 0.02);
            strokeAmp = (kth ? 0.85 : 1) * (0.35 + 0.65 * Math.min(1, st / 0.012)) * (1 - 0.3 * (st / stroke));
          }
          y += nb.tick(r() * 2 - 1) * breath * (0.5 * e + chiffNow);
          let amp = e * levelGain(lvl) * per * strokeAmp;
          if (trem) {
            fPh += fInc;
            amp *= 0.65 + 0.35 * Math.sin(fPh);
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
// Pipe organ: ranks of flue pipes (foot ratios and levels), each a near-sine with a few harmonics, a breathy chiff
// as the pipe speaks, and a little wind noise. The swell box (dynamics) changes level and brightness.
// ---------------------------------------------------------------------------------------------------------------
export function organ(spec) {
  const {
    ranks = [[0.5, 0.35], [1, 1], [2, 0.5], [4, 0.25]], harm = [0.3, 0.12, 0.06], chiff = 0.1, attack = 0.04,
    release = 0.12, gain = 1, range = [24, 108],
  } = spec;
  return {
    range,
    render(ev, out, ctx) {
      const r = rng(ev.seed);
      const durS = ev.art.includes('^') ? Math.min(ev.dur * 0.6, 0.2) : ev.dur;
      const onN = Math.max(1, Math.round(durS * SR));
      const n = onN + Math.round(release * SR * 1.3);
      const lv = noteLevels(ev, ctx, n);
      const f0 = mtof(ev.midi);
      const buf = new Float64Array(n);
      for (const [ratio, level] of ranks) {
        const f = f0 * ratio * (1 + (r() - 0.5) * 0.0012);
        if (f > SR * 0.42 || f < 16) continue;
        const amp = level / (1 + Math.pow(f / 7000, 2));
        let ph = r();
        const env = new ADSR(attack * (0.8 + 0.4 * r()) * (f < 120 ? 2 : 1), 0.1, 1, release);
        for (let s = 0; s < n; s++) {
          const e = env.next(s < onN);
          ph += f / SR;
          if (ph >= 1) ph -= 1;
          const w = TAU * ph;
          buf[s] += amp * e * (Math.sin(w) + harm[0] * Math.sin(2 * w) + harm[1] * Math.sin(3 * w) + harm[2] * Math.sin(4 * w));
        }
      }
      const nb = new Biquad('bp', Math.min(9000, f0 * 3), 1.2);
      for (let s = 0; s < Math.min(n, Math.round(0.08 * SR)); s++) buf[s] += nb.tick(r() * 2 - 1) * chiff * Math.exp(-s / (0.025 * SR));
      const [gl, gr] = ctx.pan(ev.pan);
      const i0 = Math.round(ev.t * SR);
      const per = gain * (0.6 + 0.4 * ev.vel);
      for (let s = 0; s < n; s++) {
        const i = i0 + s;
        if (i >= out.L.length) break;
        const y = buf[s] * per * levelGain(lv[s >> 6]);
        out.L[i] += y * gl;
        out.R[i] += y * gr;
      }
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Ensemble: several players of any instrument (a pizzicato section, doubled harps), each a little apart in
// pitch, time and place. Chords split the players, as a divided section does.
// ---------------------------------------------------------------------------------------------------------------
export function ensemble(spec) {
  const { inner, players = 3, detune = 6, timing = 0.016, spread = 0.25, gain = 1 } = spec;
  const inst = build(inner);
  return {
    range: spec.range ?? inst.range,
    render(ev, out, ctx) {
      const r = rng(ev.seed ^ 0x5bd1e995);
      const nP = ev.cn > 1 ? Math.max(1, Math.round(players / ev.cn)) : players;
      const k = gain / Math.sqrt(players);
      const sub = { ...ctx, pan: (p) => ctx.pan(p).map((x) => x * k) };
      for (let p = 0; p < nP; p++) {
        inst.render(
          {
            ...ev, midi: ev.midi + (gauss(r) * detune) / 100, t: ev.t + r() * timing, pan: clamp(ev.pan + spread * (r() * 2 - 1), -1, 1),
            vel: clamp(ev.vel * (0.9 + 0.2 * r()), 0.05, 1), seed: hash(`${ev.seed}:${p}`),
          },
          out, sub,
        );
      }
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Orchestral percussion without pitch: each token is a hit (see instruments.mjs hit(): kick, snare, metal, bell,
// noise), shaped by the dynamics. ~ is a roll: repeated strokes, or one long swell for cymbals and tam-tam.
// ---------------------------------------------------------------------------------------------------------------
export function perc(spec) {
  const { kit, gain = 1, rollRate = 18 } = spec;
  return {
    range: [0, 127],
    render(ev, out, ctx) {
      let p = kit[ev.drum];
      if (!p) throw new Error(`perc: unknown token "${ev.drum}" (kit: ${Object.keys(kit).join(' ')})`);
      const r = rng(ev.seed);
      const lvl = ctx.levelAt(ev.t);
      const roll = ev.art.includes('~');
      const base = clamp(ev.vel * (ev.art.includes('!') ? 1.2 : 1), 0.05, 1.2) * levelGain(lvl) * gain;
      const hits = [];
      if (roll && p.roll === 'swell') {
        p = { ...p, swell: Math.max(0.05, ev.dur * 0.9) };
        hits.push([0, 0.8]);
      } else if (roll) {
        const rate = p.rollRate ?? rollRate;
        for (let t = 0; t < ev.dur; t += 1 / rate) hits.push([t + (r() - 0.5) * 0.008, 0.55 + 0.3 * r()]);
      } else hits.push([0, 1]);
      const [gl, gr] = ctx.pan(clamp(ev.pan + (p.pan ?? 0), -1, 1));
      const len = p.len ?? (p.d ?? p.nd ?? 0.4) * 1.1 + (p.swell ?? 0);
      for (const [ht, hv] of hits) {
        const y = hit(p, hv * base, r, Math.max(0.02, len));
        const i0 = Math.round((ev.t + ht) * SR);
        for (let s = 0; s < y.length; s++) {
          const i = i0 + s;
          if (i < 0) continue;
          if (i >= out.L.length) break;
          out.L[i] += y[s] * gl;
          out.R[i] += y[s] * gr;
        }
      }
    },
  };
}

Object.assign(BUILDERS, { wind, organ, ensemble, perc });
for (const [name, p] of Object.entries(PRESETS.instruments)) if (p.range) RANGES[name] = p.range;

/** The instrument spec of a preset, ready for a song's `instruments` table. */
export function presetSpec(name) {
  const p = PRESETS.instruments[name];
  if (!p) throw new Error(`no orchestra preset "${name}"`);
  return { ...p.spec, rangeName: name };
}
export { PRESETS };
