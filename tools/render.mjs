// node tools/render.mjs <song> [...] [--stems] [--workers N]: render the whole song once, start to end, to
// out/<name>.wav, and print stats and the critic's notes. <song> is a name in songs/ (forest), a song module's path,
// or a score file (quartet.abc, piece.krn, piece.mid, score.mxl), whose voices and import warnings are printed
// first. Parts render in parallel on N worker threads (default: one per core; --workers 1 renders on this thread);
// the samples are the same either way.
import { writeFileSync, mkdirSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { renderSong, wav } from '../engine/render.mjs';
import { renderSongParallel } from '../engine/parallel.mjs';
import { createPool } from './workers.mjs';
import { loadSong, printImport } from './ears.mjs';

const args = process.argv.slice(2);
if (!args.some((a) => !a.startsWith('--')) || args.includes('--help')) {
  console.log(`usage: node tools/render.mjs <song> [...] [--stems] [--workers N]
  <song>     a name in songs/ (rollcall), a song module's path, or a score file (quartet.abc, piece.krn, piece.mid,
             score.mxl): rendered once, start to end, to out/<name>.wav, with its stats in out/<name>.json
  --stems    each part's own WAV too, in out/stems/<name>/ (python3 tools/ears.py --stems out/stems/<name>)
  --workers  how many threads render the parts (default: one per core; 1 renders on this thread)`);
  process.exit(args.includes('--help') ? 0 : 2);
}
mkdirSync('out', { recursive: true });
const wantStems = args.includes('--stems');
const wi = args.indexOf('--workers');
const nWorkers = wi >= 0 ? Number(args[wi + 1]) : availableParallelism();
const pool = nWorkers > 1 ? createPool(nWorkers) : null;
for (const arg of args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--workers')) {
  const { song, imported, name } = await loadSong(arg);
  console.log(`\n== ${name}: ${song.title} (${song.style})`);
  if (imported) printImport(arg, imported);
  const res = pool ? await renderSongParallel(song, { run: pool.run, stems: wantStems }) : renderSong(song, { log: console.log, stems: wantStems });
  if (wantStems) {
    mkdirSync(`out/stems/${name}`, { recursive: true });
    for (const [p, b] of Object.entries(res.stems)) writeFileSync(`out/stems/${name}/${p}.wav`, wav(b.L, b.R));
  }
  writeFileSync(`out/${name}.wav`, wav(res.L, res.R));
  const s = res.stats;
  console.log(`  rendered ${s.seconds}s of audio in ${s.renderMs} ms (${(s.seconds / (s.renderMs / 1000)).toFixed(1)}x real time${pool ? `, ${nWorkers} workers` : ''}); ${s.lufs} LUFS, peak ${s.peakDb} dBFS`);
  // each part's notes and range (and, for a melody, bass or harmony, how many on-beat notes are chord tones), then
  // the critic's notes: what to fix
  console.log('  parts:');
  for (const [p, r] of Object.entries(res.review.report)) console.log(`    ${p.padEnd(12)} ${r.events} events${r.range ? `, ${r.range}` : ''}${r.chordTones ? `, chord tones ${r.chordTones}` : ''}`);
  console.log(res.review.warnings.length ? `  critic notes (${res.review.warnings.length}):` : '  critic notes: none');
  for (const w of res.review.warnings) console.log(`    ${w}`);
  writeFileSync(`out/${name}.json`, JSON.stringify({ title: song.title, stats: s, critic: res.review }, null, 2));
}
await pool?.close();
