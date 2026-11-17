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

mkdirSync('out', { recursive: true });
const args = process.argv.slice(2);
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
  console.log('  critic:');
  for (const [p, r] of Object.entries(res.review.report)) console.log(`    ${p.padEnd(12)} ${JSON.stringify(r)}`);
  for (const w of res.review.warnings) console.log(`    warning: ${w}`);
  writeFileSync(`out/${name}.json`, JSON.stringify({ title: song.title, stats: s, critic: res.review }, null, 2));
}
await pool?.close();
