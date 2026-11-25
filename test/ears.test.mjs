// The JavaScript ears (engine/ears.mjs): known signals give known numbers; a render gives what tools/ears.py says
// (where Python, numpy, scipy and pyloudnorm are installed: MGA_PYTHON=1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SR } from '../engine/dsp.mjs';
import { ears, checkAudio } from '../engine/ears.mjs';
import { renderSong, wav } from '../engine/render.mjs';
import { readWav, cueAudio } from '../tools/ears.mjs';
import { renderCue } from '../engine/loop.mjs';
import { loadSong, excerpt } from './helpers.mjs';

const tone = (secs, f) => {
  const L = new Float32Array(Math.round(secs * SR));
  for (const [hz, a, t0 = 0, t1 = secs] of f) for (let i = Math.round(t0 * SR); i < Math.round(t1 * SR); i++) L[i] += a * Math.sin(2 * Math.PI * hz * (i / SR) + 0.3);
  return L;
};

test('a 1 kHz tone at -20 dBFS: -20 LUFS, -20 dBTP, all of it in the mids, no clicks', () => {
  const x = tone(4, [[1000, 0.1]]);
  const m = ears(x, x);
  assert.ok(Math.abs(m.integrated_lufs + 20) < 0.3, `${m.integrated_lufs} LUFS`);
  assert.ok(Math.abs(m.true_peak_dbtp + 20) < 0.1, `${m.true_peak_dbtp} dBTP`);
  assert.ok(m.balance_pct.mid > 99);
  assert.equal(m.clicks, 0);
  assert.equal(m.stereo_corr, 1);
});

test('true peak between samples: a tone at a quarter of the sample rate, peaks falling between samples', () => {
  const n = SR, L = new Float32Array(n);
  for (let i = 0; i < n; i++) L[i] = 0.5 * Math.sin(2 * Math.PI * 11025 * (i / SR) + Math.PI / 4);
  const m = ears(L, L);
  assert.ok(m.sample_peak_dbfs < -8.9, `sample peak ${m.sample_peak_dbfs}`); // samples at 0.354: -9.0 dBFS
  assert.ok(Math.abs(m.true_peak_dbtp + 6.02) < 0.3, `true peak ${m.true_peak_dbtp} (the wave's 0.5: -6.0)`);
});

test('key: I IV V I in C major and in A minor; tempo: a pulse at 120 BPM; a lone spike is a click', () => {
  const chords = (roots) => tone(8, roots.flatMap(([ns, t0]) => ns.map((m) => [440 * 2 ** ((m - 69) / 12), 0.08, t0, t0 + 2])));
  const C = chords([[[48, 60, 64, 67], 0], [[53, 60, 65, 69], 2], [[55, 59, 62, 67], 4], [[48, 60, 64, 67], 6]]);
  assert.equal(ears(C, C).key_est, 'C major');
  const Am = chords([[[45, 57, 60, 64], 0], [[50, 57, 62, 65], 2], [[52, 56, 59, 64], 4], [[45, 57, 60, 64], 6]]);
  assert.equal(ears(Am, Am).key_est, 'A minor');
  const P = new Float32Array(8 * SR);
  for (let b = 0; b < 16; b++) for (let i = 0; i < 2000; i++) P[Math.round(b * 0.5 * SR) + i] += 0.5 * Math.exp(-i / 300) * Math.sin(i * 0.3);
  assert.ok(Math.abs(ears(P, P).tempo_bpm_est - 120) < 3, `${ears(P, P).tempo_bpm_est} BPM`);
  const S = new Float32Array(SR);
  S[SR / 2] = 0.5;
  const m = ears(S, S);
  assert.ok(m.clicks >= 1, 'the jump in and the jump out (tools/ears.py counts both too)');
  assert.equal(checkAudio(m).pass, false);
});

test('a strike that opens an entry swelling in is not a click; the strike alone is', () => {
  // a quiet bed, a one-sample strike, then a chord swelling in over 20 ms: little sound in the strike's first 10 ms,
  // more in the 40 after. The library's one FAIL was this: Aida's tutti under a triangle, at 7:46
  const at = SR / 2, entry = new Float32Array(SR), alone = new Float32Array(SR);
  for (let i = 0; i < SR; i++) {
    const bed = i < at ? 0.004 * Math.sin((2 * Math.PI * 200 * i) / SR) : 0;
    let chord = 0;
    if (i > at) {
      const t = (i - at) / SR;
      for (const hz of [262, 330, 392]) chord += 0.03 * Math.min(1, t / 0.02) * Math.sin(2 * Math.PI * hz * t);
    }
    entry[i] = bed + chord;
    alone[i] = bed;
  }
  entry[at] = alone[at] = -0.06;
  assert.equal(ears(entry, entry).clicks, 0);
  assert.ok(ears(alone, alone).clicks >= 1);
});

test('a drum hit that rings for a millisecond in silence is not a click; a one-sample spike is', () => {
  // a rim click in a quiet count-in: a burst at 8 kHz, its neighbouring samples swinging by more than the threshold,
  // dying away in a few ms. A game's cue written with presets and a room failed on six of these (0.24.1)
  const hit = new Float32Array(SR), spike = new Float32Array(SR);
  for (let i = 0; i < 400; i++) hit[SR / 2 + i] = 0.06 * Math.exp(-i / (0.002 * SR)) * Math.sin((2 * Math.PI * 8000 * i) / SR + 0.7);
  assert.ok(hit.some((x, i) => i && Math.abs(x - hit[i - 1]) > 0.05), 'the burst jumps past the threshold');
  assert.equal(ears(hit, hit).clicks, 0);
  spike[SR / 2] = 0.06;
  assert.ok(ears(spike, spike).clicks >= 1);
});

test('the chiptune cue, heard through both seams, passes the ears', async () => {
  const song = await loadSong('chiptune');
  const c = renderCue(song);
  const a = cueAudio(c);
  assert.equal(a.L.length, Math.round(c.intro * c.sr) + Math.round(c.headLoopAt * c.sr) + 2 * c.loop[c.layers[0]].L.length);
  const m = ears(a.L, a.R);
  const v = checkAudio(m);
  assert.ok(v.pass, v.problems.join('; '));
});

test('the JavaScript ears agree with tools/ears.py', { skip: process.env.MGA_PYTHON ? false : 'set MGA_PYTHON=1 (needs numpy, scipy, pyloudnorm, matplotlib)' }, async () => {
  const r = renderSong(excerpt(await loadSong('electronic')));
  const dir = mkdtempSync(join(tmpdir(), 'ears-'));
  const f = join(dir, 'x.wav');
  writeFileSync(f, wav(r.L, r.R));
  const py = JSON.parse(execFileSync('python3', ['tools/ears.py', f], { encoding: 'utf8' }));
  const { L, R } = readWav(new Uint8Array(wav(r.L, r.R)));
  const js = ears(L, R);
  assert.ok(Math.abs(js.integrated_lufs - py.integrated_lufs) < 0.2, `${js.integrated_lufs} against ${py.integrated_lufs} LUFS`);
  assert.ok(Math.abs(js.true_peak_dbtp - py.true_peak_dbtp) < 0.4, `${js.true_peak_dbtp} against ${py.true_peak_dbtp} dBTP`);
  for (const k of Object.keys(py.balance_pct)) assert.ok(Math.abs(js.balance_pct[k] - py.balance_pct[k]) <= 1, `${k}: ${js.balance_pct[k]} against ${py.balance_pct[k]}`);
  assert.equal(js.key_est, py.key_est);
  assert.ok(Math.abs(js.tempo_bpm_est - py.tempo_bpm_est) < 2);
  assert.equal(js.clicks, py.clicks);
});
