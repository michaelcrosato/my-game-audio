// The cue sets (songs/set_*.mjs): ten loopable cues each, in three styles, arranged from the same themes; every cue
// arranges with no errors and no critic notes. The chiptune set's cues also go through the ears here (they render
// in about a second each); CI's cues job runs `npm run ears` on all thirty.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arrange, critic } from '../engine/score.mjs';
import { cuesOf, cueTiming, renderCue } from '../engine/loop.mjs';
import { ears, checkAudio } from '../engine/ears.mjs';
import { cueAudio } from '../tools/ears.mjs';
import { THEMES, CUES } from '../songs/themes/cues.mjs';
import { loadSong } from './helpers.mjs';

const SETS = ['set_chiptune', 'set_synthwave', 'set_orchestral'];
const WANT = ['title', 'menu', 'exploration', 'town', 'dungeon', 'battle', 'boss', 'victory', 'defeat', 'ambience'];

test('the themes: the ten cues a game needs, each with a key, tempo, chords and a melody that fills its bars', () => {
  assert.deepEqual(CUES, WANT);
  for (const c of CUES) {
    const t = THEMES[c];
    const song = { bpm: t.bpm, meter: t.meter, grid: t.grid, instruments: { x: { type: 'chip', ch: 'pulse' } }, parts: { m: { inst: 'x' } }, sections: { A: { bars: t.chords.split('|').filter((s) => s.trim()).length, chords: t.chords, parts: { m: t.melody } } }, form: ['A'] };
    assert.deepEqual(arrange(song).errors, [], c);
  }
});

for (const name of SETS) {
  test(`${name}: ten cues, each arranging with no errors and no critic notes, at its theme's tempo`, async () => {
    const song = await loadSong(name);
    assert.deepEqual(Object.keys(cuesOf(song)), WANT);
    for (const cue of WANT) {
      const def = cuesOf(song)[cue];
      const form = [...def.intro, ...def.body];
      const arr = arrange({ ...song, form });
      assert.deepEqual(arr.errors, [], `${cue}: ${arr.errors[0]}`);
      assert.deepEqual(critic({ ...song, form }, arr).warnings, [], cue);
      const tm = cueTiming(song, cue);
      const beat = 60 / THEMES[cue].bpm;
      assert.ok(Math.abs(tm.bodyBars[0].dur / tm.bodyBars[0].beats - beat) < 1e-9, `${cue}: ${THEMES[cue].bpm} BPM`);
    }
  });
}

test('set_chiptune: every cue passes the ears through both seams, in its key (no clicks, true peak under -1 dBTP, -16 LUFS)', async () => {
  const song = await loadSong('set_chiptune');
  for (const cue of WANT) {
    const m = ears(...Object.values(cueAudio(renderCue(song, { cue }))));
    const v = checkAudio(m);
    assert.ok(v.pass, `${cue}: ${v.problems.join('; ')}`);
    // the ears hear each cue in its theme's key (the ambience is D dorian, which no major or minor profile names)
    if (cue !== 'ambience') assert.equal(m.key_est, THEMES[cue].key, `${cue}: heard in ${m.key_est}`);
  }
});
