// Voices: dialogue text to gibberish speech. Syllables follow the words, the pitch contour follows punctuation and
// emotion, characters differ in pitch, speed and formants, and every line renders cleanly and the same way twice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { speak, syllables, VOICES, EMOTIONS } from '../engine/voice.mjs';
import { sfxLoudness } from '../engine/sfx.mjs';
import { SR } from '../engine/dsp.mjs';

const LINE = 'Hello there, traveller! Is that a sword? I sell the finest blades in town.';

test('syllables: vowel groups with their consonants, word by word, with the punctuation after each word', () => {
  const s = syllables('Hello there, traveller! Is that a sword?');
  assert.deepEqual(s.map((x) => x.text), ['Hel', 'lo', 'there', 'tra', 'vel', 'ler', 'Is', 'that', 'a', 'sword']);
  assert.deepEqual(s.map((x) => x.vowel).join(''), 'eoeaeeiaao');
  assert.deepEqual(s.filter((x) => x.end).map((x) => `${x.text}${x.end}`), ['there,', 'ler!', 'sword?']);
  // every syllable points back at its letters in the text, in order, so a dialog box can reveal them
  const text = 'Hello there, traveller!';
  for (const x of syllables(text)) assert.equal(text.slice(x.from, x.to), x.text);
  assert.deepEqual(syllables('Hmm... 42 brrr').map((x) => x.text), ['Hmm', 'brrr']);
});

test('every character speaks a line cleanly: finite, below -1 dBFS, at the voice level', () => {
  for (const name of Object.keys(VOICES)) {
    const r = speak(LINE, name);
    let peak = 0, bad = 0;
    for (const x of r.L) {
      if (!Number.isFinite(x)) bad++;
      else peak = Math.max(peak, Math.abs(x));
    }
    assert.equal(bad, 0, name);
    assert.ok(peak <= Math.pow(10, -1 / 20) + 1e-6 && peak > 0.02, `${name}: peak ${(20 * Math.log10(peak)).toFixed(1)} dBFS`);
    const loud = sfxLoudness(r.L, r.R);
    assert.ok(loud <= -19 && loud >= -24, `${name}: loudness ${loud.toFixed(1)}`);
    assert.ok(r.seconds > 2 && r.seconds < 8, `${name}: ${r.seconds.toFixed(2)} s`);
  }
});

test('the same line, character and seed sound the same; another seed or text sounds different', () => {
  const a = speak(LINE, 'merchant'), b = speak(LINE, 'merchant');
  assert.deepEqual(a.L, b.L);
  const c = speak(LINE, 'merchant', { seed: 99 });
  assert.notDeepEqual(a.L.subarray(0, 20000), c.L.subarray(0, 20000));
});

// the pitch of each syllable, measured from the audio by autocorrelation in its middle
function pitchOf(r, s) {
  const mid = Math.round((s.t + s.dur * 0.55) * SR), w = 1024;
  let best = 0, lag = 0;
  for (let k = Math.round(SR / 900); k < Math.round(SR / 50); k++) {
    let c = 0, e1 = 0, e2 = 0;
    for (let i = 0; i < w; i++) {
      const x = r.L[mid + i], y = r.L[mid + i + k];
      c += x * y;
      e1 += x * x;
      e2 += y * y;
    }
    const v = c / Math.sqrt(e1 * e2 + 1e-12);
    if (v > best) {
      best = v;
      lag = k;
    }
  }
  return SR / lag;
}

test('punctuation shapes the pitch: a question rises at its end, a statement falls', () => {
  const q = speak('Is that your sword?', 'hero');
  const st = speak('That is your sword.', 'hero');
  const qp = q.syllables.map((s) => pitchOf(q, s)), sp = st.syllables.map((s) => pitchOf(st, s));
  assert.ok(qp.at(-1) > qp[0] * 1.08, `question: ${qp.map((f) => f.toFixed(0)).join(' ')} Hz`);
  assert.ok(sp.at(-1) < sp[0], `statement: ${sp.map((f) => f.toFixed(0)).join(' ')} Hz`);
});

test('characters differ: pitch follows the profile, speed sets the length', () => {
  const pitch = (name) => {
    const r = speak('Banana banana banana.', name);
    const ps = r.syllables.slice(0, 4).map((s) => pitchOf(r, s)).sort((a, b) => a - b);
    return (ps[1] + ps[2]) / 2;
  };
  const giant = pitch('giant'), hero = pitch('hero'), child = pitch('child');
  assert.ok(giant < hero && hero < child, `giant ${giant.toFixed(0)}, hero ${hero.toFixed(0)}, child ${child.toFixed(0)} Hz`);
  assert.ok(Math.abs(Math.log2(hero / VOICES.hero.pitch)) < 0.5, `the hero speaks near ${VOICES.hero.pitch} Hz: ${hero.toFixed(0)}`);
  assert.ok(speak(LINE, 'elder').seconds > speak(LINE, 'merchant').seconds * 1.3, 'the elder speaks slower than the merchant');
  // Animalese characters blip once per letter
  const letters = LINE.replace(/[^a-z]/gi, '').length;
  assert.equal(speak(LINE, 'critter').syllables.length, letters);
});

test('emotions: happy is higher, sad is lower and slower, scared is faster', () => {
  const base = speak(LINE, 'villager');
  const mean = (r) => r.syllables.reduce((a, s) => a + s.semis, 0) / r.syllables.length;
  const happy = speak(LINE, 'villager', { emotion: 'happy' }), sad = speak(LINE, 'villager', { emotion: 'sad' });
  assert.ok(mean(happy) > mean(base) && mean(sad) < mean(base));
  assert.ok(sad.seconds > base.seconds * 1.15, `sad ${sad.seconds.toFixed(2)} s against ${base.seconds.toFixed(2)} s`);
  assert.ok(speak(LINE, 'villager', { emotion: 'scared' }).seconds < base.seconds);
  assert.deepEqual(Object.keys(EMOTIONS), ['neutral', 'happy', 'sad', 'angry', 'scared', 'surprised']);
  assert.throws(() => speak('Hi', 'dragon'), /no voice "dragon"/);
});

test('a custom profile: any object with the fields of VOICES', () => {
  const r = speak('Greetings, mortal.', { pitch: 95, speed: 7, size: 0.8, voice: 'bass', breath: 0.2, buzz: 0.8 });
  assert.deepEqual(r.syllables.map((s) => s.text), ['Gree', 'tings', 'mor', 'tal']);
  assert.ok(r.seconds > 0.6);
});
