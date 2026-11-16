// node tools/build.mjs: writes dist/my-game-audio.js (a script that sets the global MyGameAudio) and
// dist/my-game-audio.mjs (an ES module), each one dependency-free file holding the whole engine and the player.
//
// The bundle runs its own code as the render worker: everything sits inside one function, and the player starts a
// worker from that function's source text. So there is one copy of the engine in the file, and a page can inline
// the file (no separate worker URL to serve). The build is byte-for-byte repeatable; CI checks dist/ is current.
// `--check` fails if dist/ differs from a fresh build, and prints the sizes against the budget.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { VERSION } from '../engine/version.mjs';

// The size budget for dist/my-game-audio.js, gzipped (what a game downloads). Raise it on purpose, in the changelog.
export const BUDGET_GZIP = 100 * 1024;

const res = await build({
  entryPoints: [new URL('../engine/browser.mjs', import.meta.url).pathname],
  bundle: true, format: 'iife', globalName: '__mga', write: false, minify: true, legalComments: 'none',
  target: ['es2022'], platform: 'browser', logLevel: 'error',
  define: { 'import.meta.url': '"about:blank"' },
});
const body = res.outputFiles[0].text.trim();
const header = `/*! my-game-audio ${VERSION} | MIT licence | https://github.com/michaelcrosato/my-game-audio
 * Game music, sound effects and voices written as code: no audio files. Docs: docs/API.md, docs/AI_GUIDE.md.
 * Built from engine/ by tools/build.mjs; edit the sources, not this file. */\n`;
const factory = `function myGameAudio(asWorker){${body}\nif(asWorker)__mga.startWorker(self);return __mga}`;
const iife = `${header}(function(root){${factory}\nvar api=myGameAudio(false);api.setWorkerSource("("+myGameAudio.toString()+")(true);");root.MyGameAudio=api})(typeof globalThis!=="undefined"?globalThis:this);\n`;
const api = await import('../engine/browser.mjs');
const names = Object.keys(api).filter((k) => k !== 'default').sort();
const esm = `${header}${factory}\nconst api=myGameAudio(false);api.setWorkerSource("("+myGameAudio.toString()+")(true);");\nexport default api;\nexport const {${names.join(',')}}=api;\n`;

const out = { 'dist/my-game-audio.js': iife, 'dist/my-game-audio.mjs': esm };
const root = new URL('../', import.meta.url).pathname;
const check = process.argv.includes('--check');
let stale = 0;
for (const [p, text] of Object.entries(out)) {
  const path = root + p;
  if (check) {
    if (!existsSync(path) || readFileSync(path, 'utf8') !== text) {
      console.error(`${p} is out of date: run npm run build and commit it`);
      stale++;
    }
  } else {
    mkdirSync(root + 'dist', { recursive: true });
    writeFileSync(path, text);
  }
  const gz = gzipSync(text, { level: 9 }).length;
  console.log(`${p.padEnd(24)} ${(text.length / 1024).toFixed(1)} KB, ${(gz / 1024).toFixed(1)} KB gzipped${p.endsWith('.js') ? ` (budget ${BUDGET_GZIP / 1024} KB)` : ''}`);
  if (p.endsWith('.js') && gz > BUDGET_GZIP) {
    console.error(`${p} is over its size budget`);
    stale++;
  }
}
if (stale) process.exit(1);
