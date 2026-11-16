// MIDI in and out, and ABC in: songs survive a trip through a MIDI file note for note; played (unquantized) MIDI
// snaps to its grid; drums land on the General MIDI kit; ABC tunes keep their keys, accidentals, rhythms, repeats,
// endings, ornaments and chord symbols.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportMidi, importMidi, parseMidi } from '../engine/midi.mjs';
import { importABC, keyAccidentals } from '../engine/abc.mjs';
import { importScore, scoreFormat } from '../engine/importers.mjs';
import { arrange, critic, midiToName } from '../engine/score.mjs';
import { loadSong } from './helpers.mjs';

const still = (song) => ({ ...song, parts: Object.fromEntries(Object.entries(song.parts).map(([k, p]) => [k, { ...p, humanize: 0, shift: 0 }])) });
// every note of an arrangement as "time:pitch", times to the millisecond
const notesOf = (song) => Object.values(arrange(still(song)).parts).flatMap((p) => p.events.map((e) => `${e.t.toFixed(3)}:${e.midi ?? e.drum}`)).sort();

for (const name of ['chiptune', 'beethoven5']) {
  test(`${name}: export to MIDI and import back, note for note`, async () => {
    const song = await loadSong(name);
    const bytes = exportMidi(song);
    const back = importMidi(bytes, { title: song.title });
    assert.deepEqual(arrange(back.song).errors, []);
    const a = notesOf(song), b = notesOf(back.song);
    assert.equal(b.length, a.length);
    assert.deepEqual(b, a);
  });
}

test('the MIDI file: a format 1 file with a tempo track, named tracks, programs and drums on channel 10', async () => {
  const song = await loadSong('orchestral');
  const m = parseMidi(exportMidi(song));
  assert.equal(m.format, 1);
  assert.equal(m.ppq, 480);
  assert.equal(m.tracks.length, 1 + Object.keys(song.parts).length);
  assert.equal(m.tracks[0].events.find((e) => e.type === 'tempo').us, Math.round((60 / song.bpm) * 1e6));
  assert.deepEqual(m.tracks.slice(1, 4).map((t) => t.name), ['violinsI', 'violinsII', 'violas']);
  const programs = m.tracks.flatMap((t) => t.events.filter((e) => e.type === 'program').map((e) => e.program));
  assert.ok(programs.includes(40) && programs.includes(42), `violins (40) and cellos (42) from their presets: ${programs}`);
  const drumTrack = m.tracks.find((t) => t.name === 'drum');
  assert.ok(drumTrack.events.filter((e) => e.type === 'on').every((e) => e.ch === 9));
});

test('importing played MIDI: notes snap to the grid, drums to kit tokens, velocities to dynamics', () => {
  // a hand-made file: 480 ticks a quarter, a melody slightly off the beat, a kick and snare, loud then soft
  const ev = [];
  const note = (ch, n, on, off, vel) => ev.push({ tick: on, d: [0x90 | ch, n, vel] }, { tick: off, d: [0x80 | ch, n, 0] });
  const pitches = [60, 62, 64, 65, 67, 65, 64, 62];
  pitches.forEach((p, i) => note(0, p, i * 480 + (i % 2 ? 9 : -7) + 7, i * 480 + 470, i < 4 ? 110 : 40));
  for (let i = 0; i < 8; i++) note(9, i % 2 ? 38 : 36, i * 480 + 5, i * 480 + 60, 100);
  ev.sort((a, b) => a.tick - b.tick);
  const vlq = (n) => { const o = [n & 127]; while ((n >>= 7)) o.unshift((n & 127) | 128); return o; };
  const body = [];
  let last = 0;
  for (const e of ev) { body.push(...vlq(e.tick - last), ...e.d); last = e.tick; }
  body.push(0, 0xff, 0x2f, 0);
  const bytes = new Uint8Array([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 1, 0xe0, 0x4d, 0x54, 0x72, 0x6b, 0, 0, (body.length >> 8) & 255, body.length & 255, ...body]);
  assert.equal(scoreFormat(bytes), 'midi');
  const r = importMidi(bytes);
  assert.equal(r.report.grid, 1, 'quarter notes: the coarsest grid nearly every note is near');
  const arr = arrange(still(r.song));
  assert.deepEqual(arr.errors, []);
  const mel = Object.entries(arr.parts).find(([, p]) => p.events.some((e) => e.midi != null))[1];
  assert.deepEqual(mel.events.map((e) => midiToName(e.midi)), pitches.map(midiToName));
  assert.deepEqual(mel.events.map((e) => +e.t.toFixed(3)), [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], 'on the beat at 120 BPM');
  const drums = Object.values(arr.parts).find((p) => p.events.some((e) => e.drum));
  assert.deepEqual(drums.events.map((e) => e.drum).join(' '), 'k s k s k s k s');
  assert.equal(r.song.instruments.percussion.type, 'drums');
  const dyn = Object.values(r.song.sections)[0].dyn;
  assert.match(Object.values(dyn)[0], /^\| f \| pp \|$/, 'velocity 110 then 40: f, then pp');
});

const REEL = `X:1
T:Lantern Reel
C:my-game-audio tests
M:4/4
L:1/8
Q:1/4=110
K:D
|:"D"A2 FA dAFA|"G"B2 GB "D"AFDF|"Em"E2 EF GFEF|"A7"(3ABc ec dcBA:|
|:"D"d2 fd "A"c2 ec|"G"B2 dB "D"A2 F2|"Em"G>F E>D "A7"!trill!E2 FG|1 "D"A2 d2 d4:|2 "D"!fermata!d8|]
`;

test('ABC: keys, accidentals, lengths, broken rhythm, triplets, repeats and endings, ornaments, tempo', () => {
  assert.equal(scoreFormat(REEL), 'abc');
  const r = importABC(REEL, { instrument: 'flute', accompany: false });
  assert.equal(r.song.title, 'Lantern Reel');
  assert.equal(r.report.bars, 16, 'two repeated strains of four bars, endings written out');
  assert.equal(r.report.parts[0].preset, 'flute');
  const arr = arrange(still(r.song));
  assert.deepEqual(arr.errors, []);
  const ev = arr.parts.fl.events;
  // bar 1: A2 FA dAFA, in D major (F sharp), at 110 quarter notes a minute
  assert.deepEqual(ev.slice(0, 7).map((e) => midiToName(e.midi)), ['A4', 'F#4', 'A4', 'D5', 'A4', 'F#4', 'A4']);
  const q = 60 / 110;
  assert.ok(Math.abs(ev[1].t - q) < 1e-9 && Math.abs(ev[0].dur - q) < 1e-9);
  // the triplet in bar 4 takes the time of two eighth notes
  const trip = ev.filter((e) => e.where === 'm1 bar 4').slice(0, 3);
  assert.ok(Math.abs(trip[0].dur - (q / 3)) < 1e-6, `${trip[0].dur} against ${q / 3}`);
  // G>F E>D: dotted eighth then sixteenth
  const broken = ev.filter((e) => e.where === 'm9 bar 3').slice(0, 4).map((e) => +(e.dur / q).toFixed(3));
  assert.deepEqual(broken, [0.75, 0.25, 0.75, 0.25]);
  // the trill on E alternates with F sharp, the key's next note; the fermata holds its note twice as long
  assert.match(r.song.sections.m9.parts.fl, /F#4 E4_ F#4_/);
  assert.equal(r.song.sections.end.tempo, '| 110 | 110 | 110 | 110 |');
  assert.equal(r.song.sections.end.hold, '| - | - | - | 0:32*2 |');
  assert.deepEqual(r.song.form, ['m1', 'm1', 'm9', 'end'], 'the first strain twice, the second with each ending');
});

test('ABC: chord symbols become chords lines and an accompaniment the critic accepts', () => {
  const r = importABC(REEL, { instrument: 'flute' });
  assert.equal(r.report.chordSymbols, 13);
  assert.equal(r.song.sections.m1.chords, '| D | G D | Em | A7 |');
  assert.deepEqual(Object.keys(r.song.parts), ['fl', 'acc', 'bass']);
  const arr = arrange(r.song);
  assert.deepEqual(arr.errors, []);
  assert.deepEqual(critic(r.song, arr).warnings, []);
});

test('ABC: modes, explicit and bar accidentals, voices, lyrics, default note length', () => {
  assert.deepEqual(keyAccidentals('Dmix'), { C: 0, D: 0, E: 0, F: 1, G: 0, A: 0, B: 0 }, 'D mixolydian: one sharp');
  assert.deepEqual(keyAccidentals('Amix'), { C: 1, D: 0, E: 0, F: 1, G: 0, A: 0, B: 0 }, 'A mixolydian: two sharps');
  assert.deepEqual(keyAccidentals('Dm'), { C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: -1 });
  assert.equal(keyAccidentals('D =c').C, 0);
  const tune = `X:2
T:Two Voices
M:3/4
K:G
V:1 name="Flute"
^c2 c2 d2 | =c2 c2 B2 |
w: Hal-le-lu-jah-sing
V:2 name="Cello"
G,3 D,3 | G,6 |
`;
  const r = importABC(tune);
  assert.equal(r.report.voices, 2);
  assert.deepEqual(r.report.parts.map((p) => p.preset), ['flute', 'cellos']);
  const arr = arrange(still(r.song));
  const fl = arr.parts.fl.events.map((e) => midiToName(e.midi));
  // ^c holds for the rest of its bar; =c cancels; a new bar forgets; with no L: in 3/4 the unit is an eighth
  assert.deepEqual(fl, ['C#5', 'C#5', 'D5', 'C5', 'C5', 'B4']);
  assert.ok(Math.abs(arr.parts.fl.events[0].dur - 60 / 120) < 1e-9, 'c2: two eighths, a quarter note at 120');
  assert.deepEqual(arrange(r.song).errors, []);
});

test('importScore tells the formats apart', async () => {
  const { readFileSync } = await import('node:fs');
  const mxl = readFileSync(new URL('./scores/features.musicxml', import.meta.url));
  assert.equal(scoreFormat(mxl), 'musicxml');
  assert.equal((await importScore(mxl, { title: 'x' })).format, 'musicxml');
  assert.equal((await importScore(REEL)).format, 'abc');
  assert.equal((await importScore(exportMidi(await loadSong('chiptune')))).format, 'midi');
});

test('MIDI: the sustain pedal (controller 64) goes out and comes back; without one, pedal: "bass" changes with the bass', () => {
  const song = {
    title: 'Pedal', bpm: 60, meter: [4, 4], grid: 4, instruments: { piano: { type: 'piano' } },
    parts: { rh: { inst: 'piano' }, lh: { inst: 'piano' } },
    sections: { A: { bars: 2, pedal: '| P:2 P:2 | .:2 U:2 |', parts: { rh: '| C5 E5 G5 C6 | B5 G5 D5 B4 |', lh: '| C3:4 | G2:2 A2:2 |' } } },
    form: ['A'],
  };
  const m = parseMidi(exportMidi(song));
  const cc = m.tracks.flatMap((t) => t.events).filter((e) => e.type === 'cc' && e.cc === 64).map((e) => `${e.tick}:${e.value}`);
  assert.deepEqual(cc, ['0:127', '960:0', '960:127', '2880:0'], 'a change lifts and presses on one tick');
  const back = importMidi(exportMidi(song));
  assert.equal(Object.values(back.song.sections)[0].pedal, '| P:2 P:2 | .:2 U:2 |');
  const plain = exportMidi({ ...song, sections: { A: { ...song.sections.A, pedal: undefined } } });
  assert.equal(Object.values(importMidi(plain).song.sections)[0].pedal, undefined);
  // the bass: C3 holds bar 1 under the right hand; G2 and A2 are new bass notes
  assert.equal(Object.values(importMidi(plain, { pedal: 'bass' }).song.sections)[0].pedal, '| P:4 | P:2 P:2 |');
});
