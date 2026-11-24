// tools/takes.mjs: every version of a piece is kept, and there is a limit on how many versions there are.
//
//   npm run take -- piece.abc [--as NAME] [--note "what changed"] [--once] [--workers N] [--no-score]
//       Save the score as the piece's next take: check it as `npm run ears` does (the import's warnings, the critic's
//       notes, PASS or FAIL), score it with Audiobox Aesthetics where that is installed (the first minute of each
//       cue), and keep it: the score in takes/NAME/N.abc, its numbers in takes/NAME/takes.json, its audio in
//       out/takes/NAME/ (never committed). Then it says whether to revise again or stop, and which take is best.
//   npm run takes                                    list the pieces; rewrites the table in takes/README.md
//   npm run takes -- listen NAME [--blind]           render every take of NAME to out/takes/NAME/listen/
//   npm run takes -- heard NAME BETTER WORSE [--by WHO]   record that take BETTER sounded better than WORSE
//   npm run takes -- rescore NAME|--all              measure the takes again on this engine version
//
// The limit: five takes a piece, a first draft and four revisions, and sooner when two revisions in a row add less
// than 0.1 to the best enjoyment so far. The scores stand in for ears; past that, chasing them fits the scorer, not
// the music. The best take is kept as the answer, not the last one.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { basename, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { ears, checkAudio } from '../engine/ears.mjs';
import { renderCue, renderCueParallel, cuesOf } from '../engine/loop.mjs';
import { renderSong, wav } from '../engine/render.mjs';
import { renderSongParallel } from '../engine/parallel.mjs';
import { arrange, critic } from '../engine/score.mjs';
import { importScore } from '../engine/importers.mjs';
import { VERSION } from '../engine/version.mjs';
import { createPool } from './workers.mjs';
import { cueAudio, printImport, printList, sectionLoudness, sectionLine, voicesOf } from './ears.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
/** Where the takes are kept (MGA_TAKES_DIR moves it, for tests) and where their audio goes (never committed). */
export const TAKES_DIR = resolve(process.env.MGA_TAKES_DIR ?? join(ROOT, 'takes'));
export const AUDIO_DIR = resolve(process.env.MGA_TAKES_AUDIO ?? join(ROOT, 'out', 'takes'));
/** Takes a piece may have: a first draft and four revisions. */
export const CAP = 5;
/** What a revision must add to the best enjoyment (Audiobox CE) so far to count as a gain. */
export const MIN_GAIN = 0.1;
/** Revisions in a row without a gain before the piece stops. */
export const PATIENCE = 2;
/** How much of each cue Audiobox scores, as the repository's numbers do: the first minute. */
export const SCORE_SECONDS = 60;
export const LICENCE = 'CC0-1.0: an original score, written for this repository';
const SCORE = /\.(abc|krn|mid|midi|mxl|musicxml|xml)$/i;

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'piece';
const today = () => new Date().toISOString().slice(0, 10);
const fmt = (x) => (x == null ? '  -  ' : x.toFixed(2));

/** A take's measurement on an engine version (default: this one), or else its latest. */
export function measurement(take, engine = VERSION) {
  return take.measured.find((m) => m.engine === engine) ?? take.measured[take.measured.length - 1];
}
/** What the checks found in a measurement: import warnings, critic notes and failed cues. */
export function mistakes(m) {
  return m.importWarnings.length + m.criticNotes.length + Object.values(m.cues).filter((c) => !c.pass).length;
}
export const isClean = (m) => mistakes(m) === 0;
const enjoyment = (m) => m.audiobox?.CE ?? null;

/**
 * Whether take t gains on the standing best take b. While no take is clean, a take with fewer mistakes does; then the
 * first clean take; between clean takes, one with MIN_GAIN or more enjoyment. Null when it cannot be told (no scores):
 * a later clean take is then taken on the composer's word.
 */
function gainsOn(t, b) {
  const m = measurement(t), bm = measurement(b);
  if (!isClean(m)) return !isClean(bm) && mistakes(m) < mistakes(bm);
  if (!isClean(bm)) return true;
  const x = enjoyment(m), y = enjoyment(bm);
  if (x == null || y == null) return null;
  return x - y >= MIN_GAIN - 1e-9;
}
/**
 * The best of some takes: the first, replaced by each later take that gains on it. A revision has to earn its place by
 * the same margin the limit counts, so a take 0.05 above the best is not the new best (two trial agents asked why).
 */
export function bestTake(takes) {
  let best = null;
  for (const t of takes) if (!best || gainsOn(t, best) !== false) best = t;
  return best;
}
/** Whether take i gained on the best of the takes before it (null when it cannot be told: no scores). */
export function gain(takes, i) {
  return gainsOn(takes[i], bestTake(takes.slice(0, i)));
}
/**
 * What to do after the latest take: { stop, best, why }. Stop at the limit, or when PATIENCE revisions in a row
 * brought no gain (once some take is clean); otherwise revise, fixing what the checks found first.
 */
export function verdict(takes, cap = CAP) {
  const n = takes.length, best = bestTake(takes), last = measurement(takes[n - 1]);
  if (n >= cap) return { stop: true, best, why: `the limit of ${cap} takes is reached` };
  if (isClean(measurement(best))) {
    let run = 0;
    for (let i = 1; i < n; i++) {
      const g = gain(takes, i);
      run = g === false ? run + 1 : g === true ? 0 : run;
    }
    if (run >= PATIENCE) return { stop: true, best, why: `${PATIENCE} revisions in a row added less than ${MIN_GAIN} to the best enjoyment` };
  }
  if (!isClean(last)) return { stop: false, best, why: `fix what the checks found, then save the next take (${cap - n} left)` };
  return { stop: false, best, why: `${cap - n} more take${cap - n === 1 ? '' : 's'} allowed; a revision counts when it adds ${MIN_GAIN} or more to the best enjoyment (${fmt(enjoyment(measurement(best)))})` };
}

/** The pieces kept in TAKES_DIR: their takes.json, read. */
export function readBooks(dir = TAKES_DIR) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(dir, d.name, 'takes.json')))
    .map((d) => JSON.parse(readFileSync(join(dir, d.name, 'takes.json'), 'utf8')))
    .sort((a, b) => a.piece.localeCompare(b.piece));
}
function readBook(name) {
  const p = join(TAKES_DIR, name, 'takes.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
}
function writeBook(book) {
  mkdirSync(join(TAKES_DIR, book.piece), { recursive: true });
  writeFileSync(join(TAKES_DIR, book.piece, 'takes.json'), JSON.stringify(book, null, 1) + '\n');
}

/** Whether the scores agree with what was heard: { agree, disagree, tie, unscored }. */
export function agreement(book) {
  const r = { agree: 0, disagree: 0, tie: 0, unscored: 0 };
  const byNum = new Map(book.takes.map((t) => [t.take, t]));
  for (const h of book.heard ?? []) {
    const a = enjoyment(measurement(byNum.get(h.better), h.engine)), b = enjoyment(measurement(byNum.get(h.worse), h.engine));
    if (a == null || b == null) r.unscored++;
    else if (Math.abs(a - b) < 1e-9) r.tie++;
    else r[a > b ? 'agree' : 'disagree']++;
  }
  return r;
}

/** The table of pieces in takes/README.md: the lowest first takes first, so the range is easy to listen across. */
export function indexTable(books) {
  const rows = books.map((b) => {
    const first = b.takes[0], best = bestTake(b.takes);
    const fm = measurement(first), bm = measurement(best);
    const ce = (m) => enjoyment(m), pq = (m) => m.audiobox?.PQ ?? null;
    const insts = [...new Set((best.voices ?? []).map((v) => v.split(' -> ')[1]))];
    const heard = agreement(b), n = (b.heard ?? []).length;
    const d = ce(bm) != null && ce(fm) != null && best !== first ? ` (${ce(bm) - ce(fm) >= 0 ? '+' : ''}${(ce(bm) - ce(fm)).toFixed(2)})` : '';
    return {
      key: ce(fm) ?? Infinity,
      cells: [
        `[${b.piece}](${b.piece}/takes.json)`,
        insts.length > 5 ? `${insts.slice(0, 5).join(', ')} and ${insts.length - 5} more` : insts.join(', '),
        String(b.takes.length),
        `${first.take}: ${fmt(ce(fm))} / ${fmt(pq(fm))}`,
        `${best.take}: ${fmt(ce(bm))} / ${fmt(pq(bm))}${d}`,
        n ? `${heard.agree} of ${n} agree` : 'not yet',
      ],
    };
  }).sort((a, b) => a.key - b.key);
  const head = ['Piece', 'Instruments', 'Takes', 'First take: enjoyment / quality', 'Best take', 'Heard'];
  return [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.cells.join(' | ')} |`)].join('\n');
}
const MARK = ['<!-- takes:index -->', '<!-- /takes:index -->'];
/** Rewrite the table between the markers in takes/README.md (when that file exists). */
export function writeIndex(dir = TAKES_DIR) {
  const p = join(dir, 'README.md');
  if (!existsSync(p)) return false;
  const text = readFileSync(p, 'utf8');
  const a = text.indexOf(MARK[0]), b = text.indexOf(MARK[1]);
  if (a < 0 || b < a) return false;
  const books = readBooks(dir);
  const body = books.length ? indexTable(books) : 'No pieces yet.';
  writeFileSync(p, `${text.slice(0, a + MARK[0].length)}\n${body}\n${text.slice(b)}`);
  return true;
}

/**
 * Score WAV files with Audiobox Aesthetics (tools/aesthetics.py), first minute each: { scores, endings } or { error }.
 * `ending`: also each file's last minute where it is longer than one (endings[i], else null).
 */
export function audiobox(paths, { ending = false } = {}) {
  const py = process.env.MGA_AUDIOBOX_PYTHON ?? 'python3';
  const tmp = join(AUDIO_DIR, `.aesthetics-${process.pid}.json`);
  mkdirSync(AUDIO_DIR, { recursive: true });
  const args = ['-I', join(ROOT, 'tools', 'aesthetics.py'), '--seconds', String(SCORE_SECONDS), ...(ending ? ['--ending'] : []), '--json', tmp];
  const r = spawnSync(py, [...args, ...paths], { encoding: 'utf8' });
  if (r.error || r.status !== 0) {
    const why = r.error ? r.error.message : (r.stderr.trim().split('\n').pop() ?? `exit ${r.status}`);
    return { error: why };
  }
  const j = JSON.parse(readFileSync(tmp, 'utf8'));
  rmSync(tmp, { force: true });
  return { scores: paths.map((p) => j[p]), endings: paths.map((p) => j[`${p}#end`] ?? null) };
}
const mean = (xs) => {
  const out = {};
  for (const k of ['CE', 'CU', 'PC', 'PQ']) out[k] = +(xs.reduce((s, x) => s + x[k], 0) / xs.length).toFixed(2);
  return out;
};

/**
 * Check, render and score a score file as a take: { errors } when it cannot play, else { title, voices,
 * measurement, wavs }. `mode` 'cues' renders each cue as a game hears it (the head, then the loop twice, as `npm run
 * ears` does); 'once' renders the piece start to end. Audio goes to `${audioBase}.<cue>.wav`.
 */
export async function measureTake(bytes, fileName, opt = {}) {
  const imported = await importScore(bytes, { fileName });
  printImport(fileName, imported, opt.log ?? console.log);
  return measureSong(imported.song, { ...opt, imported });
}

/**
 * The measuring half of measureTake, for a song from a score's import (`imported`) or from a song module: the
 * critic's notes, each cue (or the whole piece, 'once') rendered and checked, the Audiobox scores.
 */
export async function measureSong(song, { imported = null, mode = 'cues', audioBase, pool = null, score = true, log = console.log } = {}) {
  const arr = arrange(song);
  if (arr.errors.length) {
    printList('score errors (they stop it playing)', arr.errors, log);
    return { errors: arr.errors };
  }
  const notes = critic(song, arr).warnings;
  if (notes.length) printList('critic notes (repairs first)', notes, log);
  else log('critic notes: none');
  const cues = {}, wavs = [];
  const take = (cue, L, R, renderMs, form) => {
    const m = ears(L, R);
    const sections = sectionLoudness(song, L, R, form);
    const v = checkAudio(m, { lufs: song.master?.lufs ?? -16 });
    const path = `${audioBase}.${cue}.wav`;
    writeFileSync(path, wav(L, R));
    wavs.push(path);
    cues[cue] = {
      pass: v.pass, seconds: m.seconds, lufs: m.integrated_lufs, truePeak: m.true_peak_dbtp, clicks: m.clicks,
      key: m.key_est, tempo: m.tempo_bpm_est, balance: m.balance_pct, sections, problems: v.problems, warnings: v.warnings,
    };
    log(`${v.pass ? 'PASS' : 'FAIL'} ${cue} (rendered in ${(renderMs / 1000).toFixed(1)} s): ${m.seconds} s, ${m.integrated_lufs} LUFS, true peak ${m.true_peak_dbtp} dBTP, ${m.clicks} clicks; key ~ ${m.key_est}, tempo ~ ${m.tempo_bpm_est}`);
    for (const p of v.problems) log(`     problem: ${p}`);
    for (const w of v.warnings) log(`     warning: ${w}`);
    if (sectionLine(sections)) log(`     ${sectionLine(sections)}`);
  };
  if (mode === 'once') {
    const res = pool ? await renderSongParallel(song, { run: pool.run }) : renderSong(song);
    take('once', res.L, res.R, res.stats.renderMs, song.form);
  } else {
    for (const cue of Object.keys(cuesOf(song))) {
      const c = pool ? await renderCueParallel(song, { cue, run: pool.run }) : renderCue(song, { cue });
      const a = cueAudio(c), def = cuesOf(song)[cue];
      take(cue, a.L, a.R, c.stats.renderMs, [...def.intro, ...def.body]);
    }
  }
  let box = null, boxError = null;
  if (score) {
    // a piece played once is scored on its last minute too: a longer piece's ending (a hymn's Amen) is not in its first
    const r = audiobox(wavs, { ending: mode === 'once' });
    if (r.scores) {
      Object.keys(cues).forEach((cue, i) => {
        cues[cue].audiobox = r.scores[i];
        if (r.endings[i]) cues[cue].ending = r.endings[i];
        log(`Audiobox ${cue}: enjoyment ${r.scores[i].CE}, quality ${r.scores[i].PQ} (first minute)${r.endings[i] ? `; last minute ${r.endings[i].CE}, ${r.endings[i].PQ}` : ''}`);
      });
      box = mean(r.scores);
    } else boxError = r.error;
  }
  const measured = { engine: VERSION, date: today(), mode, importWarnings: imported?.report.warnings ?? [], criticNotes: notes, cues, audiobox: box };
  const voices = imported ? voicesOf(imported) : Object.keys(song.instruments ?? {});
  return { title: song.title, voices, measurement: measured, wavs, boxError };
}

function printBook(book, log = console.log) {
  log(`\n${book.piece}${book.title ? ` (${book.title})` : ''}: ${book.takes.length} of ${book.cap} takes, measured ${book.takes[0].measured[0].mode === 'once' ? 'once, start to end' : 'as a game hears each cue'}`);
  log('  take  enjoyment  quality  checks              what changed');
  for (const t of book.takes) {
    const m = measurement(t);
    const k = mistakes(m);
    const checks = k ? `${k} to fix` : 'clean';
    log(`  ${String(t.take).padEnd(4)}  ${fmt(m.audiobox?.CE).padStart(9)}  ${fmt(m.audiobox?.PQ).padStart(7)}  ${checks.padEnd(18)}  ${t.note ?? ''}`);
  }
}
function printVerdict(book, log = console.log) {
  const v = verdict(book.takes, book.cap);
  const bm = measurement(v.best);
  const end = bm.cues?.once?.ending;
  log(`best: take ${v.best.take} (${v.best.file}): enjoyment ${fmt(bm.audiobox?.CE)}, quality ${fmt(bm.audiobox?.PQ)}${end ? ` (its last minute ${fmt(end.CE)}, ${fmt(end.PQ)})` : ''}${isClean(bm) ? '' : `, ${mistakes(bm)} still to fix`}`);
  log(v.stop ? `STOP: ${v.why}. Keep take ${v.best.take}.` : `next: ${v.why}.`);
  return v;
}

async function save(file, opt) {
  if (!SCORE.test(file)) throw new Error('a take is a score file: .abc, .krn, .mid, .mxl, .musicxml or .xml');
  const name = slug(opt.as ?? basename(file).replace(/\.[^.]+$/, ''));
  const book = readBook(name) ?? { piece: name, title: null, cap: CAP, licence: LICENCE, takes: [], heard: [] };
  // the limit holds: a piece that has stopped (its cap, or no gain in PATIENCE revisions) takes no more
  if (book.takes.length && verdict(book.takes, book.cap).stop) {
    printBook(book);
    const v = printVerdict(book);
    throw new Error(`not saved: ${name} has stopped (${v.why}); its answer is take ${v.best.take}`);
  }
  const mode = book.takes.length ? book.takes[0].measured[0].mode : opt.once ? 'once' : 'cues';
  if (book.takes.length && opt.once && mode !== 'once') console.log(`note: ${name}'s takes are measured as cues (set by its first take); --once is ignored`);
  const n = book.takes.length + 1;
  mkdirSync(join(AUDIO_DIR, name), { recursive: true });
  const bytes = readFileSync(file);
  const pool = opt.workers > 1 ? createPool(opt.workers) : null;
  let r;
  try {
    r = await measureTake(bytes, basename(file), { mode, audioBase: join(AUDIO_DIR, name, String(n)), pool, score: opt.score });
  } finally {
    await pool?.close();
  }
  if (r.errors) throw new Error('not saved: the score has errors that stop it playing; fix them and save again (this used no take)');
  if (r.boxError) console.log(`Audiobox did not score it (${r.boxError}); the take is kept with the checks' numbers. See tools/aesthetics.py to install it.`);
  const ext = extname(file).toLowerCase();
  mkdirSync(join(TAKES_DIR, name), { recursive: true });
  writeFileSync(join(TAKES_DIR, name, `${n}${ext}`), bytes);
  book.title ??= r.title;
  book.takes.push({ take: n, file: `${n}${ext}`, date: today(), note: opt.note ?? (n === 1 ? 'first draft' : ''), voices: r.voices, measured: [r.measurement] });
  writeBook(book);
  writeIndex();
  printBook(book);
  printVerdict(book);
  console.log(`kept: ${relative(process.cwd(), join(TAKES_DIR, name, `${n}${ext}`))}; audio: ${r.wavs.map((w) => relative(process.cwd(), w)).join(', ')}`);
}

async function listen(name, { blind = false, workers = 1 } = {}) {
  const book = readBook(name);
  if (!book) throw new Error(`no takes for ${name} in ${TAKES_DIR}`);
  const dir = join(AUDIO_DIR, name, 'listen');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const ids = book.takes.map((t) => String(t.take));
  const order = blind ? [...book.takes].sort(() => Math.random() - 0.5) : book.takes;
  const letters = 'ABCDEFGHIJ';
  const key = {};
  const pool = workers > 1 ? createPool(workers) : null;
  try {
    for (let i = 0; i < order.length; i++) {
      const t = order[i], id = blind ? letters[i] : String(t.take);
      key[id] = t.take;
      const mode = t.measured[0].mode;
      const quiet = () => {};
      const r = await measureTake(readFileSync(join(TAKES_DIR, name, t.file)), t.file, { mode, audioBase: join(dir, id), pool, score: false, log: quiet });
      console.log(`${id}: ${r.wavs.map((w) => relative(process.cwd(), w)).join(', ')}`);
    }
  } finally {
    await pool?.close();
  }
  writeFileSync(join(dir, 'key.json'), JSON.stringify({ blind, key, engine: VERSION }, null, 1));
  // a blind key is also kept with the takes (committed, so a verdict given days later still finds its takes), in
  // base64 so that a glance at the folder does not unblind the listener
  if (blind) writeFileSync(join(TAKES_DIR, name, 'blind-key.txt'), Buffer.from(JSON.stringify({ blind, key, engine: VERSION, date: today() })).toString('base64') + '\n');
  if (blind) console.log(`\nListen without looking at the scores, then: npm run takes -- heard ${name} BETTER WORSE (letters, e.g. B A)`);
  else console.log(`\nThen: npm run takes -- heard ${name} BETTER WORSE (take numbers, e.g. ${ids[ids.length - 1]} ${ids[0]})`);
  if (book.takes.some((t) => !t.measured.some((m) => m.engine === VERSION))) console.log(`Some takes were scored on an older engine than ${VERSION}: npm run takes -- rescore ${name}`);
}

function heard(name, better, worse, { by = 'owner' } = {}) {
  const book = readBook(name);
  if (!book) throw new Error(`no takes for ${name}`);
  let blind = false, engine = VERSION;
  const keyPath = join(AUDIO_DIR, name, 'listen', 'key.json');
  const resolveId = (id) => {
    if (/^[A-J]$/i.test(id)) {
      const kept = join(TAKES_DIR, name, 'blind-key.txt');
      if (!existsSync(keyPath) && !existsSync(kept)) throw new Error(`no blind listening key for ${name}: npm run takes -- listen ${name} --blind`);
      const k = existsSync(keyPath) ? JSON.parse(readFileSync(keyPath, 'utf8')) : JSON.parse(Buffer.from(readFileSync(kept, 'utf8').trim(), 'base64').toString('utf8'));
      blind = k.blind;
      engine = k.engine;
      return k.key[id.toUpperCase()];
    }
    return Number(id);
  };
  const b = resolveId(better), w = resolveId(worse);
  for (const x of [b, w]) if (!book.takes.some((t) => t.take === x)) throw new Error(`${name} has no take ${x}`);
  book.heard ??= [];
  book.heard.push({ better: b, worse: w, by, date: today(), blind, engine });
  writeBook(book);
  writeIndex();
  const byNum = new Map(book.takes.map((t) => [t.take, t]));
  const ce = (n) => enjoyment(measurement(byNum.get(n), engine));
  const say = ce(b) == null || ce(w) == null ? 'not scored' : Math.abs(ce(b) - ce(w)) < 1e-9 ? 'the scores tie' : ce(b) > ce(w) ? 'the scores agree' : 'the scores disagree';
  console.log(`recorded: take ${b} sounded better than take ${w}${blind ? ' (blind)' : ''}. Enjoyment ${fmt(ce(b))} against ${fmt(ce(w))}: ${say}.`);
}

async function rescore(names, { workers = 1 } = {}) {
  const pool = workers > 1 ? createPool(workers) : null;
  try {
    for (const name of names) {
      const book = readBook(name);
      for (const t of book.takes) {
        // what each voice became, as this engine reads the score
        t.voices = voicesOf(await importScore(readFileSync(join(TAKES_DIR, name, t.file)), { fileName: t.file }));
        if (t.measured.some((m) => m.engine === VERSION)) continue;
        console.log(`\n${name}, take ${t.take} on ${VERSION}:`);
        const r = await measureTake(readFileSync(join(TAKES_DIR, name, t.file)), t.file, { mode: t.measured[0].mode, audioBase: join(AUDIO_DIR, name, `${t.take}`), pool });
        if (r.errors) continue;
        t.measured.push(r.measurement);
      }
      writeBook(book);
      printBook(book);
    }
  } finally {
    await pool?.close();
  }
  writeIndex();
}

function list() {
  const books = readBooks();
  if (!books.length) console.log(`no takes yet in ${TAKES_DIR}`);
  for (const b of books) {
    printBook(b);
    printVerdict(b);
  }
  if (writeIndex()) console.log('\ntakes/README.md: the table is current');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
  const WITH_VALUE = ['--as', '--note', '--workers', '--by'];
  const pos = args.filter((a, i) => !a.startsWith('--') && !WITH_VALUE.includes(args[i - 1]));
  const cmd = pos[0] ?? 'list';
  const workers = Number(opt('--workers') ?? availableParallelism());
  try {
    if (cmd === 'save') {
      if (!pos[1]) throw new Error('usage: npm run take -- piece.abc [--as NAME] [--note "what changed"] [--once] [--workers N] [--no-score]');
      await save(pos[1], { as: opt('--as'), note: opt('--note'), once: args.includes('--once'), workers, score: !args.includes('--no-score') });
    } else if (cmd === 'list') list();
    else if (cmd === 'listen') await listen(pos[1], { blind: args.includes('--blind'), workers });
    else if (cmd === 'heard') heard(pos[1], pos[2], pos[3], { by: opt('--by') ?? 'owner' });
    else if (cmd === 'rescore') await rescore(args.includes('--all') ? readBooks().map((b) => b.piece) : [pos[1]], { workers });
    else throw new Error(`unknown command ${cmd}: save, list, listen, heard or rescore`);
  } catch (e) {
    console.error(String(e.message ?? e));
    process.exit(1);
  }
}
