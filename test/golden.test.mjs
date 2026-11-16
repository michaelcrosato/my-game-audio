// Determinism: every song's excerpt renders to exactly the samples recorded in test/golden.json. When a change to
// the engine alters sound on purpose, bump the version and run `npm run golden -- --write` (see tools/golden.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderSong } from '../engine/render.mjs';
import { VERSION } from '../engine/version.mjs';
import { songNames, loadSong, excerpt, sha256 } from './helpers.mjs';

const golden = JSON.parse(readFileSync(new URL('./golden.json', import.meta.url), 'utf8'));
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('the engine version matches package.json and is at least the golden hashes\' version', () => {
  assert.equal(VERSION, pkg.version);
  const v = (s) => s.split('.').map(Number);
  const [a, b] = [v(VERSION), v(golden.version)];
  assert.ok(a[0] > b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] >= b[2]))), `engine ${VERSION} is older than golden ${golden.version}`);
});

for (const name of songNames()) {
  test(`${name} renders to its golden hash`, async () => {
    assert.ok(golden.songs[name], `${name} has no golden hash yet: run npm run golden -- --write`);
    const r = renderSong(excerpt(await loadSong(name)));
    assert.equal(sha256(r.L, r.R), golden.songs[name], `${name} renders differently from test/golden.json (engine ${golden.version}); if that is intended, bump the version and run npm run golden -- --write`);
  });
}
