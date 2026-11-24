// Sound effects: every library sound renders finite audio below clipping, at its loudness, for a length that suits
// its category; seeds vary each play and repeat exactly; ambient loops repeat with no click; the models and the
// layered format (trem, vowel, rep, seq, scatter, room, events in loops) behave as documented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderSfx, sfxLoudness, SFX_TYPES } from '../engine/sfx.mjs';
import { truePeak } from '../engine/ears.mjs';
import { SOUNDS, SOUND_CATEGORIES, soundNames, nearestSounds } from '../engine/sounds.mjs';
import { createPlayer } from '../engine/player.mjs';
import { SR } from '../engine/dsp.mjs';
import { createHash } from 'node:crypto';

const sha = (r) => createHash('sha256').update(Buffer.from(r.L.buffer)).update(Buffer.from(r.R.buffer)).digest('hex');
// seconds a one-shot of each category may last (ambient beds are loops: their length is their `loop`); spells,
// shots, thunder and jingles with a room ring longer
const LENGTH = { sports: [0.1, 5], interface: [0.05, 1.5], movement: [0.1, 1.6], combat: [0.2, 5], magic: [0.3, 4], pickups: [0.2, 2], doors: [0.3, 4], world: [0.1, 7], creatures: [0.1, 5], machines: [0.1, 4], jingles: [0.3, 4] };
const CATS = SOUND_CATEGORIES;

test('the library has at least 200 sounds, each in a category, each with its own description', () => {
  assert.ok(Object.keys(SOUNDS).length >= 200, `${Object.keys(SOUNDS).length} sounds`);
  assert.deepEqual(CATS, ['interface', 'movement', 'combat', 'magic', 'pickups', 'doors', 'world', 'creatures', 'machines', 'sports', 'jingles', 'ambient']);
  for (const c of CATS) assert.ok(soundNames(c).length >= 6, `${c}: ${soundNames(c).length} sounds`);
  const descs = new Set();
  for (const [n, s] of Object.entries(SOUNDS)) {
    assert.ok(CATS.includes(s.cat), `${n}: category "${s.cat}"`);
    assert.ok(typeof s.desc === 'string' && s.desc.length >= 6, `${n}: no description`);
    assert.ok(!descs.has(s.desc), `${n}: the description "${s.desc}" is another sound's`);
    descs.add(s.desc);
    if (!s.loop) assert.ok(LENGTH[s.cat], `${n}: no length for "${s.cat}"`);
  }
});

for (const [name, spec] of Object.entries(SOUNDS)) {
  test(`${name}: no clipping, a fitting length, its loudness`, () => {
    for (const seed of [1, 2]) {
      const r = renderSfx(spec, { seed });
      let peak = 0, bad = 0;
      for (let i = 0; i < r.L.length; i++) {
        const x = Math.max(Math.abs(r.L[i]), Math.abs(r.R[i]));
        if (!Number.isFinite(x)) bad++;
        else peak = Math.max(peak, x);
      }
      assert.equal(bad, 0, 'non-finite samples');
      assert.ok(peak <= Math.pow(10, -1 / 20) + 1e-6, `peak ${(20 * Math.log10(peak)).toFixed(2)} dBFS (ceiling -1)`);
      // the ceiling holds the true peak too: between the samples, where a sharp transient overshoots (0.18.0 and before
      // read up to -0.65 dBTP)
      const tp = Math.max(truePeak(r.L), truePeak(r.R));
      assert.ok(tp <= Math.pow(10, -1 / 20) * 1.0012, `true peak ${(20 * Math.log10(tp)).toFixed(2)} dBTP (ceiling -1)`);
      assert.ok(peak > 0.01, 'silent');
      if (spec.loop) assert.equal(r.L.length, Math.round(spec.loop * SR), 'a loop is exactly its length');
      else {
        const [lo, hi] = LENGTH[spec.cat];
        assert.ok(r.seconds >= lo && r.seconds <= hi, `${r.seconds.toFixed(2)} s, ${spec.cat} sounds last ${lo} to ${hi} s`);
        // a one-shot starts promptly: its first sound within 30 ms (or its first layer's delay)
        const delay = Math.min(...(spec.layers ?? [spec]).map((l) => l.at ?? 0));
        const first = r.L.findIndex((x, i) => Math.abs(x) > 1e-3 || Math.abs(r.R[i]) > 1e-3) / SR;
        assert.ok(first <= delay + 0.03, `first sound after ${(first * 1000).toFixed(0)} ms`);
      }
      assert.ok(Math.abs(r.loudness - (spec.level ?? -18)) <= 1, `loudness ${r.loudness.toFixed(1)}, target ${spec.level}`);
    }
  });
}

test('seeds: the same seed gives the same take, other seeds other takes', () => {
  const a = renderSfx(SOUNDS.step_gravel, { seed: 5 }), b = renderSfx(SOUNDS.step_gravel, { seed: 5 });
  assert.equal(sha(a), sha(b));
  const takes = new Set([1, 2, 3, 4, 5, 6].map((seed) => sha(renderSfx(SOUNDS.step_gravel, { seed }))));
  assert.equal(takes.size, 6, 'six seeds, six different footsteps');
  // vary.pitch moves a tonal sound's pitch between takes, within its range
  // zero crossings over the tone's steady 0.3 s
  const zc = (r) => { let n = 0; for (let i = 1; i < Math.round(0.3 * SR); i++) if ((r.L[i - 1] < 0) !== (r.L[i] < 0)) n++; return n / 0.3; };
  const rates = [1, 2, 3, 4].map((seed) => zc(renderSfx({ layers: [{ type: 'tone', wave: 'sine', freq: 1000, s: 0.3, d: 0.01 }], vary: { pitch: 0.1 } }, { seed })));
  for (const z of rates) assert.ok(z > 2 * 1000 * 0.88 && z < 2 * 1000 * 1.12, `${z.toFixed(0)} zero crossings per second`);
  assert.ok(Math.max(...rates) - Math.min(...rates) > 10, 'the takes differ in pitch');
});

for (const name of soundNames('ambient')) {
  test(`${name}: the loop repeats with no click and holds its level across the seam`, () => {
    const r = renderSfx(SOUNDS[name], { seed: 3 });
    const n = r.L.length;
    const d2 = (x, i) => Math.abs(x[(i + 1) % n] - 2 * x[i % n] + x[(i - 1 + n) % n]);
    let local = 0;
    for (let i = n - 2000; i < n + 2000; i++) if (Math.abs(i - n) > 2) local = Math.max(local, d2(r.L, i));
    const seam = Math.max(d2(r.L, n - 1), d2(r.L, n), d2(r.L, n + 1));
    assert.ok(seam <= 1.5 * local, `second difference at the seam ${(seam / local).toFixed(2)}x the largest within 45 ms`);
    // the level change across the seam (250 ms either side) is no bigger than the bed's own swings elsewhere: no dip
    // or jump from the crossfade. Measured on the steady layers only: a drop or a crackle landing by the seam is
    // music, not a fault, and so is an event (a layer with an `at`)
    const steady = SOUNDS[name].layers.filter((l) => (l.type === 'noise' || l.type === 'tone') && l.at == null);
    const b = renderSfx({ ...SOUNDS[name], layers: steady }, { seed: 3 });
    const rms = (a, c) => { let e = 0; for (let i = a; i < c; i++) e += b.L[((i % n) + n) % n] ** 2; return Math.sqrt(e / (c - a)); };
    const w = Math.round(0.25 * SR);
    const change = (at) => Math.abs(20 * Math.log10(rms(at - w, at) / rms(at, at + w)));
    const elsewhere = Array.from({ length: 40 }, (_, k) => change(Math.round(((k + 0.5) / 40) * n))).sort((a, b) => a - b);
    const limit = Math.max(3, elsewhere[Math.floor(0.9 * elsewhere.length)]);
    assert.ok(change(n) <= limit, `${change(n).toFixed(1)} dB across the seam; elsewhere up to ${limit.toFixed(1)} dB`);
  });
}

test('layers: delays, gains and pans place each layer; unknown types are errors', () => {
  const spec = { layers: [{ type: 'tone', wave: 'sine', freq: 440, d: 0.05, pan: -1 }, { type: 'tone', wave: 'sine', freq: 880, d: 0.05, at: 0.2, pan: 1 }], level: -20 };
  const r = renderSfx(spec);
  const rms = (x, a, b) => { let e = 0; for (let i = Math.round(a * SR); i < Math.round(b * SR); i++) e += x[i] ** 2; return Math.sqrt(e); };
  assert.ok(rms(r.L, 0, 0.06) > 100 * rms(r.R, 0, 0.06), 'the first layer is left');
  assert.ok(rms(r.R, 0.2, 0.26) > 100 * rms(r.L, 0.2, 0.26), 'the second layer is right, 0.2 s later');
  assert.ok(rms(r.L, 0.08, 0.19) + rms(r.R, 0.08, 0.19) < 1e-3, 'silence between them');
  assert.throws(() => renderSfx({ layers: [{ type: 'kazoo' }] }), /unknown layer type "kazoo"/);
  assert.deepEqual(SFX_TYPES, ['tone', 'noise', 'modal', 'boom', 'step', 'whoosh', 'crackle', 'drip', 'creak', 'scatter']);
});

test('the loudness measure: a full-scale 1 kHz sine reads about -3 dB, 10 dB quieter reads 10 dB lower', () => {
  const s = (a) => {
    const L = new Float32Array(SR), R = new Float32Array(SR);
    for (let i = 0; i < SR; i++) L[i] = R[i] = a * Math.sin((2 * Math.PI * 1000 * i) / SR);
    return sfxLoudness(L, R);
  };
  assert.ok(Math.abs(s(1) - -0.06) < 0.3, `${s(1).toFixed(2)}`); // BS.1770: a 0 dBFS 1 kHz sine in both channels is about 0 LKFS... less 3 dB per channel, plus 3 for two
  assert.ok(Math.abs(s(1) - s(Math.pow(10, -0.5)) - 10) < 0.01);
});

// the RMS of a channel over [a, b) seconds
const rmsOf = (x, a, b) => {
  let e = 0;
  const i0 = Math.round(a * SR), i1 = Math.min(x.length, Math.round(b * SR));
  for (let i = i0; i < i1; i++) e += x[i] * x[i];
  return Math.sqrt(e / Math.max(1, i1 - i0));
};
// zero crossings per second over [a, b): twice the pitch of a sine
const crossings = (x, a, b) => {
  let n = 0;
  for (let i = Math.round(a * SR) + 1; i < Math.round(b * SR); i++) if ((x[i - 1] < 0) !== (x[i] < 0)) n++;
  return n / (b - a);
};

test('rep plays a layer again: three beeps 0.2 s apart, each 6 dB below the last', () => {
  const r = renderSfx({ layers: [{ type: 'tone', wave: 'sine', freq: 1000, a: 0.002, s: 0.05, d: 0.01, rep: [3, 0.2, 6] }], level: -20 });
  const beeps = [0, 0.2, 0.4].map((t) => rmsOf(r.L, t + 0.01, t + 0.05));
  for (let k = 1; k < 3; k++) assert.ok(Math.abs(20 * Math.log10(beeps[k - 1] / beeps[k]) - 6) < 0.5, `beep ${k + 1}: ${(20 * Math.log10(beeps[k - 1] / beeps[k])).toFixed(2)} dB below`);
  assert.ok(rmsOf(r.L, 0.09, 0.19) < 1e-4 * beeps[0], 'silence between them');
});

test('seq plays a layer as notes: an octave up after 0.2 s, its sustain the note length', () => {
  const r = renderSfx({ layers: [{ type: 'tone', wave: 'sine', freq: 440, a: 0.002, d: 0.005, seq: [[0, 0, 0.1], [0.2, 12, 0.1]] }], level: -20 });
  assert.ok(Math.abs(crossings(r.L, 0.02, 0.09) - 880) < 40, `first note ${crossings(r.L, 0.02, 0.09).toFixed(0)} crossings/s`);
  assert.ok(Math.abs(crossings(r.L, 0.22, 0.29) - 1760) < 60, `second note ${crossings(r.L, 0.22, 0.29).toFixed(0)} crossings/s`);
  assert.ok(rmsOf(r.L, 0.12, 0.19) < 1e-4 * rmsOf(r.L, 0.02, 0.09), 'a rest between the notes');
});

test('trem: a gate silences the closed part of each cycle; a wobble dips to 1 - depth', () => {
  const gate = renderSfx({ layers: [{ type: 'tone', wave: 'sine', freq: 1000, a: 0.001, s: 1, d: 0.01, trem: [4, 1, 0.5] }], level: -20 });
  // at 4 Hz the gate is open for 0.125 s of every 0.25 s
  assert.ok(rmsOf(gate.L, 0.14, 0.24) < 1e-3 * rmsOf(gate.L, 0.01, 0.11), 'closed half silent');
  const wob = renderSfx({ layers: [{ type: 'tone', wave: 'sine', freq: 1000, a: 0.001, s: 1, d: 0.01, trem: [2, 0.5] }], level: -20 });
  const top = rmsOf(wob.L, 0.49, 0.51), dip = rmsOf(wob.L, 0.24, 0.26);
  assert.ok(Math.abs(dip / top - 0.5) < 0.03, `the dip is ${(dip / top).toFixed(3)} of the peak`);
});

test('vowel shapes a layer\'s colour but keeps its level against the others', () => {
  const spec = (vowel) => ({ layers: [{ type: 'tone', wave: 'sine', freq: 300, s: 0.4, d: 0.01, pan: -1 }, { type: 'tone', wave: 'saw', freq: 110, s: 0.4, d: 0.01, pan: 1, vowel }], level: -20 });
  const ratio = (r) => rmsOf(r.R, 0.05, 0.35) / rmsOf(r.L, 0.05, 0.35);
  const a = ratio(renderSfx(spec('a'))), u = ratio(renderSfx(spec('u'))), plain = ratio(renderSfx(spec(undefined)));
  for (const [v, x] of [['a', a], ['u', u]]) assert.ok(Math.abs(20 * Math.log10(x / plain)) < 1, `"${v}" moves the layer ${(20 * Math.log10(x / plain)).toFixed(2)} dB`);
  assert.notEqual(sha(renderSfx(spec('a'))), sha(renderSfx(spec('u'))), 'the vowels differ');
});

test('scatter: a bounce lands each strike sooner and quieter than the last; a smash spreads its strikes', () => {
  const r = renderSfx({ layers: [{ type: 'scatter', material: 'metal', pattern: 'bounce', freq: 3000, count: 4, gap: 0.2, ratio: 0.5, fall: 0.5, d: 0.05 }], level: -20, tail: 0.1 });
  // a strike peaks as it starts: the loudest sample in a window around where each should land (each gap within 10%)
  const peakIn = (a, b) => {
    let m = 0, at = a;
    for (let i = Math.round(a * SR); i < Math.round(b * SR); i++) if (Math.abs(r.L[i]) > m) { m = Math.abs(r.L[i]); at = i / SR; }
    return [at, m];
  };
  const s0 = peakIn(0, 0.05), s1 = peakIn(0.15, 0.25), s2 = peakIn(s1[0] + 0.07, s1[0] + 0.13), s3 = peakIn(s2[0] + 0.035, s2[0] + 0.065);
  const gaps = [s1[0] - s0[0], s2[0] - s1[0], s3[0] - s2[0]];
  [0.2, 0.1, 0.05].forEach((g, k) => assert.ok(Math.abs(gaps[k] / g - 1) < 0.12, `gap ${k + 1}: ${gaps[k].toFixed(3)} s`));
  assert.ok(s0[1] > s1[1] && s1[1] > s2[1] && s2[1] > s3[1], `peaks ${[s0, s1, s2, s3].map((x) => x[1].toFixed(3))}`);
  const smash = renderSfx({ layers: [{ type: 'scatter', material: 'glass', freq: [2000, 6000], count: 20, span: 0.5 }], level: -20 });
  assert.ok(rmsOf(smash.L, 0.3, 0.5) > 0.01 * rmsOf(smash.L, 0, 0.1), 'strikes later in the span');
});

test('room gives a one-shot a tail that dies away; without one, a click is over at once', () => {
  const click = { layers: [{ type: 'noise', a: 0.0005, d: 0.01 }], level: -20 };
  const dry = renderSfx(click), wet = renderSfx({ ...click, room: { mix: 0.5, rt60: 1 } });
  assert.ok(rmsOf(dry.L, 0.1, 0.3) < 1e-6, 'dry: silence after the click');
  const t1 = rmsOf(wet.L, 0.1, 0.2), t2 = rmsOf(wet.L, 0.6, 0.7);
  assert.ok(t1 > 1e-4 && t2 < t1 / 4, `wet tail ${t1.toExponential(1)}, then ${t2.toExponential(1)}`);
  assert.ok(wet.seconds >= 1, `a 1 s room rings for its rt60 (${wet.seconds.toFixed(2)} s)`);
});

test('in a loop, a layer with an `at` is an event that plays once; the rest run the whole loop', () => {
  const r = renderSfx({ loop: 2, level: -26, layers: [{ type: 'noise', color: 'pink', lp: [300, 300] }, { type: 'tone', wave: 'sine', freq: 3000, a: 0.002, d: 0.1, at: 1 }] });
  // X = 0.5 s of the bed folds into the start, so the event at 1 s sounds at 0.5 s of the loop
  const band = (a, b) => crossings(r.L, a, b);
  assert.ok(band(0.51, 0.56) > 4000, `the event: ${band(0.51, 0.56).toFixed(0)} crossings/s`);
  assert.ok(band(1.2, 1.6) < 2000, `the bed alone later: ${band(1.2, 1.6).toFixed(0)} crossings/s`);
});

test('the footstep surfaces since 0.17.0 render, each its own', () => {
  const hashes = new Set(['sand', 'mud', 'leaves', 'tile', 'carpet', 'dirt'].map((surface) => sha(renderSfx({ layers: [{ type: 'step', surface }] }, { seed: 4 }))));
  assert.equal(hashes.size, 6);
});

test('a sound the library does not have: the names games use lead to its own, and the error says them', () => {
  assert.equal(nearestSounds('confirm')[0], 'ui_confirm');
  assert.equal(nearestSounds('select')[0], 'ui_move');
  assert.equal(nearestSounds('oneup')[0], 'extra_life');
  assert.equal(nearestSounds('crowd')[0], 'crowd_cheer');
  assert.equal(nearestSounds('jumpp')[0], 'jump');
  assert.deepEqual(nearestSounds('xyzzy'), []);
  for (const n of ['boom', 'shoot', 'powerup', 'cancel', 'secret', 'clap']) for (const k of nearestSounds(n)) assert.ok(SOUNDS[k], `${n} -> ${k}`);
  const player = createPlayer({ workers: 0 });
  assert.throws(() => player.sfx('confirm'), /no sound "confirm": did you mean ui_confirm\?/);
});
