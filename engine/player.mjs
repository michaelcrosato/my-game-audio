// player.mjs: game audio in the browser. Music that loops seamlessly, crossfades and changes section on the next bar
// or beat, layers with live gains, stingers, bar and beat callbacks; sound effects and voices; all through music,
// sfx and voice buses with volume, mute and ducking. Rendering runs in Workers and is cached, in memory and in
// IndexedDB, keyed by the song's content and the engine version.
//
//   const player = createPlayer();               // or createPlayer({ context, buses: { music, sfx, voice } })
//   await player.music(song, { fade: 1 });       // the intro, then the loop forever
//   player.layer('drums', 0, 2);                 // fade the drums layer out over 2 s
//   player.cue('climax', { at: 'bar' });         // the next cue, from the next bar line
//   player.sting(song.stingers.win ? 'win' : jingle, { at: 'beat' });
//   player.onBeat(({ bar, beat }) => pulse());
//
// The music clock is the AudioContext's: positions come from what has been scheduled, so callbacks fire on the beat
// that is being heard (within the scheduler's 25 ms tick).
import { SR, db } from './dsp.mjs';
import { renderSfx } from './sfx.mjs';
import { SOUNDS, nearestSounds } from './sounds.mjs';
import { freeze, cueKey, cuesOf, cueTiming, renderCueParallel } from './loop.mjs';
import { handle } from './worker.mjs';
import { VERSION } from './version.mjs';

const BUSES = ['music', 'sfx', 'voice'];
let workerSource = null; // set by the bundle (dist/), which runs its own code as the worker
/** The code a bundled build runs as its render worker (internal; the dist build calls it). */
export function setWorkerSource(src) {
  workerSource = src;
}

// ---------------------------------------------------------------------------------------------------------------
// Rendering service: a pool of workers (or the main thread), with a memory cache and an IndexedDB cache
// ---------------------------------------------------------------------------------------------------------------
function makeWorker() {
  if (typeof Worker === 'undefined') return null;
  try {
    if (workerSource) return new Worker(URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' })));
    return new Worker(new URL('./worker-entry.mjs', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }
}

class Renderer {
  constructor({ workers = 2, idb = true, name = 'my-game-audio' } = {}) {
    this.size = workers;
    this.dbName = name;
    this.pool = [];
    this.queue = [];
    this.seq = 0;
    this.useIdb = idb && typeof indexedDB !== 'undefined';
    this.db = null;
    this.mem = new Map();
    this.pending = new Map();
  }
  _worker() {
    let w = this.pool.find((x) => !x.busy);
    if (!w && this.pool.length < this.size) {
      const wk = makeWorker();
      if (!wk) return null;
      w = { wk, busy: false };
      this.pool.push(w);
    }
    return w ?? null;
  }
  /**
   * Run a request; onMsg gets every message for it. A `front` job goes ahead of the others waiting (after the front
   * jobs already waiting). Returns { promise, cancel }.
   */
  run(req, onMsg, front = false) {
    const id = ++this.seq;
    let settle, fail;
    const promise = new Promise((a, b) => ((settle = a), (fail = b)));
    const job = { id, req: { ...req, id }, onMsg, settle, fail, w: null, cancelled: false, front };
    const at = front ? this.queue.findIndex((j) => !j.front) : -1;
    this.queue.splice(at < 0 ? this.queue.length : at, 0, job);
    this._pump();
    return { promise, cancel: () => this._cancel(job) };
  }
  _pump() {
    while (this.queue.length) {
      const w = this._worker();
      if (w === null && this.pool.length === 0) {
        // no workers at all (old browsers, some test pages): render on the main thread, one job at a time
        const job = this.queue.shift();
        setTimeout(() => this._inline(job), 0);
        continue;
      }
      if (!w) return;
      const job = this.queue.shift();
      w.busy = true;
      job.w = w;
      w.wk.onmessage = (e) => this._receive(job, e.data);
      w.wk.onerror = (e) => this._receive(job, { id: job.id, type: 'error', message: e.message || 'worker failed' });
      w.wk.postMessage(job.req);
    }
  }
  _inline(job) {
    handle(job.req, (m) => this._receive(job, m));
  }
  _receive(job, m) {
    if (job.cancelled || job.done) return;
    job.onMsg?.(m);
    if (m.type === 'chunk') return;
    // finished: the worker is free for the next job, and this job must never touch it again (cancelling a finished
    // job would otherwise terminate a worker that is busy with someone else's render)
    job.done = true;
    if (job.w) job.w.busy = false;
    job.w = null;
    if (m.type === 'error') job.fail(new Error(m.message));
    else job.settle(m);
    this._pump();
  }
  _cancel(job) {
    if (job.cancelled || job.done) return;
    job.cancelled = true;
    const qi = this.queue.indexOf(job);
    if (qi >= 0) this.queue.splice(qi, 1);
    else if (job.w) {
      // a worker cannot be interrupted mid-render: end it, and the pool makes a new one when needed
      job.w.wk.terminate();
      this.pool = this.pool.filter((x) => x !== job.w);
    }
    job.fail(new Error('cancelled'));
    this._pump();
  }
  async _open() {
    if (!this.useIdb) return null;
    if (this.db) return this.db;
    this.db = await new Promise((resolve) => {
      const rq = indexedDB.open(this.dbName, 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('renders');
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => resolve(null);
    }).catch(() => null);
    if (this.db) this._prune();
    return this.db;
  }
  // renders made by other engine versions can never be used again (the database is this page's own: see cacheName)
  _prune() {
    try {
      const st = this.db.transaction('renders', 'readwrite').objectStore('renders');
      const rq = st.getAllKeys();
      rq.onsuccess = () => {
        for (const k of rq.result) if (!String(k).startsWith(VERSION + ':')) st.delete(k);
      };
    } catch { /* storage refused */ }
  }
  async idbGet(key) {
    const db = await this._open();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const rq = db.transaction('renders').objectStore('renders').get(key);
        rq.onsuccess = () => resolve(rq.result ?? null);
        rq.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  async idbPut(key, value) {
    const db = await this._open();
    if (!db) return;
    try {
      db.transaction('renders', 'readwrite').objectStore('renders').put(value, key);
    } catch { /* full or refused: the memory cache still has it */ }
  }
}

// 16-bit storage halves what a cue takes in IndexedDB; playback quality is unchanged (peaks sit at -2 dBFS)
const toI16 = (f) => {
  const o = new Int16Array(f.length);
  for (let i = 0; i < f.length; i++) o[i] = Math.max(-32768, Math.min(32767, Math.round(f[i] * 32767)));
  return o;
};
const toF32 = (s) => {
  const o = new Float32Array(s.length);
  for (let i = 0; i < s.length; i++) o[i] = s[i] / 32767;
  return o;
};
const mapStems = (stems, f) => (stems ? Object.fromEntries(Object.entries(stems).map(([n, s]) => [n, { L: f(s.L), R: f(s.R) }])) : null);

// ---------------------------------------------------------------------------------------------------------------
// The player
// ---------------------------------------------------------------------------------------------------------------
/**
 * Make a player. Options:
 *   context      an AudioContext (or OfflineAudioContext) to play on; made on first use otherwise (44.1 kHz)
 *   destination  where the master bus goes (default: context.destination)
 *   buses        { music, sfx, voice }: AudioNodes of the host (a game engine's own buses) to play into instead
 *   workers      render workers (default 2; 0 renders on the main thread)
 *   parallel     render a cue's parts across all the workers, mixing them on this thread (default: true with
 *                3 or more workers); the samples are the same either way
 *   cache        keep renders in IndexedDB (default true): a database of this page's own; a string names it
 *   stream       play a cue that is not cached yet while it renders (default true)
 *   voiceDuck    music level while a voice speaks (default 0.6; 1 for none)
 */
// The render cache's IndexedDB database: the page's own, so games that share a site (52in1 serves all of its games
// from one) never touch each other's renders. One database for every page made each page prune the renders of
// every other engine version, so games pinned to different versions deleted each other's music on every visit, and
// 28 of the 31 newest games there turned the cache off. `cache: 'name'` names the database instead.
const cacheName = (c) => (typeof c === 'string' && c ? `${c}:my-game-audio` : `my-game-audio:${globalThis.location?.pathname ?? ''}`);

export function createPlayer(opts = {}) {
  const R = new Renderer({ workers: opts.workers ?? 2, idb: opts.cache !== false, name: cacheName(opts.cache) });
  // quick jobs (sound-effect takes, speech) get their own worker, so they never wait behind a music render
  const Q = new Renderer({ workers: opts.workers === 0 ? 0 : 1, idb: false });
  const parallel = (opts.parallel ?? R.size >= 3) && R.size > 1 && typeof Worker !== 'undefined';
  // a cue rendered part by part in the pool, mixed here in order (engine/parallel.mjs), packed as the worker packs it
  const cueInParallel = async (frozen, cue) => {
    const r = await renderCueParallel(frozen, { cue, run: (job) => R.run({ type: 'part', job }).promise.then((m) => m.tracks) });
    const own = (stems) => stems && Object.fromEntries(Object.entries(stems).map(([n, s]) => [n, { L: s.L.slice(), R: s.R.slice() }]));
    const meta = { cue: r.cue, sr: r.sr, layers: r.layers, intro: r.intro, body: r.body, headLoopAt: r.headLoopAt, introBars: r.introBars, bodyBars: r.bodyBars, normDb: r.normDb, stats: r.stats };
    return { meta, head: own(r.head), loop: own(r.loop), entry: r.entry === r.head ? null : own(r.entry) };
  };
  const P = {
    version: VERSION,
    ctx: opts.context ?? null,
    renderer: R,
    _buses: null,
    // music starts at 10%, the level games play it under their effects and voices (every game set it, 108 calls in
    // 248, as its brief asks); player.volume('music', v) sets another
    _vol: { master: 1, music: 0.1, sfx: 1, voice: 1 },
    _mute: { master: false, music: false, sfx: false, voice: false },
    _duck: 1,
    _voiceDuckDepth: opts.voiceDuck ?? 0.6,
    _speaking: 0,
    cur: null, // the music instance playing (its song, cue, timing and nodes)
    _fading: [],
    _beats: [],
    _bars: [],
    _timer: null,
    _lastBeat: null,
    _layerGains: {}, // per song key: the gains asked for each layer, kept across cues of that song
    stats: { cacheHits: 0, renders: 0, streams: 0 },
  };

  P.context = function () {
    if (P.ctx) return P.ctx;
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) throw new Error('Web Audio is not available');
    try {
      P.ctx = new AC({ sampleRate: SR, latencyHint: 'playback' });
    } catch {
      P.ctx = new AC();
    }
    return P.ctx;
  };

  function buses() {
    if (P._buses) return P._buses;
    const c = P.context();
    const master = c.createGain();
    master.connect(opts.destination ?? c.destination);
    const b = { master };
    for (const n of BUSES) {
      b[n] = c.createGain();
      b[n].connect(opts.buses?.[n] ?? master);
    }
    // the music bus: instances -> duck -> music volume. Stingers skip the duck.
    b.musicIn = c.createGain();
    b.musicIn.connect(b.music);
    P._buses = b;
    applyVolumes();
    return b;
  }
  function applyVolumes(fade = 0.02) {
    if (!P._buses) return;
    const c = P.ctx, t = c.currentTime, b = P._buses;
    // a running context glides to the new level (no zipper noise); one not running yet (suspended before the first
    // tap, or offline) takes it at once, so sounds scheduled before it starts already hear it
    const instant = c.state !== 'running';
    const set = (node, v) => {
      node.gain.cancelScheduledValues(t);
      if (instant) node.gain.setValueAtTime(v, t);
      else node.gain.setTargetAtTime(v, t, Math.max(0.001, fade / 3));
    };
    set(b.master, P._mute.master ? 0 : P._vol.master);
    for (const n of BUSES) set(b[n], P._mute[n] ? 0 : P._vol[n]);
    set(b.musicIn, P._duck * (P._speaking > 0 ? P._voiceDuckDepth : 1));
  }

  /** A bus's GainNode ('master', 'music', 'sfx', 'voice') for nodes of your own. */
  P.bus = (name = 'sfx') => buses()[name === 'music' ? 'musicIn' : name];
  /** Get or set a bus's volume (0..1). */
  P.volume = (bus = 'master', v) => {
    if (v === undefined) return P._vol[bus];
    P._vol[bus] = Math.max(0, Math.min(1, v));
    applyVolumes();
    return P._vol[bus];
  };
  /** Mute or unmute a bus (default: the master); returns the new state. */
  P.mute = (bus = 'master', on = !P._mute[bus]) => {
    P._mute[bus] = !!on;
    applyVolumes();
    return P._mute[bus];
  };
  /** Hold the music down (a pause menu, a dialog): `depth` is the level while on (default 0.35). */
  P.duck = (on = true, { depth = 0.35, fade = 0.25 } = {}) => {
    P._duck = on ? depth : 1;
    applyVolumes(fade);
  };
  /** Resume the context after a user gesture (browsers start audio suspended). */
  P.unlock = async () => {
    const c = P.context();
    if (c.state === 'suspended' && c.resume) await c.resume().catch(() => {});
    return c.state;
  };

  // ------------------------------------------------------------------------------------------------------------
  // Getting a cue's audio: memory, IndexedDB, or a render
  // ------------------------------------------------------------------------------------------------------------
  function decode(r) {
    const c = P.context();
    const buf = (s) => {
      const b = c.createBuffer(2, s.L.length, r.meta.sr);
      b.copyToChannel(s.L, 0);
      b.copyToChannel(s.R, 1);
      return b;
    };
    const conv = (stems) => (stems ? Object.fromEntries(Object.entries(stems).map(([n, s]) => [n, buf(s)])) : null);
    const head = conv(r.head);
    return { ...r.meta, head, loop: conv(r.loop), entry: r.entry ? conv(r.entry) : head };
  }
  /**
   * Render (or fetch from the caches) a cue of a song, without playing it: call it while a level loads so the music
   * starts at once later. Resolves to the decoded cue.
   */
  P.prepare = async (song, cue = 'main', known) => {
    const frozen = (song.__frozen ??= freeze(song));
    const key = cueKey(frozen, cue);
    if (R.mem.has(key)) {
      P.stats.cacheHits++;
      return R.mem.get(key);
    }
    if (R.pending.has(key)) return R.pending.get(key);
    const p = (async () => {
      const stored = known ?? (await R.idbGet(key));
      let raw;
      if (stored) {
        P.stats.cacheHits++;
        raw = { meta: stored.meta, head: mapStems(stored.head, toF32), loop: mapStems(stored.loop, toF32), entry: mapStems(stored.entry, toF32) };
      } else {
        P.stats.renders++;
        raw = parallel ? await cueInParallel(frozen, cue) : await R.run({ type: 'cue', song: frozen, cue }).promise;
        R.idbPut(key, { meta: raw.meta, head: mapStems(raw.head, toI16), loop: mapStems(raw.loop, toI16), entry: mapStems(raw.entry, toI16) });
      }
      const d = decode(raw);
      d.key = key;
      R.mem.set(key, d);
      R.pending.delete(key);
      return d;
    })();
    p.catch(() => R.pending.delete(key));
    R.pending.set(key, p);
    return p;
  };
  /** True when a cue is in the memory cache (it will start at once). */
  P.ready = (song, cue = 'main') => R.mem.has(cueKey(song.__frozen ?? freeze(song), cue));

  // ------------------------------------------------------------------------------------------------------------
  // Music instances: a cue scheduled on the context's clock
  // ------------------------------------------------------------------------------------------------------------
  function layerGainsFor(songKey, layers) {
    const g = (P._layerGains[songKey] ??= {});
    return Object.fromEntries(layers.map((n) => [n, g[n] ?? 1]));
  }
  // A playing cue: { song, songKey, cue, d (decoded), out (GainNode), layers: { name: GainNode }, t0, sources }.
  // Its timeline: the head from t0 (the intro, then the body), then the loop from headLoopAt on, forever. It starts
  // sounding at context time `at`, from (at - t0) seconds into that timeline (t0 defaults to at: from the start).
  function startInstance(song, d, at, { t0 = at, entry = false, gain = 1, fadeIn = 0 } = {}) {
    const c = P.context(), b = buses();
    const out = c.createGain();
    out.connect(b.musicIn);
    if (fadeIn > 0) {
      out.gain.setValueAtTime(0, at);
      out.gain.linearRampToValueAtTime(gain, at + fadeIn);
    } else out.gain.setValueAtTime(gain, at);
    const songKey = (song.__songKey ??= cueKey(song.__frozen ?? freeze(song), ''));
    const lg = layerGainsFor(songKey, d.layers);
    const layers = {}, sources = [];
    const head = entry ? d.entry : d.head;
    const headDur = head[d.layers[0]].duration;
    const intro = entry ? 0 : d.intro;
    const s = at - t0; // seconds into the music when it starts sounding
    for (const n of d.layers) {
      const g = c.createGain();
      g.gain.value = lg[n];
      g.connect(out);
      layers[n] = g;
      if (s < headDur) {
        const h = c.createBufferSource();
        h.buffer = head[n];
        h.connect(g);
        h.start(at, s);
        sources.push(h);
      }
      const l = c.createBufferSource();
      l.buffer = d.loop[n];
      l.loop = true;
      l.loopStart = 0;
      l.loopEnd = d.loop[n].duration;
      l.connect(g);
      const from = Math.max(at, t0 + headDur);
      l.start(from, ((((from - t0 - intro) % d.body) + d.body) % d.body));
      sources.push(l);
    }
    return { song, songKey, d, cue: d.cue, out, layers, sources, t0, intro, stopped: false };
  }
  function stopInstance(inst, at, fade) {
    if (!inst || inst.stopped) return;
    inst.stopped = true;
    const g = inst.out.gain;
    const t = Math.max(at, P.ctx.currentTime);
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    if (fade > 0) g.linearRampToValueAtTime(0, t + fade);
    else g.setValueAtTime(0, t);
    const end = t + Math.max(fade, 0) + 0.05;
    for (const s of inst.sources) try { s.stop(end); } catch { /* not started */ }
    inst.stream?.cancel?.();
    setTimeout(() => {
      try { inst.out.disconnect(); } catch { /* gone */ }
      P._fading = P._fading.filter((x) => x !== inst);
    }, Math.max(0, (end - P.ctx.currentTime) * 1000) + 200);
    P._fading.push(inst);
  }

  /** Position on an instance's timeline at context time t: { s (seconds of music), inIntro, bodyAt (seconds into the body) }. */
  function where(inst, t) {
    const s = t - inst.t0;
    if (s < inst.intro) return { s, inIntro: true, bodyAt: 0 };
    const body = inst.d.body;
    const u = s - inst.intro;
    return { s, inIntro: false, bodyAt: ((u % body) + body) % body, pass: Math.floor(u / body) };
  }
  /** Bars of an instance from its start, as context times, from `from` on, up to `n` of them. */
  function barsFrom(inst, from, n = 64) {
    const out = [];
    const d = inst.d;
    if (inst.intro > 0) for (const b of d.introBars) {
      const t = inst.t0 + b.t;
      if (t >= from - 1e-6) out.push({ t, dur: b.dur, beats: b.beats, bar: out.length, intro: true });
      if (out.length >= n) return out;
    }
    const base = inst.t0 + inst.intro;
    let pass = Math.max(0, Math.floor((from - base) / d.body) - 1);
    while (out.length < n && pass < 1e6) {
      for (const b of d.bodyBars) {
        const t = base + pass * d.body + b.t;
        if (t >= from - 1e-6) out.push({ t, dur: b.dur, beats: b.beats, pass, intro: false });
        if (out.length >= n) break;
      }
      pass++;
    }
    return out;
  }
  /** The next bar line (or beat) at or after context time t on an instance; at 'now' it is t itself. */
  function nextBoundary(inst, t, at) {
    if (!inst || !inst.d || inst.t0 == null || at === 'now' || !at) return t;
    for (const b of barsFrom(inst, t - 16, 64)) {
      if (at === 'bar') {
        if (b.t >= t - 1e-6) return b.t;
      } else {
        for (let k = 0; k < b.beats; k++) {
          const bt = b.t + (k * b.dur) / b.beats;
          if (bt >= t - 1e-6) return bt;
        }
      }
    }
    return t;
  }

  /**
   * Play a song's cue: the intro, then its loop forever. Options:
   *   cue     which cue (default 'main'; see cuesOf)
   *   fade    seconds of crossfade from the music playing (default 0.05)
   *   at      'now' | 'beat' | 'bar': start on the playing music's next beat or bar (default 'now')
   *   layers  { name: gain } to start with (others keep their last gain, or 1)
   *   intro   false skips the intro
   * Resolves when the music is scheduled. Playing the song and cue already playing does nothing.
   */
  P.music = async (song, o = {}) => {
    if (!song) return P.stop(o);
    const cue = o.cue ?? 'main';
    const frozen = (song.__frozen ??= freeze(song));
    const songKey = (song.__songKey ??= cueKey(frozen, ''));
    if (P.cur && !P.cur.stopped && P.cur.songKey === songKey && P.cur.cue === cue && !o.restart) return P.cur;
    if (o.layers) Object.assign((P._layerGains[songKey] ??= {}), o.layers);
    const c = P.context();
    buses();
    const key = cueKey(frozen, cue);
    const token = (P._token = (P._token ?? 0) + 1);
    if (o.loop === false) return streamThenLoop(song, frozen, cue, key, o, token, true);
    let stored = null;
    if (!R.mem.has(key) && !R.pending.has(key)) {
      stored = await R.idbGet(key);
      if (token !== P._token) return null;
      if (!stored && opts.stream !== false) return streamThenLoop(song, frozen, cue, key, o, token);
    }
    const d = await P.prepare(song, cue, stored);
    if (token !== P._token) return null; // a later call took over
    const at = nextBoundary(P.cur, c.currentTime + 0.05, o.at);
    const fade = o.fade ?? 0.05;
    const old = P.cur;
    const inst = startInstance(song, d, at, { entry: o.intro === false, fadeIn: old ? fade : 0 });
    inst.prev = old;
    P.cur = inst;
    if (old) stopInstance(old, at, fade);
    ensureClock();
    return inst;
  };

  // First play of a cue that is not cached: a worker streams the intro and the body's first passes, which play as
  // they arrive, while another renders the exact cue; at a bar line after it arrives, the loop takes over (the same
  // music at the same point), and the stream's estimated loudness glides to the exact one first.
  // With `once`, the song's form streams once and nothing loops (a long piece, a score dropped on a page).
  async function streamThenLoop(song, frozen, cue, key, o, token, once = false) {
    const c = P.context(), b = buses();
    const def = once ? { intro: [], body: frozen.form } : cuesOf(frozen)[cue];
    if (!def) throw new Error(`no cue "${cue}"`);
    P.stats.streams++;
    const out = c.createGain();
    out.connect(b.musicIn);
    const songKey = song.__songKey;
    const lg = P._layerGains[songKey] ?? {};
    const silent = new Set(Object.entries(lg).filter(([, g]) => g === 0).map(([n]) => n));
    const layerParts = frozen.layers ? Object.entries(frozen.layers) : [];
    const muted = layerParts.filter(([n]) => silent.has(n)).flatMap(([, ps]) => ps);
    const parts = muted.length ? Object.keys(frozen.parts).filter((p) => !muted.includes(p)) : null;
    const fade = o.fade ?? 0.05;
    // the timing comes from the arrangement (no audio needed), so bars, beats and boundaries work from the start
    const timing = once ? cueTiming({ ...frozen, loops: undefined, loop: undefined, intro: undefined }, 'main') : cueTiming(frozen, cue);
    const inst = { song, songKey, d: { ...timing, cue, layers: [] }, cue, out, layers: {}, sources: [], t0: null, intro: timing.intro, stopped: false, streaming: true };
    let firstResolve;
    const first = new Promise((r) => (firstResolve = r));
    const job = R.run({ type: 'stream', song: frozen, cue, parts, form: once ? frozen.form : undefined }, (m) => {
      if (m.type !== 'chunk' || inst.stopped) return;
      if (token !== P._token) {
        // a later music() or stop() took over before this stream started
        inst.stopped = true;
        job.cancel();
        firstResolve(null);
        return;
      }
      if (inst.t0 === null) {
        // start: on the old music's next beat or bar if asked, at least 50 ms from now
        const old = P.cur;
        inst.t0 = nextBoundary(old, c.currentTime + 0.05, o.at);
        inst.streamNorm = m.normDb;
        if (old) {
          out.gain.setValueAtTime(0, inst.t0);
          out.gain.linearRampToValueAtTime(1, inst.t0 + fade);
          stopInstance(old, inst.t0, fade);
        }
        inst.prev = old;
        P.cur = inst;
        ensureClock();
        firstResolve(inst);
      }
      const buf = c.createBuffer(2, m.L.length, m.sr);
      buf.copyToChannel(m.L, 0);
      buf.copyToChannel(m.R, 1);
      const src = c.createBufferSource();
      src.buffer = buf;
      src.connect(out);
      const when = inst.t0 + m.start / m.sr;
      // a chunk that arrives late plays from where the music is now (a gap is better than music out of time)
      if (when >= c.currentTime) src.start(when);
      else if (when + buf.duration > c.currentTime) src.start(c.currentTime, c.currentTime - when);
      inst.sources.push(src);
      inst.endsAt = inst.t0 + m.total / m.sr;
    });
    inst.stream = job;
    job.promise.catch(() => {});
    if (once) {
      inst.once = true;
      return first;
    }
    // the exact cue, in parallel; at a bar line after it arrives, it takes over from the stream
    P.prepare(song, cue).then(async (d) => {
      await first;
      if (inst.stopped || P.cur !== inst) return;
      const earliest = Math.max(c.currentTime + 0.6, inst.t0 + d.intro + d.headLoopAt);
      const at = nextBoundary(inst, earliest, 'bar');
      const corr = Math.pow(10, (d.normDb - inst.streamNorm) / 20);
      const g = out.gain;
      g.cancelScheduledValues(c.currentTime);
      g.setValueAtTime(g.value || 1, c.currentTime + 0.02);
      g.linearRampToValueAtTime(corr, at - 0.05); // the estimated loudness glides to the exact one
      g.setValueAtTime(corr, at);
      g.linearRampToValueAtTime(0, at + 0.05);
      const real = startInstance(song, d, at, { t0: inst.t0, fadeIn: 0.05 }); // the same music, from the same point
      const endAt = at + 0.1;
      for (const src of inst.sources) try { src.stop(endAt); } catch { /* not started */ }
      setTimeout(() => job.cancel(), Math.max(0, (endAt - c.currentTime) * 1000));
      inst.stopped = true;
      real.prev = inst;
      P.cur = real;
    }).catch((e) => console.warn('my-game-audio: render failed:', e.message));
    return first;
  }

  /**
   * Change to another cue of the song playing, on its next bar line (default) or beat: `at` 'bar' | 'beat' | 'now'.
   * The new cue enters without its intro unless `intro: true`. `fade` (default 0.08 s) is how long the old cue takes
   * to fade from the bar line.
   */
  P.cue = async (name, o = {}) => {
    const cur = P.cur;
    if (!cur) throw new Error('no music is playing');
    if (cur.cue === name && !o.restart) return cur;
    const d = await P.prepare(cur.song, name);
    if (P.cur !== cur) return P.cur;
    const c = P.ctx;
    const at = nextBoundary(cur, c.currentTime + 0.05, o.at ?? 'bar');
    const inst = startInstance(cur.song, d, at, { entry: !o.intro });
    inst.prev = cur;
    P.cur = inst;
    stopInstance(cur, at, o.fade ?? 0.08);
    return inst;
  };

  /** Stop the music, fading over `fade` seconds (default 0.3), now or on the next 'beat' or 'bar'. */
  P.stop = (o = {}) => {
    P._token = (P._token ?? 0) + 1;
    const cur = P.cur;
    P.cur = null;
    if (!cur) return;
    const at = nextBoundary(cur, P.ctx.currentTime, o.at ?? 'now');
    stopInstance(cur, at, o.fade ?? 0.3);
  };

  /** A layer's gain (0..1) on the music playing, faded over `fade` seconds (default 0.5); kept for the song's other cues. */
  P.layer = (name, gain = 1, fade = 0.5) => {
    const cur = P.cur;
    if (!cur) return;
    (P._layerGains[cur.songKey] ??= {})[name] = gain;
    const g = cur.layers[name];
    if (!g) {
      if (!cur.streaming && !cur.d.layers.includes(name)) console.warn(`my-game-audio: no layer "${name}" (layers: ${cur.d.layers.join(', ')})`);
      return;
    }
    const t = P.ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.linearRampToValueAtTime(gain, t + Math.max(0.01, fade));
  };
  /** The layers of the music playing and their gains. */
  P.layers = () => (P.cur?.d ? layerGainsFor(P.cur.songKey, P.cur.d.layers) : {});

  /**
   * Play a short piece once over the music: the name of one of the playing song's `stingers` (sections), or a song
   * (its form). `at` 'now' | 'beat' | 'bar'; `duck` the music's level under it (default 0.4); `gain` its level.
   */
  P.sting = async (what, o = {}) => {
    const c = P.context(), b = buses();
    let song, form;
    if (typeof what === 'string') {
      song = P.cur?.song;
      form = song?.stingers?.[what];
      if (!form) throw new Error(`no stinger "${what}" in the song playing`);
    } else {
      song = what;
      form = what.form;
    }
    const frozen = (song.__frozen ??= freeze(song));
    const key = `once:${cueKey({ ...frozen, form }, '')}`;
    let buf = R.mem.get(key);
    if (!buf) {
      const r = await R.run({ type: 'once', song: frozen, form }).promise;
      buf = c.createBuffer(2, r.L.length, r.sr);
      buf.copyToChannel(r.L, 0);
      buf.copyToChannel(r.R, 1);
      R.mem.set(key, buf);
    }
    const at = nextBoundary(P.cur, c.currentTime + 0.03, o.at ?? 'now');
    const g = c.createGain();
    g.gain.value = o.gain ?? 1;
    g.connect(b.music);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(g);
    src.start(at);
    const cur = P.cur;
    if (cur && (o.duck ?? 0.4) < 1) {
      const dg = cur.out.gain, depth = o.duck ?? 0.4;
      // the sting's body is its notes; its tail is reverb, under which the music returns
      const len = Math.max(0.2, buf.duration - 2);
      dg.setValueAtTime(dg.value, at);
      dg.linearRampToValueAtTime(depth, at + 0.05);
      dg.setValueAtTime(depth, at + len);
      dg.linearRampToValueAtTime(1, at + len + 0.6);
    }
    return { at, duration: buf.duration, stop: () => src.stop() };
  };

  // ------------------------------------------------------------------------------------------------------------
  // The music clock: position, bar and beat callbacks
  // ------------------------------------------------------------------------------------------------------------
  /**
   * Where the music is: { playing, cue, time (seconds of music), bar (counted from the start, 0-based, the intro
   * included), beat (in the bar, 0-based), beats (in this bar), pass (times round the loop), inIntro }.
   */
  // the instance being heard at context time t: a cue or song scheduled to start later has not taken over yet
  function heard(t) {
    let inst = P.cur;
    while (inst && inst.t0 != null && t < inst.t0 && inst.prev) inst = inst.prev;
    if (P.cur && P.cur.t0 != null && t >= P.cur.t0) P.cur.prev = null; // the old one is no longer needed
    return inst;
  }
  Object.defineProperty(P, 'pos', {
    get() {
      const inst = P.ctx ? heard(P.ctx.currentTime) : P.cur;
      if (!inst || inst.t0 == null || !inst.d) return { playing: !!inst, cue: inst?.cue ?? null, time: 0, bar: 0, beat: 0, beats: 4, pass: 0, inIntro: true };
      return posAt(inst, P.ctx.currentTime);
    },
  });
  function posAt(inst, t) {
    const d = inst.d;
    const w = where(inst, t);
    const list = w.inIntro ? d.introBars : d.bodyBars;
    const u = w.inIntro ? w.s : w.bodyAt;
    let i = 0;
    while (i + 1 < list.length && list[i + 1].t <= u + 1e-9) i++;
    const bar = list[i] ?? { t: 0, dur: 1, beats: 4 };
    const beat = Math.min(bar.beats - 1, Math.max(0, Math.floor(((u - bar.t) / bar.dur) * bar.beats + 1e-9)));
    const barNo = w.inIntro ? i : (inst.intro > 0 ? d.introBars.length : 0) + w.pass * d.bodyBars.length + i;
    return { playing: true, cue: inst.cue, time: w.s, bar: Math.max(0, barNo), beat, beats: bar.beats, pass: w.inIntro ? 0 : w.pass, inIntro: w.inIntro };
  }
  /** Call fn(pos) on every beat of the music (within 25 ms of when it is heard). Returns { cancel() }. */
  P.onBeat = (fn) => {
    const e = { fn };
    P._beats.push(e);
    ensureClock();
    return { cancel: () => (P._beats = P._beats.filter((x) => x !== e)) };
  };
  /** Call fn(pos) on every bar line. Returns { cancel() }. */
  P.onBar = (fn) => {
    const e = { fn };
    P._bars.push(e);
    ensureClock();
    return { cancel: () => (P._bars = P._bars.filter((x) => x !== e)) };
  };
  function ensureClock() {
    if (P._timer || typeof setInterval === 'undefined') return;
    P._timer = setInterval(tick, 25);
  }
  function tick() {
    if (!P.ctx) return;
    const lat = P.ctx.outputLatency || P.ctx.baseLatency || 0;
    const t = P.ctx.currentTime - lat;
    const inst = heard(t);
    if (!inst || !inst.d || inst.t0 == null || t < inst.t0) return;
    const p = posAt(inst, t);
    const id = `${inst.t0}:${p.bar}:${p.beat}`;
    if (P._lastBeat === id) return;
    const isBar = !P._lastBeat || P._lastBeat.split(':')[1] !== String(p.bar) || P._lastBeat.split(':')[0] !== String(inst.t0);
    P._lastBeat = id;
    for (const e of P._beats.slice()) try { e.fn(p); } catch (err) { console.error(err); }
    if (isBar) for (const e of P._bars.slice()) try { e.fn(p); } catch (err) { console.error(err); }
  }

  // ------------------------------------------------------------------------------------------------------------
  // Sound effects and voices
  // ------------------------------------------------------------------------------------------------------------
  const library = { ...SOUNDS };
  const takes = new Map(); // a sound's rendered takes: { bufs, next, asked }
  const VARIANTS = 4;
  const toBuffer = (L, R) => {
    const b = P.context().createBuffer(2, L.length, SR);
    b.copyToChannel(L, 0);
    b.copyToChannel(R, 1);
    return b;
  };
  // a sound's first take renders in the quick worker: rendered here, it held the page for 16 to 344 ms once per sound
  // (Chromium, 0.19.0), which a game drawing with WebGPU feels as dropped frames; with no workers it renders here
  function takesOf(key, spec) {
    let e = takes.get(key);
    if (!e) takes.set(key, (e = { bufs: [], next: 0, asked: 0, ready: null }));
    if (!e.bufs.length && !e.ready) {
      const seed = ++e.asked;
      const here = () => {
        const r = renderSfx(spec, { seed });
        e.bufs.unshift(toBuffer(r.L, r.R));
        return e;
      };
      if (Q.size === 0) {
        here();
        e.ready = Promise.resolve(e);
      } else {
        // ahead of other sounds' later takes, which only add variety; it goes first in the list, whatever order the
        // others arrive in; a failed render falls back to this thread
        e.ready = Q.run({ type: 'sfx', spec, seed }, null, true).promise.then((m) => (e.bufs.unshift(toBuffer(m.L, m.R)), e), here);
      }
    }
    while (!spec.loop && e.asked < (spec.takes ?? VARIANTS)) {
      const seed = ++e.asked;
      Q.run({ type: 'sfx', spec, seed }).promise.then((m) => e.bufs.push(toBuffer(m.L, m.R))).catch(() => {});
    }
    return e;
  }
  /** Add or replace a named sound (a spec for renderSfx); player.sfx(name) then plays it. */
  P.define = (name, spec) => {
    library[name] = spec;
    takes.delete(name);
  };
  /** The names of the sounds the player knows: the library (engine/sounds.mjs) and any defined. */
  P.sounds = () => Object.keys(library);
  /** Render sounds ahead (while a level loads), in the quick worker, so their first play is at once. Resolves when ready. */
  P.preload = (names = []) => Promise.all(names.filter((n) => library[n]).map((n) => takesOf(n, library[n]).ready));
  /**
   * Play a sound effect through the sfx bus: a library name ('coin', 'step_grass', 'amb_rain', ...) or a spec.
   * Each play takes the next of several seeded takes, so repeats vary. Options: volume (0..1), pan (-1..1), pitch
   * (a playback-rate multiplier), loop (default: the spec's), fade (seconds, for a loop's start), at ('now', 'beat' or
   * 'bar' of the music: rhythm games), bus ('sfx' or 'voice'). Returns { stop(fade), set({ volume, pan }), duration }.
   */
  P.sfx = (what, o = {}) => {
    // the name first: a misspelt sound says so, with the names it may have meant, before any audio starts
    const spec = typeof what === 'string' ? library[what] : what;
    if (!spec) {
      const near = nearestSounds(what, Object.keys(library));
      throw new Error(`no sound "${what}"${near.length ? `: did you mean ${near.join(', ')}?` : ''} (player.sounds() lists all ${Object.keys(library).length}; define() adds one)`);
    }
    const key = typeof what === 'string' ? what : JSON.stringify(spec);
    const e = takesOf(key, spec);
    if (e.bufs.length) return startSfx(e, spec, o);
    // its first take is still rendering: it starts the moment it arrives (a few tens of ms); the handle works meanwhile
    const live = { h: null, stopped: false, set: null };
    e.ready.then(() => {
      if (live.stopped) return;
      live.h = startSfx(e, spec, o);
      if (live.set) live.h.set(live.set);
    }).catch((err) => console.warn('my-game-audio: a sound failed to start:', err.message));
    return {
      get duration() { return live.h?.duration ?? 0; },
      get playing() { return live.h ? live.h.playing : !live.stopped; },
      stop(fade) { if (live.h) live.h.stop(fade); else live.stopped = true; },
      set(x = {}) { if (live.h) live.h.set(x); else live.set = { ...live.set, ...x }; },
    };
  };
  function startSfx(e, spec, o) {
    const c = P.context(), b = buses();
    const buf = e.bufs[e.next++ % e.bufs.length];
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = o.loop ?? !!spec.loop;
    if (o.pitch) src.playbackRate.value = o.pitch;
    const g = c.createGain();
    const vol = o.volume ?? 1;
    const pan = c.createStereoPanner ? c.createStereoPanner() : null;
    src.connect(g);
    if (pan) {
      pan.pan.value = Math.max(-1, Math.min(1, o.pan ?? 0));
      g.connect(pan);
      pan.connect(b[o.bus ?? 'sfx']);
    } else g.connect(b[o.bus ?? 'sfx']);
    // on a whole sample: a start between samples would be interpolated, a slightly different sound
    const at = Math.ceil(nextBoundary(heard(c.currentTime), c.currentTime + 0.005, o.at ?? 'now') * c.sampleRate) / c.sampleRate;
    if (o.fade) {
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(vol, at + o.fade);
    } else g.gain.value = vol;
    src.start(at);
    let playing = true;
    src.onended = () => (playing = false);
    return {
      duration: buf.duration,
      get playing() { return playing; },
      stop(fade = 0.05) {
        if (!playing) return;
        const t = c.currentTime;
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.linearRampToValueAtTime(0, t + fade);
        try { src.stop(t + fade + 0.02); } catch { /* ended */ }
      },
      set({ volume, pan: p } = {}) {
        const t = c.currentTime;
        if (volume !== undefined) g.gain.setTargetAtTime(volume, t, 0.02);
        if (p !== undefined && pan) pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, p)), t, 0.02);
      },
    };
  }

  /**
   * Say a line of dialogue in gibberish through the voice bus: `character` a name from VOICES or a profile. The music
   * ducks while the voice speaks. Options: emotion, seed, volume, pan, onSyllable(syllable, index) (called as each
   * syllable sounds: reveal the text up to syllable.to). Resolves when it starts, to { duration, syllables, done
   * (a promise), stop() }.
   */
  P.say = async (text, character = 'villager', o = {}) => {
    const c = P.context(), b = buses();
    const m = await Q.run({ type: 'speak', text, character, opts: { emotion: o.emotion, seed: o.seed } }, null, true).promise;
    const buf = toBuffer(m.L, m.R);
    const src = c.createBufferSource();
    src.buffer = buf;
    const g = c.createGain();
    g.gain.value = o.volume ?? 1;
    const pan = c.createStereoPanner ? c.createStereoPanner() : null;
    src.connect(g);
    if (pan) {
      pan.pan.value = o.pan ?? 0;
      g.connect(pan);
      pan.connect(b.voice);
    } else g.connect(b.voice);
    const at = Math.ceil((c.currentTime + 0.02) * c.sampleRate) / c.sampleRate;
    src.start(at);
    P._speaking++;
    applyVolumes(0.12);
    const timers = [];
    let ended = false, finish;
    const done = new Promise((res) => (finish = res));
    const end = () => {
      if (ended) return;
      ended = true;
      timers.forEach(clearTimeout);
      P._speaking = Math.max(0, P._speaking - 1);
      applyVolumes(0.4);
      finish();
    };
    src.onended = end;
    if (o.onSyllable) m.syllables.forEach((sy, i) => timers.push(setTimeout(() => !ended && o.onSyllable(sy, i), Math.max(0, (at - c.currentTime + sy.t) * 1000))));
    return {
      duration: buf.duration, syllables: m.syllables, done,
      stop(fade = 0.05) {
        const t = c.currentTime;
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.linearRampToValueAtTime(0, t + fade);
        try { src.stop(t + fade + 0.02); } catch { /* ended */ }
      },
    };
  };

  /**
   * Import a score in a worker: MusicXML (.mxl or .musicxml), MIDI or ABC, as bytes or text: { song, text, report,
   * format } (see importScore). Play it with music(song, { loop: false }); it streams, so it starts within seconds.
   */
  P.importScore = async (bytes, opts = {}) => {
    const m = await R.run({ type: 'import', bytes, opts }).promise;
    return { song: m.song, text: m.text, report: m.report, format: m.format };
  };

  /** Stop everything and release the workers. */
  P.dispose = () => {
    P.stop({ fade: 0 });
    clearInterval(P._timer);
    P._timer = null;
    for (const w of [...R.pool, ...Q.pool]) w.wk.terminate();
    R.pool = [];
    Q.pool = [];
  };
  return P;
}
