// docs/GAMES.md, the page a game's agent reads first, stays true: its songbook imports with no warnings, errors or
// critic notes and passes the ears; every sound, voice, emotion and player method it names exists; its counts match
// the library; its links resolve.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { importABCBook } from '../engine/abc.mjs';
import { arrange, critic } from '../engine/score.mjs';
import { renderCue } from '../engine/loop.mjs';
import { ears, checkAudio } from '../engine/ears.mjs';
import { createPlayer } from '../engine/player.mjs';
import { SOUNDS, SOUND_CATEGORIES, soundNames } from '../engine/sounds.mjs';
import { VOICES, EMOTIONS } from '../engine/voice.mjs';
import { cueAudio } from '../tools/ears.mjs';

const page = readFileSync(new URL('../docs/GAMES.md', import.meta.url), 'utf8');
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen'];

test('the songbook: no warnings, errors or critic notes, and its cue passes the ears', () => {
  const abc = page.match(/```abc\n([\s\S]*?)```/)[1];
  const r = importABCBook(abc);
  assert.deepEqual(r.report.warnings, []);
  const song = r.song;
  assert.deepEqual(Object.keys(song.loops), ['explore']);
  assert.deepEqual(Object.keys(song.stingers), ['found']);
  assert.deepEqual(Object.keys(song.layers), ['drums']);
  const arr = arrange(song);
  assert.deepEqual(arr.errors, []);
  assert.deepEqual(critic(song, arr).warnings, []);
  const v = checkAudio(ears(...Object.values(cueAudio(renderCue(song, { cue: 'explore' })))));
  assert.ok(v.pass, v.problems.join('; '));
});

test('every sound it names exists, and its counts are the library\'s', () => {
  const table = page.slice(page.indexOf('| You might call it'), page.indexOf('```js', page.indexOf('| You might call it')));
  const named = [...table.matchAll(/`([a-z0-9_]+)`/g)].map((m) => m[1]);
  assert.ok(named.length > 50, `${named.length} names in the table`);
  for (const n of named) assert.ok(SOUNDS[n], `the table names "${n}"`);
  const code = [...page.matchAll(/```js\n([\s\S]*?)```/g)].map((m) => m[1]).join('\n');
  const defined = [...code.matchAll(/define\('([a-z0-9_]+)'/g)].map((m) => m[1]);
  for (const m of code.matchAll(/(?:sfx\(|preload\(\[[^\]]*?)'([a-z0-9_]+)'/g)) assert.ok(SOUNDS[m[1]] || defined.includes(m[1]), `the code plays "${m[1]}"`);
  for (const m of code.matchAll(/SOUNDS\.([a-z0-9_]+)/g)) assert.ok(SOUNDS[m[1]], `the code copies "${m[1]}"`);
  assert.ok(page.includes(`${Object.keys(SOUNDS).length} named sounds in ${WORDS[SOUND_CATEGORIES.length]} categories`), 'the count of sounds and categories');
  const steps = soundNames('movement').filter((n) => n.startsWith('step_')).length;
  assert.ok(table.includes(`and ${WORDS[steps - 5]} more surfaces`), `${steps} footstep sounds`);
  assert.ok(table.includes(`and ${WORDS[soundNames('ambient').length - 5]} more loops`), `${soundNames('ambient').length} ambient loops`);
});

test('its voices, emotions and player methods exist; its links resolve', () => {
  const voices = page.slice(page.indexOf('- Characters:'), page.indexOf('- Emotions:'));
  assert.deepEqual([...voices.matchAll(/`([a-z]+)`/g)].map((m) => m[1]), Object.keys(VOICES));
  const emotions = page.slice(page.indexOf('- Emotions:'), page.indexOf('A question rises'));
  assert.deepEqual([...emotions.matchAll(/`([a-z]+)`/g)].map((m) => m[1]), Object.keys(EMOTIONS));
  const player = createPlayer({ workers: 0 });
  const methods = new Set([...page.matchAll(/player\.([a-zA-Z]+)\(/g)].map((m) => m[1]));
  for (const m of methods) assert.equal(typeof player[m], 'function', `player.${m}()`);
  for (const [, href] of page.matchAll(/\]\(([A-Za-z_./-]+\.md)\)/g)) assert.ok(existsSync(new URL(`../docs/${href}`, import.meta.url)), href);
  assert.ok(existsSync(new URL('../dist/my-game-audio.js', import.meta.url)) && existsSync(new URL('../tools/ears.mjs', import.meta.url)));
});
