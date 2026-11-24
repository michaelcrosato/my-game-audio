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
import PRESETS from '../engine/orchestra-presets.json' with { type: 'json' };

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
  assert.match(s.parts.vn, /\| C5:32%trem16 \|/, '!//! is a measured tremolo in sixteenths: one bowed note, its strokes in time');
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

test('the sustain pedal as a score marks it: !ped! presses (again, a change), !ped-up! lifts', () => {
  const r = importABC(`X:1\nT:Pedal\nM:4/4\nL:1/8\nQ:1/4=66\nK:Eb\nV:1 name="Piano"\nV:2 name="Piano"\n[V:1] !p! z2 G2 B2 e2 | f3 e d2 B2 |]\n[V:2] !ped! E,B,EB, G,B,EB, | !ped! B,,F,B,F, D,F,!ped-up!B,2 |]\n`, quiet);
  assert.equal(r.report.pedal, 3);
  assert.equal(Object.values(r.song.sections)[0].pedal, '| P:8 | P:6 U:2 |');
  assert.deepEqual(arrange(r.song).errors, []);
  const none = importABC(`X:1\nT:Dry\nM:4/4\nL:1/4\nK:C\nV:1 name="Piano"\nc e g c' |]\n`, quiet);
  assert.equal(none.report.pedal, 0, 'no marks, no pedal');
});

test('voices named as a choir sings, or only "Bass" or "Choir", get the instrument the music around them means', () => {
  const tune = (names) => `X:1\nT:t\nM:4/4\nL:1/4\nK:C\n${names.map((n, i) => `V:${i + 1} name="${n}"`).join('\n')}\n${names.map((n, i) => `[V:${i + 1}] ${n === 'Drums' ? 'C,, D,, C,, D,,' : i === 0 ? "e g c' g" : 'C, E, G, C,'} |]`).join('\n')}\n`;
  const presets = (names) => importABC(tune(names), quiet).report.parts.map((p) => p.preset);
  assert.deepEqual(presets(['Soprano', 'Alto', 'Tenor', 'Bass']), ['soprano_choir', 'alto_choir', 'tenor_choir', 'bass_choir'], 'a choir, without words too');
  assert.deepEqual(presets(['Solo Soprano', 'Alto']), ['soprano_voice', 'alto_choir']);
  assert.deepEqual(presets(['Viola', 'Alto']), ['violas', 'violas'], 'one choir name alone is not a choir: Alto is a viola');
  assert.deepEqual(presets(['Alto Sax', 'Tenor Sax', 'Bass Clarinet']), ['alto_sax', 'tenor_sax', 'bass_clarinet'], 'instruments named for a voice range are not singers');
  assert.deepEqual(presets(['Piano', 'Bass', 'Drums']), ['piano', 'basses', 'percussion'], 'a jazz trio: the string bass');
  assert.deepEqual(presets(['Electric Guitar', 'Bass', 'Drums']), ['electric_guitar', 'electric_bass', 'percussion']);
  assert.deepEqual(presets(['Synth Lead', 'Bass']), ['synth_lead', 'synth_bass']);
  assert.deepEqual(presets(['Pulse', 'Bass']), ['chip_pulse', 'chip_triangle']);
  assert.deepEqual(presets(['Choir', 'Choir']), ['soprano_choir', 'bass_choir'], 'a choir voice sings the part its register is');
});

test('the critic checks the voice under the chord symbols against them: wrong chords are caught', () => {
  const tune = (chords) => `X:1\nT:t\n%%accompany off\nM:3/4\nL:1/8\nK:Dm\nV:1 name="Flute"\nV:2 name="Cellos"\n[V:1] "${chords[0]}"A2 d2 f2 | "${chords[1]}"g4 f2 | "${chords[2]}"e3 d ^c2 | "${chords[3]}"d6 |]\n[V:2] D,6 | G,,6 | A,,6 | D,6 |]\n`;
  const right = importABC(tune(['Dm', 'Gm', 'A7', 'Dm']), quiet);
  assert.equal(right.song.parts.fl.role, 'melody');
  assert.deepEqual(critic(right.song, arrange(right.song)).warnings, []);
  const wrong = importABC(tune(['Eb', 'Eb', 'Eb', 'Eb']), quiet);
  assert.match(critic(wrong.song, arrange(wrong.song)).warnings.join('\n'), /^fl: only \d+% of on-beat notes are chord tones/);
});

test('hairpins end on the note their closing mark is written before, and the reader says what it cannot use', () => {
  const tune = (body) => importABC(`X:1\nT:t\nM:3/4\nL:1/8\nK:C\nV:1 name="Flute"\n${body}\n`, quiet);
  const across = tune('!mf! A6 | !>(! e6 | !>)! !p! d6 | c6 |]');
  assert.equal(Object.values(across.song.sections)[0].dyn.fl, '| mf | > | p | - |', 'across the bar line, to the dynamic');
  assert.deepEqual(across.report.warnings, []);
  assert.deepEqual(tune('!mf! !<(!!<)! A6 | e6 |]').report.warnings, ['Flute, bar 1: a hairpin over one note is not heard; open it before one note and close it before a later one']);
  assert.deepEqual(tune('!rit! A6 | !tenuto!e2 !1!e2 !upbow!e2 |]').report.warnings, ['Flute, bar 1: !rit! is not read, so it is ignored; a ritardando is words above the staff: "^rit." (or "^poco rit."), and "^a tempo" ends it'], 'tenuto, fingerings and bowings are accepted');
  const chords = importABC(`X:1\nT:t\nM:4/4\nL:1/4\nK:C\nV:1 name="Flute"\nV:2 name="Cello"\n[V:1] "Cmaj13"c e g c |]\n[V:2] "C"C,4 |]\n`, quiet).report.warnings;
  assert.match(chords[0], /^Flute, bar 1: the chord symbol "Cmaj13" is not one this reader knows/);
  assert.match(chords[1], /^Cello, bar 1: the chord symbol "C" is over a voice other than the first/);
  const marks = importABC(`X:1\nT:t\nM:4/4\nL:1/4\nK:C\nV:1 name="Piano"\n!arpeggio![CEGc]2 c !breath!d |]\n`, quiet);
  assert.equal(Object.values(marks.song.sections)[0].parts.pno, '| [C4 E4 G4 C5]:8& C5:3 . D5:4 |', 'a rolled chord; a breath after the note before');
});

test('drum chords are hits at once; Percussion in an orchestral score is the orchestra\'s; a single tune\'s Intro plays once', () => {
  const band = `X:1\nT:t\n%%cue a\n%%layer drums Drums\nM:4/4\nL:1/8\nK:A\nV:1 name="Electric Guitar"\nV:2 name="Drums"\n[V:1] A8 |]\n[V:2] [C,,^F,,]2 ^F,,2 [D,,^F,,]2 [C,,^C,]2 |]\n`;
  const one = importABC(band, quiet);
  assert.deepEqual(Object.values(one.song.sections)[0].parts.perc1, '| k h s k |', 'the K: signature does not touch drum notes');
  assert.deepEqual(Object.values(one.song.sections)[0].parts.perc2, '| h . h c |', 'the second hit of each chord, on a lane of its own');
  assert.deepEqual(importABCBook(band, quiet).song.layers, { drums: ['perc1', 'perc2'] }, 'a layer takes all of a voice\'s lanes');
  const orch = (name) => importABC(`X:1\nT:t\nM:4/4\nL:1/4\nK:D\nV:1 name="Violins"\nV:2 name="${name}" clef=perc\n[V:1] d f a d' |]\n[V:2] C,, D,, ^C, _E, |]\n`, quiet);
  assert.equal(orch('Percussion').song.instruments.percussion.type, 'perc');
  assert.equal(Object.values(orch('Percussion').song.sections)[0].parts.perc, '| bd sd cym scym |');
  assert.equal(Object.values(orch('Cymbals').song.sections)[0].parts.perc, '| cym cym cym cym |', 'a voice named for one instrument plays only it');
  assert.equal(orch('Drums').song.instruments.percussion.type, 'drums', 'a voice named Drums is the band kit anywhere');
  const intro = importABC(`X:1\nT:t\nM:4/4\nL:1/4\nK:C\nV:1 name="Flute"\nP:Intro\n[V:1] c4 |\nP:A\n[V:1] d4 | e4 |]\n`, quiet);
  assert.deepEqual([intro.song.intro, intro.song.loop], [['Intro'], ['A']]);
  assert.match(intro.text, /intro: \["Intro"\],\n  loop: \["A"\],\n  form: /);
});

test('the mix from the score: %%gain and %%pan, or %%MIDI control 7 and 10, after a voice', () => {
  const r = importABC(`X:1\nT:t\nM:4/4\nL:1/4\nK:C\nV:1 name="Lead Guitar"\n%%gain +4\n%%pan 0\nV:2 name="Rhythm Guitar"\n%%MIDI control 10 0\n%%MIDI control 7 80\n[V:1] c4 |]\n[V:2] C,4 |]\n`, quiet);
  const [lead, rhythm] = Object.values(r.song.parts);
  const preset = (n) => PRESETS.instruments[n].gain;
  assert.deepEqual([lead.gain, lead.pan], [+(preset('distortion_guitar') + 4).toFixed(1), 0]);
  assert.deepEqual([rhythm.gain, rhythm.pan], [+(preset('distortion_guitar') - 3.9).toFixed(1), -0.9], 'volume 80 is 3.9 dB down; pan 0 is hard left, as far as a part goes');
  assert.deepEqual(r.report.directives, []);
});

test('dynamics and hairpins inside a bar are read where they are written', () => {
  const tune = (body) => importABC(`X:1\nT:t\nM:4/4\nL:1/4\nQ:1/4=60\nK:C\nV:1 name="Violins"\n${body}\n`, quiet);
  const r = tune("[V:1] !p! c d !f! e f | !mp! !<(! g a b !<)! c' | !<(! c4 | !<)! !ff! c4 |]");
  assert.deepEqual(r.report.warnings, []);
  // p on beat 1 and f on beat 3; a crescendo from mp closed before beat 4 with no dynamic arrives one level up (mf);
  // one over a whole bar ends on the ff written where it closes
  assert.equal(Object.values(r.song.sections)[0].dyn.vn, '| p:2 f:2 | mp<:3 mf:1 | < | ff |');
  const arr = arrange(r.song);
  const at = (t) => +arr.parts.vn.levelAt(t).toFixed(2);
  assert.deepEqual([at(1), at(3), at(4.5), at(7.5), at(10), at(12.5)], [0.32, 0.78, 0.47, 0.6, 0.76, 0.92]);
  // a diminuendo across a section's first bar starts again there from the level it began at
  const long = tune("[V:1] !f! c4 | c4 | c4 | !>(! c4 | c4 | !>)! !p! c4 |]");
  const lines = Object.values(long.song.sections).map((s) => s.dyn.vn);
  assert.deepEqual(lines, ['| f | - | - | > |', '| f> | p |']);
  // dynamicsInBar: false reads one dynamic a bar, as for MusicXML, MIDI and Humdrum
  assert.equal(Object.values(importABC(`X:1\nT:t\nM:4/4\nL:1/4\nK:C\nV:1 name="Violins"\n[V:1] !p! c d !f! e f |]\n`, { ...quiet, dynamicsInBar: false }).song.sections)[0].dyn.vn, '| p |');
});

test('glissandi from ABC: !-(! before the note a glissando leaves, !-)! before the one it reaches; %%double', () => {
  const r = importABC('X:1\nT:t\nM:4/4\nL:1/4\nQ:1/4=60\nK:C\nV:1 name="Harp"\nV:2 name="Violins"\nV:3 name="Distortion Guitar"\n%%double\n[V:1] !-(! C2 !-)! c2 | c4 |]\n[V:2] !~(! G2 !~)! d2 | d4 |]\n[V:3] [E,B,]4 | [E,B,]4 |]\n', quiet);
  assert.deepEqual(r.report.warnings, []);
  const s = Object.values(r.song.sections)[0];
  // in the time of the first note: a harp over the white keys, a violin chromatically, each note slurred to the next
  assert.equal(s.parts.hp, '| C4:2 D4:2_ E4:2_ F4:2_ G4:2_ A4:2_ B4:2_ C5:14 | C5:28 |');
  assert.equal(s.parts.vn, '| G4:2 G#4:2_ A4:2_ Bb4:2_ B4:2_ C5:2_ C#5:2_ D5:14 | D5:28 |');
  assert.equal(r.song.parts.dgtr.double, 0.85, 'double-tracked, as songs/rock.mjs is');
  assert.equal(r.song.parts.hp.double, undefined);
  assert.match(importABC('X:1\nT:t\nK:C\nV:1 name="Violins"\n[V:1] !slide! c4 |]\n', quiet).report.warnings[0], /!slide! is not read.*!-\(! before the first and !-\)! before the second/);
});

test('!harmonic! is a natural harmonic on a note, an artificial one on a two-note chord', () => {
  const r = importABC('X:1\nT:t\nM:4/4\nL:1/4\nK:C\nV:1 name="Violins"\n[V:1] !harmonic!c2 !harmonic![EA]2 | c4 |]\n', quiet);
  assert.deepEqual(r.report.warnings, []);
  // as written; the stopped E and the touch a fourth above sound two octaves over the E
  assert.equal(Object.values(r.song.sections)[0].parts.vn, '| C5:2* E6:2* | C5:4 |');
});

test('drums: !ghost! plays a ghost note, a grace note a flam, two a drag; repeated grace notes are kept', () => {
  const r = importABC('X:1\nT:t\nM:4/4\nL:1/8\nK:C\nV:1 name="Flute"\nV:2 name="Electric Bass"\nV:3 name="Drums"\n[V:1] {gag}a4 {ef}g4 |]\n[V:2] C,8 |]\n[V:3] C,, ^F,, {D,,}D,, ^F,, !ghost!D,, ^F,, {D,,D,,}D,, ^F,, |]\n', quiet);
  assert.deepEqual(r.report.warnings, []);
  const s = Object.values(r.song.sections)[0];
  assert.equal(s.parts.perc, '| k h {s}s h s? h {s s}s h |');
  assert.equal(s.parts.fl, '| {G5 A5 G5}A5:4 {E5 F5}G5:4 |', 'the second G of {gag} was dropped before 0.15.0');
});

test('a drum note that takes an accidental from earlier in its bar is warned about', () => {
  const r = importABC('X:1\nT:t\nM:4/4\nL:1/8\nK:C\nV:1 name="Electric Bass"\nV:2 name="Drums"\n[V:1] C,8 | C,8 |]\n[V:2] C,, ^F,, D,, ^F,, C, A,, F,, F,, | C,, ^F,, D,, ^F,, C, A,, =F,, =F,, |]\n', quiet);
  assert.equal(Object.values(r.song.sections)[0].parts.perc, '| k h s h t1 t2 h h | k h s h t1 t2 t3 t3 |');
  assert.deepEqual(r.report.warnings, ['Drums, bar 1: F,, plays as ^F,, (closed hi-hat), as an accidental lasts to the bar line on a drum staff too; write =F,, for the low tom']);
});

test('a slur joins every note after its first, as a player phrases it', () => {
  const r = importABC('X:1\nT:t\nM:3/4\nL:1/8\nK:D\nV:1 name="Solo Violin"\n[V:1] (f3 g a2) | (a/g/f/g/) a4 | ((f3 g) a2) | (3abc d4 |]\n', quiet);
  assert.deepEqual(r.report.warnings, []);
  assert.equal(Object.values(r.song.sections)[0].parts.vns, '| F#5:18 G5:6_ A5:12_ | A5:3 G5:3_ F#5:3_ G5:3_ A5:24 | F#5:18 G5:6_ A5:12_ | A5:4 B5:4 C#5:4 D5:24 |');
});

test('measured tremolo: one note with its strokes on strings, winds and brass; written out on the others', () => {
  const r = importABC('X:1\nT:t\nM:3/4\nL:1/8\nK:D\nV:1 name="Solo Violin"\nV:2 name="Flute"\nV:3 name="Piano"\nV:4 name="Violas"\n[V:1] !//!B6 | !/!B6 | !trem!B6 |]\n[V:2] !//!d6 | d6 | d6 |]\n[V:3] !//!D6 | D6 | D6 |]\n[V:4] "^pizz." !//!D6 | D6 | D6 |]\n', quiet);
  const s = Object.values(r.song.sections)[0].parts;
  assert.equal(s.vns, '| B4:12%trem16 | B4:12%trem8 | B4:12~ |');
  assert.equal(s.fl, '| D5:12%trem16 | D5:12 | D5:12 |', 'tongued repeats on a flute');
  assert.equal(s.pno, '| D4 D4 D4 D4 D4 D4 D4 D4 D4 D4 D4 D4 | D4:12 | D4:12 |', 'a piano repeats the note');
  assert.equal(s.va_pizz, '| D4 D4 D4 D4 D4 D4 D4 D4 D4 D4 D4 D4 | D4:12 | D4:12 |', 'pizzicato is plucked each time');
});

test('%%duty gives a chip pulse its own duty cycle, at the preset\'s level', () => {
  const r = importABC('X:1\nT:t\nM:4/4\nL:1/8\nK:C\nV:1 name="Pulse"\n%%duty 0\nV:2 name="Pulse"\n%%duty 2\nV:3 name="Triangle Wave"\n[V:1] c8 |]\n[V:2] E8 |]\n[V:3] C,8 |]\n', quiet);
  assert.deepEqual(Object.values(r.song.parts).map((p) => p.inst), ['chip_pulse_duty0', 'chip_pulse_duty2', 'chip_triangle']);
  assert.deepEqual(r.song.instruments.chip_pulse_duty0.duty, [0]);
  assert.equal(+(r.song.parts.pulse1.gain - r.song.parts.pulse2.gain).toFixed(1), 2.5, 'the thin pulse brought up to the round one\'s level');
});

test('%%duck pumps a voice under the kick and %%delay echoes it, as synthwave does', async () => {
  const { renderSong } = await import('../engine/render.mjs');
  const r = importABC('X:1\nT:t\nM:4/4\nL:1/8\nQ:1/4=120\nK:Am\nV:1 name="Synth Pad"\n%%duck 0.6\nV:2 name="Synth Pluck"\n%%delay 3/16 -6\nV:3 name="Drums"\n[V:1] [A,CE]8 | [A,CE]8 | z8 |]\n[V:2] A,CEA ECA,C | A,CEA ECA,C | z8 |]\n[V:3] C,,2 C,,2 C,,2 C,,2 | C,,2 C,,2 C,,2 C,,2 | z8 |]\n', quiet);
  const { parts, buses } = r.song;
  assert.deepEqual(parts.pad.fx.find((f) => f[0] === 'duck'), ['duck', { source: ['perc'], token: 'k', depth: 0.6, release: 0.18 }]);
  assert.equal(parts.arp.sends.delay_3_16, -6);
  assert.equal(buses.delay_3_16.time, '3/16');
  const rms = (L, t0, t1) => {
    let e = 0;
    for (let i = Math.round(t0 * 44100); i < Math.round(t1 * 44100); i++) e += L[i] ** 2;
    return 10 * Math.log10(e / ((t1 - t0) * 44100) + 1e-20);
  };
  const pad = renderSong({ ...r.song, parts: { pad: parts.pad, perc: { ...parts.perc, gain: -60 } }, master: { lufs: false } });
  assert.ok(rms(pad.L, 2.9, 2.99) - rms(pad.L, 2.52, 2.6) > 3, 'the pad dips after each kick and comes back before the next');
});

test('words (w:) are sung by the music line above them, aligned as ABC aligns them', () => {
  const sung = (abc) => {
    const r = importABC(abc, quiet);
    return { line: Object.values(r.song.sections).map((s) => s.parts.sop).join(' ').replace(/[A-G][#b]?\d(:\d+)?[_!^?]*/g, '').replace(/\s+/g, ' ').trim(), warnings: r.report.warnings };
  };
  const head = 'X:1\nT:t\nM:4/4\nL:1/4\nK:C\nV:1 name="Soprano"\nV:2 name="Alto"\n';
  // under their notes, as ABC 2.1 writes them: before 0.15.0 these were sung a line late, and the last line lost
  const under = sung(`${head}[V:1] c c d e | f4 |\nw: Glo-ry to the Lord\n[V:2] A A B c | c4 |\nw: Glo-ry to the Lord\n[V:1] e d c d | c4 |]\nw: now and for e-ver\n[V:2] c B A B | A4 |]\nw: now and for e-ver\n`);
  assert.equal(under.line, '| @glo @ry @to @the | @lord | @now @and @for @e | @ver |');
  assert.deepEqual(under.warnings, []);
  // above their notes, after the voice's V: line, as one trial agent learned to write them, still work
  const above = sung(`${head}V:1\nw: Glo-ry to the Lord\n[V:1] c c d e | f4 |]\nV:2\nw: Glo-ry to the Lord\n[V:2] A A B c | c4 |]\n`);
  assert.equal(above.line, '| @glo @ry @to @the | @lord |');
  // _ holds a syllable over the next note, * leaves a note without one, | goes on to the next bar
  const marks = sung(`${head}[V:1] c d e f | g a b c' | c'4 |]\nw: A-_-men * | Al-le-lu-ia | ho~ly\n[V:2] C4 | C4 | C4 |]\n`);
  assert.equal(marks.line, '| @a @a @men @e | @al @le @lu @ia | @holy |', 'held and skipped notes go on singing the vowel before; ~ keeps two words on one note');
  // words with no note to be sung on are reported, not lost in silence
  assert.match(sung(`${head}[V:1] c d e f |]\nw: one two three four five six\n[V:2] C4 |]\n`).warnings[0], /^Soprano, bar 1: 2 syllables of its words had no note to be sung on, from "five"/);
});

test('chord symbols within a bar keep their places, so the critic checks each note against the chord over it', () => {
  const r = importABC('X:1\nT:t\nM:4/4\nL:1/4\nK:G\nV:1 name="Flute"\n[V:1] "G"B "D7"A "G"G2 | "C"E2 "G"D "D"F | "G"G2 "D"F2 |]\n', { ...quiet, accompany: false });
  const s = Object.values(r.song.sections)[0];
  assert.equal(s.chords, '| G:1 D7:1 G:2 | C:2 G:1 D:1 | G D |', 'lengths where the chords do not share the bar evenly');
  const c = critic(r.song, arrange(r.song));
  assert.equal(c.report.fl.chordTones, '100% of on-beat notes', 'a melody of chord tones reads as one (it read 78% when the chords were spread evenly)');
});

test('a voice named with General MIDI\'s name plays that instrument; a named voice that matches none warns', () => {
  // the newest games named voices "Acoustic Bass" and "Brass" (both played the piano) and stingers "Net" and "Gloves"
  const abc = (names) => `X:1\nT:Names\nM:4/4\nL:1/4\nK:C\n${names.map((n, i) => `V:${i + 1} name="${n}"`).join('\n')}\n${names.map((_, i) => `[V:${i + 1}] C D E F |`).join('\n')}\n`;
  const r = importABCBook(abc(['Acoustic Bass', 'String Ensemble', 'Strings', 'Brass', 'Accordion', 'Net']));
  const preset = Object.fromEntries(r.report.parts.map((p) => [p.name, p.preset]));
  assert.deepEqual(preset, { 'Acoustic Bass': 'basses_pizz', 'String Ensemble': 'violins', Strings: 'violins', Brass: 'trumpet', Accordion: 'organ', Net: 'piano' });
  assert.equal(r.report.warnings.filter((w) => /matched no instrument/.test(w)).length, 1);
  assert.match(r.report.warnings.join('\n'), /"Net" matched no instrument, so it plays the piano/);
  // a tune's title is not an instrument's name: a one-voice stinger titled "After the whistle" plays the piano, quietly
  const t = importABCBook('X:1\nT:After the whistle\n%%stinger whistle\nM:4/4\nL:1/4\nK:C\nC D E F |\n');
  assert.equal(t.report.parts[0].preset, 'piano');
  assert.deepEqual(t.report.warnings, []);
});
