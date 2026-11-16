// node web/build.mjs: writes web/index.html, a self-contained listening page that renders each song in the browser.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const NAMES = ['chiptune', 'electronic', 'orchestral', 'rock'];
const CLASSICS = ['moonlight', 'entertainer', 'alla_turca'].filter((n) => existsSync(`songs/${n}.mjs`)); // generated locally, not committed
const ORCH = ['beethoven5', 'ode', 'rollcall'];
const bundle = readFileSync('web/bundle.js', 'utf8');
const aes = JSON.parse(readFileSync('out/aesthetics.json', 'utf8'));
const aesC = CLASSICS.length ? JSON.parse(readFileSync('out/aesthetics_classics.json', 'utf8')) : {};
const aesO = JSON.parse(readFileSync('out/aesthetics_orchestra.json', 'utf8'));
const engineLines = ['dsp', 'fx', 'instruments', 'orchestra', 'piano', 'render', 'score'].reduce((n, f) => n + readFileSync(`engine/${f}.mjs`, 'utf8').split('\n').length, 0);
const presets = JSON.parse(readFileSync('engine/orchestra-presets.json', 'utf8'));
const nInst = Object.keys(presets.instruments).length - 1, nPerc = Object.keys(presets.percussion).length;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const meta = {
  chiptune: { title: 'Ember Run', what: 'Chiptune, NES 2A03', note: 'Two pulse channels, a 32-step triangle and a 15-bit noise register, with FamiTracker-style volume, duty and vibrato macros at 60 Hz.' },
  electronic: { title: 'Neon Causeway', what: 'Electronic, synthwave', note: 'Seven-voice supersaw pad, a 16th-note arpeggio through a ping-pong delay, octave bass and a saw lead; pad, bass and arp duck under the kick.' },
  orchestral: { title: 'The Last Lantern', what: 'Orchestral cue', note: 'Bowed-string sections with body resonances, brass whose brightness follows the dynamics, a formant choir, Karplus-Strong harp and modal timpani.' },
  rock: { title: 'Iron Vow', what: 'Band, metal', note: 'Double-tracked Karplus-Strong guitars into an oversampled drive and a cabinet model, palm-muted gallops, a vibrato lead and a synthesized kit.', aside: 'Power chords carry no thirds, so the analyzer hears G major, the relative major of E minor.' },
  moonlight: { title: 'Moonlight Sonata, I', what: 'Beethoven, 1801', note: 'All 69 bars. The importer split the right hand into melody and triplets, so the melody sounds over them, and changes the sustain pedal with each bass note.', credit: 'Notes: Craig Stuart Sapp, Humdrum edition of the Beethoven piano sonatas.' },
  entertainer: { title: 'The Entertainer', what: 'Scott Joplin, 1902', note: 'Every repeat, played without the sustain pedal. Ties across the beat give the rag its syncopation.', credit: 'Notes: Craig Stuart Sapp, Humdrum edition of Joplin (CC BY-NC-SA 4.0).' },
  beethoven5: { title: 'Symphony No. 5, I', what: 'Beethoven, 1808', note: 'All 502 bars and the exposition repeat, read from a MusicXML full score. The 18 parts were matched to instruments without help, and keep Beethoven\'s dynamics, sforzandi, slurs, staccatos, pizzicato passages, tremolos and fermatas.', credit: 'Score: OpenScore Orchestra corpus, CC0.' },
  ode: { title: 'Symphony No. 9, IV: Ode to Joy', what: 'Beethoven, 1824 · bars 92 to 330', note: 'The theme from its first statement in the cellos and basses, the Presto outburst, the bass recitative and the first choral climax. 36 parts, with four soloists and a four-part choir that sing the vowels of Schiller\'s words, though no consonants.', credit: 'Score: OpenScore Orchestra corpus, CC0.' },
  rollcall: { title: 'Orchestra roll call', what: 'Every instrument preset', note: 'Each instrument plays the same bar in turn, family by family: strings, winds, brass, tuned percussion, keyboards and harp, voices, then the unpitched percussion. Then all of them play three closing chords together. Written directly as code, not imported.' },
  alla_turca: { title: 'Rondo alla Turca', what: 'Mozart, 1783', note: 'All repeats, with the grace notes before the left-hand chords and the trills written out note by note.', credit: 'Notes: Craig Stuart Sapp, Humdrum edition after the Alte Mozart-Ausgabe (CC BY-NC-SA 4.0).', aside: 'The refrain and the coda are in A major, so the analyzer hears A major for the whole movement.' },
};

const tempoNote = (heard, score) => {
  const r = heard / score;
  return Math.abs(r - 3) < 0.12 ? ' (3× score)' : Math.abs(r - 2) < 0.1 ? ' (2× score)' : Math.abs(r - 0.5) < 0.05 ? ' (½ score)' : '';
};
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const card = (n, i, a, scoreLabel) => {
  const e = JSON.parse(readFileSync(`out/${n}.ears.json`, 'utf8'));
  const st = JSON.parse(readFileSync(`out/${n}.json`, 'utf8')).stats;
  const song = readFileSync(`songs/${n}.mjs`, 'utf8');
  const m = meta[n];
  const bpm = /bpm: (\d+)/.exec(song)[1];
  const key = /key: ['"]([^'"]+)['"]/.exec(song)[1];
  const stream = st.normDb != null && st.seconds > 60 ? ` data-norm="${st.normDb}"` : '';
  return `
  <article class="card" id="${n}" data-name="${n}"${stream}>
    <header>
      <span class="num">${String(i + 1).padStart(2, '0')}</span>
      <div>
        <h2>${m.title}</h2>
        <p class="what">${m.what} · ${key} · ${bpm} BPM · ${mmss(st.seconds)}</p>
      </div>
    </header>
    <p class="note">${m.note}</p>
    <div class="controls">
      <button type="button" class="render" id="render-${n}">${stream ? 'Play' : 'Render and play'}</button>
      <button type="button" class="stop" id="stop-${n}" disabled>Stop</button>
      <span class="status" id="status-${n}" aria-live="polite">Not rendered yet</span>
    </div>
    <canvas class="wave" id="wave-${n}" height="72" aria-label="Waveform of ${m.title}, drawn after rendering"></canvas>
    <dl class="metrics">
      <div><dt>Loudness</dt><dd>${e.integrated_lufs.toFixed(1)} LUFS</dd></div>
      <div><dt>True peak</dt><dd>${e.true_peak_dbtp.toFixed(1)} dBTP</dd></div>
      <div><dt>Key heard</dt><dd>${e.key_est}${e.key_est === key ? '' : ' *'}</dd></div>
      <div><dt>Tempo heard</dt><dd>${e.tempo_bpm_est.toFixed(0)} BPM${tempoNote(e.tempo_bpm_est, Number(bpm))}</dd></div>
      <div><dt>${scoreLabel}</dt><dd>${a.CE.toFixed(1)} / ${a.PQ.toFixed(1)}</dd></div>
      <div><dt>Node render</dt><dd>${(st.renderMs / 1000).toFixed(1)} s (${(st.seconds / (st.renderMs / 1000)).toFixed(0)}×)</dd></div>
    </dl>${e.key_est === key || !m.aside ? '' : `\n    <p class="aside">* ${m.aside}</p>`}${m.credit ? `\n    <p class="aside">${m.credit}</p>` : ''}
    <details>
      <summary>Read the score (${song.split('\n').length} lines of text)</summary>
      <pre><code>${esc(song)}</code></pre>
    </details>
  </article>`;
};
const cards = NAMES.map((n, i) => card(n, i, aes[`out/${n}.wav`], 'Enjoyment / quality')).join('\n');
const classicCards = CLASSICS.map((n, i) => card(n, i + NAMES.length, aesC[`out/cal/${n}_60.wav`], 'Enjoyment / quality, first minute')).join('\n');
const orchCards = ORCH.map((n, i) => card(n, i + NAMES.length + CLASSICS.length, aesO[`out/cal/${n}_60.wav`], 'Enjoyment / quality, first minute')).join('\n');
const total = NAMES.length + CLASSICS.length + ORCH.length;
const words = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Code-Written Music Demos</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans+Condensed:wght@500;600&family=IBM+Plex+Sans:wght@400;500&display=swap" rel="stylesheet">
<style>
:root {
  /* a tracker-room palette: quiet slate paper, one signal-amber accent, mono for anything that is code */
  --bg: #f4f5f7;
  --panel: #ffffff;
  --ink: #1a1e26;
  --muted: #5a6372;
  --line: #d9dde4;
  --accent: #b45d00;
  --accent-ink: #ffffff;
  --wave: #3c4a63;
  --font-display: "IBM Plex Sans Condensed", "Arial Narrow", system-ui, sans-serif;
  --font-body: "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, "SFMono-Regular", Menlo, monospace;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #12161d; --panel: #1a1f29; --ink: #e8ebf0; --muted: #9aa3b2; --line: #2c3442;
    --accent: #f0a23c; --accent-ink: #1a1206; --wave: #9fb1cf; color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --bg: #12161d; --panel: #1a1f29; --ink: #e8ebf0; --muted: #9aa3b2; --line: #2c3442;
  --accent: #f0a23c; --accent-ink: #1a1206; --wave: #9fb1cf; color-scheme: dark;
}
* { box-sizing: border-box; }
html, body { margin: 0; }
body { background: var(--bg); color: var(--ink); font: 400 16px/1.55 var(--font-body); }
main { max-width: 980px; margin: 0 auto; padding: 40px 20px 64px; display: grid; gap: 28px; }
.intro { max-width: 66ch; display: grid; gap: 10px; }
.intro h1 { font: 600 clamp(28px, 4vw, 40px)/1.1 var(--font-display); letter-spacing: -0.01em; margin: 0; text-wrap: balance; }
.intro p { margin: 0; color: var(--muted); }
.intro h2.group { font: 600 clamp(22px, 3vw, 28px)/1.15 var(--font-display); margin: 12px 0 0; text-wrap: balance; }
.intro strong { color: var(--ink); font-weight: 500; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 440px), 1fr)); gap: 20px; }
.card { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 20px; display: grid; gap: 14px; align-content: start; min-width: 0; }
.card header { display: flex; gap: 14px; align-items: baseline; }
.num { font: 500 13px var(--font-mono); color: var(--accent); }
.card h2 { font: 600 24px/1.15 var(--font-display); margin: 0; }
.what { margin: 2px 0 0; color: var(--muted); font-size: 14px; }
.note { margin: 0; font-size: 15px; }
.controls { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
button { font: 500 14px var(--font-body); border-radius: 6px; padding: 8px 14px; cursor: pointer; border: 1px solid var(--accent); }
button.render { background: var(--accent); color: var(--accent-ink); }
button.stop { background: transparent; color: var(--ink); border-color: var(--line); }
button:disabled { opacity: 0.45; cursor: default; }
button:focus-visible, summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.status { font: 400 13px var(--font-mono); color: var(--muted); font-variant-numeric: tabular-nums; }
.wave { width: 100%; height: 72px; display: block; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
.metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px 14px; margin: 0; }
.metrics div { min-width: 0; }
.metrics dt { font-size: 12px; color: var(--muted); }
.metrics dd { margin: 0; font: 500 14px var(--font-mono); font-variant-numeric: tabular-nums; }
details summary { cursor: pointer; color: var(--accent); font-weight: 500; font-size: 14px; }
pre { margin: 10px 0 0; max-height: 420px; overflow: auto; background: var(--bg); border: 1px solid var(--line); border-radius: 6px; padding: 12px; }
code { font: 400 12.5px/1.5 var(--font-mono); white-space: pre; }
.foot { color: var(--muted); font-size: 14px; max-width: 70ch; }
.aside { margin: 0; color: var(--muted); font-size: 13px; }
@media (max-width: 520px) { .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto; } }
</style>
</head>
<body>
<main>
  <section class="intro">
    <h1>${words[total]} pieces, no samples</h1>
    <p>Each piece below exists only as text: a score in tracker notation, plus instrument and mix definitions as plain data and code. Pressing play synthesizes it in your browser, on a background thread, with the same ${engineLines.toLocaleString('en-US')} lines of dependency-free JavaScript that made the MP3s. No audio is downloaded.</p>
    <p>Short pieces render whole, then play. Long ones play while they render: sound starts after the first few seconds are ready, and the rest keeps rendering ahead of playback; a slow device buffers a little longer first. The numbers under each piece come from the offline analysis tools: loudness and peaks, the key and tempo an analyzer hears, and Meta's Audiobox Aesthetics scores (1 to 10) for content enjoyment and production quality.</p>
  </section>
  <section class="grid">
${cards}
  </section>
${classicCards ? `  <section class="intro">
    <h2 class="group">From public-domain sheet music</h2>
    <p>These three began as encoded sheet music. An importer turned each one into the same text score format, with every note, repeat, grace note and trill. A piano built in code plays them: inharmonic strings, a felt hammer that brightens with force, a two-stage decay, and dampers that follow a pedal line. Its envelopes and spectra were tuned against measurements of recorded grand-piano notes. The longest piece takes about half a minute to render.</p>
  </section>
  <section class="grid">
${classicCards}
  </section>` : ''}
  <section class="intro">
    <h2 class="group">A full orchestra, read from printed scores</h2>
    <p>The engine has ${nInst} orchestral instrument presets, from piccolo to contrabassoon, every string section and soloist with pizzicato, brass with and without mutes, tuned percussion, keyboards, harp, choir and solo voices, plus ${nPerc} unpitched percussion sounds. Their levels were set by measuring each one. A second importer reads MusicXML, the format MuseScore, Sibelius, Finale and Dorico export. It matches each part to a preset by its sound ID, its name in several languages or its MIDI program, writes repeats out and keeps tempo marks, dynamics and articulations. It matched all 1,663 parts of the 96 scores in the corpus these two symphonies come from.</p>
  </section>
  <section class="grid">
${orchCards}
  </section>
  <p class="foot">my-game-audio: game music written as code. The engine renders deterministically: the same text and seed give the same samples on every run in the same JavaScript engine.</p>
</main>
<script type="text/plain" id="engine-src">${bundle}</script>
<script type="text/plain" id="worker-src">
self.onmessage = (e) => {
  const { name, normDb } = e.data;
  const t = performance.now();
  try {
    if (normDb != null) {
      const st = MyGameAudioDemo.stream(name, normDb, (c) => self.postMessage({ chunk: true, L: c.L, R: c.R, start: c.start, total: c.total, sr: c.sr }, [c.L.buffer, c.R.buffer]), () => {});
      self.postMessage({ done: true, ms: performance.now() - t, seconds: st.seconds });
    } else {
      const r = MyGameAudioDemo.render(name, () => {});
      self.postMessage({ done: true, L: r.L, R: r.R, sr: r.sr, ms: performance.now() - t, seconds: r.stats.seconds }, [r.L.buffer, r.R.buffer]);
    }
  } catch (err) { self.postMessage({ error: String(err) }); }
};
</script>
<script>
(() => {
  const src = document.getElementById('engine-src').textContent + '\\n' + document.getElementById('worker-src').textContent;
  const workerUrl = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
  const store = {}; // name -> { L, R, sr, total, filled, done }
  let ctx = null, playing = null;
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const el = (id) => document.getElementById(id);
  const fmt = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

  function draw(name, pos) {
    const r = store[name];
    const c = el('wave-' + name);
    const w = c.clientWidth, h = c.clientHeight, dpr = window.devicePixelRatio || 1;
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    g.clearRect(0, 0, w, h);
    g.fillStyle = css('--line');
    g.fillRect(0, h / 2, w, 1);
    if (!r) return;
    g.fillStyle = css('--wave');
    const n = r.total, step = Math.max(1, Math.floor(n / w));
    for (let x = 0; x < w; x++) {
      const s0 = Math.floor((x * n) / w);
      if (s0 >= r.filled) break;
      let lo = 0, hi = 0;
      for (let i = s0; i < Math.min(r.filled, s0 + step); i += 4) { const v = (r.L[i] + r.R[i]) / 2; if (v < lo) lo = v; if (v > hi) hi = v; }
      g.fillRect(x, h / 2 - hi * h * 0.48, 1, Math.max(1, (hi - lo) * h * 0.48));
    }
    if (pos != null) { g.fillStyle = css('--accent'); g.fillRect(Math.round(Math.min(1, pos) * w), 0, 2, h); }
  }

  function stop() {
    if (!playing) return;
    const p = playing;
    playing = null;
    for (const s of p.sources) { try { s.stop(); } catch (e) {} }
    if (p.worker) {
      p.worker.terminate();
      if (store[p.name] && !store[p.name].done) { delete store[p.name]; el('status-' + p.name).textContent = 'Stopped'; }
    }
    el('stop-' + p.name).disabled = true;
    el('render-' + p.name).disabled = false;
    el('render-' + p.name).textContent = store[p.name] ? 'Play again' : 'Play';
    draw(p.name);
  }

  function animate(p) {
    const tick = () => {
      if (playing !== p) return;
      const r = store[p.name];
      if (p.t0 != null && r) draw(p.name, (ctx.currentTime - p.t0) / (r.total / r.sr));
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function schedule(p, d) {
    const b = ctx.createBuffer(2, d.L.length, d.sr);
    b.copyToChannel(d.L, 0); b.copyToChannel(d.R, 1);
    const s = ctx.createBufferSource();
    s.buffer = b; s.connect(ctx.destination);
    let when = p.t0 + d.start / d.sr;
    if (when < ctx.currentTime + 0.02) { p.t0 += ctx.currentTime + 0.25 - when; when = p.t0 + d.start / d.sr; } // render fell behind: pause briefly
    s.start(when);
    p.sources.push(s);
    p.end = when + b.duration;
    s.onended = () => {
      const r = store[p.name];
      if (playing === p && r && r.done && ctx.currentTime >= p.end - 0.05) { el('status-' + p.name).textContent = p.summary || 'Finished'; stop(); }
    };
  }

  function playWhole(name) {
    stop();
    const r = store[name];
    const p = { name, sources: [], t0: ctx.currentTime + 0.05 };
    playing = p;
    schedule(p, { L: r.L, R: r.R, sr: r.sr, start: 0 });
    el('stop-' + name).disabled = false;
    el('render-' + name).disabled = true;
    animate(p);
  }

  function renderAndPlay(name, normDb) {
    stop();
    const status = el('status-' + name), btn = el('render-' + name);
    const wk = new Worker(workerUrl);
    const p = { name, worker: wk, sources: [], t0: null, queue: [], wall0: performance.now() };
    playing = p;
    btn.disabled = true;
    el('stop-' + name).disabled = false;
    status.textContent = normDb != null ? 'Starting…' : 'Rendering…';
    const timer = normDb != null ? null : setInterval(() => { status.textContent = 'Rendering… ' + ((performance.now() - p.wall0) / 1000).toFixed(0) + ' s'; }, 500);
    animate(p);
    wk.onmessage = (e) => {
      const d = e.data;
      if (playing !== p) return;
      if (d.error) { if (timer) clearInterval(timer); status.textContent = 'Render failed: ' + d.error; stop(); return; }
      if (d.chunk) {
        const r = store[name] || (store[name] = { L: new Float32Array(d.total), R: new Float32Array(d.total), sr: d.sr, total: d.total, filled: 0, done: false });
        r.L.set(d.L, d.start); r.R.set(d.R, d.start);
        r.filled = d.start + d.L.length;
        p.queue.push(d);
        const have = r.filled / r.sr, total = r.total / r.sr, wall = (performance.now() - p.wall0) / 1000;
        const speed = have / Math.max(0.05, wall);
        const need = speed >= 1.2 ? 0 : Math.min(total, total * (1 - speed / 1.2) + 3); // buffer so playback never overtakes the render
        if (p.t0 == null && have >= need) p.t0 = ctx.currentTime + 0.15;
        if (p.t0 != null) { for (const q of p.queue) schedule(p, q); p.queue = []; }
        status.textContent = (p.t0 == null ? 'Buffering ' : 'Playing · rendered ') + fmt(have) + ' of ' + fmt(total);
        if (p.t0 == null) draw(name);
        return;
      }
      if (d.done) {
        if (timer) clearInterval(timer);
        wk.terminate();
        p.worker = null;
        p.summary = 'Rendered ' + fmt(d.seconds) + ' of audio in ' + (d.ms / 1000).toFixed(1) + ' s';
        if (d.L) {
          store[name] = { L: d.L, R: d.R, sr: d.sr, total: d.L.length, filled: d.L.length, done: true };
          status.textContent = p.summary;
          playing = null;
          playWhole(name);
          return;
        }
        store[name].done = true;
        status.textContent = p.summary + ' · playing';
      }
    };
    wk.onerror = (e) => { if (timer) clearInterval(timer); status.textContent = 'Render failed: ' + e.message; stop(); };
    wk.postMessage({ name, normDb });
  }

  document.querySelectorAll('.card').forEach((card) => {
    const name = card.dataset.name;
    const normDb = card.dataset.norm != null ? Number(card.dataset.norm) : null;
    el('stop-' + name).addEventListener('click', stop);
    el('render-' + name).addEventListener('click', async () => {
      try {
        if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === 'suspended') await ctx.resume();
      } catch (e) { el('status-' + name).textContent = 'This browser blocked audio: ' + e.message; return; }
      if (store[name] && store[name].done) playWhole(name);
      else renderAndPlay(name, normDb);
    });
    draw(name);
  });
  window.addEventListener('resize', () => document.querySelectorAll('.card').forEach((c) => draw(c.dataset.name)));
})();
</script>
</body>
</html>
`;
writeFileSync('web/index.html', html);
console.log('web/index.html', html.length, 'bytes');
