// Shared by the loop tests: mixing stems, playback as a player hears it, and the seam measurements.
import assert from 'node:assert/strict';
import { renderCue, cuesOf, tailOf } from '../engine/loop.mjs';
import { mixParts } from '../engine/render.mjs';
import { arrange } from '../engine/score.mjs';
import { SR } from '../engine/dsp.mjs';
import { loadSong } from './helpers.mjs';

export const mixOf = (stems) => {
  const n = Object.values(stems)[0].L.length;
  const L = new Float32Array(n), R = new Float32Array(n);
  for (const s of Object.values(stems)) for (let i = 0; i < n; i++) { L[i] += s.L[i]; R[i] += s.R[i]; }
  return { L, R };
};
export const cat = (...xs) => {
  const n = xs.reduce((a, x) => a + x.L.length, 0);
  const L = new Float32Array(n), R = new Float32Array(n);
  let o = 0;
  for (const x of xs) { L.set(x.L, o); R.set(x.R, o); o += x.L.length; }
  return { L, R };
};
export const slice = (x, a, b) => ({ L: x.L.subarray(a, b), R: x.R.subarray(a, b) });
export function diffDb(a, b) {
  let e = 0, d = 0;
  for (let i = 0; i < a.L.length; i++) {
    e += a.L[i] ** 2 + a.R[i] ** 2;
    d += (a.L[i] - b.L[i]) ** 2 + (a.R[i] - b.R[i]) ** 2;
  }
  return 10 * Math.log10(d / (e || 1) + 1e-30);
}
/** How far the second difference at sample i stands out from the largest one within 20 ms around it (1 = typical). */
export function click(x, i) {
  const d2 = (k) => Math.max(Math.abs(x.L[k + 1] - 2 * x.L[k] + x.L[k - 1]), Math.abs(x.R[k + 1] - 2 * x.R[k] + x.R[k - 1]));
  let local = 0;
  for (let k = i - 882; k <= i + 882; k++) if (Math.abs(k - i) > 2) local = Math.max(local, d2(k));
  return Math.max(d2(i - 1), d2(i), d2(i + 1)) / (local || 1e-12);
}
/** What a player plays: the head, then the loop from headLoopAt, then the loop again, twice. */
export const playback = (r, stems = (x) => mixOf(x)) => {
  const head = stems(r.head), loop = stems(r.loop);
  const j = Math.round(r.headLoopAt * SR);
  return { x: cat(head, slice(loop, j, loop.L.length), loop, loop), seams: [head.L.length, head.L.length + loop.L.length - j, head.L.length + 2 * loop.L.length - j] };
};


const cues = new Map();
/** renderCue, once per song and cue in a test file. */
export async function cueOf(name, cue = 'main') {
  const k = `${name}:${cue}`;
  if (!cues.has(k)) cues.set(k, renderCue(await loadSong(name), { cue }));
  return cues.get(k);
}

/** The cue, dry and unmastered, against a continuous render of its intro and three passes of its body. */
export async function checkFold(name, cue) {
  const song = await loadSong(name);
  const parts = Object.fromEntries(Object.entries(song.parts).map(([k, p]) => [k, { ...p, sends: {} }]));
  const dry = { ...song, parts, buses: {}, master: { lufs: false } };
  const def = cuesOf(dry)[cue];
  const r = renderCue(dry, { cue });
  const form = [...def.intro, ...def.body, ...def.body, ...def.body];
  const arr = arrange({ ...dry, form });
  const N = Math.ceil((arr.duration + tailOf(dry)) * SR);
  const ref = mixParts({ ...dry, form }, arr, N);
  const head = mixOf(r.head), loop = mixOf(r.loop);
  const TI = Math.round(r.intro * SR), Lb = loop.L.length;
  const d1 = diffDb(slice(ref, 0, head.L.length), head);
  const d2 = diffDb(slice(ref, TI + Lb, TI + 2 * Lb), loop);
  assert.ok(d1 < -60, `head differs from the continuous render by ${d1.toFixed(1)} dB`);
  assert.ok(d2 < -60, `loop differs from the second pass of the continuous render by ${d2.toFixed(1)} dB`);
}

/** No click where the head meets the loop or where the loop meets itself, with every effect and the master. */
export async function checkSeams(name, cue = 'main') {
  const r = await cueOf(name, cue);
  const { x, seams } = playback(r);
  for (const s of seams) {
    const c = click(x, s);
    assert.ok(c <= 1.5, `seam at ${(s / SR).toFixed(3)} s: second difference ${c.toFixed(2)}x the largest within 20 ms`);
  }
  assert.ok(Math.abs(r.stats.lufs - -16) < 0.5, `loop loudness ${r.stats.lufs} LUFS`);
  assert.ok(r.stats.peakDb <= -1.9, `loop peak ${r.stats.peakDb} dBFS`);
  const loop = mixOf(r.loop);
  assert.ok(click(cat(loop, loop), loop.L.length) <= 1.5, 'loop seam');
}
