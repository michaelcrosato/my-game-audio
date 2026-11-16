// Playing while rendering: for every song that streams, the streamed render of its excerpt matches the whole render
// (dry: difference energy below -40 dB; with reverb and delay: integrated loudness within 0.2 LU).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderSong, renderStream, streamable } from '../engine/render.mjs';
import { lufs } from '../engine/fx.mjs';
import { songNames, loadSong, excerpt, dry, diffDb } from './helpers.mjs';

function streamed(song, normDb, N) {
  const L = new Float32Array(N), R = new Float32Array(N);
  let last = 0, chunks = 0;
  renderStream(song, {
    normDb,
    onChunk: (c) => {
      assert.equal(c.start, last, 'chunks arrive in order with no gaps');
      L.set(c.L, c.start);
      R.set(c.R, c.start);
      last = c.start + c.L.length;
      chunks++;
    },
  });
  assert.equal(last, N, 'the stream covers the whole render');
  return { L, R, chunks };
}

for (const name of songNames()) {
  test(`${name}: streamed against whole`, async (t) => {
    const song = await loadSong(name);
    if (!streamable(song)) {
      const nl = Object.values(song.parts).flatMap((p) => (p.fx ?? []).map((f) => f[0])).filter((f) => ['comp', 'duck', 'drive', 'chorus'].includes(f));
      assert.ok(nl.length > 0, 'a song that does not stream uses a nonlinear part effect');
      t.skip(`does not stream (${[...new Set(nl)].join(', ')})`);
      return;
    }
    const d = dry(song);
    const a = renderSong(d);
    const s = streamed(d, a.stats.normDb, a.L.length);
    const diff = diffDb(a.L, a.R, s.L, s.R);
    assert.ok(diff < -40, `dry: streamed differs from whole by ${diff.toFixed(1)} dB`);
    const w = excerpt(song);
    const b = renderSong(w);
    const sw = streamed(w, b.stats.normDb, b.L.length);
    const dl = lufs(sw.L, sw.R) - lufs(b.L, b.R);
    assert.ok(Math.abs(dl) <= 0.2, `with effects: streamed loudness differs by ${dl.toFixed(2)} LU`);
  });
}
