// npm run check: the quick health check of the repo, for agents and CI (about a minute on one core).
// For every song: the score parses and arranges with no errors; the first two sections, rendered dry, have only
// finite samples below full scale and render identically twice; and where the song can stream (no compressors,
// ducking, drive or chorus on its parts), the streamed render of that excerpt matches the whole one.
import { readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { arrange, critic } from '../engine/score.mjs';
import { renderSong, renderStream, streamable } from '../engine/render.mjs';

let failed = 0;
const fail = (m) => {
  failed++;
  console.log('  FAIL ' + m);
};
const hash = (r) => createHash('sha256').update(Buffer.from(r.L.buffer)).update(Buffer.from(r.R.buffer)).digest('hex').slice(0, 12);
const names = readdirSync(new URL('../songs/', import.meta.url)).filter((f) => f.endsWith('.mjs')).map((f) => f.slice(0, -4)).sort();

for (const name of names) {
  const song = (await import(`../songs/${name}.mjs`)).default;
  const arr = arrange(song);
  if (arr.errors.length) {
    fail(`${name}: ${arr.errors.length} score errors, first: ${arr.errors[0]}`);
    continue;
  }
  const notes = critic(song, arr).warnings.length;
  // dry excerpt: no send buses, so a streamed render should match the whole render almost exactly
  const parts = Object.fromEntries(Object.entries(song.parts).map(([k, p]) => [k, { ...p, sends: {} }]));
  const dry = { ...song, parts, buses: {}, form: song.form.slice(0, 2), tail: 1 };
  const a = renderSong(dry), b = renderSong(dry);
  if (hash(a) !== hash(b)) fail(`${name}: two renders of the same excerpt differ`);
  let peak = 0, bad = 0;
  for (let i = 0; i < a.L.length; i++) {
    const x = Math.max(Math.abs(a.L[i]), Math.abs(a.R[i]));
    if (!Number.isFinite(x)) bad++;
    else if (x > peak) peak = x;
  }
  if (bad) fail(`${name}: ${bad} non-finite samples`);
  if (peak > 1) fail(`${name}: peak ${peak.toFixed(3)} is above full scale`);
  let stream = 'does not stream';
  if (streamable(song)) {
    const N = a.L.length, L = new Float32Array(N), R = new Float32Array(N);
    renderStream(dry, { normDb: a.stats.normDb, onChunk: (c) => { L.set(c.L, c.start); R.set(c.R, c.start); } });
    let e = 0, d = 0;
    for (let i = 0; i < N; i++) {
      e += a.L[i] ** 2 + a.R[i] ** 2;
      d += (a.L[i] - L[i]) ** 2 + (a.R[i] - R[i]) ** 2;
    }
    const diff = 10 * Math.log10(d / (e || 1) + 1e-30);
    stream = `streamed render ${diff.toFixed(0)} dB from whole`;
    if (diff > -40) fail(`${name}: the streamed render differs from the whole render by ${diff.toFixed(1)} dB (want below -40)`);
  }
  console.log(`${name.padEnd(12)} ${arr.duration.toFixed(0).padStart(4)} s, ${String(notes).padStart(2)} critic notes; excerpt ${a.stats.seconds} s, hash ${hash(a)}, ${stream}`);
}
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
