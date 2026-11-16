// node tools/render.mjs <song> [...]: render songs/<song>.mjs to out/<song>.wav and print stats + the critic's notes.
import { writeFileSync, mkdirSync } from 'node:fs';
import { renderSong, wav } from '../engine/render.mjs';

mkdirSync('out', { recursive: true });
const args = process.argv.slice(2);
const wantStems = args.includes('--stems');
for (const name of args.filter((a) => !a.startsWith('--'))) {
  const song = (await import(`../songs/${name}.mjs`)).default;
  console.log(`\n== ${name}: ${song.title} (${song.style})`);
  const res = renderSong(song, { log: console.log, stems: wantStems });
  if (wantStems) {
    mkdirSync(`out/stems/${name}`, { recursive: true });
    for (const [p, b] of Object.entries(res.stems)) writeFileSync(`out/stems/${name}/${p}.wav`, wav(b.L, b.R));
  }
  writeFileSync(`out/${name}.wav`, wav(res.L, res.R));
  const s = res.stats;
  console.log(`  rendered ${s.seconds}s of audio in ${s.renderMs} ms (${(s.seconds / (s.renderMs / 1000)).toFixed(1)}x real time); ${s.lufs} LUFS, peak ${s.peakDb} dBFS`);
  console.log('  critic:');
  for (const [p, r] of Object.entries(res.review.report)) console.log(`    ${p.padEnd(12)} ${JSON.stringify(r)}`);
  for (const w of res.review.warnings) console.log(`    warning: ${w}`);
  writeFileSync(`out/${name}.json`, JSON.stringify({ title: song.title, stats: s, critic: res.review }, null, 2));
}
