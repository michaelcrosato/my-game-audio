// Every orchestra preset: plays the calibration phrase at its family's target loudness (within 2 LU, so a change to
// an instrument that moves its level fails until `node tools/orchestra_calibrate.mjs --write` is run), and plays the
// lowest and highest notes of its range as finite, audible sound below full scale.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TARGET, KIT_TARGET, measure, play } from '../tools/calibration.mjs';
import { midiToName } from '../engine/score.mjs';
import { db } from '../engine/dsp.mjs';

const P = JSON.parse(readFileSync(new URL('../engine/orchestra-presets.json', import.meta.url), 'utf8'));

function stats(L, R, from, to) {
  let peak = 0, e = 0, bad = 0;
  for (let i = from; i < to; i++) {
    const a = L[i], b = R[i];
    if (!Number.isFinite(a) || !Number.isFinite(b)) bad++;
    else {
      peak = Math.max(peak, Math.abs(a), Math.abs(b));
      e += a * a + b * b;
    }
  }
  return { peak, rms: Math.sqrt(e / (2 * (to - from))), bad };
}

for (const [name, p] of Object.entries(P.instruments)) {
  if (name === 'percussion') {
    test('percussion tokens play at their calibrated loudness', () => {
      for (const tok of Object.keys(p.spec.kit)) {
        const L = measure(P, name, tok) + 20 * Math.log10(p.spec.kit[tok].gain);
        assert.ok(Math.abs(L - KIT_TARGET[tok]) <= 2, `${tok}: ${L.toFixed(2)} LUFS, target ${KIT_TARGET[tok]}`);
      }
    });
    continue;
  }
  test(`${name}: calibrated loudness, and the ends of its range`, () => {
    const L = measure(P, name) + p.gain;
    const t = TARGET[name] ?? -22;
    assert.ok(Math.abs(L - t) <= 2, `${name}: ${L.toFixed(2)} LUFS with its gain of ${p.gain} dB, target ${t}`);
    const [lo, hi] = p.range;
    const r = play(p.spec, `| ${midiToName(lo)}:8 .:8 | ${midiToName(hi)}:8 .:8 |`, { fx: p.fx, gain: p.gain });
    const split = Math.round(3 * 44100); // bar 2 starts 3 s in at 80 BPM
    const low = stats(r.L, r.R, 0, split);
    const high = stats(r.L, r.R, split, r.L.length);
    for (const [which, s, note] of [['lowest', low, lo], ['highest', high, hi]]) {
      assert.equal(s.bad, 0, `${name} ${which} note ${midiToName(note)}: non-finite samples`);
      assert.ok(s.peak < 1, `${name} ${which} note ${midiToName(note)}: peak ${s.peak.toFixed(3)} at mf`);
      assert.ok(s.rms > db(-70), `${name} ${which} note ${midiToName(note)}: silent (${(20 * Math.log10(s.rms)).toFixed(1)} dB RMS)`);
    }
  });
}
