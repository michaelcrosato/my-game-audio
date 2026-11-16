// Golden render hashes: the SHA-256 of a short excerpt of every song (the first two sections, with all effects),
// recorded in test/golden.json with the engine version that produced them. test/golden.test.mjs fails when a song
// renders differently, so an engine change that alters sound is always deliberate:
//   npm run golden            show which songs changed
//   npm run golden -- --write record the new hashes. Changed hashes of existing songs are written only if
//                             engine/version.mjs has moved on from the version in golden.json (bump it, and say
//                             what changed in CHANGELOG.md); new songs are added at any time.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { renderSong } from '../engine/render.mjs';
import { VERSION } from '../engine/version.mjs';
import { songNames, loadSong, excerpt, sha256 } from '../test/helpers.mjs';

const PATH = new URL('../test/golden.json', import.meta.url);
const old = existsSync(PATH) ? JSON.parse(readFileSync(PATH, 'utf8')) : { version: null, songs: {} };
const songs = {};
const changed = [], added = [];
for (const name of songNames()) {
  const r = renderSong(excerpt(await loadSong(name)));
  songs[name] = sha256(r.L, r.R);
  const was = old.songs[name];
  const tag = was == null ? 'new' : was === songs[name] ? 'same' : 'CHANGED';
  if (tag === 'new') added.push(name);
  if (tag === 'CHANGED') changed.push(name);
  console.log(`${name.padEnd(22)} ${songs[name].slice(0, 16)}  ${tag}`);
}
const removed = Object.keys(old.songs).filter((n) => !(n in songs));
if (removed.length) console.log('removed:', removed.join(', '));
if (process.argv.includes('--write')) {
  if (changed.length && old.version === VERSION) {
    console.error(`\n${changed.length} song(s) render differently, but the engine is still ${VERSION}. Bump engine/version.mjs and package.json, add a CHANGELOG.md entry, then write again.`);
    process.exit(1);
  }
  const version = changed.length || old.version == null ? VERSION : old.version;
  writeFileSync(PATH, JSON.stringify({ version, note: 'SHA-256 of the first two sections of each song, rendered with all effects. Written by tools/golden.mjs.', songs }, null, 2) + '\n');
  console.log(`wrote test/golden.json (version ${version})`);
} else if (changed.length || added.length || removed.length) console.log('\nrun with --write to record these hashes');
