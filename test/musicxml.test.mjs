// The JavaScript MusicXML importer (engine/musicxml.mjs) writes the songs tools/import_orchestra.py writes.
// Intended differences, and the only ones allowed: note names are compared by pitch (music21's spelling of a
// transposed note varies between its versions: Ab1 or G#1), and the `source` field and the header comments
// (the Python songs were made with --source and name their importer). test/musicxml-python.test.mjs runs the Python
// importer itself where music21 is installed (CI installs it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { importMusicXML, readMusicXMLText, parseXML, readScore, playOrder, mapPart, CONCERT_DYNAMICS } from '../engine/musicxml.mjs';
import { arrange } from '../engine/score.mjs';
import { compareSongs, songDigest } from '../tools/compare_import.mjs';
import { loadSong } from './helpers.mjs';

const fixture = (n) => readFileSync(new URL(`./scores/${n}`, import.meta.url));
const expectSame = (a, b) => {
  const d = compareSongs(a, b);
  assert.deepEqual(d, [], `the importers differ:\n${d.slice(0, 10).join('\n')}`);
};

// tools/import_orchestra.py's songs for these scores (music21 10.5.2, the presets of 0.12.0), as songDigest
// fingerprints: the committed songs were these until 0.10.0, when they became default-mode imports (sung words,
// held fermatas)
const PYTHON = {
  beethoven5: '2d79ad1a962e99d3a0f8835658653c325d8d5f887cc9f286d95feaa5e26f2865',
  ode: '6a0319396e885bcc2edbd9f76f6480f83ae8e274db3a209ecde9491d49f85d99',
};

test('Beethoven 5, I: compat mode makes the same song as tools/import_orchestra.py; default mode, songs/beethoven5.mjs', async () => {
  const opt = { title: 'Symphony No. 5, I', key: 'C minor' };
  const t0 = performance.now();
  const r = await importMusicXML(fixture('Beethoven_Op.67_1.mxl'), { ...opt, compat: true });
  const ms = performance.now() - t0;
  assert.equal(songDigest(r.song), PYTHON.beethoven5);
  assert.equal(r.report.bars, 626, 'all 502 bars with the exposition repeat');
  assert.equal(r.report.parts.length, 18);
  assert.equal(r.report.fermataBars, 10);
  assert.ok(ms < 10000, `${Math.round(ms)} ms`);
  const d = await importMusicXML(fixture('Beethoven_Op.67_1.mxl'), opt);
  expectSame(d.song, await loadSong('beethoven5'));
  assert.equal(d.report.holds > 0, true, 'the fermatas hold their notes');
});

test('Beethoven 9, IV, bars 93 to 331: compat mode makes the same song as tools/import_orchestra.py; default mode, songs/ode.mjs', async () => {
  const opt = { title: 'Symphony No. 9, IV: Ode to Joy', key: 'D major', bars: '93-331', tempo: 160 };
  const r = await importMusicXML(fixture('Beethoven_Op.125_4.mxl'), { ...opt, compat: true });
  assert.equal(songDigest(r.song), PYTHON.ode);
  assert.equal(r.report.parts.length, 36);
  const soloists = r.report.parts.filter((p) => p.preset.endsWith('_voice')).map((p) => p.preset);
  assert.deepEqual(soloists, ['soprano_voice', 'alto_voice', 'tenor_voice', 'bass_voice']);
  const d = await importMusicXML(fixture('Beethoven_Op.125_4.mxl'), opt);
  const song = await loadSong('ode');
  expectSame(d.song, song);
  assert.match(JSON.stringify(song.sections), /@freu/, 'the choir sings the words');
});

test('the feature score: endings, voices, grace notes, triplets, ties, slurs, trills, tremolos, pizz., lyrics', async () => {
  const r = await importMusicXML(fixture('features.musicxml'), { title: 'Feature test', fileName: 'features.musicxml', compat: true });
  const expected = (await import('./scores/features.expected.mjs')).default;
  expectSame(r.song, expected);
  assert.deepEqual(r.song.form, ['m1', 'm3', 'm4', 'm5', 'end'], 'bars 1 2 3 4 3 5: the second ending replaces the first');
});

test('the song text is a module of the same song, and it arranges with no errors', async () => {
  const r = await importMusicXML(fixture('features.musicxml'), { title: 'Feature test' });
  const url = 'data:text/javascript;base64,' + Buffer.from(r.text).toString('base64');
  const mod = (await import(url)).default;
  assert.deepEqual(JSON.parse(JSON.stringify(mod)), JSON.parse(JSON.stringify(r.song)));
  assert.deepEqual(arrange(r.song).errors, []);
});

test('reading files: .mxl archives and MusicXML text give the same score', async () => {
  const fromZip = await readMusicXMLText(fixture('Beethoven_Op.67_1.mxl'));
  assert.match(fromZip, /<score-partwise/);
  const a = readScore(parseXML(fromZip)), b = readScore(parseXML(await readMusicXMLText(new TextEncoder().encode(fromZip))));
  assert.equal(a.parts.length, b.parts.length);
  assert.equal(a.parts[0].notes.length, b.parts[0].notes.length);
  assert.equal(a.meta.composer, 'Beethoven, Ludwig van');
  await assert.rejects(importMusicXML('<score-timewise/>'), /timewise/);
  await assert.rejects(importMusicXML('<html/>'), /not a MusicXML score/);
});

test('the order measures are played in: repeats, times, first and second endings', () => {
  const m = (o = {}) => ({ forward: false, backward: false, times: null, endings: [], ...o });
  // | 0 |: 1 | 2 :| 3 |
  assert.deepEqual(playOrder([m(), m({ forward: true }), m({ backward: true }), m()]), [0, 1, 2, 1, 2, 3]);
  // a backward repeat with no forward one goes back to the start; times="3" plays three times
  assert.deepEqual(playOrder([m(), m({ backward: true, times: 3 }), m()]), [0, 1, 0, 1, 0, 1, 2]);
  // |: 0 | [1. 1 :| [2. 2 | 3
  const e = [m({ forward: true }), m({ backward: true, endings: [{ numbers: [1], type: 'start' }, { numbers: [1], type: 'stop' }] }), m({ endings: [{ numbers: [2], type: 'start' }, { numbers: [2], type: 'discontinue' }] }), m()];
  assert.deepEqual(playOrder(e), [0, 1, 0, 2, 3]);
});

test('jumps (the default mode): da capo, dal segno, to coda and fine; repeats not taken again after a jump', () => {
  const m = (jump = {}, o = {}) => ({ forward: false, backward: false, times: null, endings: [], jump, ...o });
  // D.C. al Fine: | 0 | 1 Fine | 2 | 3 D.C. |
  const dc = [m(), m({ fine: true }), m(), m({ dacapo: true })];
  assert.deepEqual(playOrder(dc, { jumps: true }), [0, 1, 2, 3, 0, 1]);
  assert.deepEqual(playOrder(dc), [0, 1, 2, 3], 'without jumps (compat), the order music21 gives');
  // D.S. al Coda: | 0 | 1 segno | 2 to coda | 3 D.S. | 4 coda | 5 |
  const ds = [m(), m({ segno: 'segno' }), m({ tocoda: 'coda' }), m({ dalsegno: 'segno' }), m({ coda: 'coda' }), m()];
  assert.deepEqual(playOrder(ds, { jumps: true }), [0, 1, 2, 3, 1, 2, 4, 5]);
  // a repeat is taken once, before the jump; after it, only the last ending plays
  // |: 0 | [1. 1 :| [2. 2 | 3 D.C. |
  const e = [m({}, { forward: true }), m({}, { backward: true, endings: [{ numbers: [1], type: 'start' }, { numbers: [1], type: 'stop' }] }),
    m({}, { endings: [{ numbers: [2], type: 'start' }, { numbers: [2], type: 'discontinue' }] }), m({ dacapo: true })];
  assert.deepEqual(playOrder(e, { jumps: true }), [0, 1, 0, 2, 3, 0, 2, 3]);
});

// a one-part score of whole notes; `dirs` puts direction XML at the start of a measure
const tiny = (n, { time = '4/4', dirs = {} } = {}) => {
  const [b, t] = time.split('/');
  const measures = Array.from({ length: n }, (_, i) => `<measure number="${i + 1}">${i ? '' : `<attributes><divisions>1</divisions><time><beats>${b}</beats><beat-type>${t}</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>`}${dirs[i + 1] ?? ''}<note><pitch><step>C</step><octave>5</octave></pitch><duration>${(4 * b) / t}</duration><type>whole</type></note></measure>`).join('');
  return `<?xml version="1.0"?><score-partwise version="3.1"><part-list><score-part id="P1"><part-name>Flute</part-name></score-part></part-list><part id="P1">${measures}</part></score-partwise>`;
};
const words = (w, sound = '') => `<direction placement="above"><direction-type><words>${w}</words></direction-type>${sound}</direction>`;

test('soundTempo: a transcription plays at its own playback tempo, not its words', async () => {
  // 'Adagio.' over an alla breve bar: the word table reads a half-note beat; the score plays a quarter at 80
  const xml = tiny(4, { time: '2/2', dirs: { 1: words('Adagio.', '<sound tempo="80"/>') } });
  const byWord = await importMusicXML(xml, { title: 'w' });
  const bySound = await importMusicXML(xml, { title: 's', soundTempo: true });
  assert.notEqual(byWord.report.base, 80);
  assert.equal(bySound.report.base, 80);
  assert.equal(Math.round(arrange(bySound.song).duration), 12, '4 bars of 4 quarters at 80');
  // a tempo the word table does not know, and a score whose first mark comes late (it starts at MusicXML's 120)
  const late = tiny(4, { dirs: { 3: words('Tempo di valse', '<sound tempo="60"/>') } });
  const r = await importMusicXML(late, { title: 'late', soundTempo: true });
  assert.equal(Math.round(arrange(r.song).duration), 12, 'two bars at 120 (4 s), two at 60 (8 s)');
});

test('jumps in a score: <sound dacapo> with Fine, and the words "Menuetto D.C." when a score has no <sound> jumps', async () => {
  const fine = '<direction><direction-type><words>Fine</words></direction-type><sound fine="yes"/></direction>';
  const dc = '<direction><direction-type><words>D.C. al Fine</words></direction-type><sound dacapo="yes"/></direction>';
  const a = await importMusicXML(tiny(4, { dirs: { 2: fine, 4: dc } }), { title: 'dc' });
  assert.equal(Math.round(arrange(a.song).duration), 12, 'bars 1 2 3 4 1 2: six bars of 2 s');
  const compat = await importMusicXML(tiny(4, { dirs: { 2: fine, 4: dc } }), { title: 'dc', compat: true });
  assert.equal(Math.round(arrange(compat.song).duration), 8, 'compat plays it once, as music21 does');
  const w = await importMusicXML(tiny(3, { dirs: { 3: words('Menuetto D.C.') } }), { title: 'words' });
  assert.equal(Math.round(arrange(w.song).duration), 12, 'bars 1 2 3 1 2 3');
});

test('choosing presets: sound IDs, names in several languages, General MIDI programs, solo parts, percussion', () => {
  assert.equal(mapPart('Violoncelli', null, null, 0, false)[0], 'cellos');
  assert.equal(mapPart('Hörner in F', null, null, 0, false)[0], 'horn');
  assert.equal(mapPart('Part 3', null, 71, 0, false)[0], 'clarinet');
  assert.equal(mapPart('Violin solo', 'strings.violin', 40, 0, false)[0], 'violin_solo');
  assert.equal(mapPart('Something', null, null, 0, false)[0], 'piano');
  assert.deepEqual(mapPart('Triangle', null, null, 1, false).slice(0, 2), ['percussion', 'tri']);
  assert.equal(mapPart('Bass', 'voice.bass', null, 0, true)[0], 'bass_choir');
});

test('the concert stretch of dynamics is for ensembles: a piece for one instrument keeps its marks\' own range', async () => {
  // stretched, a solo piano's pp sank to the floor (Clair de lune's opening sat at -37 LUFS): 0.21.0 leaves it alone
  const notation = (n) => readFileSync(new URL(`./scores/notation/${n}.musicxml`, import.meta.url));
  assert.equal((await importMusicXML(notation('pedal'))).song.dynamics, undefined, 'a piano piece');
  assert.equal((await importMusicXML(notation('glissando'))).song.dynamics, CONCERT_DYNAMICS, 'a harp and a violin');
  assert.equal((await importMusicXML(fixture('Beethoven_Op.67_1.mxl'))).song.dynamics, CONCERT_DYNAMICS, 'an orchestra');
});
