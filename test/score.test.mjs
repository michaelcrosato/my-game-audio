// The text score format: the parser's errors, chord symbols, generators and the critic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseLine, parseChord, parseChords, noteToMidi, midiToName, voiceLead, padLine, arpLine, bassLine, repeat, transposeLine, critic, arrange,
} from '../engine/score.mjs';

test('note names and MIDI numbers', () => {
  assert.equal(noteToMidi('C4'), 60);
  assert.equal(noteToMidi('A4'), 69);
  assert.equal(noteToMidi('F#3'), 54);
  assert.equal(noteToMidi('Bb2'), 46);
  assert.equal(noteToMidi('Cb4'), 59);
  assert.equal(noteToMidi('B#3'), 60);
  assert.equal(noteToMidi('C-1'), 0);
  assert.equal(noteToMidi('H4'), null);
  assert.equal(noteToMidi('C'), null);
  assert.equal(midiToName(61), 'C#4');
  assert.equal(midiToName(70), 'Bb4');
  for (let m = 12; m < 120; m++) assert.equal(noteToMidi(midiToName(m)), m);
});

test('a line parses into events with step positions, lengths and articulations', () => {
  const r = parseLine('| C4:4 [E4 G4]:4 .:4 D4:2! -:2 |');
  assert.deepEqual(r.errors, []);
  assert.equal(r.bars, 1);
  assert.equal(r.events.length, 3);
  assert.deepEqual(r.events.map((e) => [e.step, e.steps, e.notes]), [[0, 4, [60]], [4, 4, [64, 67]], [12, 4, [62]]]);
  assert.equal(r.events[2].vel, 1, 'an accent plays at full velocity');
  const g = parseLine('| C4:8? D4:4^ E4:4_ |');
  assert.deepEqual(g.events.map((e) => e.art), ['?', '^', '_']);
  assert.ok(g.events[0].vel < 0.5, 'a ghost note is soft');
});

test('grace notes, vowels and comments', () => {
  const r = parseLine('| {G#4 A4}B4:8 C5:8@o | # a comment\n');
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.events[0].grace, [68, 69]);
  assert.equal(r.events[1].vowel, 'o');
  const sharp = parseLine('| F#5:16 |');
  assert.deepEqual(sharp.errors, [], 'a sharp is not a comment');
  assert.equal(sharp.events[0].notes[0], 78);
});

test('the parser reports every error with its bar, instead of throwing', () => {
  const short = parseLine('| C4:4 D4:4 | E4:16 |', { where: 'A.lead' });
  assert.equal(short.errors.length, 1);
  assert.match(short.errors[0], /^A\.lead bar 1: 8 steps, expected 16 \(missing 8\)/);
  const long = parseLine('| C4:12 D4:8 |', { where: 'A.lead' });
  assert.match(long.errors[0], /bar 1: 20 steps, expected 16 \(4 too many\)/);
  assert.match(parseLine('| C4:8 Q4:8 |').errors[0], /bar 1: can't read "Q4:8"|bad note/);
  assert.match(parseLine('| [C4 X9]:16 |').errors[0], /bad note in "\[C4 X9\]:16"/);
  assert.match(parseLine('| .:4 -:12 |').errors[0], /"-" with no note before it/);
  assert.match(parseLine('C4:16 D4:16').errors[0], /32 steps with no bar lines/);
  assert.match(parseLine('| {X9}C4:16 |').errors[0], /bad grace notes/);
  const many = parseLine('| C4:4 | D4:4 | E4:16 |');
  assert.equal(many.errors.length, 2, 'both short bars are reported');
});

test('a line may start by holding a note over from the section before', () => {
  const r = parseLine('| -:4 C4:12 |');
  assert.deepEqual(r.errors, []);
  assert.equal(r.lead, 4);
});

test('other grids: 12 steps for 3/4 in sixteenths', () => {
  assert.deepEqual(parseLine('| C4:4 D4:4 E4:4 |', { spb: 12 }).errors, []);
  assert.equal(parseLine('| C4:4 D4:4 E4:4 |').errors.length, 1);
});

test('drum lines take kit tokens', () => {
  const r = parseLine('| k . h . s . h . k . h k s . h . |', { drum: true });
  assert.deepEqual(r.errors, []);
  assert.equal(r.events.map((e) => e.notes[0]).join(''), 'khshkhksh');
});

test('chord symbols', () => {
  assert.deepEqual(parseChord('Am').tones, [9, 0, 4]);
  assert.deepEqual(parseChord('G7').tones, [7, 11, 2, 5]);
  assert.equal(parseChord('C/E').bass, 4);
  assert.deepEqual(parseChord('Bbmaj7').tones, [10, 2, 5, 9]);
  assert.equal(parseChord('Hm'), null);
  assert.equal(parseChord('Cfoo'), null);
  const c = parseChords('| Dm | Bb F | Gm | A7 |');
  assert.deepEqual(c.errors, []);
  assert.equal(c.bars, 4);
  assert.deepEqual(c.chords.map((x) => [x.step, x.steps]), [[0, 16], [16, 8], [24, 8], [32, 16], [48, 16]]);
  assert.match(parseChords('| Dm | Xq |').errors[0], /bar 2: unknown chord "Xq"/);
});

test('generators write lines that parse cleanly and follow the chords', () => {
  const chords = '| Dm | Bb | Gm | A |';
  for (const line of [padLine(chords), arpLine(chords, { lo: 'D3', hi: 'D5', rate: 2 }), bassLine(chords, { rhythm: 'x.x.o.5.' })]) {
    const r = parseLine(line);
    assert.deepEqual(r.errors, [], line);
    assert.equal(r.bars, 4);
  }
  const vl = voiceLead(chords, { lo: 'C3', hi: 'C5', notes: 4 });
  for (const v of vl) for (const n of v.notes) assert.ok(v.chord.tones.includes(n % 12), `${midiToName(n)} is in ${v.chord.sym}`);
  // voice leading keeps the voices close: no voice jumps more than a fifth between neighbouring chords
  for (let i = 1; i < vl.length; i++) for (let k = 0; k < 4; k++) assert.ok(Math.abs(vl[i].notes[k] - vl[i - 1].notes[k]) <= 7);
  assert.equal(repeat('| C4:16 |', 3), '| C4:16 | C4:16 | C4:16 |');
  assert.equal(transposeLine('| C4:8 [E4 G4]:8 |', 2), '| D4:8 [F#4 A4]:8 |');
});

const tiny = (over = {}) => ({
  bpm: 120, meter: [4, 4], grid: 16, seed: 1,
  instruments: { v: { type: 'va', rangeName: 'violin' }, b: { type: 'va' } },
  parts: { lead: { inst: 'v', role: 'melody' }, bass: { inst: 'b', role: 'bass' } },
  sections: { A: { bars: 4, chords: '| C | F | G | C |', parts: { lead: '| C5:16 | A4:16 | B4:16 | C5:16 |', bass: '| C2:16 | F2:16 | G2:16 | C2:16 |' } } },
  form: ['A'],
  ...over,
});

test('arrange reports unknown sections, parts, instruments and references', () => {
  const song = tiny();
  assert.deepEqual(arrange(song).errors, []);
  assert.match(arrange({ ...song, form: ['A', 'Z'] }).errors[0], /form: unknown section "Z"/);
  const bad = tiny();
  bad.sections.A.parts.drums = '| k . . . |';
  assert.match(arrange(bad).errors[0], /A: unknown part "drums"/);
  const ref = tiny();
  ref.sections.A.parts.lead = '@B.lead';
  assert.match(arrange(ref).errors[0], /unknown reference @B\.lead/);
  const fill = tiny();
  fill.sections.A.parts.lead = '| C5:16 | A4:16 | B4:16 |';
  assert.match(arrange(fill).errors[0], /3 bars do not fill the section's 4/);
  const chords = tiny();
  chords.sections.A.chords = '| C | F | G |';
  assert.match(arrange(chords).errors[0], /A\.chords: 3 bars, section has 4/);
  const inst = tiny();
  inst.parts.lead.inst = 'nope';
  assert.match(arrange(inst).errors[0], /unknown instrument "nope"/);
});

test('the critic flags notes out of range, wrong chord tones and bars that never change', () => {
  assert.deepEqual(critic(tiny()).warnings, []);
  const low = tiny();
  low.sections.A.parts.lead = '| C3:16 | A4:16 | B4:16 | C5:16 |';
  const w = critic(low).warnings;
  assert.equal(w.length, 1);
  assert.match(w[0], /lead: 1 note outside G3-E7, e\.g\. C3 at A bar 1/);
  const wrong = tiny();
  wrong.sections.A.parts.bass = '| C#2:16 | F#2:16 | G#2:16 | C2:16 |';
  assert.match(critic(wrong).warnings[0], /bass: only 25% of on-beat notes are chord tones; e\.g\. C#2 over C/);
  const same = tiny();
  same.sections.A.parts.lead = '| C5:16 | C5:16 | C5:16 | C5:16 |';
  assert.match(critic(same).warnings.join('\n'), /A\.lead: all 4 bars identical/);
  const r = critic(tiny()).report;
  assert.equal(r.lead.range, 'A4-C5');
  assert.equal(r.bass.chordTones, '100% of on-beat notes');
});
