// worker.mjs: renders for the player off the main thread. In development it runs as a module worker
// (worker-entry.mjs); the bundled file in dist/ runs its own code as the worker and calls startWorker().
// Messages in: { id, type: 'cue' | 'stream' | 'once' | 'sfx' | 'speak' | 'import', song (frozen), cue, form, normDb,
// spec, seed, text, character, bytes, opts }.
// Messages out: { id, type: 'cue', ... } | { id, type: 'chunk', ... } | { id, type: 'done' } | { id, type: 'error', message }.
import { renderCue, renderOnce, estimateNorm, cuesOf } from './loop.mjs';
import { renderStream } from './render.mjs';
import { renderSfx } from './sfx.mjs';
import { speak } from './voice.mjs';
import { importScore } from './importers.mjs';

/** Handle one request; `post(message, transfer)` sends results back. Exported so a page without workers can run it. */
export function handle(msg, post) {
  const { id, type, song } = msg;
  try {
    if (type === 'cue') {
      const r = renderCue(song, { cue: msg.cue });
      const transfer = [];
      const pack = (stems) => {
        if (!stems) return null;
        const out = {};
        for (const [n, s] of Object.entries(stems)) {
          // a stem may be a view of a larger buffer: copy so each one transfers on its own
          const L = s.L.byteLength === s.L.buffer.byteLength ? s.L : s.L.slice();
          const R = s.R.byteLength === s.R.buffer.byteLength ? s.R : s.R.slice();
          out[n] = { L, R };
          transfer.push(L.buffer, R.buffer);
        }
        return out;
      };
      const head = pack(r.head), loop = pack(r.loop), entry = r.entry === r.head ? null : pack(r.entry);
      const meta = { cue: r.cue, sr: r.sr, layers: r.layers, intro: r.intro, body: r.body, headLoopAt: r.headLoopAt, introBars: r.introBars, bodyBars: r.bodyBars, normDb: r.normDb, stats: r.stats };
      post({ id, type: 'cue', meta, head, loop, entry }, transfer);
    } else if (type === 'stream') {
      // the intro and three passes of the body, played while they render, at an estimated loudness; the player
      // switches to the exact loop when it arrives and stops this stream
      // a cue streams as its intro and three passes of its body (the exact loop takes over); `form` streams those
      // sections once (a piece that does not loop)
      const def = cuesOf(song)[msg.cue ?? 'main'];
      const normDb = msg.normDb ?? estimateNorm(song, { cue: msg.cue ?? 'main' });
      const parts = msg.parts ? Object.fromEntries(Object.entries(song.parts).filter(([k]) => msg.parts.includes(k))) : song.parts;
      const s = { ...song, parts, form: msg.form ?? [...def.intro, ...def.body, ...def.body, ...def.body] };
      renderStream(s, {
        normDb, first: msg.first ?? 2, window: msg.window ?? 6,
        onChunk: (c) => post({ id, type: 'chunk', L: c.L, R: c.R, start: c.start, total: c.total, sr: c.sr, normDb }, [c.L.buffer, c.R.buffer]),
      });
      post({ id, type: 'done' });
    } else if (type === 'import') {
      // a score (MusicXML, MIDI or ABC; bytes or text) to a song: async, since .mxl archives unzip through a stream
      return importScore(msg.bytes, msg.opts ?? {})
        .then((r) => post({ id, type: 'import', song: r.song, text: r.text, report: r.report, format: r.format }))
        .catch((e) => post({ id, type: 'error', message: e?.message ?? String(e) }));
    } else if (type === 'sfx') {
      const r = renderSfx(msg.spec, { seed: msg.seed });
      post({ id, type: 'sfx', L: r.L, R: r.R, seed: msg.seed }, [r.L.buffer, r.R.buffer]);
    } else if (type === 'speak') {
      const r = speak(msg.text, msg.character, msg.opts ?? {});
      post({ id, type: 'speak', L: r.L, R: r.R, syllables: r.syllables, seconds: r.seconds }, [r.L.buffer, r.R.buffer]);
    } else if (type === 'once') {
      const r = renderOnce(song, msg.form ?? song.form);
      post({ id, type: 'once', L: r.L, R: r.R, sr: r.sr, normDb: r.normDb }, [r.L.buffer, r.R.buffer]);
    } else throw new Error(`unknown request "${type}"`);
  } catch (e) {
    post({ id, type: 'error', message: e?.message ?? String(e) });
  }
}

/** Install the message handler when running inside a worker. */
export function startWorker(scope = globalThis) {
  scope.onmessage = (e) => handle(e.data, (m, t) => scope.postMessage(m, t ?? []));
}
