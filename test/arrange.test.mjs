// Arrangement: sections in form order become timed note events, with per-section meter, grid and tempo lines.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arrange } from '../engine/score.mjs';

const near = (a, b, msg, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${msg}: ${a} vs ${b}`);

const base = (sections, form, over = {}) => ({
  bpm: 120, meter: [4, 4], grid: 16, seed: 1,
  instruments: { s: { type: 'va' }, k: { type: 'drums', kit: { k: { type: 'kick', f0: 50, f1: 120, d: 0.3, pd: 0.03 } } } },
  parts: { a: { inst: 's' }, d: { inst: 'k' } },
  sections, form, ...over,
});

test('a 4/4 bar at 120 BPM lasts 2 s; a step on the 16 grid lasts 1/8 s', () => {
  const arr = arrange(base({ A: { bars: 2, parts: { a: '| C4:4 D4:4 E4:8 | F4:16 |' } } }, ['A']));
  assert.deepEqual(arr.errors, []);
  near(arr.duration, 4, 'duration');
  const ev = arr.parts.a.events;
  assert.deepEqual(ev.map((e) => e.t), [0, 0.5, 1, 2]);
  assert.deepEqual(ev.map((e) => e.dur), [0.5, 0.5, 1, 2]);
  assert.deepEqual(ev.map((e) => e.where), ['A bar 1', 'A bar 1', 'A bar 1', 'A bar 2']);
});

test('the form plays sections in order, repeats them, and a short line repeats to fill its section', () => {
  const arr = arrange(base({
    A: { bars: 1, parts: { a: '| C4:16 |' } },
    B: { bars: 4, parts: { a: '| D4:16 |', d: '| k . . . k . . . k . . . k . . . |' } },
  }, ['A', 'B', 'A']));
  assert.deepEqual(arr.errors, []);
  near(arr.duration, 12, 'duration');
  assert.deepEqual(arr.parts.a.events.map((e) => [e.t, e.midi]), [[0, 60], [2, 62], [4, 62], [6, 62], [8, 62], [10, 60]]);
  assert.equal(arr.parts.d.events.length, 16);
  assert.deepEqual(arr.starts.map((s) => [s.name, s.bar0]), [['A', 0], ['B', 1], ['A', 5]]);
});

test('a section can change meter and grid: 3/4 on a 12-step grid', () => {
  const arr = arrange(base({
    A: { bars: 1, parts: { a: '| C4:16 |' } },
    W: { bars: 2, meter: [3, 4], grid: 12, parts: { a: '| C4:4 D4:4 E4:4 | F4:12 |' } },
  }, ['A', 'W']));
  assert.deepEqual(arr.errors, []);
  near(arr.duration, 2 + 1.5 * 2, 'duration');
  const ev = arr.parts.a.events;
  assert.deepEqual(ev.map((e) => e.t), [0, 2, 2.5, 3, 3.5]);
  assert.equal(ev[1].beats, 3);
  assert.equal(ev[1].spb, 12);
  assert.deepEqual(arr.timeline.map((b) => b.t1 - b.t0), [2, 1.5, 1.5]);
});

test('a tempo line sets one BPM per bar, "-" keeps the last; a wrong count is an error when strict, else repaired', () => {
  const arr = arrange(base({ A: { bars: 4, tempo: '| 120 | 60 | - | 240 |', parts: { a: '| C4:16 |' } } }, ['A']));
  assert.deepEqual(arr.errors, []);
  assert.deepEqual(arr.timeline.map((b) => b.t1 - b.t0), [2, 4, 4, 1]);
  assert.deepEqual(arr.parts.a.events.map((e) => e.t), [0, 2, 6, 10]);
  near(arr.duration, 11, 'duration');
  const short = base({ A: { bars: 4, tempo: '| 120 | 60 |', parts: { a: '| C4:16 |' } } }, ['A']);
  assert.match(arrange(short, { strict: true }).errors[0], /A\.tempo: 2 bars, section has 4/);
  const bad = arrange(short);
  assert.deepEqual([bad.errors, bad.repairs], [[], ['A.tempo: 2 bars, section has 4; the last tempo carries on']]);
  near(bad.duration, 2 + 4 + 4 + 4, 'bars 3 and 4 keep 60 BPM');
  const zero = base({ A: { bars: 2, tempo: '| 120 | x |', parts: { a: '| C4:16 |' } } }, ['A']);
  assert.match(arrange(zero, { strict: true }).errors[0], /A\.tempo: bad tempo/);
  near(arrange(zero).duration, 4, 'the bad tempo reads as the one before');
});

test('a section bpm and a ritardando from one tempo to another across its bars', () => {
  const arr = arrange(base({
    A: { bars: 1, bpm: 60, parts: { a: '| C4:16 |' } },
    R: { bars: 3, rit: [120, 60], parts: { a: '| C4:16 |' } },
  }, ['A', 'R']));
  assert.deepEqual(arr.timeline.map((b) => +(b.t1 - b.t0).toFixed(6)), [4, 2, 2.666667, 4]);
});

test('a note held into the next section with a leading "-" lengthens the note before', () => {
  const arr = arrange(base({
    A: { bars: 1, parts: { a: '| .:8 [C4 E4]:8 |' } },
    B: { bars: 1, parts: { a: '| -:8 G4:8 |' } },
  }, ['A', 'B']));
  assert.deepEqual(arr.errors, []);
  const ev = arr.parts.a.events;
  assert.deepEqual(ev.map((e) => [e.t, e.dur, e.midi]), [[1, 2, 60], [1, 2, 64], [3, 1, 67]]);
  const orphan = base({ B: { bars: 1, parts: { a: '| -:8 G4:8 |' } } }, ['B']);
  assert.match(arrange(orphan, { strict: true }).errors[0], /starts with "-" but nothing is held/);
  assert.match(arrange(orphan).repairs[0], /nothing is held from the section before; the hold left out/);
});

test('references copy another section\'s line, transposed', () => {
  const arr = arrange(base({
    A: { bars: 1, parts: { a: '| C4:8 E4:8 |' } },
    B: { bars: 1, parts: { a: '@A.a+5' } },
  }, ['A', 'B']));
  assert.deepEqual(arr.errors, []);
  assert.deepEqual(arr.parts.a.events.map((e) => e.midi), [60, 64, 65, 69]);
});

test('dynamics: one marking per bar, hairpins ramp to the next marking, "*" sets every part', () => {
  const arr = arrange(base({ A: { bars: 4, parts: { a: '| C4:16 |' }, dyn: { a: '| p | p< | f | - |' } } }, ['A']));
  assert.deepEqual(arr.errors, []);
  const lv = arr.parts.a.levelAt;
  near(lv(1), 0.32, 'p in bar 1');
  near(lv(3), 0.32 + (0.78 - 0.32) * 0.5, 'halfway through the crescendo', 1e-3);
  near(lv(5), 0.78, 'f in bar 3');
  near(lv(7.5), 0.78, '"-" keeps f');
  const all = arrange(base({ A: { bars: 1, parts: { a: '| C4:16 |', d: '| k . . . |' }, dyn: { '*': '| ff |' } } }, ['A']));
  near(all.parts.d.levelAt(1), 0.92, 'drums take the "*" marking');
  const bad = base({ A: { bars: 1, parts: { a: '| C4:16 |' }, dyn: { a: '| loud |' } } }, ['A']);
  assert.match(arrange(bad, { strict: true }).errors[0], /bad dynamic "loud"/);
  assert.match(arrange(bad).repairs[0], /bad dynamic "loud"; left out/);
});

test('the pedal line: keys released with the pedal down are damped when it next lifts (a second P lifts and presses)', () => {
  const arr = arrange(base({ A: { bars: 2, pedal: '| P . . . . . . . P . . . . . . . | . . . . . . . . U . . . . . . . |', parts: { a: '| C4:16 |' } } }, ['A']));
  assert.deepEqual(arr.errors, []);
  near(arr.damperAt(0.5), 1, 'held until the re-press halfway through bar 1');
  near(arr.damperAt(1.5), 3, 'held until the lift in bar 2');
  near(arr.damperAt(3.5), 3.5, 'after the lift, damped at once');
  assert.match(arrange(base({ A: { bars: 1, pedal: '| X . . . . . . . . . . . . . . . |', parts: { a: '| C4:16 |' } } }, ['A']), { strict: true }).errors[0], /"X" is not P or U/);
});

test('humanize and velocity variation are seeded: the same song arranges the same way twice', () => {
  const song = base({ A: { bars: 2, parts: { a: '| C4:4 D4:4 E4:4 F4:4 |' } } }, ['A']);
  song.parts.a.humanize = 0.01;
  const a = arrange(song).parts.a.events.map((e) => [e.t, e.vel]);
  const b = arrange(song).parts.a.events.map((e) => [e.t, e.vel]);
  assert.deepEqual(a, b);
  const c = arrange({ ...song, seed: 2 }).parts.a.events.map((e) => [e.t, e.vel]);
  assert.notDeepEqual(a, c, 'another seed humanizes differently');
});
