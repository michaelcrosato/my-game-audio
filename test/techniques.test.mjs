// Playing techniques (M4): each one is heard in a measurable way. Single notes are rendered straight from an
// instrument, then compared by spectral centroid, energy in a band, envelope or pitch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SR, panGains } from '../engine/dsp.mjs';
import { build, syllableParts } from '../engine/instruments.mjs';
import { parseLine, arrange, TECHNIQUES } from '../engine/score.mjs';
import { stageTaps, SEATS } from '../engine/stage.mjs';
import { renderSong, renderStream } from '../engine/render.mjs';
import PRESETS from '../engine/orchestra-presets.json' with { type: 'json' };
import '../engine/orchestra.mjs';
import { dry, diffDb } from './helpers.mjs';

const ctx = { pan: panGains, levelAt: () => 0.6 };
/** One note of a preset (by name), mono (L + R), with 0.3 s of room before it for consonants sung ahead of the beat. */
function note(preset, ev, level = 0.6) {
  const spec = PRESETS.instruments[preset]?.spec ?? preset;
  const len = Math.round((0.3 + (ev.dur ?? 1) + 1.2) * SR);
  const out = { L: new Float32Array(len), R: new Float32Array(len) };
  build(spec).render({ t: 0.3, dur: 1, midi: 60, vel: 0.8, art: '', seed: 7, pan: 0, ci: 0, cn: 1, level, quarter: 0.5, ...ev }, out, { ...ctx, levelAt: () => level });
  return out.L.map((x, i) => x + out.R[i]);
}
const seg = (x, t0, t1) => x.subarray(Math.round(t0 * SR), Math.round(t1 * SR));
const rms = (x) => Math.sqrt(x.reduce((a, v) => a + v * v, 0) / Math.max(1, x.length));
function spectrum(x) {
  let n = 1;
  while (n < x.length) n <<= 1;
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < x.length; i++) re[i] = x[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (x.length - 1)));
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) [re[i], re[j], im[i], im[j]] = [re[j], re[i], im[j], im[i]];
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const c = Math.cos(a * k), s = Math.sin(a * k);
        const xr = re[i + k + len / 2] * c - im[i + k + len / 2] * s, xi = re[i + k + len / 2] * s + im[i + k + len / 2] * c;
        re[i + k + len / 2] = re[i + k] - xr;
        im[i + k + len / 2] = im[i + k] - xi;
        re[i + k] += xr;
        im[i + k] += xi;
      }
    }
  }
  const p = new Float64Array(n / 2);
  for (let k = 0; k < n / 2; k++) p[k] = re[k] * re[k] + im[k] * im[k];
  return { p, hz: SR / n };
}
const centroid = (x) => {
  const { p, hz } = spectrum(x);
  let a = 0, b = 0;
  p.forEach((v, k) => ((a += v * k * hz), (b += v)));
  return a / b;
};
const band = (x, lo, hi) => {
  const { p, hz } = spectrum(x);
  let e = 0, all = 0;
  p.forEach((v, k) => ((all += v), k * hz >= lo && k * hz < hi && (e += v)));
  return e / all;
};
/** The pitch of a stretch (autocorrelation), in MIDI note numbers. */
function pitch(x, lo = 40, hi = 90) {
  const f2l = (m) => SR / (440 * 2 ** ((m - 69) / 12));
  let best = 0, bl = 0;
  for (let l = Math.floor(f2l(hi)); l <= Math.ceil(f2l(lo)); l++) {
    let s = 0;
    for (let i = 0; i + l < x.length; i++) s += x[i] * x[i + l];
    if (s > best) [best, bl] = [s, l];
  }
  return 69 + 12 * Math.log2(SR / bl / 440);
}
/** The envelope (RMS every 5 ms) and how strongly it repeats at a period (normalized autocorrelation). */
function periodicity(x, period) {
  const hop = Math.round(0.005 * SR), env = [];
  for (let i = 0; i + hop <= x.length; i += hop) env.push(rms(x.subarray(i, i + hop)));
  // less its moving average over one period, which takes out slower swells (the players beating against each other)
  const lag = Math.round(period / 0.005);
  const e = env.map((v, i) => {
    const a = Math.max(0, i - (lag >> 1)), b = Math.min(env.length, a + lag);
    return v - env.slice(a, b).reduce((x, y) => x + y, 0) / (b - a);
  });
  let s = 0, s0 = 0;
  for (let i = 0; i + lag < e.length; i++) (s += e[i] * e[i + lag]), (s0 += e[i] * e[i]);
  return s / s0;
}

test('the score: techniques after the suffixes, syllables after @; unknown techniques are errors', () => {
  const r = parseLine('| C5:4^%spicc D5:4%pont%trem16 E5:4@schoe F5:4@a |', { spb: 16 });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.events.map((e) => [e.art, e.tech ?? [], e.syl ?? null, e.vowel]), [
    ['^', ['spicc'], null, null], ['', ['pont', 'trem16'], null, null], ['', [], 'schoe', 'e'], ['', [], null, 'a'],
  ]);
  assert.match(parseLine('| C5:16%sulpont |', { spb: 16 }).errors[0], /unknown technique "%sulpont"/);
  assert.ok(TECHNIQUES.length >= 11);
});

test('strings: sul ponticello brighter and thinner, sul tasto darker, a harmonic nearly pure', () => {
  const at = (ev) => seg(note('violins', { midi: 64, ...ev }), 0.6, 1.1);
  const plain = at({}), pont = at({ tech: ['pont'] }), tasto = at({ tech: ['tasto'] }), harm = at({ art: '*' });
  const f0 = 329.6;
  assert.ok(centroid(pont) > 1.4 * centroid(plain), `pont ${centroid(pont)} against ${centroid(plain)} Hz`);
  assert.ok(band(pont, 0, 1.5 * f0) < 0.5 * band(plain, 0, 1.5 * f0), 'the fundamental drops away near the bridge');
  assert.ok(centroid(tasto) < 0.8 * centroid(plain), `tasto ${centroid(tasto)} against ${centroid(plain)} Hz`);
  assert.ok(band(harm, 0, 1.5 * f0) > 0.9, 'a harmonic: nine tenths of its energy at the fundamental');
});

test('strings: spiccato and col legno are short and struck; a sustained note is not', () => {
  const plain = note('violins', { dur: 1 }), spicc = note('violins', { dur: 1, tech: ['spicc'] }), legno = note('violins', { dur: 1, tech: ['legno'] });
  const tail = (x) => rms(seg(x, 0.55, 0.75)) / rms(seg(x, 0.3, 0.4));
  assert.ok(tail(plain) > 0.5, `plain ${tail(plain)}`);
  assert.ok(tail(spicc) < 0.05, `spiccato ${tail(spicc)}`);
  assert.ok(tail(legno) < 0.05, `col legno ${tail(legno)}`);
  // col legno is mostly the stick's click: brighter at its start than a bowed attack
  assert.ok(centroid(seg(legno, 0.3, 0.33)) > centroid(seg(plain, 0.3, 0.33)));
});

test('strings: portamento slides from the last note; a slurred note glides only through a finger change', () => {
  const port = note('violins', { midi: 67, prevMidi: 60, legato: true, art: '_', tech: ['port'], dur: 1 });
  const slur = note('violins', { midi: 67, prevMidi: 60, legato: true, art: '_', dur: 1 });
  assert.ok(pitch(seg(port, 0.33, 0.37)) < 65.5, `portamento starts low: ${pitch(seg(port, 0.33, 0.37))}`);
  assert.ok(Math.abs(pitch(seg(slur, 0.36, 0.4)) - 67) < 0.5, `the slur arrives within 60 ms: ${pitch(seg(slur, 0.36, 0.4))}`);
  assert.ok(Math.abs(pitch(seg(port, 0.6, 0.7)) - 67) < 0.5, 'both end on the note');
});

test('measured tremolo: bow strokes of the note value, in time (sixteenths at a quarter of 0.5 s)', () => {
  const trem = seg(note('violins', { dur: 1.2, tech: ['trem16'] }), 0.5, 1.4);
  const plain = seg(note('violins', { dur: 1.2 }), 0.5, 1.4);
  assert.ok(periodicity(trem, 0.125) > 0.25, `strokes every 0.125 s: ${periodicity(trem, 0.125)}`);
  assert.ok(periodicity(trem, 0.125) > 2.5 * Math.max(0.02, periodicity(plain, 0.125)), `a plain note: ${periodicity(plain, 0.125)}`);
});

test('winds: tongued repeats speak each stroke; flutter-tongue chops the tone', () => {
  const rep = seg(note('flute', { midi: 76, dur: 1.2, tech: ['trem16'] }), 0.5, 1.4);
  assert.ok(periodicity(rep, 0.125) > 0.5, `${periodicity(rep, 0.125)}`);
  const flz = seg(note('flute', { midi: 76, dur: 1.2, tech: ['flz'] }), 0.5, 1.4);
  assert.ok(periodicity(flz, 1 / 18) > 0.3, `flutter at 18 Hz: ${periodicity(flz, 1 / 18)}`);
});

test('brass: a rip rises into its note, flutter-tongue chops it, fortissimo turns brassy', () => {
  const rip = note('trumpet', { midi: 72, dur: 1, tech: ['rip'] });
  assert.ok(pitch(seg(rip, 0.32, 0.36), 50, 80) < 68, `the rip starts well below: ${pitch(seg(rip, 0.32, 0.36), 50, 80)}`);
  assert.ok(Math.abs(pitch(seg(rip, 0.7, 0.8), 50, 80) - 72) < 0.5);
  const flz = seg(note('trumpet', { midi: 72, dur: 1.2, tech: ['flz'] }), 0.5, 1.4);
  assert.ok(periodicity(flz, 1 / 24) > 0.3, `${periodicity(flz, 1 / 24)}`);
  // brassiness: at ff the upper harmonics grow faster than the level (cuivre); %brassy asks for it at mf
  const mf = seg(note('trombone', { midi: 55 }, 0.6), 0.6, 1.1), ff = seg(note('trombone', { midi: 55 }, 0.95), 0.6, 1.1);
  const forced = seg(note('trombone', { midi: 55, tech: ['brassy'] }, 0.6), 0.6, 1.1);
  assert.ok(band(ff, 2000, 8000) > 1.5 * band(mf, 2000, 8000), `${band(ff, 2000, 8000)} against ${band(mf, 2000, 8000)}`);
  assert.ok(band(forced, 2000, 8000) > 1.3 * band(mf, 2000, 8000));
});

test('choir: a syllable\'s consonants: s before the beat, t as a burst, a final s after the vowel, m dips the start', () => {
  assert.deepEqual(syllableParts('schoen').onset.map((p) => p[0]), ['sch']);
  assert.deepEqual(syllableParts('freun').onset.map((p) => p[0]), ['f', 'r']);
  assert.deepEqual(syllableParts('freun').coda.map((p) => p[0]), ['n']);
  const sing = (syl, vowel = 'a') => note('soprano_choir', { midi: 67, dur: 0.8, vowel, ...(syl ? { syl } : {}) });
  const a = sing(null), sa = sing('sa'), ta = sing('ta'), as = sing('as'), ma = sing('ma');
  // the s sounds in the 90 ms before the note, high in the spectrum
  assert.ok(rms(seg(sa, 0.21, 0.29)) > 20 * rms(seg(a, 0.21, 0.29)) + 1e-6);
  assert.ok(centroid(seg(sa, 0.21, 0.29)) > 4000, `s at ${centroid(seg(sa, 0.21, 0.29))} Hz`);
  assert.ok(rms(seg(ta, 0.28, 0.3)) > rms(seg(ta, 0.21, 0.26)), 'the t is a short burst just before the vowel');
  // a final s: the vowel stops and the hiss sounds at the note's end
  assert.ok(centroid(seg(as, 1.03, 1.09)) > 4000, `final s at ${centroid(seg(as, 1.03, 1.09))} Hz`);
  const ha = sing('ha');
  assert.ok(rms(seg(ma, 0.3, 0.33)) < 0.7 * rms(seg(ha, 0.3, 0.33)), 'the m hums before the vowel opens');
});

test('the hall: reflections by seat and by stage depth', () => {
  const song = { instruments: { vn: { type: 'strings', rangeName: 'violins' }, tb: { type: 'brass', rangeName: 'trombone' } } };
  const at = (seat, inst, pan = 0) => stageTaps({ ...song, stage: { seat } }, { inst, pan });
  const first = (t) => Math.min(...t.taps.map((x) => x[0])) / SR;
  const early = (t) => t.taps.reduce((a, x) => a + x[1] ** 2, 0) / t.direct ** 2;
  // a front-row seat hears its first reflection later after the direct sound than the stalls, the stalls than the balcony
  assert.ok(first(at('front', 'vn')) > first(at('stalls', 'vn')) && first(at('stalls', 'vn')) > first(at('balcony', 'vn')));
  // the trombones sit further back: quieter directly, more reflected sound for their direct sound
  assert.ok(at('stalls', 'tb').direct < 0.85 * at('stalls', 'vn').direct);
  assert.ok(early(at('stalls', 'tb')) > 2 * early(at('stalls', 'vn')));
  assert.ok(early(at('balcony', 'vn')) > early(at('front', 'vn')));
  assert.equal(stageTaps(song, { inst: 'vn' }), null, 'no stage, no taps');
  assert.deepEqual(Object.keys(SEATS), ['front', 'stalls', 'balcony']);
});

test('the hall: a staged song streams to the same samples as its whole render', () => {
  const song = {
    title: 'stage', bpm: 120, meter: [4, 4], grid: 4, seed: 3, tail: 1, stage: { seat: 'stalls' },
    instruments: { vn: { type: 'strings', rangeName: 'violins' }, hn: { type: 'brass', rangeName: 'horn' } },
    parts: { vn: { inst: 'vn', pan: -0.4 }, hn: { inst: 'hn', pan: 0.3 } },
    sections: { A: { bars: 2, parts: { vn: '| C5 E5 G5 C6 | G5:4 |', hn: '| C4:2 G3:2 | C4:4 |' } } }, form: ['A'],
  };
  assert.deepEqual(arrange(song).errors, []);
  const d = dry(song);
  const whole = renderSong(d);
  const L = new Float32Array(whole.L.length), R = new Float32Array(whole.L.length);
  renderStream(d, { normDb: whole.stats.normDb, first: 1, window: 1, onChunk: (c) => (L.set(c.L, c.start), R.set(c.R, c.start)) });
  const diff = diffDb(whole.L, whole.R, L, R);
  assert.ok(diff < -40, `streamed differs from whole by ${diff.toFixed(1)} dB`);
});

test('the limiter holds true peaks (between samples) under its ceiling, even for bright sounds', async () => {
  const { limit } = await import('../engine/fx.mjs');
  // a loud 11 kHz tone sampled so its peaks fall between samples, the worst case for a sample-peak limiter
  const n = SR, L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) L[i] = R[i] = 1.4 * Math.sin(2 * Math.PI * 11025.5 * (i / SR) + Math.PI / 4);
  limit(L, R, { ceiling: -2 });
  // the true peak: 8x oversampled with a long windowed sinc
  let tp = 0;
  for (let i = 64; i < n - 64; i++) {
    for (let f = 0; f < 8; f++) {
      let v = 0;
      for (let j = -32; j <= 32; j++) {
        const d = j - f / 8;
        v += L[i + j] * (d === 0 ? 1 : Math.sin(Math.PI * d) / (Math.PI * d)) * (0.5 + 0.5 * Math.cos((Math.PI * d) / 33));
      }
      tp = Math.max(tp, Math.abs(v));
    }
  }
  assert.ok(20 * Math.log10(tp) < -1.5, `true peak ${(20 * Math.log10(tp)).toFixed(2)} dBTP against a -2 dB ceiling`);
});
