// dist/: the one-file builds are current, within their size budget, export the whole API, and render exactly what
// the engine renders.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as engine from '../engine/browser.mjs';
import { renderSong } from '../engine/render.mjs';
import { sha256, loadSong, excerpt } from './helpers.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

test('dist/ matches a fresh build and fits its size budget (npm run build)', () => {
  const out = execFileSync('node', ['tools/build.mjs', '--check'], { cwd: root, encoding: 'utf8' });
  assert.match(out, /my-game-audio\.js .* KB gzipped \(budget/);
});

test('the ES module build exports the same API as the engine and renders the same samples', async () => {
  const dist = await import('../dist/my-game-audio.mjs');
  const want = Object.keys(engine).sort();
  assert.deepEqual(Object.keys(dist).filter((k) => k !== 'default').sort(), want);
  assert.equal(dist.VERSION, engine.VERSION);
  const song = excerpt(await loadSong('chiptune'));
  const a = dist.renderSong(song), b = renderSong(song);
  assert.equal(sha256(a.L, a.R), sha256(b.L, b.R));
});

test('the script build sets the global MyGameAudio', async () => {
  const { readFileSync } = await import('node:fs');
  const vm = await import('node:vm');
  const ctx = vm.createContext({});
  vm.runInContext(readFileSync(root + 'dist/my-game-audio.js', 'utf8'), ctx);
  assert.equal(typeof ctx.MyGameAudio.createPlayer, 'function');
  assert.equal(ctx.MyGameAudio.VERSION, engine.VERSION);
});
