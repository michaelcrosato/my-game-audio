// node tools/import.mjs SCORE.mxl songs/name.mjs [--bars 93-331] [--tempo 160] [--title "..."] [--key "D major"] [--source "..."]
// MusicXML (.mxl or .musicxml) to a song file with engine/musicxml.mjs: no Python, no music21. It writes what
// tools/import_orchestra.py writes (test/musicxml.test.mjs checks the two agree), in seconds instead of minutes.
// Without an output path it prints the parts' presets and writes nothing. Scores are untrusted input: it only reads
// them.
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { importMusicXML } from '../engine/musicxml.mjs';

const args = process.argv.slice(2);
const files = [], opt = {};
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) opt[args[i].slice(2)] = args[++i];
  else files.push(args[i]);
}
if (!files.length) {
  console.error('usage: node tools/import.mjs SCORE.mxl [songs/name.mjs] [--bars A-B] [--tempo BPM] [--title T] [--key K] [--source S]');
  process.exit(2);
}
const [src, out] = files;
const t0 = performance.now();
const r = await importMusicXML(readFileSync(src), { ...opt, fileName: basename(src), log: console.log });
console.log(`read ${basename(src)} in ${((performance.now() - t0) / 1000).toFixed(1)} s: ${r.report.bars} bars, ${r.report.parts.length} parts, ${r.report.lanes} lanes, ${r.report.sections} distinct sections`);
if (out) {
  writeFileSync(out, r.text);
  console.log(`wrote ${out} (${(r.text.length / 1024).toFixed(0)} KB)`);
}
