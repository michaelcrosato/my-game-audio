// tools/library.mjs: a library of well-known public-domain music, fed to the engine as the sheet music it was
// written in. Nothing here is composed for the repository: the scores are public-domain editions and CC0
// transcriptions (library/README.md lists each one's source and licence), and the engine plays them as they are.
//
//   npm run library                               list the pieces and their numbers; rewrites library/README.md's table
//   npm run library -- check [ID...]              import and arrange each piece: its length, voices, warnings, notes
//   npm run library -- render [ID...] [--workers N] [--no-score] [--missing]
//       render each piece start to end to out/library/ID.once.wav (never committed), check it as `npm run ears` does,
//       score its first minute with Audiobox Aesthetics where that is installed, and keep the numbers in
//       library/library.json. --missing renders only the pieces not yet measured on this engine version.
//   npm run library -- score [ID...]              Audiobox scores for rendered pieces that have none, six at a time
//   npm run library -- page [--audio wav|m4a]     out/library/index.html: a page to listen to the rendered pieces
//       (m4a: encodes each WAV with ffmpeg first, into out/library/web/, for a page small enough to share)
import { readFileSync, writeFileSync, mkdirSync, existsSync, openSync, closeSync, rmSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { arrange, critic } from '../engine/score.mjs';
import { importScore } from '../engine/importers.mjs';
import { VERSION } from '../engine/version.mjs';
import { createPool } from './workers.mjs';
import { voicesOf } from './ears.mjs';
import { measureSong, audiobox } from './takes.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
/** The library (MGA_LIBRARY_DIR moves it, for tests) and where its audio goes (never committed). */
export const LIB_DIR = resolve(process.env.MGA_LIBRARY_DIR ?? join(ROOT, 'library'));
export const LIB_AUDIO = resolve(process.env.MGA_LIBRARY_AUDIO ?? join(ROOT, 'out', 'library'));
/** The licences a score here may carry (CLAUDE.md, rule 4). */
export const LICENCES = ['CC0-1.0', 'Public Domain'];
const MARK = ['<!-- library:index -->', '<!-- /library:index -->'];

export const readLibrary = (dir = LIB_DIR) => JSON.parse(readFileSync(join(dir, 'library.json'), 'utf8'));
const writeLibrary = (lib, dir = LIB_DIR) => writeFileSync(join(dir, 'library.json'), `${JSON.stringify(lib, null, 1)}\n`);
// change one piece's record under a lock file, so that render jobs running side by side do not undo each other
function updatePiece(id, change) {
  const lock = join(LIB_DIR, '.library.lock');
  for (let tries = 0; ; tries++) {
    try {
      closeSync(openSync(lock, 'wx'));
      break;
    } catch (e) {
      if (e.code !== 'EEXIST' || tries > 600) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
  try {
    const lib = readLibrary();
    change(lib.pieces.find((x) => x.id === id));
    writeLibrary(lib);
  } finally {
    rmSync(lock, { force: true });
  }
}
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const mmss = (s) => (s == null ? '-' : `${Math.floor(Math.round(s) / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`);
const fmt = (x) => (x == null ? '-' : x.toFixed(2));

/** A piece's song: imported from its score file, or a song module of songs/ ({ song, imported }). */
export async function loadPiece(p, dir = LIB_DIR) {
  if (p.song) return { song: (await import(pathToFileURL(join(ROOT, 'songs', `${p.song}.mjs`)).href)).default, imported: null };
  const imported = await importScore(readFileSync(join(dir, p.file)), { fileName: basename(p.file), ...p.import });
  // `adjust`: song fields set after the import, such as a narrower range of dynamics for a piano piece whose pp would
  // otherwise sit 20 LU under its ff (the score is left as it came)
  return { song: { ...imported.song, ...p.adjust }, imported };
}

/** The table of pieces that library/README.md keeps between its markers. */
export function indexTable(lib) {
  const rows = ['| # | Piece | Composer | Year | Played by | Length | Checks | Enjoyment / quality | Source |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- |'];
  lib.pieces.forEach((p, i) => {
    const m = p.measured;
    const checks = !m?.seconds ? (m?.errors ? 'ERRORS' : 'not yet') : m.pass ? 'PASS' : `FAIL (${m.problems.length})`;
    const box = m?.audiobox ? `${fmt(m.audiobox.CE)} / ${fmt(m.audiobox.PQ)}` : '-';
    rows.push(`| ${i + 1} | ${p.title} | ${p.composer} | ${p.year} | ${p.scoring} | ${mmss(m?.seconds)} | ${checks} | ${box} | [${p.source.corpus}](${p.source.url}) |`);
  });
  return rows.join('\n');
}

/** Rewrite the table in library/README.md; false when it was already current. */
export function writeIndex(lib = readLibrary(), dir = LIB_DIR) {
  const path = join(dir, 'README.md');
  const text = readFileSync(path, 'utf8');
  const a = text.indexOf(MARK[0]), b = text.indexOf(MARK[1]);
  if (a < 0 || b < a) throw new Error(`${path} has no ${MARK[0]} ... ${MARK[1]} markers`);
  const next = `${text.slice(0, a + MARK[0].length)}\n${indexTable(lib)}\n${text.slice(b)}`;
  if (next === text) return false;
  writeFileSync(path, next);
  return true;
}

function pick(lib, ids) {
  if (!ids.length) return lib.pieces;
  const out = ids.map((id) => lib.pieces.find((p) => p.id === id) ?? (() => { throw new Error(`no piece ${id} in the library`); })());
  return out;
}

/** Import and arrange each piece; print its length, voices, the import's warnings and the critic's notes. */
async function check(ids) {
  const lib = readLibrary();
  let bad = 0;
  for (const p of pick(lib, ids)) {
    try {
      const { song, imported } = await loadPiece(p);
      const arr = arrange(song);
      const notes = arr.errors.length ? [] : critic(song, arr).warnings;
      const warns = imported?.report.warnings ?? [];
      const voices = imported ? voicesOf(imported) : Object.keys(song.instruments ?? {});
      if (arr.errors.length) bad++;
      console.log(`${p.id.padEnd(36)} ${mmss(arr.duration).padStart(6)}  ${String(voices.length).padStart(2)} voices  ${String(warns.length).padStart(3)} warnings  ${String(notes.length).padStart(3)} notes${arr.errors.length ? `  ${arr.errors.length} ERRORS: ${arr.errors[0]}` : ''}`);
      if (ids.length) {
        for (const v of voices) console.log(`     ${v}`);
        for (const w of warns.slice(0, 12)) console.log(`     warning: ${w}`);
        for (const n of notes.slice(0, 12)) console.log(`     note: ${n}`);
      }
    } catch (e) {
      bad++;
      console.log(`${p.id.padEnd(36)} FAILED TO IMPORT: ${e.message}`);
    }
  }
  return bad;
}

/** Render, check and score each piece; keep its numbers in library.json as each one finishes. */
async function render(ids, { workers = availableParallelism(), score = true, missing = false } = {}) {
  mkdirSync(LIB_AUDIO, { recursive: true });
  const pool = workers > 1 ? createPool(workers) : null;
  try {
    for (const id of pick(readLibrary(), ids).map((p) => p.id)) {
      const p = readLibrary().pieces.find((x) => x.id === id);
      if (missing && p.measured?.engine === VERSION && (p.measured.audiobox || !score)) continue;
      console.log(`\n== ${p.id}: ${p.composer}, ${p.title}`);
      const { song, imported } = await loadPiece(p);
      const r = await measureSong(song, { imported, mode: 'once', audioBase: join(LIB_AUDIO, p.id), pool, score });
      let measured;
      if (r.errors) {
        measured = { engine: VERSION, errors: r.errors };
      } else {
        const m = r.measurement, c = m.cues.once;
        measured = {
          engine: m.engine, date: m.date, seconds: c.seconds, lufs: c.lufs, truePeak: c.truePeak, clicks: c.clicks,
          key: c.key, pass: c.pass, problems: c.problems, warnings: c.warnings, importWarnings: m.importWarnings.length,
          criticNotes: m.criticNotes.length, audiobox: c.audiobox ?? null, voices: r.voices,
        };
        if (r.boxError) console.log(`  Audiobox: not scored (${r.boxError})`);
      }
      updatePiece(id, (x) => (x.measured = measured));
    }
  } finally {
    await pool?.close();
  }
  writeIndex();
}

/** Score the rendered pieces that have no Audiobox score on this engine version, a few at a time. */
function scoreAll(ids) {
  const todo = pick(readLibrary(), ids).filter((p) => p.measured?.engine === VERSION && !p.measured.audiobox && existsSync(join(LIB_AUDIO, `${p.id}.once.wav`)));
  if (!todo.length) return console.log('nothing to score: every rendered piece has its Audiobox scores');
  console.log(`scoring ${todo.length} pieces with Audiobox (the first minute of each)`);
  // a few at a time: the model takes its whole batch at once, and 77 minutes of audio asked for 30 GB
  for (let i = 0; i < todo.length; i += 6) {
    const batch = todo.slice(i, i + 6);
    const r = audiobox(batch.map((p) => join(LIB_AUDIO, `${p.id}.once.wav`)));
    if (!r.scores) throw new Error(`Audiobox could not score ${batch.map((p) => p.id).join(', ')}: ${r.error}`);
    batch.forEach((p, k) => updatePiece(p.id, (x) => (x.measured.audiobox = r.scores[k])));
    console.log(`  ${Math.min(i + 6, todo.length)} of ${todo.length}: ${batch.map((p, k) => `${p.id} ${r.scores[k].CE}`).join(', ')}`);
  }
  writeIndex();
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** The listening page: every piece, its numbers and its source, playing `<id>.<ext>` from beside the page. */
export function pageHtml(lib, { ext = 'wav', standalone = true } = {}) {
  const data = lib.pieces.filter((p) => p.measured?.seconds).map((p) => ({
    id: p.id, title: p.title, composer: p.composer, year: p.year, scoring: p.scoring, group: p.group, seconds: p.measured.seconds,
    pass: p.measured.pass, ce: p.measured.audiobox?.CE ?? null, pq: p.measured.audiobox?.PQ ?? null,
    source: p.source.corpus, url: p.source.url, src: `${p.id}.${ext}`,
  }));
  const body = readFileSync(join(ROOT, 'tools', 'library-page.html'), 'utf8')
    .replace('/*LIBRARY_DATA*/[]', () => JSON.stringify(data).replace(/</g, '\\u003c'))
    .replace('<!--ENGINE-->', esc(VERSION));
  // a page opened from disk needs its own doctype; a host that wraps the page in one takes the body as it is
  return standalone ? `<!doctype html>\n<html lang="en"><meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${body}</html>\n` : body;
}

function page({ audio = 'wav' } = {}) {
  const lib = readLibrary();
  let dir = LIB_AUDIO;
  if (audio === 'm4a') {
    dir = join(LIB_AUDIO, 'web');
    mkdirSync(dir, { recursive: true });
    for (const p of lib.pieces.filter((x) => x.measured?.seconds)) {
      const src = join(LIB_AUDIO, `${p.id}.once.wav`), dst = join(dir, `${p.id}.m4a`);
      if (!existsSync(src)) throw new Error(`${src} is missing: npm run library -- render ${p.id}`);
      if (existsSync(dst) && statSync(dst).mtimeMs >= statSync(src).mtimeMs) continue; // encoded since its last render
      const r = spawnSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', src, '-c:a', 'aac', '-b:a', '56k', '-movflags', '+faststart', dst], { encoding: 'utf8' });
      if (r.error || r.status !== 0) throw new Error(`ffmpeg could not encode ${src}: ${r.error?.message ?? r.stderr}`);
    }
  }
  const out = join(dir, 'index.html');
  writeFileSync(out, pageHtml(lib, { ext: audio === 'm4a' ? 'm4a' : 'once.wav' }));
  console.log(`${out}: ${lib.pieces.filter((x) => x.measured?.seconds).length} pieces`);
}

function list() {
  const lib = readLibrary();
  console.log(`${lib.pieces.length} pieces in library/ (engine ${VERSION})`);
  console.log('  #   piece                                 length  checks  enjoyment  quality  source');
  lib.pieces.forEach((p, i) => {
    const m = p.measured;
    const checks = !m ? 'not yet' : m.errors ? 'ERRORS' : m.pass ? 'PASS' : 'FAIL';
    console.log(`  ${String(i + 1).padStart(3)} ${p.id.padEnd(37)} ${mmss(m?.seconds).padStart(6)}  ${checks.padEnd(7)} ${fmt(m?.audiobox?.CE).padStart(9)}  ${fmt(m?.audiobox?.PQ).padStart(7)}  ${p.source.corpus}${m && m.engine !== VERSION ? ` (measured on ${m.engine})` : ''}`);
  });
  if (writeIndex(lib)) console.log('library/README.md: the table is rewritten');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
  const WITH_VALUE = ['--workers', '--audio'];
  const pos = args.filter((a, i) => !a.startsWith('--') && !WITH_VALUE.includes(args[i - 1]));
  const cmd = pos[0] ?? 'list';
  try {
    if (cmd === 'list') list();
    else if (cmd === 'check') process.exitCode = (await check(pos.slice(1))) ? 1 : 0;
    else if (cmd === 'render') await render(pos.slice(1), { workers: Number(opt('--workers') ?? availableParallelism()), score: !args.includes('--no-score'), missing: args.includes('--missing') });
    else if (cmd === 'score') scoreAll(pos.slice(1));
    else if (cmd === 'page') page({ audio: opt('--audio') ?? 'wav' });
    else throw new Error(`unknown command ${cmd}: list, check, render, score or page`);
  } catch (e) {
    console.error(String(e.message ?? e));
    process.exit(1);
  }
}
