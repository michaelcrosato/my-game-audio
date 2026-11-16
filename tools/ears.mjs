// npm run ears -- FILE.wav [...]           measure WAV files (16-bit or float, stereo or mono)
// npm run ears -- songs/<name>.mjs [--cue NAME|all] [--workers N]
//   render a song's cues (all of them by default) as a game plays them, the head then the loop twice (both seams),
//   and measure each; prints the numbers, the flags, and PASS or FAIL (engine/ears.mjs checkAudio), and writes
//   out/<name>.<cue>.ears.json. Exits 1 when anything fails. No Python needed; tools/ears.py stays as the deeper view.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { availableParallelism } from 'node:os';
import { ears, checkAudio } from '../engine/ears.mjs';
import { renderCue, renderCueParallel, cuesOf } from '../engine/loop.mjs';
import { createPool } from './workers.mjs';

/** A WAV file's samples: { L, R, sr }. */
export function readWav(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 12, fmt = null;
  while (p + 8 <= v.byteLength) {
    const id = String.fromCharCode(...bytes.subarray(p, p + 4)), size = v.getUint32(p + 4, true);
    if (id === 'fmt ') fmt = { format: v.getUint16(p + 8, true), ch: v.getUint16(p + 10, true), sr: v.getUint32(p + 12, true), bits: v.getUint16(p + 22, true) };
    if (id === 'data') {
      const n = Math.floor(size / (fmt.ch * (fmt.bits / 8)));
      const L = new Float32Array(n), R = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        for (let c = 0; c < Math.min(2, fmt.ch); c++) {
          const at = p + 8 + (i * fmt.ch + c) * (fmt.bits / 8);
          const x = fmt.format === 3 ? v.getFloat32(at, true) : v.getInt16(at, true) / 32768;
          (c === 0 ? L : R)[i] = x;
        }
        if (fmt.ch === 1) R[i] = L[i];
      }
      return { L, R, sr: fmt.sr };
    }
    p += 8 + size + (size & 1);
  }
  throw new Error('no data chunk');
}

/** A cue as a game hears it first: the head, then the loop twice (so both kinds of seam are measured). */
export function cueAudio(c) {
  const sum = (stems) => {
    const parts = Object.values(stems);
    const n = parts[0].L.length, L = new Float32Array(n), R = new Float32Array(n);
    for (const s of parts) for (let i = 0; i < n; i++) (L[i] += s.L[i]), (R[i] += s.R[i]);
    return { L, R };
  };
  const head = sum(c.head), loop = sum(c.loop);
  const at = Math.round(c.headLoopAt * c.sr), Lb = loop.L.length, n = head.L.length + 2 * Lb;
  const L = new Float32Array(n), R = new Float32Array(n);
  L.set(head.L);
  R.set(head.R);
  // the loop starts headLoopAt seconds into the body: from there on, the loop plays (wrapping)
  const bodyAt = Math.round(c.intro * c.sr);
  for (let i = bodyAt + at; i < n; i++) {
    const k = (i - bodyAt) % Lb;
    L[i] = loop.L[k];
    R[i] = loop.R[k];
  }
  // the window ends mid-music: fade its last 50 ms so the cut is not heard (or measured) as a click
  const end = bodyAt + at + 2 * Lb, f = Math.round(0.05 * c.sr);
  for (let i = 0; i < f; i++) {
    const g = (f - 1 - i) / f;
    L[end - f + i] *= g;
    R[end - f + i] *= g;
  }
  return { L: L.subarray(0, end), R: R.subarray(0, end) };
}

const show = (name, m, verdict) => {
  const b = m.balance_pct;
  console.log(`${verdict.pass ? 'PASS' : 'FAIL'} ${name}: ${m.seconds} s, ${m.integrated_lufs} LUFS, true peak ${m.true_peak_dbtp} dBTP, ${m.clicks} clicks; key ~ ${m.key_est}, tempo ~ ${m.tempo_bpm_est}; balance sub ${b.sub} bass ${b.bass} low-mid ${b['low-mid']} mid ${b.mid} high-mid ${b['high-mid']} air ${b.air} %`);
  for (const p of verdict.problems) console.log(`     problem: ${p}`);
  for (const w of verdict.warnings) console.log(`     warning: ${w}`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
  const files = args.filter((a, i) => !a.startsWith('--') && !['--cue', '--workers'].includes(args[i - 1]));
  if (!files.length) {
    console.error('usage: npm run ears -- FILE.wav [...] | songs/<name>.mjs [--cue NAME|all] [--workers N]');
    process.exit(2);
  }
  mkdirSync('out', { recursive: true });
  let failed = 0;
  const nW = Number(opt('--workers') ?? availableParallelism());
  const pool = files.some((f) => f.endsWith('.mjs')) && nW > 1 ? createPool(nW) : null;
  for (const f of files) {
    if (f.endsWith('.wav')) {
      const { L, R } = readWav(readFileSync(f));
      const m = ears(L, R);
      const v = checkAudio(m);
      show(basename(f), m, v);
      writeFileSync(f.replace(/\.wav$/, '.ears.json'), JSON.stringify({ ...m, verdict: v }, null, 1));
      failed += v.pass ? 0 : 1;
      continue;
    }
    const song = (await import(pathToFileURL(resolve(f)).href)).default;
    const name = basename(f, '.mjs');
    const want = opt('--cue') ?? 'all';
    const cues = want === 'all' ? Object.keys(cuesOf(song)) : [want];
    for (const cue of cues) {
      const c = pool ? await renderCueParallel(song, { cue, run: pool.run }) : renderCue(song, { cue });
      const a = cueAudio(c);
      const m = ears(a.L, a.R);
      const v = checkAudio(m, { lufs: song.master?.lufs ?? -16 });
      show(`${name} ${cue} (rendered in ${(c.stats.renderMs / 1000).toFixed(1)} s)`, m, v);
      writeFileSync(`out/${name}.${cue}.ears.json`, JSON.stringify({ ...m, verdict: v }, null, 1));
      failed += v.pass ? 0 : 1;
    }
  }
  await pool?.close();
  process.exit(failed ? 1 : 0);
}
