// Compare the streamed render of a song with the whole-piece render: loudness, difference, time to first audio.
// usage: node tools/stream_test.mjs SONG [WINDOW_SECONDS]
import { renderSong, renderStream } from '../engine/render.mjs';
import { lufs } from '../engine/fx.mjs';
const name = process.argv[2];
const song = (await import(`../songs/${name}.mjs`)).default;
const t0 = performance.now();
const full = renderSong(song);
const tFull = performance.now() - t0;
const N = full.L.length;
const L = new Float32Array(N), R = new Float32Array(N);
let firstMs = null, chunks = 0;
const t1 = performance.now();
const st = renderStream(song, {
  normDb: full.stats.normDb, window: Number(process.argv[3] ?? 8),
  onChunk: (c) => {
    if (firstMs === null) firstMs = performance.now() - t1;
    L.set(c.L, c.start);
    R.set(c.R, c.start);
    chunks++;
  },
});
const tStream = performance.now() - t1;
let e = 0, d = 0, maxd = 0;
for (let i = 0; i < N; i++) {
  e += full.L[i] ** 2 + full.R[i] ** 2;
  const a = full.L[i] - L[i], b = full.R[i] - R[i];
  d += a * a + b * b;
  maxd = Math.max(maxd, Math.abs(a), Math.abs(b));
}
console.log(`${name}: full ${(tFull / 1000).toFixed(1)} s, stream ${(tStream / 1000).toFixed(1)} s in ${st.windows} windows (${chunks} chunks), first audio after ${(firstMs / 1000).toFixed(2)} s`);
console.log(`  loudness full ${lufs(full.L, full.R).toFixed(2)} LUFS, stream ${lufs(L, R).toFixed(2)} LUFS; difference ${(10 * Math.log10(d / e)).toFixed(1)} dB below the signal, largest sample difference ${maxd.toFixed(4)}`);
if (process.argv.includes('--wav')) {
  const { wav } = await import('../engine/render.mjs');
  const { writeFileSync } = await import('node:fs');
  writeFileSync(`out/${name}.stream.wav`, wav(L, R));
}
