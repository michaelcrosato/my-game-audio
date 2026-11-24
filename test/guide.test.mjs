// docs/AI_GUIDE.md teaches with code that works: its piece for strings (ABC), its songbook of cues (ABC) and its
// example song (the score format) import and arrange with no warnings, errors or critic notes, and pass the ears;
// every player method and sound it names exists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { arrange, critic } from '../engine/score.mjs';
import { renderCue } from '../engine/loop.mjs';
import { ears, checkAudio } from '../engine/ears.mjs';
import { cueAudio } from '../tools/ears.mjs';
import { SOUNDS } from '../engine/sounds.mjs';
import { VOICES, EMOTIONS } from '../engine/voice.mjs';
import { PRESETS } from '../engine/orchestra.mjs';
import { TECHNIQUES } from '../engine/score.mjs';

const guide = readFileSync(new URL('../docs/AI_GUIDE.md', import.meta.url), 'utf8');

test('the example song: no errors, no critic notes, and its cue passes the ears', async () => {
  const code = guide.match(/```js\n\/\/ file: songs\/forest\.mjs\n([\s\S]*?)```/)[1];
  const engine = pathToFileURL(fileURLToPath(new URL('../engine/', import.meta.url))).href;
  const dir = mkdtempSync(join(tmpdir(), 'guide-'));
  const f = join(dir, 'forest.mjs');
  writeFileSync(f, code.replace(/'\.\.\/engine\//g, `'${engine}`));
  const song = (await import(pathToFileURL(f).href)).default;
  const arr = arrange(song);
  assert.deepEqual(arr.errors, []);
  assert.deepEqual(critic(song, arr).warnings, []);
  const v = checkAudio(ears(...Object.values(cueAudio(renderCue(song)))));
  assert.ok(v.pass, v.problems.join('; '));
});

test('every sound, voice, emotion, preset and technique the guide names exists', () => {
  // the sound-effects section lists every sound in the library, by category, and nothing else
  const section = guide.slice(guide.indexOf('## Sound effects'), guide.indexOf('## Voices'));
  const listed = [...section.matchAll(/^- \*\*[^*]+\((\d+)\):\*\* ([\s\S]*?)\.$/gm)];
  const names = listed.flatMap((m) => [...m[2].matchAll(/`([a-z0-9_]+)`/g)].map((x) => x[1]));
  for (const n of names) assert.ok(SOUNDS[n], `the guide lists "${n}"`);
  assert.deepEqual([...names].sort(), Object.keys(SOUNDS).sort(), 'the guide lists every sound once');
  assert.equal(listed.reduce((t, m) => t + +m[1], 0), names.length, 'the counts add up');
  assert.ok(section.includes(`There are ${Object.keys(SOUNDS).length} named sounds`), 'the guide says how many');
  for (const v of Object.keys(VOICES)) assert.ok(guide.includes(v), `voice ${v}`);
  for (const e of Object.keys(EMOTIONS)) assert.ok(guide.includes(e), `emotion ${e}`);
  for (const t of TECHNIQUES) assert.ok(guide.includes('%' + t), `technique %${t}`);
  for (const p of ['violins', 'horn', 'timpani', 'soprano_choir', 'harp', 'oboe']) assert.ok(PRESETS.instruments[p], p);
});

test('the sheet-music template: an ABC songbook with no warnings, errors or critic notes, whose cue passes the ears', async () => {
  const code = guide.match(/```js\n\/\/ file: songs\/meadow\.mjs\n([\s\S]*?)```/)[1];
  const engine = pathToFileURL(fileURLToPath(new URL('../engine/', import.meta.url))).href;
  const dir = mkdtempSync(join(tmpdir(), 'guide-'));
  const f = join(dir, 'meadow.mjs');
  writeFileSync(f, code.replace(/'\.\.\/engine\//g, `'${engine}`));
  const { default: song, ABC } = await import(pathToFileURL(f).href);
  const { importABCBook } = await import('../engine/abc.mjs');
  const r = importABCBook(ABC);
  assert.deepEqual(r.report.warnings, []);
  assert.deepEqual(Object.keys(song.loops), ['explore']);
  assert.deepEqual(song.loops.explore.intro, ['explore_Intro']);
  assert.deepEqual(Object.keys(song.stingers), ['found']);
  assert.deepEqual(Object.keys(song.layers), ['drums']);
  assert.equal(r.report.room, 'band');
  const arr = arrange(song);
  assert.deepEqual(arr.errors, []);
  assert.deepEqual(critic(song, arr).warnings, []);
  const v = checkAudio(ears(...Object.values(cueAudio(renderCue(song, { cue: 'explore' })))));
  assert.ok(v.pass, v.problems.join('; '));
});

test('the piece template: string sections from their names, no warnings or critic notes, and it passes the ears', async () => {
  const abc = guide.match(/```abc\n% file: evening\.abc\n([\s\S]*?)```/)[1];
  const { importScore } = await import('../engine/importers.mjs');
  const { renderSong } = await import('../engine/render.mjs');
  const r = await importScore(abc, { fileName: 'evening.abc', log: () => {} });
  assert.deepEqual(r.report.warnings, []);
  assert.deepEqual(r.report.parts.map((p) => p.preset), ['violins', 'violins', 'violas', 'cellos']);
  assert.deepEqual(Object.keys(r.song.parts), ['vn1', 'vn2', 'va', 'vc'], '%%accompany off: no harp, no added bass');
  const arr = arrange(r.song);
  assert.deepEqual(arr.errors, []);
  assert.deepEqual(critic(r.song, arr).warnings, []);
  const { L, R } = renderSong(r.song);
  const m = ears(L, R);
  const v = checkAudio(m);
  assert.ok(v.pass, v.problems.join('; '));
  assert.match(m.key_est, /^D major/, 'the guide says it is heard in D major');
});
