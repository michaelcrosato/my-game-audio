// Humdrum **kern in JavaScript (engine/kern.mjs): an original study (test/scores/kern_study.krn, CC0) with a pickup,
// a spine split and merge, a tie across the bar line with a trill, a grace note, staccato and accent marks, a dynamics
// spine and an expansion list. It reads as tools/kern.py does, note for note, and imports as a song.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { readKern, importKern } from '../engine/kern.mjs';
import { importScore, scoreFormat } from '../engine/importers.mjs';
import { arrange, critic } from '../engine/score.mjs';

const path = new URL('./scores/kern_study.krn', import.meta.url);
const text = readFileSync(path, 'utf8');
const q = (t) => +(t / 20160).toFixed(6);
const quiet = { log: () => {} };

test('readKern: the study, note by note (times in quarter notes)', () => {
  const k = readKern(text);
  assert.deepEqual(k.order, ['A', 'A', 'B']);
  assert.deepEqual([q(k.barLen), q(k.pickup), q(k.end), k.tempo], [3, 1, 28, 96]);
  assert.deepEqual(k.keys.map(([t, f]) => [q(t), f]), [[0, 1]]);
  const rh = k.notes[1].map((n) => [q(n.on), q(n.dur), n.midi, n.arts, n.grace, n.trill]);
  assert.deepEqual(rh.slice(0, 4), [[0, 1, 62, '', [], 0], [1, 1, 67, '^', [], 0], [2, 1, 71, '!', [69], 0], [3, 1, 69, '', [], 0]]);
  assert.deepEqual(rh[9], [7, 4, 66, '', [], 1], 'the trilled F# tied over the bar line lasts four beats');
  assert.deepEqual(k.dyn.map(([t, d]) => [q(t), d]), [[0, 'p'], [4, 'mf'], [7, 'f'], [16, 'mf'], [19, 'f'], [25, 'p']]);
});

test('readKern reads as tools/kern.py does', { skip: process.env.MGA_PYTHON ? false : 'set MGA_PYTHON=1 to run tools/kern.py too' }, () => {
  const k = readKern(text);
  const js = { notes: Object.fromEntries(Object.entries(k.notes).map(([s, ns]) => [s, ns.map((n) => [q(n.on), q(n.dur), n.midi, n.arts, n.grace, n.trill])])), dyn: k.dyn.map(([t, d]) => [q(t), d]), barLen: q(k.barLen), pickup: q(k.pickup) };
  const py = spawnSync('python3', ['-I', '-c', `
import sys, json
sys.path.insert(0, 'tools')
import kern
notes, dyn, bar_len, pickup, order, end = kern.read(open(sys.argv[1]).read())
f = lambda x: round(float(x), 6)
print(json.dumps({'notes': {str(s): [[f(n['on']), f(n['dur']), n['midi'], n['arts'], n['grace'], n['trill']] for n in ns] for s, ns in notes.items()}, 'dyn': [[f(t), d] for t, d in dyn], 'barLen': f(bar_len), 'pickup': f(pickup)}))
`, path.pathname], { cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8' });
  assert.equal(py.status, 0, py.stderr);
  assert.deepEqual(js, JSON.parse(py.stdout));
});

test('importKern: a song with the pickup, the repeat written out, the trill and grace note, and no critic notes', async () => {
  const r = importKern(text, quiet);
  assert.equal(r.song.title, 'Little Kern Study');
  assert.deepEqual(r.song.form, ['m1', 'm2', 'm6', 'end'], 'pickup, A, A again (with its dynamics), B');
  assert.equal(r.song.bpm, 96);
  assert.deepEqual(r.report.parts.map((p) => p.preset), ['piano', 'piano']);
  assert.match(r.song.sections.m2.parts.pno1, /^\| G4:8\^ \{A4\}B4:8! A4:8 \|/);
  assert.match(r.song.sections.m2.parts.pno1, /G4 F#4_ G4_ F#4_/, 'the trill from the upper note');
  assert.ok(r.song.sections.m2.parts.pno1b, 'the split voice is a lane of its own');
  const arr = arrange(r.song);
  assert.deepEqual([arr.errors, arr.repairs], [[], []]);
  assert.deepEqual(critic(r.song, arr).warnings, []);
  assert.equal(scoreFormat(text), 'kern');
  assert.equal((await importScore(text, quiet)).format, 'kern');
});
