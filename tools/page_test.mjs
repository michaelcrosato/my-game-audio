// npm run page:test: the demo page in headless Chromium, on the player in dist/. Builds the page first.
// It checks, and prints the numbers for:
//   1. music starts within 2 seconds of pressing Play, on a cold cache (it streams while the exact loop renders);
//   2. the exact loop takes over, and the loop seams are clean: an OfflineAudioContext player renders the head and
//      two passes of the loop, and its output must equal the stems laid end to end, sample for sample, across both
//      seams (no gap, no click), with no sample-to-sample jump at the seams beyond the music's own;
//   3. layers fade, a second song crossfades in on a bar line, a section change lands on the next bar, a stinger
//      lands on a beat, and bar and beat callbacks keep time;
//   4. no console errors or warnings, no page errors.
// usage: node tools/page_test.mjs [--keep] (CHROME=/path/to/chrome to use another browser)
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
execFileSync('node', ['tools/build.mjs'], { cwd: root, stdio: 'inherit' });
execFileSync('node', ['web/build.mjs'], { cwd: root, stdio: 'inherit' });

const TYPES = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', json: 'application/json', musicxml: 'application/xml', mxl: 'application/octet-stream' };
const srv = createServer((q, r) => {
  const p = root + decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/, '');
  if (!p.startsWith(root) || !existsSync(p)) {
    r.writeHead(404);
    return r.end();
  }
  r.writeHead(200, { 'content-type': TYPES[p.split('.').pop()] ?? 'application/octet-stream' });
  r.end(readFileSync(p));
}).listen(0);
const url = `http://localhost:${srv.address().port}/web/index.html`;

const browser = await chromium.launch({
  executablePath: process.env.CHROME || (existsSync('/opt/pw-browsers/chromium') ? undefined : undefined),
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 1400 } });
const problems = [];
page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') problems.push(`console ${m.type()}: ${m.text()}`);
});
let failed = 0;
// every step in the page gets a time limit, so a promise that never settles fails the test instead of hanging it
const within = (ms, what, fn, arg) => Promise.race([page.evaluate(fn, arg), new Promise((_, no) => setTimeout(() => no(new Error(`${what}: no answer in ${ms / 1000} s`)), ms))]);
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failed++;
};

await page.goto(url);
await page.waitForFunction(() => window.demo && window.MyGameAudio);
console.log(`page: ${url} (engine ${await page.evaluate(() => MyGameAudio.VERSION)})`);

// 1. music starts within 2 seconds, from a cold cache
const t0 = Date.now();
await page.click('#play-chiptune');
await page.waitForFunction(() => {
  const p = window.demo.player;
  return p.cur && p.cur.t0 != null && p.ctx.currentTime >= p.cur.t0;
}, null, { timeout: 30000 });
const startMs = Date.now() - t0;
check(startMs <= 2000, `music sounding ${startMs} ms after Play (cold cache, streamed; limit 2000 ms)`);

// 2. the exact loop takes over, then the seams, rendered offline from the cache
await page.waitForFunction(() => window.demo.player.cur && !window.demo.player.cur.streaming, null, { timeout: 120000 });
console.log(`     the exact loop took over ${((Date.now() - t0) / 1000).toFixed(1)} s after Play`);
const seam = await within(90000, 'offline seam render', async () => {
  const A = window.MyGameAudio, song = window.demo.songs.chiptune;
  const t = A.cueTiming(song);
  const sr = 44100, lead = 0.05;
  const probe = await window.demo.player.prepare(song); // from the memory cache: no render
  const headDur = probe.head[probe.layers[0]].duration;
  const len = Math.ceil((lead + headDur + 2 * t.body + 0.5) * sr);
  const off = new OfflineAudioContext(2, len, sr);
  const p2 = A.createPlayer({ context: off, stream: false });
  const inst = await p2.music(song);
  const d = inst.d;
  const out = await off.startRendering();
  // the expected signal: every layer's head, then its loop from headLoopAt, then the loop again, from t0
  const L = new Float32Array(len), R = new Float32Array(len);
  const i0 = Math.round(inst.t0 * sr);
  for (const n of d.layers) {
    const h = d.head[n], l = d.loop[n];
    const hl = h.getChannelData(0), hr = h.getChannelData(1), ll = l.getChannelData(0), lr = l.getChannelData(1);
    let o = i0;
    for (let i = 0; i < hl.length && o + i < len; i++) { L[o + i] += hl[i]; R[o + i] += hr[i]; }
    o += hl.length;
    const j = Math.round(d.headLoopAt * sr);
    for (let k = j; o < len; k++, o++) {
      const q = k % ll.length;
      L[o] += ll[q];
      R[o] += lr[q];
    }
  }
  const gl = out.getChannelData(0), gr = out.getChannelData(1);
  const H = Math.round(headDur * sr), Lb = d.loop[d.layers[0]].length, Tw = Math.round(d.headLoopAt * sr);
  const seams = [i0 + H, i0 + H + Lb - Tw, i0 + H + 2 * Lb - Tw].filter((s) => s + 2000 < len);
  const res = [];
  for (const s of seams) {
    let maxDiff = 0, rms = 0, jump = 0, local = 0;
    for (let i = s - 2000; i < s + 2000; i++) {
      maxDiff = Math.max(maxDiff, Math.abs(gl[i] - L[i]), Math.abs(gr[i] - R[i]));
      rms += gl[i] * gl[i];
    }
    for (let i = s - 441; i < s + 441; i++) {
      const dj = Math.abs(gl[i] - gl[i - 1]);
      if (Math.abs(i - s) <= 1) jump = Math.max(jump, dj);
      else local = Math.max(local, dj);
    }
    res.push({ at: +(s / sr).toFixed(3), maxDiff, rms: Math.sqrt(rms / 4000), jumpRatio: jump / (local || 1e-9) });
  }
  return { seams: res, headDur, body: d.body, loops: Math.floor((len - i0 - H) / Lb), p2: p2.stats };
});
check(seam.p2.renders === 0 && seam.p2.cacheHits === 1, `a second player found the cue in IndexedDB (renders ${seam.p2.renders}, cache hits ${seam.p2.cacheHits})`);
check(seam.seams.length >= 2, `rendered offline: head ${seam.headDur.toFixed(2)} s, then the ${seam.body.toFixed(1)} s loop; ${seam.seams.length} seams`);
for (const s of seam.seams) {
  check(s.maxDiff < 1e-4 && s.rms > 0.01 && s.jumpRatio <= 1.5,
    `seam at ${s.at} s: output equals the stems end to end (largest difference ${s.maxDiff.toExponential(1)}), level ${(20 * Math.log10(s.rms)).toFixed(1)} dBFS (no gap), jump ${s.jumpRatio.toFixed(2)}x the largest nearby (no click)`);
}

// 3. layers, crossfade on a bar, section change on the next bar, stinger on a beat, callbacks
await page.fill('#layer-chiptune-drums', '0').catch(() => {});
await page.evaluate(() => window.demo.player.layer('drums', 0, 0.3));
await page.waitForTimeout(500);
const lay = await page.evaluate(() => ({ want: window.demo.player.layers().drums, now: window.demo.player.cur.layers.drums.gain.value }));
check(lay.want === 0 && lay.now < 0.01, `the drums layer faded out (gain ${lay.now.toFixed(3)})`);
await page.evaluate(() => window.demo.player.layer('drums', 1, 0.1));

const sting = await within(30000, 'stinger', async () => {
  const p = window.demo.player;
  const s = await p.sting('win', { at: 'beat' });
  const beat = 60 / 150, pos = s.at - p.cur.t0; // the chiptune's intro is whole bars, so beats count from t0
  const off = ((pos % beat) + beat) % beat;
  return { off: Math.min(off, beat - off), asked: s.at - p.ctx.currentTime };
});
check(sting.off < 1e-6, `the stinger starts on a beat (${sting.off.toExponential(1)} s off the grid)`);

// a small two-cue song made in the test: a cue change lands on the old cue's next bar line
const cueRes = await within(60000, 'cue change', async () => {
  const p = window.demo.player;
  const kit = { k: { type: 'kick', f0: 50, f1: 140, d: 0.25, pd: 0.03, gain: 0.8 } };
  const song = {
    title: 'Cue test', bpm: 120, meter: [4, 4], grid: 16, seed: 3, tail: 1,
    instruments: { sq: { type: 'chip', ch: 'pulse', duty: [2], vol: [12, 10, 8], release: [3, 1] }, dr: { type: 'drums', kit } },
    parts: { lead: { inst: 'sq' }, drums: { inst: 'dr' } },
    sections: {
      calm: { bars: 2, parts: { lead: '| C5:8 E5:8 | G5:8 E5:8 |', drums: '| k . . . . . . . k . . . . . . . |' } },
      fight: { bars: 2, parts: { lead: '| A5:4 A5:4 G5:4 E5:4 | D5:8 E5:8 |', drums: '| k . k . k . k . k . k . k . k . |' } },
    },
    loops: { calm: { body: ['calm'] }, fight: { body: ['fight'] } },
  };
  await p.prepare(song, 'calm');
  await p.prepare(song, 'fight');
  const before = p.cur;
  await p.music(song, { cue: 'calm', fade: 0.5, at: 'bar' }); // crossfades from the chiptune on its next bar
  const a = p.cur;
  const sinceChip = a.t0 - before.t0; // the chiptune's bars are 1.6 s, its intro two of them
  const crossOff = Math.abs(sinceChip / 1.6 - Math.round(sinceChip / 1.6)) * 1.6;
  // wait until the new song has played 0.7 s, then change cue: it must land on the next 2 s bar line
  while (p.ctx.currentTime < a.t0 + 0.7) await new Promise((r) => setTimeout(r, 20));
  const asked = p.ctx.currentTime;
  await p.cue('fight', { at: 'bar' });
  const b = p.cur;
  return { crossOk: a.song === song && before.stopped, crossOff, cueAt: b.t0, asked, sinceStart: b.t0 - a.t0, cue: b.cue };
});
check(cueRes.crossOk && cueRes.crossOff < 1e-6, `a second song crossfaded in on the first one's bar line (${cueRes.crossOff.toExponential(1)} s off)`);
check(cueRes.cue === 'fight' && Math.abs(cueRes.sinceStart - 2) < 1e-6 && cueRes.cueAt >= cueRes.asked,
  `the cue change landed on the next bar line (${cueRes.sinceStart.toFixed(3)} s after the cue began, 2 s bars)`);
await page.waitForTimeout(2500);
const beats = await page.evaluate(() => window.demo.log.slice(-5));
const gaps = beats.slice(1).map((b, i) => b.t - beats[i].t);
check(beats.length === 5 && gaps.every((g) => Math.abs(g - 500) < 80), `beat callbacks every ${gaps.map((g) => Math.round(g)).join(', ')} ms (120 BPM: 500)`);

// 5. sound effects and voices through their buses: offline players render exactly what the engine renders, at
// the bus's volume; muting the bus silences it
const buses = await within(60000, 'sfx and voice buses', async () => {
  const A = window.MyGameAudio, sr = 44100;
  const diff = (out, want, at, g) => {
    const i0 = Math.round(at * sr);
    let d = 0, e = 0;
    for (let c = 0; c < 2; c++) {
      const o = out.getChannelData(c), w = c ? want.R : want.L;
      for (let i = 0; i < w.length && i0 + i < o.length; i++) {
        d = Math.max(d, Math.abs(o[i0 + i] - w[i] * g));
        e = Math.max(e, Math.abs(o[i0 + i]));
      }
    }
    return { d, e };
  };
  const off1 = new OfflineAudioContext(2, sr, sr);
  const p1 = A.createPlayer({ context: off1 });
  p1.volume('sfx', 0.5);
  p1.sfx('coin');
  const coin = diff(await off1.startRendering(), A.renderSfx(A.SOUNDS.coin, { seed: 1 }), Math.ceil(0.005 * sr) / sr, 0.5);
  const off2 = new OfflineAudioContext(2, sr, sr);
  const p2 = A.createPlayer({ context: off2 });
  p2.mute('sfx', true);
  p2.sfx('explosion');
  const muted = diff(await off2.startRendering(), A.renderSfx(A.SOUNDS.explosion, { seed: 1 }), Math.ceil(0.005 * sr) / sr, 0);
  const off3 = new OfflineAudioContext(2, sr * 3, sr);
  const p3 = A.createPlayer({ context: off3 });
  await p3.say('Hello there!', 'villager');
  const voice = diff(await off3.startRendering(), A.speak('Hello there!', 'villager'), 0.02, 1);
  return { coin, muted, voice, sounds: Object.keys(A.SOUNDS).length };
});
check(buses.coin.d < 1e-5 && buses.coin.e > 0.05, `a sound effect plays through the sfx bus at its volume (0.5: largest difference ${buses.coin.d.toExponential(1)})`);
check(buses.muted.e === 0, 'muting the sfx bus silences it');
check(buses.voice.d < 1e-5 && buses.voice.e > 0.05, `a voice plays through the voice bus (largest difference ${buses.voice.d.toExponential(1)})`);

// the sound board and the dialog box: the music ducks while a character talks, the text follows the syllables
for (const n of ['coin', 'step_gravel', 'explosion', 'door_open', 'ui_confirm']) await page.click(`#sfx-${n}`);
await page.click('#sfx-amb_rain');
await page.waitForTimeout(300);
await page.click('#sfx-amb_rain');
await page.evaluate(() => window.demo.play('chiptune'));
await page.waitForTimeout(300);
const talk = await within(30000, 'dialog', async () => {
  const p = window.demo.player, text = 'Is that a sword? I sell the finest blades in town.';
  const v = await window.demo.say(text, 'merchant', 'happy');
  await new Promise((r) => setTimeout(r, 700));
  const during = p.bus('music').gain.value, partial = document.getElementById('dialog-text').textContent;
  await v.done;
  await new Promise((r) => setTimeout(r, 1500));
  return { during, after: p.bus('music').gain.value, partial, full: document.getElementById('dialog-text').textContent, text, syllables: v.syllables.length };
});
check(Math.abs(talk.during - 0.6) < 0.05 && talk.after > 0.95, `the music ducks to ${talk.during.toFixed(2)} while the merchant talks and returns to ${talk.after.toFixed(2)}`);
check(talk.partial.length > 0 && talk.partial.length < talk.text.length && talk.text.startsWith(talk.partial) && talk.full === talk.text,
  `the dialog box shows the line syllable by syllable (${talk.partial.length} of ${talk.text.length} characters after 0.7 s, then all; ${talk.syllables} syllables)`);
check(buses.sounds >= 40, `the sound board has ${buses.sounds} sounds`);

// 6. a MusicXML score dropped on the page plays, streamed, within seconds: read in the browser, no Python
const mxl = readFileSync(root + 'test/scores/Beethoven_Op.67_1.mxl');
const dt = await page.evaluateHandle(({ b64, name }) => {
  const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
  const d = new DataTransfer();
  d.items.add(new File([bytes], name, { type: 'application/vnd.recordare.musicxml' }));
  return d;
}, { b64: mxl.toString('base64'), name: 'Beethoven_Op.67_1.mxl' });
const dropT0 = Date.now();
await page.dispatchEvent('#drop', 'drop', { dataTransfer: dt });
await page.waitForFunction(() => window.demo.score && (window.demo.score.startMs != null || window.demo.score.error), null, { timeout: 60000 });
const drop = await page.evaluate(() => ({ ...window.demo.score, once: !!window.demo.player.cur?.once, status: document.getElementById('score-status').textContent }));
check(!drop.error && drop.report.bars === 626 && drop.report.parts.length === 18, `a dropped .mxl (Beethoven 5, I) was read in the browser in ${(drop.importMs / 1000).toFixed(2)} s: ${drop.report?.bars} bars, ${drop.report?.parts.length} parts${drop.error ? ' ERROR ' + drop.error : ''}`);
check(drop.once && drop.startMs <= 8000, `it sounded ${(drop.startMs / 1000).toFixed(2)} s after the drop, streamed (${((Date.now() - dropT0) / 1000).toFixed(1)} s wall clock)`);
await page.waitForTimeout(3000);
const still = await page.evaluate(() => ({ playing: window.demo.player.pos.playing, bar: window.demo.player.pos.bar, time: window.demo.player.pos.time }));
check(still.playing && still.time > 2, `three seconds later it is still playing: ${still.time.toFixed(1)} s in, bar ${still.bar + 1}`);

// 7. ABC and MIDI too: an ABC tune dropped on the page plays; a song saves as a MIDI file
const abc = `X:1\nT:Lantern Reel\nM:4/4\nL:1/8\nQ:1/4=110\nK:D\n|:"D"A2 FA dAFA|"G"B2 GB "D"AFDF|"Em"E2 EF GFEF|"A7"(3ABc ec dcBA:|\n`;
const dt2 = await page.evaluateHandle((text) => {
  const d = new DataTransfer();
  d.items.add(new File([text], 'reel.abc', { type: 'text/plain' }));
  return d;
}, abc);
await page.evaluate(() => { window.demo.score = null; });
await page.dispatchEvent('#drop', 'drop', { dataTransfer: dt2 });
await page.waitForFunction(() => window.demo.score && (window.demo.score.startMs != null || window.demo.score.error), null, { timeout: 30000 });
const tune = await page.evaluate(() => window.demo.score);
check(!tune.error && tune.format === 'abc' && tune.report.bars === 8, `a dropped ABC tune plays: ${tune.title}, ${tune.report?.bars} bars with its repeat, ${tune.report?.chordSymbols} chord symbols, sounding ${(tune.startMs / 1000).toFixed(2)} s after the drop${tune.error ? ' ERROR ' + tune.error : ''}`);
const midiBytes = await page.evaluate(async () => {
  const a = document.getElementById('midi-chiptune');
  a.click();
  const b = new Uint8Array(await (await fetch(a.href)).arrayBuffer());
  return [b.length, String.fromCharCode(...b.subarray(0, 4))];
});
check(midiBytes[1] === 'MThd' && midiBytes[0] > 1000, `"Save as MIDI" makes a Standard MIDI File (${midiBytes[0]} bytes)`);

// 4. render speed. A cue on one worker, then its parts across four (the same samples); then on a phone-class CPU:
// Chromium's 4x CPU slowdown (what Lighthouse uses for a mid-range phone), which slows the page's own thread, so that
// render runs there (workers: 0).
await page.evaluate(() => window.demo.player.stop({ fade: 0.05 }));
const cueOf = async (opts, name) => {
  return within(240000, `render speed (${name})`, async ({ o, n }) => {
    const A = window.MyGameAudio, song = window.demo.songs[n];
    const p = A.createPlayer({ cache: false, stream: false, ...o });
    const t = performance.now();
    const d = await p.prepare(song, 'main');
    const ms = performance.now() - t;
    // the decoded loop: an AudioBuffer per layer; its energy, summed in a fixed order, fingerprints the samples
    let sum = 0;
    for (const buf of Object.values(d.loop ?? {})) for (let c = 0; c < buf.numberOfChannels; c++) for (const x of buf.getChannelData(c)) sum += x * x;
    const secs = (d.body ?? d.meta?.body ?? 0) + (d.intro ?? d.meta?.intro ?? 0);
    p.dispose();
    return { ms: Math.round(ms), secs, energy: sum };
  }, { o: opts, n: name });
};
const one = await cueOf({ workers: 1, parallel: false }, 'orchestral');
const four = await cueOf({ workers: 4, parallel: true }, 'orchestral');
console.log(`     orchestral cue: ${one.ms} ms on one worker, ${four.ms} ms with its parts on four (${(one.ms / four.ms).toFixed(1)}x)`);
check(four.energy === one.energy && one.energy > 0, 'a cue rendered part by part on four workers equals the one-worker render');
const cdp = await page.context().newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
const phone = await cueOf({ workers: 0 }, 'chiptune');
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
const desk = await cueOf({ workers: 0 }, 'chiptune');
console.log(`     chiptune cue (${phone.secs.toFixed(1)} s of music) on this thread: ${desk.ms} ms here, ${phone.ms} ms at a 4x CPU slowdown (phone-class)`);
check(phone.ms > 2 * desk.ms, 'the CPU slowdown took effect');

// 5. no console errors
await page.evaluate(() => window.demo.player.stop({ fade: 0.2 }));
await page.waitForTimeout(400);
mkdirSync(root + 'out', { recursive: true });
await page.screenshot({ path: root + 'out/page.png', fullPage: true });
check(problems.length === 0, `no console errors or warnings${problems.length ? ': ' + problems.join(' | ') : ''}`);

await browser.close();
srv.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nall page checks passed');
process.exit(failed ? 1 : 0);
