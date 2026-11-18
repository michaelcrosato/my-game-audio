// The text score format: the parser's errors, chord symbols, generators and the critic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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

test('arrange reports unknown sections, parts, instruments and references (strict), or repairs them (by default)', () => {
  const song = tiny();
  assert.deepEqual(arrange(song).errors, []);
  assert.match(arrange({ ...song, form: ['A', 'Z'] }).errors[0], /form: unknown section "Z"/);
  const bad = tiny();
  bad.sections.A.parts.drums = '| k . . . |';
  assert.match(arrange(bad, { strict: true }).errors[0], /A: unknown part "drums"/);
  const ref = tiny();
  ref.sections.A.parts.lead = '@B.lead';
  assert.match(arrange(ref, { strict: true }).errors[0], /unknown reference @B\.lead/);
  const fill = tiny();
  fill.sections.A.parts.lead = '| C5:16 | A4:16 | B4:16 |';
  assert.match(arrange(fill, { strict: true }).errors[0], /3 bars do not fill the section's 4/);
  const chords = tiny();
  chords.sections.A.chords = '| C | F | G |';
  assert.match(arrange(chords, { strict: true }).errors[0], /A\.chords: 3 bars, section has 4/);
  const inst = tiny();
  inst.parts.lead.inst = 'nope';
  assert.match(arrange(inst, { strict: true }).errors[0], /unknown instrument "nope"/);
  // by default only the unknown section stops it; the rest are repaired
  for (const s of [bad, ref, fill, chords, inst]) assert.deepEqual([arrange(s).errors, arrange(s).repairs.length], [[], 1]);
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

test('a score with mistakes still plays: arrange repairs what it can and says what it did; strict makes them errors', () => {
  const song = {
    bpm: 120, meter: [4, 4], grid: 16,
    instruments: { a: { type: 'chip', ch: 'pulse' } },
    parts: { lead: { inst: 'a' }, bass: { inst: 'a' } },
    sections: {
      A: {
        bars: 4, tempo: '| 120 | 120 | x |',
        parts: { lead: '| C5:4 D5:4 E5:4 | F5:8 G5:12 | A5:16 | Q9:4 B5:12 |', bass: '| C3:16 | G2:16 | A2:16 |', ghost: '| C4:16 |' },
        dyn: { lead: '| mf | f | zz | - | - |' },
      },
    },
    form: ['A'],
  };
  const a = arrange(song);
  assert.deepEqual(a.errors, []);
  assert.deepEqual(a.repairs, [
    'A.tempo: 3 bars, section has 4; the last tempo carries on',
    'A.tempo: bad tempo in "| 120 | 120 | x |"; read as the tempo before it',
    'A.lead bar 1: 12 steps, expected 16 (missing 4); filled out with rest',
    'A.lead bar 2: 20 steps, expected 16 (4 too many); cut at the bar line',
    'A.lead bar 4: bad note in "Q9:4"; played as a rest',
    "A.bass: 3 bars do not fill the section's 4; repeated to fill it",
    'A: unknown part "ghost"; left out',
    'A.dyn.lead bar 3: bad dynamic "zz"; left out',
    'A.dyn.lead: more dynamics bars than the section has; the rest left out',
  ]);
  // the bars after a mistake stay in time: G5 is cut to the bar line, A5 starts bar 3, B5 plays after a rest
  const at = (p) => a.parts[p].events.map((e) => [e.midi, +e.t.toFixed(2), +e.dur.toFixed(2)]);
  assert.deepEqual(at('lead').slice(3), [[77, 2, 1], [79, 3, 1], [81, 4, 2], [83, 6.5, 1.5]]);
  assert.deepEqual(at('bass').map((x) => x[0]), [48, 43, 45, 48], 'the three-bar bass repeats and stops with the section');
  assert.equal(a.duration, 8);
  assert.match(critic(song, a).warnings[0], /^repaired: A\.tempo/);
  const strict = arrange(song, { strict: true });
  assert.equal(strict.errors.length, 9);
  assert.equal(strict.errors[2], 'A.lead bar 1: 12 steps, expected 16 (missing 4)');
  // a line with no bar lines reads as bars of the grid
  const flat = parseLine('C4:16 D4:8 E4:8', { lenient: true });
  assert.deepEqual([flat.bars, flat.errors, flat.events.map((e) => e.bar)], [2, [], [0, 1, 1]]);
});

test('the critic checks a preset\'s range when only score.mjs is loaded', () => {
  // a song file an importer wrote is plain data: its instruments name their preset (rangeName) and nothing else loads
  // the presets, so score.mjs has to (it did not before 0.15.0: ode had 11 critic notes alone and 12 after a render)
  const code = `
    import { arrange, critic } from './engine/score.mjs';
    const song = {
      bpm: 120, meter: [4, 4], grid: 16, form: ['A'],
      instruments: { violins: { type: 'strings', rangeName: 'violins' } },
      parts: { vn: { inst: 'violins' } },
      sections: { A: { bars: 1, parts: { vn: '| C3:16 |' } } },
    };
    console.log(JSON.stringify(critic(song, arrange(song)).warnings));`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(JSON.parse(r.stdout)[0] ?? '', /^vn: 1 note outside G3-/);
});

test('chords in a bar share it evenly, or take the steps written after them', () => {
  const at = (line) => parseChords(line, 16).chords.map((c) => [c.chord.sym, c.step, c.steps]);
  assert.deepEqual(at('| G D |'), [['G', 0, 8], ['D', 8, 8]]);
  assert.deepEqual(at('| G:4 D7:4 G:8 |'), [['G', 0, 4], ['D7', 4, 4], ['G', 8, 8]]);
  assert.deepEqual(at('| C:12 G |'), [['C', 0, 12], ['G', 12, 4]], 'an unmarked chord takes what is left');
});

test('a dynamics bar can hold several markings at their steps, written like notes', () => {
  const song = {
    bpm: 60, meter: [4, 4], grid: 16, form: ['A'],
    instruments: { s: { type: 'strings' } },
    parts: { a: { inst: 's' } },
    sections: { A: { bars: 4, parts: { a: '| C4:16 | C4:16 | C4:16 | C4:16 |' }, dyn: { a: '| p:8 f:8 | mf:12 <:4 | ff | p f |' } } },
  };
  const arr = arrange(song);
  assert.deepEqual(arr.errors, []);
  const at = (t) => +arr.parts.a.levelAt(t).toFixed(3);
  // bar 1 (0-4 s): p, then f from step 8 (2 s)
  assert.equal(at(1), 0.32);
  assert.equal(at(3), 0.78);
  // bar 2 (4-8 s): mf until step 12 (7 s), then a crescendo to ff at bar 3 (8 s)
  assert.equal(at(5), 0.6);
  assert.equal(at(7.5), +((0.6 + 0.92) / 2).toFixed(3));
  assert.equal(at(9), 0.92);
  // bar 4 (12-16 s): marks without a length share the bar, p then f half way
  assert.equal(at(13), 0.32);
  assert.equal(at(15), 0.78);
  // one marking a bar reads as it always has
  const old = arrange({ ...song, sections: { A: { ...song.sections.A, dyn: { a: '| p< | - | f | f> |' } } } });
  assert.equal(+old.parts.a.levelAt(4).toFixed(3), +((0.32 + 0.78) / 2).toFixed(3));
  assert.match(arrange({ ...song, sections: { A: { ...song.sections.A, dyn: { a: '| p:8 loud:8 | - | - | - |' } } } }).repairs[0], /bar 1: bad dynamic "loud:8"/);
});
