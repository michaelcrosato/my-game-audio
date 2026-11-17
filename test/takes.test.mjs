// takes/: the limit on revisions holds (tools/takes.mjs verdict), every kept take still imports and arranges, each
// takes.json matches its files, and takes/README.md's table is current.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { importScore } from '../engine/importers.mjs';
import { arrange } from '../engine/score.mjs';
import { CAP, MIN_GAIN, PATIENCE, verdict, bestTake, readBooks, indexTable, TAKES_DIR } from '../tools/takes.mjs';

const root = new URL('..', import.meta.url).pathname;
// a take as takes.json keeps it: one measurement, with its checks and its scores
const take = (n, { CE = null, PQ = 7.5, warnings = 0, notes = 0, pass = true } = {}) => ({
  take: n,
  file: `${n}.abc`,
  measured: [{
    engine: 'test', mode: 'cues', importWarnings: Array(warnings).fill('w'), criticNotes: Array(notes).fill('n'),
    cues: { main: { pass } }, audiobox: CE == null ? null : { CE, CU: 7, PC: 4, PQ },
  }],
});
const takes = (...specs) => specs.map((s, i) => take(i + 1, s));

test(`the limit: ${CAP} takes, then the piece stops`, () => {
  assert.equal(CAP, 5);
  const rising = takes({ CE: 5 }, { CE: 5.5 }, { CE: 6 }, { CE: 6.5 });
  assert.equal(verdict(rising).stop, false);
  const v = verdict([...rising, take(5, { CE: 7 })]);
  assert.equal(v.stop, true);
  assert.match(v.why, /limit of 5 takes/);
  assert.equal(v.best.take, 5);
  // a take within 0.1 of the best is not the new best
  assert.equal(verdict(takes({ CE: 5.96 }, { CE: 5.95 }, { CE: 6.01 })).best.take, 1);
});

test(`${PATIENCE} revisions in a row that add less than ${MIN_GAIN} to the best enjoyment stop the piece`, () => {
  const v = verdict(takes({ CE: 6 }, { CE: 6.05 }, { CE: 6.08 }));
  assert.equal(v.stop, true);
  assert.match(v.why, /2 revisions in a row/);
  assert.equal(v.best.take, 1, 'a revision has to beat the standing best by 0.1 to replace it');
  // a gain resets the count
  assert.equal(verdict(takes({ CE: 6 }, { CE: 6.05 }, { CE: 6.3 }, { CE: 6.32 })).stop, false);
  // small steps add up against the standing best: 6.12 is 0.12 over take 1
  const steps = verdict(takes({ CE: 6 }, { CE: 6.06 }, { CE: 6.12 }));
  assert.equal(steps.stop, false);
  assert.equal(steps.best.take, 3);
});

test('mistakes come first: a clean take beats a higher-scored one with warnings or critic notes', () => {
  const t = takes({ CE: 7, notes: 1 }, { CE: 6 });
  assert.equal(bestTake(t).take, 2);
  assert.equal(verdict(t).stop, false);
  // a revision that brings mistakes back is no gain
  const v = verdict(takes({ CE: 6 }, { CE: 7, warnings: 2 }, { CE: 7.5, pass: false }));
  assert.equal(v.stop, true);
  assert.equal(v.best.take, 1);
  // until some take is clean there is no early stop, only the limit
  assert.equal(verdict(takes({ notes: 1 }, { notes: 1 }, { notes: 1 }, { notes: 1 })).stop, false);
  assert.equal(verdict(takes({ notes: 1 }, { notes: 1 }, { notes: 1 }, { notes: 1 }, { notes: 1 })).stop, true);
});

test('on a tie in the scores the earlier take stays best; with no scores, the later one', () => {
  assert.equal(bestTake(takes({ CE: 6, PQ: 7.5 }, { CE: 6, PQ: 7.5 })).take, 1);
  assert.equal(bestTake(takes({}, {})).take, 2);
});

test('every kept take imports and arranges, and each takes.json matches its files and the limit', async () => {
  for (const book of readBooks()) {
    const where = `takes/${book.piece}`;
    assert.ok(book.takes.length >= 1 && book.takes.length <= book.cap, `${where}: ${book.takes.length} takes, limit ${book.cap}`);
    assert.ok(book.cap <= CAP, `${where}: its limit is ${book.cap}, above ${CAP}`);
    assert.deepEqual(book.takes.map((t) => t.take), book.takes.map((_, i) => i + 1), `${where}: takes numbered 1 to n`);
    for (const t of book.takes) {
      const path = join(TAKES_DIR, book.piece, t.file);
      assert.ok(existsSync(path), `${where}: ${t.file} is missing`);
      assert.ok(t.measured.length >= 1 && t.measured.every((m) => m.engine && m.cues), `${where}: take ${t.take} has no measurement`);
      const { song } = await importScore(readFileSync(path), { fileName: t.file });
      const arr = arrange(song);
      assert.deepEqual(arr.errors, [], `${where}, take ${t.take}: score errors`);
    }
  }
});

test('takes/README.md has the current table of pieces (npm run takes rewrites it)', () => {
  const text = readFileSync(join(root, 'takes', 'README.md'), 'utf8');
  const m = /<!-- takes:index -->\n([^]*?)\n<!-- \/takes:index -->/.exec(text);
  assert.ok(m, 'takes/README.md has the index markers');
  const books = readBooks();
  assert.equal(m[1], books.length ? indexTable(books) : 'No pieces yet.', 'the table is out of date: run npm run takes');
});

test('npm run take keeps a take and its numbers, and refuses one after the piece has stopped', () => {
  const dir = mkdtempSync(join(tmpdir(), 'takes-'));
  const env = { ...process.env, MGA_TAKES_DIR: join(dir, 'takes'), MGA_TAKES_AUDIO: join(dir, 'audio') };
  const abc = join(dir, 'air.abc');
  writeFileSync(abc, 'X:1\nT:Short Air\nM:3/4\nL:1/4\nQ:1/4=120\nK:D\nV:1 name="Flute"\nV:2 name="Cello"\n[V:1] !mf! d f a | g2 f | e c A | d3 |]\n[V:2] !mp! D,3 | G,,3 | A,,3 | D,3 |]\n');
  const r = spawnSync(process.execPath, ['tools/takes.mjs', 'save', abc, '--once', '--no-score', '--workers', '1', '--note', 'first'], { cwd: root, env, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const book = JSON.parse(readFileSync(join(dir, 'takes', 'air', 'takes.json'), 'utf8'));
  assert.equal(book.takes.length, 1);
  assert.equal(book.takes[0].note, 'first');
  assert.equal(book.takes[0].measured[0].mode, 'once');
  assert.equal(book.takes[0].measured[0].cues.once.pass, true);
  assert.equal(readFileSync(join(dir, 'takes', 'air', '1.abc'), 'utf8'), readFileSync(abc, 'utf8'));
  assert.ok(existsSync(join(dir, 'audio', 'air', '1.once.wav')));
  // five takes on the book: the sixth is refused before anything renders
  book.takes = Array.from({ length: 5 }, (_, i) => ({ ...book.takes[0], take: i + 1, file: '1.abc' }));
  writeFileSync(join(dir, 'takes', 'air', 'takes.json'), JSON.stringify(book));
  const again = spawnSync(process.execPath, ['tools/takes.mjs', 'save', abc, '--no-score', '--workers', '1'], { cwd: root, env, encoding: 'utf8' });
  assert.equal(again.status, 1);
  assert.match(again.stderr, /has stopped \(the limit of 5 takes is reached\)/);
});
