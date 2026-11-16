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
import { compareSongs } from '../tools/compare_import.mjs';
import { loadSong } from './helpers.mjs';

const fixture = (n) => readFileSync(new URL(`./scores/${n}`, import.meta.url));
const expectSame = (a, b) => {
  const d = compareSongs(a, b);
  assert.deepEqual(d, [], `the importers differ:\n${d.slice(0, 10).join('\n')}`);
};

test('Beethoven 5, I: the same song as tools/import_orchestra.py (songs/beethoven5.mjs)', async () => {
  const t0 = performance.now();
  const r = await importMusicXML(fixture('Beethoven_Op.67_1.mxl'), { title: 'Symphony No. 5, I', key: 'C minor' });
  const ms = performance.now() - t0;
  expectSame(r.song, await loadSong('beethoven5'));
  assert.equal(r.report.bars, 626, 'all 502 bars with the exposition repeat');
  assert.equal(r.report.parts.length, 18);
  assert.equal(r.report.fermataBars, 10);
  assert.ok(ms < 10000, `${Math.round(ms)} ms`);
});

test('Beethoven 9, IV, bars 93 to 331: the same song as tools/import_orchestra.py (songs/ode.mjs)', async () => {
  const r = await importMusicXML(fixture('Beethoven_Op.125_4.mxl'), { title: 'Symphony No. 9, IV: Ode to Joy', key: 'D major', bars: '93-331' });
  expectSame(r.song, await loadSong('ode'));
  assert.equal(r.report.parts.length, 36);
  const soloists = r.report.parts.filter((p) => p.preset.endsWith('_voice')).map((p) => p.preset);
  assert.deepEqual(soloists, ['soprano_voice', 'alto_voice', 'tenor_voice', 'bass_voice']);
});

test('the feature score: endings, voices, grace notes, triplets, ties, slurs, trills, tremolos, pizz., lyrics', async () => {
  const r = await importMusicXML(fixture('features.musicxml'), { title: 'Feature test', fileName: 'features.musicxml' });
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
