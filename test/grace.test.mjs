// Grace notes sound on every instrument, not only the piano: short notes just before the note they belong to; on a
// drum kit, flams. Before 0.15.0 only the piano played them, though every importer kept them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderSong, renderStream } from '../engine/render.mjs';
import { GM_KIT } from '../engine/midi.mjs';
import { presetSpec } from '../engine/orchestra.mjs';

const song = {
  bpm: 60, meter: [4, 4], grid: 16, form: ['A'], tail: 1, master: { lufs: false },
  instruments: { d: GM_KIT, f: presetSpec('flute'), v: presetSpec('violins') },
  parts: { dr: { inst: 'd' }, fl: { inst: 'f' }, vn: { inst: 'v' } },
  sections: { A: { bars: 2, parts: { dr: '| .:4 {s}s:4 .:8 | .:16 |', fl: '| .:12 {G4}A4:4 | .:16 |', vn: '| .:16 | .:4 {B4 C5}D5:8 .:4 |' } } },
};
const r = renderSong(song);
// mean power over [t0, t1) in dB
const power = (L, R, t0, t1) => {
  let e = 0;
  for (let i = Math.round(t0 * r.sr); i < Math.round(t1 * r.sr); i++) e += L[i] ** 2 + R[i] ** 2;
  return 10 * Math.log10(e / ((t1 - t0) * r.sr) + 1e-20);
};

test('a flam is a softer hit 30 ms before the drum hit', () => {
  assert.ok(power(r.L, r.R, 0.9, 0.965) < -150, 'silence before the flam');
  const flam = power(r.L, r.R, 0.972, 0.999), main = power(r.L, r.R, 1.0, 1.03);
  assert.ok(flam > -30, `the flam sounds: ${flam.toFixed(1)} dB`);
  assert.ok(main > flam, 'the hit is louder than its flam');
});

test('grace notes sound just before their note on a flute and on violins', () => {
  assert.ok(power(r.L, r.R, 2.85, 2.94) < -150);
  assert.ok(power(r.L, r.R, 2.95, 2.999) > -30, 'the flute\'s grace note sounds before the beat');
  assert.ok(power(r.L, r.R, 4.8, 4.88) < -150);
  assert.ok(power(r.L, r.R, 4.9, 4.999) > -35, 'the violins\' two grace notes sound before the beat');
});

test('a streamed render plays the grace notes as the whole render does', () => {
  const L = new Float32Array(r.L.length), R = new Float32Array(r.R.length);
  renderStream(song, { normDb: r.stats.normDb, onChunk: (c) => { L.set(c.L.subarray(0, Math.max(0, Math.min(c.L.length, L.length - c.start))), c.start); R.set(c.R.subarray(0, Math.max(0, Math.min(c.R.length, R.length - c.start))), c.start); } });
  let e = 0, d = 0;
  for (let i = 0; i < L.length; i++) {
    e += r.L[i] ** 2 + r.R[i] ** 2;
    d += (r.L[i] - L[i]) ** 2 + (r.R[i] - R[i]) ** 2;
  }
  assert.ok(10 * Math.log10(d / e) < -40, `streamed differs by ${(10 * Math.log10(d / e)).toFixed(1)} dB`);
});
