// library/: every piece's score is where library.json says, unchanged, under a licence rule 4 allows, and still
// imports and arranges; library/README.md's table is current.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { arrange } from '../engine/score.mjs';
import { readLibrary, loadPiece, indexTable, sha256, LIB_DIR, LICENCES } from '../tools/library.mjs';

const root = new URL('..', import.meta.url).pathname;
const lib = readLibrary();
const CORPORA = ['OpenScore Orchestra', 'PDMX', 'Mutopia Project'];
const GROUPS = ['orchestra', 'piano', 'voices', 'chamber', 'folk'];

test('each piece records its work, its score and where the score came from, under a licence rule 4 allows', () => {
  const ids = lib.pieces.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  for (const p of lib.pieces) {
    for (const k of ['id', 'title', 'composer', 'year', 'scoring']) assert.ok(p[k], `${p.id}: no ${k}`);
    assert.ok(GROUPS.includes(p.group), `${p.id}: group ${p.group}`);
    assert.ok(CORPORA.includes(p.source.corpus), `${p.id}: corpus ${p.source.corpus}`);
    assert.ok(LICENCES.includes(p.source.licence), `${p.id}: licence ${p.source.licence}`);
    assert.match(p.source.url, /^https:\/\//, `${p.id}: source url`);
    if (p.source.corpus === 'OpenScore Orchestra') assert.match(p.source.commit, /^[0-9a-f]{40}$/, `${p.id}: the corpus commit`);
    if (p.source.corpus === 'PDMX' && p.file) assert.match(p.source.musescore, /^https:\/\/musescore\.com\//, `${p.id}: the MuseScore page`);
    if (p.source.corpus === 'Mutopia Project') assert.match(p.source.version ?? '', /^Mutopia-\d{4}\/\d\d\/\d\d-\d+$/, `${p.id}: the Mutopia version`);
    if (p.song) assert.ok(existsSync(join(root, 'songs', `${p.song}.mjs`)), `${p.id}: songs/${p.song}.mjs`);
    else assert.equal(sha256(readFileSync(join(LIB_DIR, p.file))), p.sha256, `${p.id}: ${p.file} has changed since it was taken`);
  }
  // the scores folder holds the pieces' files and nothing else
  const files = lib.pieces.filter((p) => p.file).map((p) => p.file.replace(/^scores\//, '')).sort();
  assert.deepEqual(readdirSync(join(LIB_DIR, 'scores')).sort(), files);
});

test('every piece imports and arranges with no errors', async () => {
  for (const p of lib.pieces) {
    const { song } = await loadPiece(p);
    const arr = arrange(song);
    assert.deepEqual(arr.errors, [], `${p.id}: score errors`);
    assert.ok(arr.duration > 20, `${p.id}: ${arr.duration} s`);
  }
});

test('library/README.md has the current table of pieces (npm run library rewrites it)', () => {
  const text = readFileSync(join(LIB_DIR, 'README.md'), 'utf8');
  const m = /<!-- library:index -->\n([^]*?)\n<!-- \/library:index -->/.exec(text);
  assert.ok(m, 'library/README.md has the index markers');
  assert.equal(m[1], indexTable(lib), 'the table is out of date: run npm run library');
});
