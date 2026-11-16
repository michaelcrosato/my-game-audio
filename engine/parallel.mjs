// parallel.mjs: rendering a song's parts in parallel workers. Parts are independent until they are mixed, so each
// worker renders whole parts (partJob) and the caller adds them to the mix in the song's part order, which keeps
// every sum, and so every sample, the same as a render on one thread. Any pool works: `run(job)` returns a Promise
// of partJob(job) computed somewhere (a Web Worker, a Node worker thread, or this thread for tests).
import { SR, hash } from './dsp.mjs';
import { arrange, critic } from './score.mjs';
import { renderPart, createMix, mixOrder, master } from './render.mjs';
import { lufs } from './fx.mjs';

const now = () => (globalThis.performance ? performance.now() : Date.now());

// a worker keeps its last few arrangements: every part of a window shares one
const arrangements = new Map();
function arrangementOf(song, key) {
  if (arrangements.has(key)) return arrangements.get(key);
  const arr = arrange(song);
  arrangements.set(key, arr);
  if (arrangements.size > 4) arrangements.delete(arrangements.keys().next().value);
  return arr;
}

/**
 * The worker's side: one part of a song rendered, as renderPart returns it ([{ L, R, pan }] or null). The job is
 * { song (frozen: no functions), key (names the song and form, for the arrangement cache), pname, N, offset, range }.
 */
export function partJob({ song, key, pname, N, offset = 0, range = null }) {
  const arr = arrangementOf(song, key ?? JSON.stringify(song).length + ':' + hash(JSON.stringify(song)));
  return renderPart(song, arr, pname, N, { offset, range });
}
/** The buffers a part job's result can transfer to the thread that asked for it. */
export const partTransfer = (tracks) => (tracks ?? []).flatMap((t) => (t.R ? [t.L.buffer, t.R.buffer] : [t.L.buffer]));

/**
 * mixParts with the parts rendered by `run`: at most `ahead` parts in flight or waiting their turn (memory stays
 * bounded), each added in order as soon as it and those before it are back. Returns { L, R, partMs }.
 */
export async function mixPartsParallel(song, arr, N, { only = null, offset = 0, range = null, stems = null, run, ahead = 8 } = {}) {
  const names = mixOrder(song, only).filter((p) => (range ? arr.parts[p].events.some((e) => e.t >= range[0] && e.t < range[1]) : arr.parts[p].events.length));
  const text = JSON.stringify(song);
  const key = `${text.length}:${hash(text)}`;
  const mix = createMix(song, N, { only, stems });
  const partMs = {};
  const jobs = new Array(names.length);
  const start = (k) => {
    const t = now();
    jobs[k] = Promise.resolve(run({ song, key, pname: names[k], N, offset, range })).then((tr) => ((partMs[names[k]] = Math.round(now() - t)), tr));
  };
  let next = 0;
  for (; next < Math.min(ahead, names.length); next++) start(next);
  for (let k = 0; k < names.length; k++) {
    const tracks = await jobs[k];
    jobs[k] = null;
    mix.add(names[k], tracks);
    if (next < names.length) start(next++);
  }
  const tb = now();
  mix.finish();
  partMs.buses = Math.round(now() - tb);
  return { L: mix.L, R: mix.R, partMs };
}

/** renderSong with its parts rendered in parallel by `run`: the same samples, stats and review. */
export async function renderSongParallel(song, { run, ahead, stems = false } = {}) {
  const t0 = now();
  const arr = arrange(song);
  if (arr.errors.length) throw new Error('score errors:\n  ' + arr.errors.join('\n  '));
  const review = critic(song, arr);
  const N = Math.ceil((arr.duration + (song.tail ?? 3)) * SR);
  const stemBufs = stems ? {} : null;
  const frozen = JSON.parse(JSON.stringify(song)); // workers get data, not functions
  for (const [name, sec] of Object.entries(song.sections)) {
    for (const [p, raw] of Object.entries(sec.parts ?? {})) if (typeof raw === 'function') frozen.sections[name].parts[p] = raw(song);
  }
  const { L: mL, R: mR, partMs } = await mixPartsParallel(frozen, arr, N, { stems: stemBufs, run, ahead });
  const normDb = master(mL, mR, song);
  let peak = 0;
  for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(mL[i]), Math.abs(mR[i]));
  const stats = {
    seconds: +(N / SR).toFixed(2), lufs: +lufs(mL, mR).toFixed(2), peakDb: +(20 * Math.log10(peak)).toFixed(2),
    renderMs: Math.round(now() - t0), partMs, normDb: +normDb.toFixed(3),
  };
  return { L: mL, R: mR, sr: SR, stats, review, arr, stems: stemBufs ?? {} };
}
