// tools/import_score.mjs, the JavaScript port of tools/import_score.py for Humdrum sources: a config splits each
// staff into parts by note length and pedals with the bass. On the study (test/scores/kern_study.json) it writes a
// song that plays, and the very file the Python tool writes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { importScore } from '../tools/import_score.mjs';
import { arrange, critic } from '../engine/score.mjs';

const root = new URL('..', import.meta.url).pathname;
const cfgText = readFileSync(new URL('./scores/kern_study.json', import.meta.url), 'utf8');
const read = (p) => readFileSync(join(root, p), 'utf8');

test('a config splits the staves into parts by note length, pedals with the bass, and the song plays', async () => {
  const text = importScore(cfgText, { read });
  const song = (await import('data:text/javascript;base64,' + Buffer.from(text).toString('base64'))).default;
  const lanes = new Set(Object.values(song.sections).flatMap((s) => Object.keys(s.parts)));
  assert.deepEqual([...lanes].sort(), ['bass', 'fig', 'mel', 'mel2']);
  assert.ok(Object.values(song.sections).every((s) => s.pedal), 'a pedal line in every section');
  assert.deepEqual(song.sections.end.rit, [96, 80]);
  const arr = arrange(song);
  assert.deepEqual([arr.errors, arr.repairs], [[], []]);
  assert.deepEqual(critic(song, arr).warnings.filter((w) => !/identical/.test(w)), []);
});

test('it writes the same file as tools/import_score.py', { skip: process.env.MGA_PYTHON ? false : 'set MGA_PYTHON=1 (needs music21)' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'import-score-'));
  // the config's own text with only its output path changed (a round trip through JSON would rewrite 1.0 as 1)
  const out = join(dir, 'py.mjs');
  writeFileSync(join(dir, 'cfg.json'), cfgText.replace(/"out": "[^"]*"/, `"out": ${JSON.stringify(out)}`));
  const py = spawnSync('python3', ['-I', 'tools/import_score.py', join(dir, 'cfg.json')], { cwd: root, encoding: 'utf8' });
  assert.equal(py.status, 0, py.stderr);
  assert.equal(importScore(cfgText, { read }), readFileSync(out, 'utf8'));
});
