// voice.mjs: characters that speak gibberish (Animalese / Simlish style) from their dialogue. The text is split
// into syllables; each becomes a short formant-voiced blip on the syllable's vowel, with a burst or hiss for its
// consonants, on a pitch contour shaped by punctuation and emotion. Nothing is recorded: a glottal-like source
// through the vowel formants of fx.mjs, moved by the character's size.
//
//   const v = speak('Hello there! Is that a sword?', 'villager', { emotion: 'happy' });
//   v.L, v.R, v.seconds, v.syllables  // [{ t, dur, text, from, to }]: when each syllable sounds, and its letters
//
// The same text, character and seed always say it the same way; the seed defaults to a hash of the text.
import { SR, TAU, rng, hash, db, clamp, Saw, Biquad, OnePole, SVF, svfG } from './dsp.mjs';
import { FORMANTS } from './fx.mjs';
import { sfxLoudness } from './sfx.mjs';

/**
 * Character profiles. pitch: the speaking pitch (Hz); speed: syllables per second; size: formant scale (smaller
 * creatures have higher formants, above 1); range: semitones of pitch movement; voice: the formant table (soprano
 * alto tenor bass); breath: aspiration noise; buzz: the source's brightness (0..1); shake: vibrato depth
 * (semitones, an old or frightened voice); style: 'simlish' (syllables with consonants) or 'animalese' (one quick
 * blip per letter).
 */
export const VOICES = {
  villager: { pitch: 210, speed: 9, size: 1.05, range: 4, voice: 'alto', breath: 0.05, buzz: 0.6 },
  hero: { pitch: 140, speed: 8.5, size: 0.95, range: 3, voice: 'tenor', breath: 0.04, buzz: 0.55 },
  heroine: { pitch: 240, speed: 9, size: 1.08, range: 4, voice: 'soprano', breath: 0.05, buzz: 0.55 },
  child: { pitch: 320, speed: 10.5, size: 1.25, range: 6, voice: 'soprano', breath: 0.06, buzz: 0.5 },
  elder: { pitch: 150, speed: 6.5, size: 0.95, range: 3, voice: 'tenor', breath: 0.12, buzz: 0.4, shake: 0.35 },
  merchant: { pitch: 170, speed: 11, size: 1.0, range: 5, voice: 'tenor', breath: 0.04, buzz: 0.65 },
  giant: { pitch: 72, speed: 5.5, size: 0.72, range: 3, voice: 'bass', breath: 0.05, buzz: 0.7 },
  fairy: { pitch: 620, speed: 14, size: 1.5, range: 7, voice: 'soprano', breath: 0.08, buzz: 0.35, style: 'animalese' },
  critter: { pitch: 420, speed: 18, size: 1.35, range: 6, voice: 'soprano', breath: 0.03, buzz: 0.6, style: 'animalese' },
  robot: { pitch: 120, speed: 9, size: 1.0, range: 0, voice: 'tenor', breath: 0, buzz: 1, square: true },
  monster: { pitch: 62, speed: 6, size: 0.68, range: 4, voice: 'bass', breath: 0.15, buzz: 0.85, growl: 0.5 },
  ghost: { pitch: 260, speed: 6, size: 1.1, range: 5, voice: 'alto', breath: 0.35, buzz: 0.2, shake: 0.6 },
};

/** Emotions: pitch shift (semitones), range multiplier, speed multiplier, loudness (dB), brightness, tremolo. */
export const EMOTIONS = {
  neutral: { shift: 0, range: 1, speed: 1, gain: 0, bright: 0 },
  happy: { shift: 2.5, range: 1.4, speed: 1.08, gain: 1, bright: 0.1 },
  sad: { shift: -3, range: 0.5, speed: 0.78, gain: -3, bright: -0.2, fall: 2 },
  angry: { shift: 1, range: 1.2, speed: 1.15, gain: 3, bright: 0.3 },
  scared: { shift: 4, range: 1.3, speed: 1.25, gain: -1, bright: 0, tremolo: 9 },
  surprised: { shift: 4, range: 1.6, speed: 1, gain: 2, bright: 0.15 },
};

const VOWELS = 'aeiouy';
const isV = (c) => VOWELS.includes(c);
// the vowel a syllable sings: the first letter of its nucleus, with y as i; digraphs lean to their sound
function vowelOf(nuc) {
  const n = nuc.toLowerCase();
  if (/^(oo|ou|ue)/.test(n)) return 'u';
  if (/^(ee|ea|ie|ey)/.test(n)) return 'i';
  if (/^(ai|ay|ei)/.test(n)) return 'e';
  if (/^(oa|ow)/.test(n)) return 'o';
  const c = n[0];
  return c === 'y' ? 'i' : 'aeiou'.includes(c) ? c : 'a';
}

/**
 * Split text into syllables: [{ text, from, to, vowel, onset, coda, word, end }]. `end` marks punctuation after the
 * syllable's word ('.', '?', '!', ',', or '' within a sentence). Digits and symbols are skipped; a word with no vowel
 * is one syllable on 'a'.
 */
export function syllables(text) {
  const out = [];
  const re = /[A-Za-zÀ-ÿ']+|[.?!,;:…]+/g;
  let m, word = 0;
  while ((m = re.exec(text))) {
    const tok = m[0];
    if (/^[.?!,;:…]+$/.test(tok)) {
      if (out.length) out[out.length - 1].end = tok.includes('?') ? '?' : tok.includes('!') ? '!' : tok.includes('.') || tok.includes('…') ? '.' : ',';
      continue;
    }
    const w = tok.replace(/'/g, '');
    const lower = w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const groups = lower.match(/[aeiouy]+|[^aeiouy]+/g) ?? [lower];
    // each vowel group is a nucleus: it takes the last consonant before it as its onset (the first syllable takes
    // them all), and the last syllable keeps the trailing consonants
    const nuclei = [];
    let pos = 0;
    groups.forEach((g, gi) => {
      if (isV(g[0])) nuclei.push({ gi, from: pos, to: pos + g.length });
      pos += g.length;
    });
    // a final silent e after one consonant (there, time, blade) belongs to the syllable before it
    const lastG = groups[groups.length - 1];
    if (nuclei.length > 1 && lastG === 'e' && lower.length > 3 && (groups[groups.length - 2] ?? '').length === 1) nuclei.pop();
    if (!nuclei.length) {
      out.push({ text: w, from: m.index, to: m.index + tok.length, vowel: 'a', onset: lower, coda: '', word, end: '' });
      word++;
      continue;
    }
    let starts = nuclei.map((n, k) => {
      if (k === 0) return 0;
      const prev = groups[n.gi - 1] ?? '';
      return n.from - Math.min(prev.length, prev.length > 1 ? 1 : prev.length);
    });
    starts = starts.map((s, k) => (k > 0 && s < nuclei[k - 1].to ? nuclei[k - 1].to : s));
    nuclei.forEach((n, k) => {
      const a = starts[k], b = k + 1 < nuclei.length ? starts[k + 1] : lower.length;
      out.push({
        text: tok.slice(a, b), from: m.index + a, to: m.index + (k + 1 < nuclei.length ? b : tok.length),
        vowel: vowelOf(lower.slice(n.from, n.to)), onset: lower.slice(a, n.from), coda: lower.slice(n.to, b), word, end: '',
      });
    });
    word++;
  }
  return out;
}

const PLOSIVE = { p: 900, b: 700, t: 4200, d: 3200, k: 2200, g: 1800, c: 2200, q: 2000 };
const FRICATIVE = { s: [5500, 0.5], z: [5000, 0.4], f: [3500, 0.25], v: [3000, 0.2], h: [1800, 0.3], x: [4500, 0.45], j: [3800, 0.35], c: [5000, 0.4] };

/**
 * Speak `text` as a character: a name from VOICES or a profile object (fields as in VOICES). Options: emotion (a
 * name from EMOTIONS), seed, level (loudness, default -20), pan. Returns { L, R, seconds, syllables }.
 */
export function speak(text, character = 'villager', { emotion = 'neutral', seed, level = -20, pan = 0 } = {}) {
  const V = { ...VOICES.villager, ...(typeof character === 'string' ? VOICES[character] : character) };
  if (typeof character === 'string' && !VOICES[character]) throw new Error(`speak: no voice "${character}" (voices: ${Object.keys(VOICES).join(', ')})`);
  const E = EMOTIONS[emotion] ?? EMOTIONS.neutral;
  const r = rng(seed ?? hash(text + '\u0000' + JSON.stringify(V)));
  const sy = syllables(text);
  const animalese = V.style === 'animalese';
  // in Animalese every letter is its own quick blip
  const units = animalese
    ? sy.flatMap((s) => [...s.text].filter((c) => /[a-z]/i.test(c)).map((c, k, all) => ({ ...s, text: c, from: s.from + s.text.indexOf(c), to: s.from + s.text.indexOf(c) + 1, vowel: isV(c.toLowerCase()) ? vowelOf(c) : s.vowel, onset: isV(c.toLowerCase()) ? '' : c.toLowerCase(), coda: '', end: k === all.length - 1 ? s.end : '' })))
    : sy;
  const speed = V.speed * E.speed;
  const dur0 = 1 / speed;
  // the timeline: syllable starts, with pauses at word ends, commas and sentence ends
  let t = 0.03;
  const plan = [];
  let sentenceStart = 0;
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    const d = dur0 * (animalese ? 0.55 : 0.8 + 0.12 * Math.min(4, u.onset.length + u.coda.length)) * (0.9 + 0.2 * r());
    plan.push({ u, t, dur: d, sentenceStart });
    t += d;
    const next = units[i + 1];
    if (u.end === ',') t += 0.16 / E.speed;
    else if (u.end) {
      t += 0.32 / E.speed;
      sentenceStart = plan.length;
    } else if (next && next.word !== u.word) t += (animalese ? 0.02 : 0.045) / E.speed;
  }
  // pitch: a random walk around the character's pitch, falling through each sentence, shaped by its end
  const sentences = [];
  for (let i = 0; i < plan.length; i++) (sentences[plan[i].sentenceStart] ??= []).push(i);
  const range = V.range * E.range;
  for (const idx of Object.values(sentences)) {
    const end = plan[idx[idx.length - 1]].u.end;
    idx.forEach((i, k) => {
      const x = idx.length > 1 ? k / (idx.length - 1) : 1;
      let st = E.shift + (r() * 2 - 1) * range * 0.5 - (1.5 + (E.fall ?? 0)) * x;
      if (end === '?' && k >= idx.length - 2) st += range * (k === idx.length - 1 ? 1.4 : 0.6);
      if (end === '!') st += 1.5 + (k === 0 ? 1 : 0);
      if (end === '.' && k === idx.length - 1) st -= 2;
      plan[i].semis = st;
      plan[i].glide = end === '?' && k === idx.length - 1 ? 3 : end === '.' && k === idx.length - 1 ? -2 : (r() - 0.5) * 1.5;
    });
  }
  const N = Math.ceil((t + 0.25) * SR);
  const y = new Float64Array(N);
  const bright = clamp((V.buzz ?? 0.6) + (E.bright ?? 0), 0.05, 1);
  const shift = V.size;
  const table = FORMANTS[V.voice] ?? FORMANTS.alto;
  for (const p of plan) {
    const { u } = p;
    const f0 = V.pitch * Math.pow(2, (p.semis ?? 0) / 12);
    const i0 = Math.round(p.t * SR);
    // the consonant: a plosive is a short silence then a burst; a fricative is a hiss; others voice through
    let voiceAt = 0;
    const c = u.onset.slice(-1);
    if (PLOSIVE[c]) {
      const bp = new Biquad('bp', PLOSIVE[c] * Math.sqrt(shift), 1.2);
      const n = Math.round(0.012 * SR), gap = Math.round(0.008 * SR);
      for (let i = 0; i < n; i++) y[i0 + gap + i] += bp.tick(r() * 2 - 1) * 0.5 * Math.exp(-i / (0.003 * SR));
      voiceAt = gap + Math.round(0.006 * SR);
    } else if (FRICATIVE[c] || u.onset.includes('sh') || u.onset.includes('ch') || u.onset.includes('th')) {
      const [fc, g] = u.onset.includes('sh') || u.onset.includes('ch') ? [3200, 0.45] : u.onset.includes('th') ? [4500, 0.2] : FRICATIVE[c];
      const hp = new Biquad(c === 'h' ? 'bp' : 'hp', fc * Math.sqrt(shift), 0.8);
      const n = Math.round(Math.min(0.06, p.dur * 0.4) * SR);
      for (let i = 0; i < n; i++) y[i0 + i] += hp.tick(r() * 2 - 1) * g * Math.sin((Math.PI * i) / n);
      voiceAt = Math.round(n * 0.6);
    }
    // the vowel: a buzzy source, its pitch gliding, through the vowel's formants moved by the character's size
    const n = Math.round(p.dur * SR) - voiceAt;
    if (n <= 0) continue;
    const src = new Saw(r());
    const sq = new Saw(r() * 0.5);
    const tilt = new OnePole(Math.min(12000, f0 * (4 + 30 * bright)));
    const forms = table[u.vowel].slice(0, 4).map(([f, g, bw]) => ({ bq: new Biquad('bp', clamp(f * shift, 120, 9000), (f * shift) / (bw * Math.max(0.7, shift))), g: db(g) }));
    const breath = new SVF();
    const att = Math.round(0.012 * SR), rel = Math.round(Math.min(0.04, p.dur * 0.35) * SR);
    let vph = r() * TAU, tph = 0;
    for (let i = 0; i < n; i++) {
      const tt = i / SR;
      const x01 = i / n;
      vph += (TAU * 5.5) / SR;
      tph += (TAU * (E.tremolo ?? 0)) / SR;
      const vib = (V.shake ?? 0) * Math.sin(vph);
      const f = f0 * Math.pow(2, ((p.glide ?? 0) * x01 + vib) / 12);
      let s = V.square ? (src.next(f / SR) > 0 ? 0.8 : -0.8) : src.next(f / SR);
      if (V.growl) s += V.growl * sq.next((f * 0.5) / SR) * (0.6 + 0.4 * Math.sin(TAU * 31 * tt));
      s = tilt.lp(s);
      breath.tick(r() * 2 - 1, svfG(2500 * shift), 0.7);
      s += breath.bp * (V.breath ?? 0) * 6;
      let out = 0;
      for (const fm of forms) out += fm.bq.tick(s) * fm.g;
      const env = Math.min(1, i / att) * Math.min(1, (n - i) / rel) * (E.tremolo ? 0.75 + 0.25 * Math.sin(tph) : 1);
      const k = i0 + voiceAt + i;
      if (k < N) y[k] += out * env;
    }
  }
  // level: brought to the voice level, peaks kept under -1 dBFS
  const L = new Float32Array(N), R = new Float32Array(N);
  const gl = Math.cos(((clamp(pan, -1, 1) + 1) * Math.PI) / 4), gr = Math.sin(((clamp(pan, -1, 1) + 1) * Math.PI) / 4);
  for (let i = 0; i < N; i++) {
    L[i] = y[i] * gl;
    R[i] = y[i] * gr;
  }
  const cur = sfxLoudness(L, R);
  let g = cur > -90 ? db(level + (E.gain ?? 0) - cur) : 1;
  let peak = 0;
  for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  if (peak * g > db(-1)) g = db(-1) / peak;
  for (let i = 0; i < N; i++) {
    L[i] *= g;
    R[i] *= g;
  }
  return {
    L, R, seconds: N / SR,
    syllables: plan.map((p) => ({ t: p.t, dur: p.dur, text: p.u.text, from: p.u.from, to: p.u.to, semis: p.semis })),
  };
}
