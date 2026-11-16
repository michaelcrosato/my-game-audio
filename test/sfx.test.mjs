// Sound effects: every library sound renders finite audio below clipping, at its loudness, for a length that suits
// its category; seeds vary each play and repeat exactly; ambient loops repeat with no click; the models and the
// layered format behave as documented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderSfx, sfxLoudness, SFX_TYPES } from '../engine/sfx.mjs';
import { SOUNDS, soundNames } from '../engine/sounds.mjs';
import { SR } from '../engine/dsp.mjs';
import { createHash } from 'node:crypto';

const sha = (r) => createHash('sha256').update(Buffer.from(r.L.buffer)).update(Buffer.from(r.R.buffer)).digest('hex');
// seconds a one-shot of each category may last (ambient beds are loops: their length is their `loop`)
const LENGTH = { interface: [0.05, 1], movement: [0.1, 1.2], combat: [0.2, 3], magic: [0.3, 2], pickups: [0.2, 2], doors: [0.3, 4] };
const CATS = ['interface', 'movement', 'combat', 'magic', 'pickups', 'doors', 'ambient'];

test('the library has at least 40 sounds in every category', () => {
  assert.ok(Object.keys(SOUNDS).length >= 40, `${Object.keys(SOUNDS).length} sounds`);
  for (const c of CATS) assert.ok(soundNames(c).length >= 4, `${c}: ${soundNames(c).length} sounds`);
  for (const [n, s] of Object.entries(SOUNDS)) assert.ok(CATS.includes(s.cat), `${n}: category "${s.cat}"`);
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
    // music, not a fault
    const steady = SOUNDS[name].layers.filter((l) => l.type === 'noise' || l.type === 'tone');
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
  assert.deepEqual(SFX_TYPES, ['tone', 'noise', 'modal', 'boom', 'step', 'whoosh', 'crackle', 'drip', 'creak']);
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
