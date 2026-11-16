// Notation the Python importer leaves out, each with its own score in test/scores/notation/ (made by
// tools/make_notation_scores.mjs): shared percussion staves, harmonics, glissandi, ornaments and arpeggio marks,
// "a 2" and "1." in shared staves, breath marks and caesuras, cue notes against small print, fermatas that hold
// only their note, and the optional expression model. Compat mode (compat: true) leaves all of it out, as the
// Python importer does; the last test lists how the default differs from it on Beethoven's Fifth.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { importMusicXML } from '../engine/musicxml.mjs';
import { arrange, midiToName } from '../engine/score.mjs';

const score = (n) => readFileSync(new URL(`./scores/notation/${n}.musicxml`, import.meta.url));
const imp = async (n, o = {}) => (await importMusicXML(score(n), o)).song;
const sec = (song) => Object.values(song.sections)[0];
const still = (song) => ({ ...song, parts: Object.fromEntries(Object.entries(song.parts).map(([k, p]) => [k, { ...p, humanize: 0 }])) });

test('a shared percussion staff: each note plays its own instrument (by name, or by its General MIDI number)', async () => {
  assert.equal(sec(await imp('percussion')).parts.perc, '| bd sd cym tri |');
  assert.equal(sec(await imp('percussion', { compat: true })).parts.perc, '| sd sd sd sd |', 'compat: one instrument for the staff');
});

test('harmonics: a natural one plays as written, an artificial one two octaves over its stopped note; both marked *', async () => {
  assert.equal(sec(await imp('harmonics')).parts.vn, '| E5:2* A6:2* |');
  assert.equal(sec(await imp('harmonics', { compat: true })).parts.vn, '| E5:2 [A4 D5]:2 |');
});

test('glissandi: a harp runs the white keys, a violin slides chromatically, in the time of the first note', async () => {
  const s = sec(await imp('glissando'));
  assert.equal(s.parts.hp, '| C4:2 D4:2_ E4:2_ F4:2_ G4:2_ A4:2_ B4:4_ C5:16 |');
  assert.equal(s.parts.vn, '| A4 Bb4_ B4_ C5_ C#5_ D5_ Eb5:2_ E5:8 E5:16 |');
});

test('ornaments on the key\'s neighbours: mordent, inverted mordent, turn; an arpeggio mark rolls its chord (&)', async () => {
  const song = await imp('ornaments');
  const s = sec(song);
  assert.equal(s.parts.fl, '| B4 A4_ B4:6_ G4 A4_ G4:6_ F#5 E5_ D5_ E5:13_ |', 'G major: the turn above E is F sharp');
  assert.equal(s.parts.hp, '| [C4 E4 G4 C5]:32& |');
  // the rolled chord: each note 35 ms after the one below, all ending together
  const hp = arrange(still(song)).parts.hp.events.sort((a, b) => a.midi - b.midi);
  assert.deepEqual(hp.map((e) => +(e.t * 1000).toFixed(1)), [0, 35, 70, 105]);
  assert.ok(Math.abs(hp[0].t + hp[0].dur - (hp[3].t + hp[3].dur)) < 1e-9);
});

test('two flutes on one staff: a chord splits, "a 2" doubles, "1." and "2." each play alone', async () => {
  const song = await imp('a2');
  assert.deepEqual(sec(song).parts, { fl: '| G5 D5 C5 . |', fl_2: '| E5 D5 . B4 |' });
  assert.ok(song.parts.fl_2.pan !== song.parts.fl.pan, 'the second player sits beside the first');
  assert.deepEqual(sec(await imp('a2', { compat: true })).parts, { fl: '| [E5 G5] D5 C5 B4 |' });
});

test('a breath mark takes the end of its note; a caesura also stops the music there (a hold)', async () => {
  const song = await imp('breath');
  const s = sec(song);
  assert.equal(s.parts.ob, '| C5:6 .:2 D5:3 . E5:4 |');
  assert.equal(s.hold, '| 11:1*3 |');
  const ev = arrange(still(song)).parts.ob.events;
  // at 60 BPM: the caesura's sixteenth-note gap lasts three sixteenths, so E5 comes 0.5 s later than written
  assert.deepEqual(ev.map((e) => +e.t.toFixed(4)), [0, 2, 3.5]);
});

test('cue notes are not played; small-printed notes are', async () => {
  assert.deepEqual(Object.values((await imp('cue')).sections).map((s) => s.parts.cl).join(' '), '| C5:4 | .:4 | D5:2 E5:2 |');
  assert.deepEqual(Object.values((await imp('cue', { compat: true })).sections).map((s) => s.parts.cl).join(' '), '| C5:4 | G5:2 A5:2 | D5:2 E5:2 |');
});

test('a fermata holds its own note (and what sounds with it), not its whole bar', async () => {
  const song = await imp('fermata');
  const s = sec(song);
  assert.equal(s.hold, '| 3:1*2 | - |');
  assert.equal(s.tempo, '| 60 | 60 |');
  const arr = arrange(still(song));
  const vn = arr.parts.vn.events;
  assert.deepEqual(vn.map((e) => +e.t.toFixed(4)), [0, 1, 2, 3, 5], 'F5 is held for two beats; G5 comes after it');
  assert.equal(+arr.parts.vc.events[0].dur.toFixed(4), 5, 'the cello\'s whole note lasts through the hold');
  const compat = await imp('fermata', { compat: true });
  assert.equal(sec(compat).tempo, '| 30 | 60 |', 'compat: the bar is played at half tempo');
});

test('hold lines in the score: steps stretched, bars longer, every later note later', () => {
  const song = {
    bpm: 60, meter: [4, 4], grid: 4, instruments: { s: { type: 'va' } }, parts: { a: { inst: 's' } },
    sections: { A: { bars: 2, hold: '| 1:2*1.5 | - |', parts: { a: '| C4 D4 E4 F4 | G4:4 |' } } }, form: ['A'],
  };
  const arr = arrange(song);
  assert.deepEqual(arr.errors, []);
  assert.deepEqual(arr.parts.a.events.map((e) => e.t), [0, 1, 2.5, 4, 5]);
  assert.equal(arr.duration, 9);
  assert.match(arrange({ ...song, sections: { A: { ...song.sections.A, hold: '| 1:2x2 | - |' } } }, { strict: true }).errors[0], /can't read "1:2x2"/);
  assert.match(arrange({ ...song, sections: { A: { ...song.sections.A, hold: '| - |' } } }, { strict: true }).errors[0], /hold: 1 bars, section has 2/);
});

test('the expression model (an option): phrase rubato and agogic accents', async () => {
  const fx = readFileSync(new URL('./scores/features.musicxml', import.meta.url));
  const plain = (await importMusicXML(fx)).song, expr = (await importMusicXML(fx, { expression: true })).song;
  const tempos = (s) => s.form.map((n) => s.sections[n].tempo).join(' ');
  assert.notEqual(tempos(expr), tempos(plain));
  assert.match(tempos(expr), /122\.4/, 'the second bar of a phrase moves on (2%)');
  const holds = Object.values(expr.sections).map((s) => s.hold ?? '').join(' ');
  assert.match(holds, /\*1\.12/, 'the phrase\'s highest note is held 12% longer');
  assert.ok(arrange(expr).duration > arrange(plain).duration);
});

test('Beethoven 5, I: the default import differs from compat (the Python importer) only at its fermatas', async () => {
  const b = readFileSync(new URL('./scores/Beethoven_Op.67_1.mxl', import.meta.url));
  const d = (await importMusicXML(b)).song, c = (await importMusicXML(b, { compat: true })).song;
  // bar by bar: the notes are the same; tempo and holds differ only in bars whose fermatas compat slows down
  const perBar = (song) => song.form.flatMap((n) => {
    const s = song.sections[n];
    const cells = (line) => (line ?? '').split('|').map((x) => x.trim()).filter((x, i, a) => i > 0 && i < a.length - 1);
    return Array.from({ length: s.bars }, (_, k) => ({
      notes: Object.fromEntries(Object.entries(s.parts).map(([p, l]) => [p, cells(l)[k]])),
      tempo: cells(s.tempo)[k], hold: s.hold ? cells(s.hold)[k] : '-',
    }));
  });
  const A = perBar(d), B = perBar(c);
  assert.equal(A.length, 626);
  assert.equal(B.length, 626);
  let differ = 0;
  for (let k = 0; k < A.length; k++) {
    assert.deepEqual(A[k].notes, B[k].notes, `bar ${k + 1}: the notes differ`);
    const held = A[k].hold !== '-';
    if (A[k].tempo !== B[k].tempo) {
      differ++;
      assert.ok(held && +B[k].tempo === +A[k].tempo / 2, `bar ${k + 1}: tempo ${A[k].tempo} against ${B[k].tempo}, hold ${A[k].hold}`);
    } else assert.ok(!held, `bar ${k + 1}: a hold (${A[k].hold}) where compat keeps the tempo`);
  }
  assert.ok(differ >= 10, `${differ} bars with fermatas`);
});

test('pedal marks: a pedal line; a key let go with a change is damped, a held one rings to the next change', async () => {
  const song = await imp('pedal');
  assert.equal(sec(song).pedal, '| P:2 P:2 | .:2 U:2 |');
  assert.equal(sec(await imp('pedal', { compat: true })).pedal, undefined, 'compat: no pedal');
  const arr = arrange(still(song));
  assert.deepEqual(arr.pedal.map((p) => `${p.type}@${p.t}`), ['P@0', 'P@2', 'U@6']);
  // at 60 BPM: C4 (released at 1) rings to the change at 2; E4, let go with the change, stops at once; G4 and C5 ring
  // to the lift at 6
  assert.deepEqual([1, 2, 3, 4].map((t) => arr.damperAt(t)), [2, 2, 6, 6]);
});

test('playing techniques from words and marks: sul pont., spiccato, col legno and ord. on strings, flz. on a flute', async () => {
  const s = sec(await imp('techniques'));
  assert.equal(s.parts.vn, '| A4%pont B4^%spicc C5%legno D5 |');
  assert.equal(s.parts.fl, '| A5:2%flz G5:2 |');
  assert.deepEqual(sec(await imp('techniques', { compat: true })).parts, { vn: '| A4 B4^ C5 D5 |', fl: '| A5:2 G5:2 |' });
});
