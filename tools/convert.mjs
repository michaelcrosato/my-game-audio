// node tools/convert.mjs IN OUT: between songs and score files, no Python.
//   node tools/convert.mjs songs/chiptune.mjs out/chiptune.mid      a song's notes for a DAW (Standard MIDI File)
//   node tools/convert.mjs tune.abc songs/tune.mjs [--instrument flute]
//   node tools/convert.mjs piece.mid songs/piece.mjs [--grid 4] [--pedal bass] [--dynamic pp]
//   node tools/convert.mjs score.mxl songs/score.mjs [--bars 1-40]  (as tools/import.mjs)
//   node tools/convert.mjs piece.krn songs/piece.mjs [--pedal bass] [--list norep]  (Humdrum **kern)
// Score files are untrusted input: they are only read.
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { importScore } from '../engine/importers.mjs';
import { exportMidi } from '../engine/midi.mjs';

const args = process.argv.slice(2);
const files = [], opt = {};
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) opt[args[i].slice(2)] = /^\d+$/.test(args[i + 1]) && args[i] === '--grid' ? +args[++i] : args[++i];
  else files.push(args[i]);
}
const [src, out] = files;
if (!src || !out) {
  console.error('usage: node tools/convert.mjs IN OUT   (song .mjs to .mid, or .abc / .mid / .mxl / .musicxml to a song .mjs)');
  process.exit(2);
}
if (src.endsWith('.mjs')) {
  const song = (await import(pathToFileURL(resolve(src)).href)).default;
  const bytes = exportMidi(song);
  writeFileSync(out, bytes);
  console.log(`wrote ${out}: ${bytes.length} bytes, ${Object.keys(song.parts).length} parts`);
} else {
  const r = await importScore(readFileSync(src), { ...opt, fileName: basename(src), log: console.log });
  writeFileSync(out, r.text);
  console.log(`read ${basename(src)} (${r.format}): ${r.report.bars} bars, ${r.report.parts.length} parts${r.report.cues ? `, cues ${Object.keys(r.report.cues).join(' ')}` : ''}; wrote ${out}`);
  for (const w of r.report.warnings ?? []) console.log('  warning:', w);
}
