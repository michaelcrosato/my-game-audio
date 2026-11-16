// A cue rendered with its parts, buses and master on worker threads (renderCueParallel) is the same, sample for
// sample, as one rendered on this thread (renderCue): the work moves off the page's thread, the music does not change.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderCue, renderCueParallel, freeze } from '../engine/loop.mjs';
import { createPool } from '../tools/workers.mjs';
import { loadSong } from './helpers.mjs';

test('a cue rendered on three worker threads equals the cue rendered on this one', async () => {
  const song = freeze(await loadSong('chiptune'));
  const pool = createPool(3);
  try {
    const a = renderCue(song), b = await renderCueParallel(song, { run: pool.run });
    assert.equal(b.normDb, a.normDb);
    for (const part of ['head', 'loop', 'entry']) {
      for (const [layer, s] of Object.entries(a[part])) {
        for (const ch of ['L', 'R']) assert.deepEqual(b[part][layer][ch], s[ch], `${part}.${layer}.${ch}`);
      }
    }
  } finally {
    await pool.close();
  }
});
