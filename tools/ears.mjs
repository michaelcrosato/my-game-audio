// npm run ears -- FILE.wav [...]           measure WAV files (16-bit or float, stereo or mono)
// npm run ears -- out/stems/<name>         a folder of stems (tools/render.mjs --stems): who carries which band, and
//                                          each part's loudness by section
// npm run ears -- songs/<name>.mjs [--cue NAME|all] [--workers N]
// npm run ears -- piece.abc --once           a piece that plays once: rendered start to end, not looped
// npm run ears -- quest.abc | piece.krn | piece.mid | score.mxl   a score file: imported as importScore does, then
//   checked as a song: the import's warnings, the arranger's errors and repairs, the critic's notes, then the cues
//   render a song's cues (all of them by default) as a game plays them, the head then the loop twice (both seams),
//   and measure each; prints the numbers, the flags, and PASS or FAIL (engine/ears.mjs checkAudio), and writes
//   out/<name>.<cue>.ears.json. Exits 1 when anything fails. No Python needed; tools/ears.py stays as the deeper view.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { availableParallelism } from 'node:os';
import { ears, checkAudio, bandEnergy, EAR_BANDS } from '../engine/ears.mjs';
import { SR } from '../engine/dsp.mjs';
import { lufs } from '../engine/fx.mjs';
import { renderCue, renderCueParallel, cuesOf } from '../engine/loop.mjs';
import { renderSong } from '../engine/render.mjs';
import { renderSongParallel } from '../engine/parallel.mjs';
import { arrange, critic } from '../engine/score.mjs';
import { importScore } from '../engine/importers.mjs';
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

/**
 * The loudness of each section of `form` as it plays in L/R from the start (an ABC tune's parts, P:A, P:B...), so a
 * chorus that lifts, or a verse that does not, shows: [{ name, start, end, lufs }], start and end in seconds. Sections
 * shorter than 0.4 s (one loudness block) are left out.
 */
export function sectionLoudness(song, L, R, form = song.form) {
  const arr = arrange({ ...song, form });
  const out = [];
  arr.starts.forEach((s, i) => {
    const t0 = arr.timeline[s.bar0]?.t0;
    const t1 = i + 1 < arr.starts.length ? arr.timeline[arr.starts[i + 1].bar0].t0 : arr.duration;
    const a = Math.round(t0 * SR), b = Math.min(L.length, Math.round(t1 * SR));
    if (t0 == null || b - a < 0.4 * SR) return;
    out.push({ name: s.name, start: +t0.toFixed(2), end: +t1.toFixed(2), lufs: +lufs(L.subarray(a, b), R.subarray(a, b)).toFixed(1) });
  });
  return out;
}
/** One line for the sections: "A 0:00 -17.1, B 0:16 -14.9 LUFS", or null for a piece of one section. */
export function sectionLine(secs, max = 12) {
  if (secs.length < 2) return null;
  const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  const shown = secs.slice(0, max).map((s) => `${s.name} ${mmss(s.start)} ${s.lufs}`);
  return `sections: ${shown.join(', ')}${secs.length > max ? `, ... ${secs.length - max} more` : ''} LUFS`;
}

/**
 * Who carries what, from a folder of stems (node tools/render.mjs piece.abc --stems): each part's loudness (dry, as it
 * enters the mix), its share of each band of the whole, and, where the render saved the sections' times, its loudness
 * in each section, so a melody under its accompaniment shows. No Python needed.
 */
export function stemTable(dir, log = console.log) {
  const rows = readdirSync(dir).filter((f) => f.endsWith('.wav')).sort().map((f) => {
    const { L, R } = readWav(readFileSync(join(dir, f)));
    return { name: f.slice(0, -4), L, R, e: bandEnergy(L, R), lufs: lufs(L, R) };
  });
  if (!rows.length) return log(`no stems in ${dir}`);
  const tot = Object.fromEntries(EAR_BANDS.map(([n]) => [n, rows.reduce((a, r) => a + r.e[n], 0) || 1e-20]));
  const lv = (x) => (Number.isFinite(x) && x > -70 ? x.toFixed(1) : '-');
  log(`${'part'.padEnd(14)}${'LUFS'.padStart(7)}${EAR_BANDS.map(([n]) => n.padStart(10)).join('')}   (share of each band of the mix)`);
  for (const r of rows) log(`${r.name.padEnd(14)}${lv(r.lufs).padStart(7)}${EAR_BANDS.map(([n]) => `${Math.round((100 * r.e[n]) / tot[n])}%`.padStart(10)).join('')}`);
  const secPath = join(dir, 'sections.json');
  if (!existsSync(secPath)) return;
  const secs = JSON.parse(readFileSync(secPath, 'utf8')).filter((s) => s.end - s.start >= 0.4);
  if (secs.length < 2) return;
  const shown = secs.slice(0, 12);
  log(`\nloudness by section, LUFS:\n${'part'.padEnd(14)}${shown.map((s) => s.name.slice(0, 9).padStart(10)).join('')}`);
  for (const r of rows) {
    log(`${r.name.padEnd(14)}${shown.map((s) => {
      const a = Math.round(s.start * SR), b = Math.min(r.L.length, Math.round(s.end * SR));
      return lv(b > a ? lufs(r.L.subarray(a, b), r.R.subarray(a, b)) : -Infinity).padStart(10);
    }).join('')}`);
  }
  if (secs.length > shown.length) log(`... and ${secs.length - shown.length} more sections`);
}

const SCORE = /\.(abc|krn|mid|midi|mxl|musicxml|xml)$/i;

/**
 * A song from the command line: a score file (.abc .krn .mid .mxl .musicxml .xml, imported as importScore does), a
 * song module's path, or the name of one in songs/. Returns { song, imported (null for a module), name }.
 */
export async function loadSong(arg) {
  const name = basename(arg).replace(/\.[^.]+$/, '');
  if (SCORE.test(arg)) {
    const imported = await importScore(readFileSync(arg), { fileName: basename(arg) });
    return { song: imported.song, imported, name };
  }
  const path = /\.mjs$|[\\/]/.test(arg) ? resolve(arg) : resolve('songs', `${arg}.mjs`);
  return { song: (await import(pathToFileURL(path).href)).default, imported: null, name };
}

/** Each voice and what it became, a drum voice named by its kit, once each: ['Flute -> flute', 'Drums -> band kit']. */
export function voicesOf(imported) {
  const kit = imported.song.instruments?.percussion;
  const kitName = !kit ? 'percussion' : kit.type === 'drums' ? 'band kit' : kit.type === 'chip' ? 'chip noise channel' : 'orchestral percussion';
  const out = [];
  for (const p of imported.report.parts) {
    const s = `${p.name} -> ${p.preset === 'percussion' ? kitName : p.preset}`;
    if (!out.includes(s)) out.push(s);
  }
  return out;
}

/** Print what an import made of a score: its cues, each voice and the instrument it became, and its warnings. */
export function printImport(file, imported, log = console.log) {
  const cues = imported.report.cues ? Object.keys(imported.report.cues).join(', ') : 'main';
  const st = imported.report.stingers && Object.keys(imported.report.stingers).length ? `, stingers ${Object.keys(imported.report.stingers).join(', ')}` : '';
  log(`${basename(file)} (${imported.format}): cues ${cues}${st}`);
  // each voice and the instrument it became, tune by tune in a songbook
  const name = basename(file).replace(/\.[^.]+$/, '');
  // a drum voice says which kit it became (its preset is "percussion" whichever it is), and a voice whose drum chords
  // fill several lanes is listed once
  const kit = imported.song.instruments?.percussion;
  const kitName = !kit ? 'percussion' : kit.type === 'drums' ? 'band kit' : kit.type === 'chip' ? 'chip noise channel' : 'orchestral percussion';
  const byCue = new Map();
  for (const p of imported.report.parts) {
    const list = byCue.get(p.cue ?? name) ?? byCue.set(p.cue ?? name, []).get(p.cue ?? name);
    const s = `${p.name} -> ${p.preset === 'percussion' ? kitName : p.preset}`;
    if (!list.includes(s)) list.push(s);
  }
  for (const [cue, voices] of byCue) log(`     ${cue}: ${voices.join(', ')}`);
  printList('import warnings', imported.report.warnings ?? [], log);
}

/** A titled list, at most 40 lines of it. */
export function printList(title, items, log = console.log) {
  if (!items.length) return;
  log(`${title} (${items.length}):`);
  for (const x of items.slice(0, 40)) log(`     ${x}`);
  if (items.length > 40) log(`     ... and ${items.length - 40} more`);
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
    console.error('usage: npm run ears -- FILE.wav [...] | out/stems/<name> | songs/<name>.mjs | quest.abc | piece.krn | piece.mid | score.mxl [--cue NAME|all] [--once] [--workers N]');
    process.exit(2);
  }
  mkdirSync('out', { recursive: true });
  let failed = 0;
  const nW = Number(opt('--workers') ?? availableParallelism());
  const pool = files.some((f) => !f.endsWith('.wav')) && nW > 1 ? createPool(nW) : null;
  for (const f of files) {
    if (existsSync(f) && statSync(f).isDirectory()) {
      stemTable(f);
      continue;
    }
    if (f.endsWith('.wav')) {
      const { L, R } = readWav(readFileSync(f));
      const m = ears(L, R);
      const v = checkAudio(m);
      show(basename(f), m, v);
      writeFileSync(f.replace(/\.wav$/, '.ears.json'), JSON.stringify({ ...m, verdict: v }, null, 1));
      failed += v.pass ? 0 : 1;
      continue;
    }
    // a score file is imported first; a song module is read as it is
    const { song, imported, name } = await loadSong(f);
    // the score before the sound: what the import and the arranger had to fix, and the critic's notes
    const list = (title, items) => printList(title, items);
    if (imported) printImport(f, imported);
    const arr = arrange(song);
    list('score errors (they stop it playing)', arr.errors);
    if (arr.errors.length) {
      console.log(`FAIL ${name}: the score has errors`);
      failed++;
      continue;
    }
    const notes = critic(song, arr).warnings;
    if (notes.length) list('critic notes (repairs first)', notes);
    else console.log('critic notes: none');
    // --once: a piece that plays once (a concert piece, a cutscene): rendered start to end, as tools/render.mjs does
    if (args.includes('--once')) {
      const res = pool ? await renderSongParallel(song, { run: pool.run }) : renderSong(song);
      const m = ears(res.L, res.R);
      const v = checkAudio(m, { lufs: song.master?.lufs ?? -16 });
      show(`${name}, once (rendered in ${(res.stats.renderMs / 1000).toFixed(1)} s)`, m, v);
      const sections = sectionLoudness(song, res.L, res.R);
      if (sectionLine(sections)) console.log(`     ${sectionLine(sections)}`);
      writeFileSync(`out/${name}.once.ears.json`, JSON.stringify({ ...m, sections, verdict: v }, null, 1));
      failed += v.pass ? 0 : 1;
      continue;
    }
    const want = opt('--cue') ?? 'all';
    const cues = want === 'all' ? Object.keys(cuesOf(song)) : [want];
    for (const cue of cues) {
      const c = pool ? await renderCueParallel(song, { cue, run: pool.run }) : renderCue(song, { cue });
      const a = cueAudio(c);
      const m = ears(a.L, a.R);
      const v = checkAudio(m, { lufs: song.master?.lufs ?? -16 });
      show(`${name} ${cue} (rendered in ${(c.stats.renderMs / 1000).toFixed(1)} s)`, m, v);
      // the sections of its first time through: the intro, then the body
      const def = cuesOf(song)[cue];
      const sections = sectionLoudness(song, a.L, a.R, [...def.intro, ...def.body]);
      if (sectionLine(sections)) console.log(`     ${sectionLine(sections)}`);
      writeFileSync(`out/${name}.${cue}.ears.json`, JSON.stringify({ ...m, sections, verdict: v }, null, 1));
      failed += v.pass ? 0 : 1;
    }
  }
  await pool?.close();
  process.exit(failed ? 1 : 0);
}
