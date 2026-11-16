// Seamless loops: a cue's head and loop play as one continuous piece of music, with no gap and no click at either
// seam (head into loop, loop into itself); layers are stems that add up to the mix. Heavier songs are in
// loop-seams.test.mjs and loop-orchestral.test.mjs, so the files run in parallel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderCue, renderOnce, cuesOf, layersOf, tailOf, freeze, cueKey } from '../engine/loop.mjs';
import { SR } from '../engine/dsp.mjs';
import { loadSong } from './helpers.mjs';
import { playback, click, cueOf, checkFold, checkSeams } from './loophelpers.mjs';

test('cues: named loops, intro and loop, or the whole form', async () => {
  const chip = await loadSong('chiptune');
  assert.deepEqual(cuesOf(chip), { main: { intro: ['intro'], body: ['A', 'B', 'A2'] } });
  const orch = await loadSong('orchestral');
  assert.deepEqual(Object.keys(cuesOf(orch)), ['main', 'climax']);
  assert.deepEqual(cuesOf({ form: ['x', 'y'] }), { main: { intro: [], body: ['x', 'y'] } });
});

test('layers: named groups of parts, the rest in "base"', async () => {
  const chip = await loadSong('chiptune');
  assert.deepEqual(layersOf(chip), { drums: ['noise'], base: ['pulse1', 'pulse2', 'tri'] });
  assert.deepEqual(layersOf({ parts: { a: {}, b: {} } }), { base: ['a', 'b'] });
  assert.throws(() => layersOf({ parts: { a: {} }, layers: { x: ['nope'] } }), /layer x: unknown part "nope"/);
});

test('the tail covers the longest ring and reverb', async () => {
  const orch = await loadSong('orchestral');
  assert.ok(tailOf(orch) >= 8, `orchestral tail ${tailOf(orch)} s (harp rings 8 s)`);
});

test('chiptune: head and loop equal a continuous render of intro and body played three times (dry, unmastered)', () => checkFold('chiptune', 'main'));

test('chiptune: no click at the head-to-loop seam or the loop seam, with every effect and the master', () => checkSeams('chiptune'));

test('layer stems add up to the mix, and each layer alone is clean at the seams', async () => {
  const r = await cueOf('chiptune');
  assert.deepEqual(r.layers, ['drums', 'base']);
  const drums = playback(r, (st) => st.drums);
  for (const s of drums.seams) assert.ok(click(drums.x, s) <= 1.5, `drums layer seam at ${(s / SR).toFixed(3)} s`);
  // with one layer muted the other still loops seamlessly
  const base = playback(r, (st) => st.base);
  for (const s of base.seams) assert.ok(click(base.x, s) <= 1.5, `base layer seam at ${(s / SR).toFixed(3)} s`);
});

test('bars and beats: the timing a player needs for bar and beat callbacks', async () => {
  const r = await cueOf('chiptune');
  assert.equal(r.introBars.length, 2);
  assert.equal(r.bodyBars.length, 20);
  assert.ok(Math.abs(r.intro - 3.2) < 1e-9 && Math.abs(r.body - 32) < 1e-9);
  for (const b of r.bodyBars) assert.equal(b.beats, 4);
  assert.deepEqual(r.bodyBars.slice(0, 3).map((b) => +b.t.toFixed(6)), [0, 1.6, 3.2]);
});

test('a second cue enters without its intro; renders are deterministic; keys follow the song', async () => {
  const song = await loadSong('orchestral');
  const chip = await loadSong('chiptune');
  const c = await cueOf('chiptune'), d = renderCue(chip);
  for (const n of c.layers) assert.deepEqual(c.loop[n].L, d.loop[n].L);
  assert.notEqual(c.entry, c.head, 'a cue with an intro has a separate entry');
  assert.equal(c.entry.base.L.length, Math.round(c.headLoopAt * SR));
  assert.throws(() => renderCue(song, { cue: 'nope' }), /no cue "nope"/);
  assert.equal(cueKey(song), cueKey(song));
  assert.notEqual(cueKey(song), cueKey({ ...song, seed: 99 }));
  assert.notEqual(cueKey(song, 'main'), cueKey(song, 'climax'));
  const f = freeze({ ...song, sections: { ...song.sections, intro: { ...song.sections.intro, parts: { ...song.sections.intro.parts, harp: () => '| .:16 | .:16 |' } } } });
  assert.equal(f.sections.intro.parts.harp, '| .:16 | .:16 |');
});

test('a one-shot render (a stinger) is mastered like a song', async () => {
  const song = await loadSong('chiptune');
  const r = renderOnce(song, song.stingers.win);
  assert.ok(Math.abs(r.seconds - (3.2 + 3)) < 0.01, `${r.seconds} s: two bars at 150 BPM and a 3 s tail`);
  let peak = 0;
  for (let i = 0; i < r.L.length; i++) peak = Math.max(peak, Math.abs(r.L[i]), Math.abs(r.R[i]));
  assert.ok(peak < 0.8 && peak > 0.1, `peak ${peak}`);
});
