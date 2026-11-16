// The JavaScript MusicXML importer (engine/musicxml.mjs) writes the songs tools/import_orchestra.py writes.
// Intended differences, and the only ones allowed: note names are compared by pitch (music21's spelling of a
// transposed note varies between its versions: Ab1 or G#1), and the `source` field and the header comments
// (the Python songs were made with --source and name their importer). test/musicxml-python.test.mjs runs the Python
// importer itself where music21 is installed (CI installs it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { importMusicXML, readMusicXMLText, parseXML, readScore, playOrder, mapPart } from '../engine/musicxml.mjs';
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

test('choosing presets: sound IDs, names in several languages, General MIDI programs, solo parts, percussion', () => {
  assert.equal(mapPart('Violoncelli', null, null, 0, false)[0], 'cellos');
  assert.equal(mapPart('Hörner in F', null, null, 0, false)[0], 'horn');
  assert.equal(mapPart('Part 3', null, 71, 0, false)[0], 'clarinet');
  assert.equal(mapPart('Violin solo', 'strings.violin', 40, 0, false)[0], 'violin_solo');
  assert.equal(mapPart('Something', null, null, 0, false)[0], 'piano');
  assert.deepEqual(mapPart('Triangle', null, null, 1, false).slice(0, 2), ['percussion', 'tri']);
  assert.equal(mapPart('Bass', 'voice.bass', null, 0, true)[0], 'bass_choir');
});
