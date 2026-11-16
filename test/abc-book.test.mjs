// Sheet music as an agent writes it: ABC scores with several voices written line by line ([V:2]), instruments by
// name or General MIDI program, drums, parts in a set order, bars that miscount (padded or cut, with a warning, not a
// failure), an accompaniment in the song's style, and songbooks whose tunes become a game's cues, layers and
// stingers (songs/lantern_road.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importABC, importABCBook, partOrder, songText } from '../engine/abc.mjs';
import { importScore } from '../engine/importers.mjs';
import { arrange, critic } from '../engine/score.mjs';
import { ABC as LANTERN } from '../songs/lantern_road.mjs';

const quiet = { log: () => {} };
const BAND = `X:1
T:Ridge Run
M:4/4
L:1/8
Q:1/4=132
P:A2B
K:Em
V:1 name="Lead Guitar"
V:2 name="Strings"
%%MIDI program 48
V:3 name="Bass"
%%MIDI program 33
V:4 name="Drums"
P:A
[V:1] !f! E2 G2 B2 e2 | d2 B2 A2 G2 | F2 A2 c2 f2 | e6 z2 |
[V:2] [EGB]8 | [DGB]8 | [FAc]8 | [EGB]8 |
[V:3] E,2 E,2 E,2 E,2 | G,2 G,2 G,2 G,2 | A,2 A,2 A,2 A,2 | E,2 E,2 E,2 E,2 |
[V:4] C,,2 ^F,,2 D,,2 ^F,,2 | C,,2 ^F,,2 D,,2 ^F,,2 | C,,2 ^F,,2 D,,2 ^F,,2 | C,,2 C,,2 D,,2 D,,D,, |
P:B
[V:1] g3 f e2 d2 | c2 B2 A4 | B2 c2 d2 e2 f2 | e8 |]
[V:2] [CEG]8 | [DFA]8 | [B,DF]8 | [EGB]8 |]
[V:3] C,4 C,4 | D,4 D,4 | B,,4 B,,4 | E,8 |]
[V:4] C,,2 ^F,,2 D,,2 ^F,,2 | C,,2 ^F,,2 D,,2 ^F,,2 | C,,2 ^F,,2 D,,2 ^F,,2 | ^C,8 |]
`;

test('ABC voices written line by line: instruments by name and program, drums by name, parts in the header order', () => {
  const r = importABC(BAND, quiet);
  assert.equal(r.report.voices, 4);
  assert.deepEqual(r.report.parts.map((p) => p.preset), ['distortion_guitar', 'violins', 'electric_bass', 'percussion']);
  // the drum voice plays General MIDI notes on the band kit: kick, closed hat, snare, crash
  assert.equal(r.song.instruments.percussion.type, 'drums');
  const drums = r.song.sections.A.parts.perc;
  assert.match(drums, /^\| k:2 h:2 s:2 h:2 \|/);
  assert.match(r.song.sections.B.parts.perc, /c:8 \|$/);
  // P:A2B: part A twice, then B; the sections are named after the parts
  assert.deepEqual(r.song.form, ['A', 'A', 'B']);
  assert.deepEqual(r.report.partSections, { A: ['A'], B: ['B'] });
  assert.equal(r.song.bpm, 132);
  assert.equal(r.report.room, 'hall', 'violins make it an orchestra');
  const arr = arrange(r.song);
  assert.deepEqual(arr.errors, []);
  assert.deepEqual(critic(r.song, arr).warnings, []);
});

test('a miscounted bar is cut or padded with a warning that names the voice, part and bar; the rest stays in time', () => {
  const r = importABC(BAND, quiet);
  assert.deepEqual(r.report.warnings, ['Lead Guitar, part B, bar 3: 5 beats in a 4/4 bar; cut at the bar line']);
  assert.equal(r.song.sections.B.parts.dgtr, '| G5:3 F#5 E5:2 D5:2 | C5:2 B4:2 A4:4 | B4:2 C5:2 D5:2 E5:2 | E5:8 |');
  const short = importABC(`X:1\nT:Short\nM:3/4\nL:1/4\nK:C\nG | c d | e f g | c3 |]\n`, quiet);
  assert.deepEqual(short.report.warnings, ['bar 2: 2 beats in a 3/4 bar; filled out with rest'], 'the pickup bar is not one');
  assert.deepEqual(arrange(short.song).errors, []);
});

test('band, synth and chip voices get rooms, masters and kits to suit them; chord symbols an accompaniment in style', () => {
  const band = importABC(BAND.replace('name="Strings"', 'name="Rhythm Guitar"').replace('%%MIDI program 48\n', ''), quiet);
  assert.equal(band.report.room, 'band');
  assert.equal(band.song.stage, undefined, 'no concert stage');
  assert.equal(band.song.buses.hall.rt60, 1.1);
  const chip = importABC(`X:1\nT:Chip\nM:4/4\nL:1/8\nK:C\nV:1 name="Pulse"\nV:2 name="Triangle Wave"\nV:3 name="Drums"\n[V:1] "C"c2 e2 g2 e2 | "G"d8 |]\n[V:2] C,2 C,2 C,2 C,2 | G,,8 |]\n[V:3] C,,2 ^F,,2 D,,2 ^F,,2 | C,,8 |]\n`, quiet);
  assert.equal(chip.report.room, 'chip');
  assert.equal(chip.song.instruments.percussion.ch, 'noise', 'the drums on the noise channel');
  assert.equal(chip.song.parts.pulse.humanize, undefined, 'a chip plays on the grid');
  assert.equal(chip.song.parts.acc.inst, 'chip_pulse', 'the chords as a pulse arpeggio');
  assert.equal(chip.song.parts.bass, undefined, 'the triangle is the bass already');
  const synth = importABC(`X:1\nT:Synth\nM:4/4\nL:1/4\nK:Am\nV:1 name="Synth Lead"\n"Am"A c e a | "F"f e c A |]\n`, quiet);
  assert.equal(synth.report.room, 'synth');
  assert.deepEqual([synth.song.parts.acc.inst, synth.song.parts.bass.inst], ['synth_pad', 'synth_bass']);
  for (const r of [band, chip, synth]) assert.deepEqual(arrange(r.song).errors, []);
});

test('partOrder reads P: fields: letters, words, repeats and brackets', () => {
  assert.deepEqual(partOrder('ABAC'), ['A', 'B', 'A', 'C']);
  assert.deepEqual(partOrder('A2B'), ['A', 'A', 'B']);
  assert.deepEqual(partOrder('(AB)2C'), ['A', 'B', 'A', 'B', 'C']);
  assert.deepEqual(partOrder('Intro A2 B'), ['Intro', 'A', 'A', 'B']);
  assert.deepEqual(partOrder('A.B.C'), ['A', 'B', 'C']);
});

test('decorations and annotations: tremolo strokes, marcato, mordent; pizz., arco, sul pont. and flz. as techniques', () => {
  const r = importABC(`X:1\nT:Marks\nM:4/4\nL:1/4\nK:C\nV:1 name="Violins"\nV:2 name="Flute"\n[V:1] "^pizz."c e g c' | "^arco" !//!c4 | "^sul pont." !trem!c4 | !mordent!c !marcato!e g2 |]\n[V:2] "^flz." c4 | z4 | z4 | z4 |]\n`, quiet);
  const s = Object.values(r.song.sections)[0];
  assert.match(s.parts.vn_pizz, /^\| C5:8 E5:8 G5:8 C6:8 \|/);
  assert.match(s.parts.vn, /\| (C5:2 ){15}C5:2 \|/, '!//! is sixteenths');
  assert.match(s.parts.vn, /C5:32~%pont/, '!trem! is unmeasured, with the bow at the bridge');
  assert.match(s.parts.vn, /C5%pont B4_%pont C5:6_%pont E5:8!%pont G5:16%pont/, 'the mordent (down and back), then the marcato note');
  assert.match(s.parts.fl, /C5:32%flz/);
});

test('a songbook: each tune a cue, the Intro part played once, layers by voice, a stinger, lanes shared across cues', () => {
  const r = importABCBook(LANTERN, { title: 'The Lantern Road', ...quiet });
  assert.deepEqual(Object.keys(r.report.cues), ['title', 'town', 'dungeon', 'battle']);
  assert.deepEqual(r.song.loops.title, { intro: ['title_Intro'], body: ['title_A', 'title_A_2'] });
  assert.deepEqual(r.song.stingers, { victory: ['victory_end'] });
  assert.deepEqual(r.song.layers, { drums: ['timp'], melody: ['fl', 'ob'], brass: ['hn'] });
  assert.deepEqual(r.report.warnings, []);
  assert.equal(r.report.room, 'hall');
  // one violin lane plays in the title, the dungeon and the battle; the town's pizzicato is a lane of its own
  assert.deepEqual(Object.keys(r.song.parts), ['vn', 'hn', 'vc', 'timp', 'acc', 'fl', 'ob', 'vn_pizz', 'cb', 'tp']);
  assert.ok(r.song.sections.dungeon_m1.parts.vn.includes('%pont'));
  assert.equal(r.song.sections.dungeon_m1.parts.acc, undefined, '%%accompany off');
  assert.equal(r.song.sections.town_m1.tempo.split('|')[1].trim(), '138');
  assert.deepEqual(r.song.sections.town_m1.meter, [3, 4]);
  const arr = arrange(r.song);
  assert.deepEqual(arr.errors, []);
  assert.deepEqual(critic(r.song, arr).warnings, []);
  // the written module is the same song
  const text = songText(r.song);
  assert.deepEqual(JSON.parse(JSON.stringify(new Function(text.replace('export default', 'return'))())), JSON.parse(JSON.stringify(r.song)));
});

test('importScore reads ABC with several tunes, or %%cue lines, as a songbook', async () => {
  const r = await importScore(LANTERN, quiet);
  assert.equal(r.format, 'abc');
  assert.ok(r.report.cues.battle);
  const one = await importScore(BAND, quiet);
  assert.equal(one.report.cues, undefined);
});
