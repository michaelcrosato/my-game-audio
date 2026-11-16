// npm run ears on a score file: an agent's whole check in one command. The import's warnings (a miscounted bar),
// each voice's instrument, then each cue rendered and measured, PASS or FAIL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
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
