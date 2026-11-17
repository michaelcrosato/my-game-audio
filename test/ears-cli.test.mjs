// npm run ears on a score file: an agent's whole check in one command. The import's warnings (a miscounted bar),
// each voice's instrument, then each cue rendered and measured, PASS or FAIL. And tools/render.mjs on a score file:
// the piece once, start to end, as a WAV to listen to.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = new URL('..', import.meta.url).pathname;

test('npm run ears -- tune.abc: the import, the score and the sound in one report', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ears-cli-'));
  const abc = join(dir, 'tune.abc');
  writeFileSync(abc, `X:1\nT:Short Air\n%%cue air\nM:3/4\nL:1/4\nQ:1/4=120\nK:D\nV:1 name="Flute"\nV:2 name="Cello"\n[V:1] "D"!mf! d f a | "G"g2 f | "A"e c A B | "D"d3 |]\n[V:2] D,3 | G,,3 | A,,3 | D,3 |]\n`);
  const r = spawnSync(process.execPath, ['tools/ears.mjs', abc, '--workers', '1'], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /tune\.abc \(abc\): cues air/);
  assert.match(r.stdout, /Flute -> flute, Cello -> cellos/);
  assert.match(r.stdout, /import warnings \(1\):\n\s+air: Flute, bar 3: 4 beats in a 3\/4 bar; cut at the bar line/);
  assert.match(r.stdout, /PASS tune air \(rendered in/);
});

test('node tools/render.mjs piece.abc: a score file rendered once, start to end, to out/<name>.wav', () => {
  const dir = mkdtempSync(join(tmpdir(), 'render-cli-'));
  const abc = join(dir, 'piece.abc');
  writeFileSync(abc, `X:1\nT:Two Bars\nM:4/4\nL:1/4\nQ:1/4=120\nK:C\nV:1 name="Solo Violin"\nV:2 name="Piano"\n[V:1] !mp! e g c' b | !fermata!c'4 |]\n[V:2] !ped! [C,G,E]4 | !ped! [C,G,C]2 z !ped-up!z |]\n`);
  const r = spawnSync(process.execPath, ['tools/render.mjs', abc, '--workers', '1'], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /== piece: Two Bars/);
  assert.match(r.stdout, /Solo Violin -> violin_solo, Piano -> piano/);
  assert.match(r.stdout, /rendered [\d.]+s of audio/);
  assert.ok(existsSync(join(root, 'out', 'piece.wav')));
});

test('npm run ears -- piece.abc --once: a piece that ends is measured once, start to end', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ears-once-'));
  const abc = join(dir, 'end.abc');
  writeFileSync(abc, `X:1\nT:An Ending\nM:4/4\nL:1/4\nQ:1/4=120\nK:C\nV:1 name="Piano"\n!mf! c e g c' | !fermata![ceg]4 |]\n`);
  const r = spawnSync(process.execPath, ['tools/ears.mjs', abc, '--once', '--workers', '1'], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /critic notes: none/);
  const secs = +/PASS end, once \(rendered in [\d.]+ s\): ([\d.]+) s/.exec(r.stdout)[1];
  assert.ok(secs < 12, `${secs} s: two bars, the held fermata and the tail, not looped`);
});

test('npm run ears prints the loudness of each part of a tune, so a chorus that lifts shows', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ears-sections-'));
  const abc = join(dir, 'lift.abc');
  writeFileSync(abc, `X:1\nT:Lift\nP:AB\nM:4/4\nL:1/4\nQ:1/4=120\nK:C\nV:1 name="Violins"\nV:2 name="Cellos"\nP:A\n[V:1] !p! c d e f | g4 | e d c d | c4 |\n[V:2] !p! C,4 | G,,4 | C,4 | C,4 |\nP:B\n[V:1] !f! g a b c' | d'4 | c' b a b | c'4 |]\n[V:2] !f! C,4 | G,,4 | C,4 | C,4 |]\n`);
  const r = spawnSync(process.execPath, ['tools/ears.mjs', abc, '--once', '--workers', '1'], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const m = /sections: A 0:00 (-[\d.]+), B 0:08 (-[\d.]+) LUFS/.exec(r.stdout);
  assert.ok(m, r.stdout);
  assert.ok(+m[2] - +m[1] > 6, `the forte part is ${(+m[2] - +m[1]).toFixed(1)} LU above the piano one`);
});

test('npm run ears -- out/stems/<name>: who carries which band, and each part by section, with no Python', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ears-stems-'));
  const abc = join(dir, 'stemlift.abc');
  writeFileSync(abc, `X:1\nT:Lift\nP:AB\nM:4/4\nL:1/4\nQ:1/4=120\nK:C\nV:1 name="Violins"\nV:2 name="Cellos"\nP:A\n[V:1] !p! c d e f | g4 |\n[V:2] !p! C,4 | G,,4 |\nP:B\n[V:1] !f! g a b c' | d'4 |]\n[V:2] !f! C,4 | G,,4 |]\n`);
  const r = spawnSync(process.execPath, ['tools/render.mjs', abc, '--stems', '--workers', '1'], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const t = spawnSync(process.execPath, ['tools/ears.mjs', join(root, 'out', 'stems', 'stemlift')], { cwd: root, encoding: 'utf8' });
  assert.equal(t.status, 0, t.stdout + t.stderr);
  const cello = /^vc\s+(-[\d.]+)\s+(\d+)%\s+(\d+)%/m.exec(t.stdout), violin = /^vn\s+(-[\d.]+)\s+(\d+)%\s+(\d+)%/m.exec(t.stdout);
  assert.ok(cello && violin, t.stdout);
  assert.ok(+cello[3] > 90, 'the cellos carry the bass band');
  const secs = /^vn\s+(-[\d.]+)\s+(-[\d.]+)\s*$/m.exec(t.stdout.split('loudness by section')[1] ?? '');
  assert.ok(secs && +secs[2] - +secs[1] > 6, 'the violins rise from p to f between the sections');
});
