// docs/AI_GUIDE.md teaches with code that works: its example song arranges with no errors and no critic notes, and
// its cue passes the ears; every player method and sound it names exists.
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
  for (const n of guide.match(/`(ui|amb|step)_[a-z]+`/g) ?? []) assert.ok(SOUNDS[n.slice(1, -1)], n);
  for (const n of ['coin', 'jump', 'sword_swing', 'explosion', 'heal', 'chest_open', 'extra_life']) assert.ok(SOUNDS[n], n);
  assert.equal(Object.keys(SOUNDS).length, 58, 'the guide says 58 sounds');
  for (const v of Object.keys(VOICES)) assert.ok(guide.includes(v), `voice ${v}`);
  for (const e of Object.keys(EMOTIONS)) assert.ok(guide.includes(e), `emotion ${e}`);
  for (const t of TECHNIQUES) assert.ok(guide.includes('%' + t), `technique %${t}`);
  for (const p of ['violins', 'horn', 'timpani', 'soprano_choir', 'harp', 'oboe']) assert.ok(PRESETS.instruments[p], p);
});
